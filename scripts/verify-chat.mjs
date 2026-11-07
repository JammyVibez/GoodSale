#!/usr/bin/env node
/**
 * Chat experience integration check.
 *
 * Runs inside one Postgres transaction and ALWAYS rolls back. It creates a
 * temporary thread between real profiles, then verifies read positions,
 * authoritative previews, notification dedupe, mute/archive and participant
 * access control.
 *
 * Usage: node scripts/verify-chat.mjs
 */
import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required to verify chat.');
  process.exit(1);
}

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
let failed = false;

function check(condition, message, detail = '') {
  if (condition) {
    console.log(`  OK      ${message}`);
  } else {
    failed = true;
    console.error(`  FAIL    ${message}${detail ? ` — ${detail}` : ''}`);
  }
}

async function setClaims(authId) {
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [authId || '']);
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: authId, role: 'authenticated' }),
  ]);
}

async function expectFailure(label, sql, params = []) {
  await client.query('SAVEPOINT expect_failure');
  try {
    await client.query(sql, params);
    await client.query('ROLLBACK TO SAVEPOINT expect_failure');
    check(false, label, 'expected the database to reject this operation');
  } catch {
    await client.query('ROLLBACK TO SAVEPOINT expect_failure');
    check(true, label);
  }
}

async function main() {
  await client.connect();
  await client.query('BEGIN');

  console.log('Chat verification (transaction will be rolled back)');

  const columns = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'chat_rooms'
      AND column_name IN (
        'buyer_last_read_at','seller_last_read_at','buyer_muted','seller_muted',
        'buyer_archived_at','seller_archived_at','last_message_sender_id','last_message_kind'
      )
  `);
  check(columns.rowCount === 8, 'chat read, preference and preview columns exist');

  const functions = await client.query(`
    SELECT proname FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('chat_mark_read','chat_set_preferences','chat_after_message_insert')
  `);
  check(functions.rowCount === 3, 'chat read, preference and trigger functions exist');

  const grants = await client.query(`
    SELECT
      has_function_privilege('authenticated', 'public.chat_mark_read(bigint)', 'EXECUTE') AS auth_mark,
      has_function_privilege('anon', 'public.chat_mark_read(bigint)', 'EXECUTE') AS anon_mark,
      has_function_privilege('authenticated', 'public.chat_set_preferences(bigint,boolean,boolean)', 'EXECUTE') AS auth_prefs,
      has_function_privilege('anon', 'public.chat_set_preferences(bigint,boolean,boolean)', 'EXECUTE') AS anon_prefs
  `);
  check(grants.rows[0].auth_mark === true, 'authenticated members can mark a thread read');
  check(grants.rows[0].anon_mark === false, 'anonymous visitors cannot mark threads read');
  check(grants.rows[0].auth_prefs === true, 'authenticated members can change thread preferences');
  check(grants.rows[0].anon_prefs === false, 'anonymous visitors cannot change thread preferences');

  const tableGrants = await client.query(`
    SELECT
      has_table_privilege('authenticated', 'public.chat_rooms', 'UPDATE') AS auth_update,
      has_table_privilege('anon', 'public.chat_rooms', 'UPDATE') AS anon_update
  `);
  check(tableGrants.rows[0].auth_update === false, 'members cannot bypass inbox RPCs with a direct row update');
  check(tableGrants.rows[0].anon_update === false, 'anonymous visitors cannot update chat rooms directly');

  const participants = await client.query(`
    SELECT pr.id AS product_id, pr.seller_id, pr.title, pr.price,
           COALESCE(pr.images->>0, '') AS image,
           seller.full_name AS seller_name, seller.auth_id AS seller_auth,
           buyer.id AS buyer_id, buyer.auth_id AS buyer_auth, buyer.full_name AS buyer_name,
           outsider.id AS outsider_id, outsider.auth_id AS outsider_auth
    FROM public.products pr
    JOIN public.profiles seller ON seller.id = pr.seller_id AND seller.auth_id IS NOT NULL
    JOIN LATERAL (
      SELECT id, auth_id, full_name FROM public.profiles
      WHERE id <> pr.seller_id AND auth_id IS NOT NULL
      ORDER BY id LIMIT 1
    ) buyer ON true
    JOIN LATERAL (
      SELECT id, auth_id FROM public.profiles
      WHERE id NOT IN (pr.seller_id, buyer.id) AND auth_id IS NOT NULL
      ORDER BY id LIMIT 1
    ) outsider ON true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.chat_rooms room
      WHERE room.buyer_id = buyer.id AND room.seller_id = pr.seller_id AND room.product_id = pr.id
    )
    LIMIT 1
  `);

  if (participants.rowCount !== 1) {
    check(false, 'found profiles and a listing for a temporary thread');
    await client.query('ROLLBACK');
    return;
  }

  const p = participants.rows[0];
  const roomResult = await client.query(
    `INSERT INTO public.chat_rooms
      (buyer_id, seller_id, product_id, product_title, product_price, product_image, seller_name, buyer_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id`,
    [p.buyer_id, p.seller_id, p.product_id, p.title, p.price, p.image, p.seller_name, p.buyer_name]
  );
  const roomId = Number(roomResult.rows[0].id);
  check(Number.isFinite(roomId), 'temporary thread created');

  // Isolate notification assertions from real unread chat notifications.
  await client.query(
    `UPDATE public.notifications SET is_read = true
     WHERE user_id = $1 AND type = 'CHAT' AND is_read = false`,
    [p.seller_id]
  );

  await setClaims(p.buyer_auth);
  const readResult = await client.query(`SELECT public.chat_mark_read($1) AS read_at`, [roomId]);
  check(Boolean(readResult.rows[0].read_at), 'buyer can mark the thread read');

  const readColumns = await client.query(
    `SELECT buyer_last_read_at, seller_last_read_at FROM public.chat_rooms WHERE id = $1`,
    [roomId]
  );
  check(Boolean(readColumns.rows[0].buyer_last_read_at), 'buyer read position persisted');
  check(!readColumns.rows[0].seller_last_read_at, 'buyer does not change the seller read position');

  const firstMessage = await client.query(
    `INSERT INTO public.messages (room_id, sender_id, message_text)
     VALUES ($1,$2,$3) RETURNING id, created_at`,
    [roomId, p.buyer_id, 'Is the leather genuine?']
  );
  check(firstMessage.rowCount === 1, 'buyer message inserted');

  const preview = await client.query(
    `SELECT last_message, last_message_sender_id, last_message_kind
     FROM public.chat_rooms WHERE id = $1`,
    [roomId]
  );
  check(preview.rows[0].last_message === 'Is the leather genuine?', 'text preview is authoritative');
  check(Number(preview.rows[0].last_message_sender_id) === Number(p.buyer_id), 'last sender recorded');
  check(preview.rows[0].last_message_kind === 'TEXT', 'message kind recorded');

  const notificationCount = async () => {
    const result = await client.query(
      `SELECT count(*)::int AS count FROM public.notifications
       WHERE user_id = $1 AND type = 'CHAT' AND is_read = false
         AND title = 'New message from ' || $2`,
      [p.seller_id, p.buyer_name]
    );
    return result.rows[0].count;
  };

  check((await notificationCount()) === 1, 'recipient gets one in-app chat notification');
  await client.query(
    `INSERT INTO public.messages (room_id, sender_id, message_text)
     VALUES ($1,$2,$3)`,
    [roomId, p.buyer_id, 'I can share a close-up.']
  );
  check((await notificationCount()) === 1, 'rapid messages are deduped into one notification');

  await client.query(
    `INSERT INTO public.messages (room_id, sender_id, image_url)
     VALUES ($1,$2,$3)`,
    [roomId, p.buyer_id, 'https://example.com/chat-check.jpg']
  );
  const mediaPreview = await client.query(
    `SELECT last_message, last_message_kind FROM public.chat_rooms WHERE id = $1`,
    [roomId]
  );
  check(mediaPreview.rows[0].last_message === 'Sent a photo', 'photo preview is described');
  check(mediaPreview.rows[0].last_message_kind === 'PHOTO', 'photo kind recorded');

  await setClaims(p.seller_auth);
  await client.query(`SELECT public.chat_mark_read($1)`, [roomId]);
  const sellerRead = await client.query(
    `SELECT seller_last_read_at FROM public.chat_rooms WHERE id = $1`,
    [roomId]
  );
  check(Boolean(sellerRead.rows[0].seller_last_read_at), 'seller read position persists');

  await client.query(`SELECT public.chat_set_preferences($1, $2, $3)`, [roomId, true, true]);
  const preferences = await client.query(
    `SELECT seller_muted, seller_archived_at FROM public.chat_rooms WHERE id = $1`,
    [roomId]
  );
  check(preferences.rows[0].seller_muted === true, 'seller can mute the conversation');
  check(Boolean(preferences.rows[0].seller_archived_at), 'seller can archive the conversation');

  const beforeMutedNotifications = await notificationCount();
  await setClaims(p.buyer_auth);
  await client.query(
    `INSERT INTO public.messages (room_id, sender_id, message_text)
     VALUES ($1,$2,$3)`,
    [roomId, p.buyer_id, 'Muted message should not notify.']
  );
  check((await notificationCount()) === beforeMutedNotifications, 'muted conversations do not notify');

  await setClaims(p.outsider_auth);
  await expectFailure(
    'non-participants cannot mark the thread read',
    `SELECT public.chat_mark_read($1)`,
    [roomId]
  );

  await client.query('ROLLBACK');
  console.log('\nAll chat checks passed. Transaction rolled back. ✅');
}

try {
  await main();
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  failed = true;
  console.error(error);
} finally {
  await client.end();
}

if (failed) process.exitCode = 1;
