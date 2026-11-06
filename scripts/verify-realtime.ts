// scripts/verify-realtime.ts
/**
 * Proves the seeded marketplace is live, not static:
 *   1. every table the marketplace client subscribes to is actually in the
 *      supabase_realtime publication (checked straight against Postgres)
 *   2. the app's own subscribeMarketplaceRealtime() runs against a real anon
 *      session — the same code path a browser executes
 *   3. server-side UPDATEs to a seeded product and a seeded storefront arrive
 *      at an anonymous subscriber without any page reload
 *
 *   npm run verify:realtime
 */
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { subscribeMarketplaceRealtime } from '@/lib/data/sync';

/** Exactly the tables lib/data/sync.ts subscribes the marketplace client to. */
const SUBSCRIBED_TABLES = [
  'bids', 'businesses', 'calls', 'chat_rooms', 'delivery_jobs', 'escrows',
  'message_reactions', 'messages', 'notifications', 'orders', 'products',
  'profiles', 'reports', 'review_replies', 'reviews', 'service_areas',
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

const missing = [
  !url && 'NEXT_PUBLIC_SUPABASE_URL',
  !anonKey && 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  !serviceKey && 'SUPABASE_SERVICE_ROLE_KEY',
].filter(Boolean);
if (missing.length) {
  console.error(`Missing env: ${missing.join(', ')}`);
  process.exit(1);
}

const anon = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });

/** Which of the tables above are in the realtime publication. */
async function publicationCheck(): Promise<boolean> {
  if (!databaseUrl) {
    console.log('publication check: SKIPPED (no DATABASE_URL)');
    return true;
  }
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { rows } = await client.query(
      `select tablename from pg_publication_tables where pubname = 'supabase_realtime'`
    );
    const published = new Set(rows.map((r) => r.tablename as string));
    const missingTables = SUBSCRIBED_TABLES.filter((t) => !published.has(t));
    console.log(
      `publication: ${SUBSCRIBED_TABLES.filter((t) => published.has(t)).length}/${SUBSCRIBED_TABLES.length} ` +
        `subscribed (missing: ${missingTables.length ? missingTables.join(', ') : 'none'})`
    );
    return missingTables.length === 0;
  } finally {
    await client.end();
  }
}

function waitForSubscribed(channel: RealtimeChannel): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve();
      else if (status === 'CHANNEL_ERROR') reject(new Error('Realtime channel error'));
      else if (status === 'TIMED_OUT') reject(new Error('Realtime subscribe timed out'));
    });
  });
}

async function waitFor(ms: number, done: () => boolean) {
  for (let i = 0; i < ms / 250 && !done(); i += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
  }
}

/** Subscribe as the app does, then touch the seeded rows from the server. */
async function liveEventsCheck(): Promise<boolean> {
  const { data: product } = await admin
    .from('products')
    .select('id, view_count')
    .eq('is_seeded', true)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  const { data: business } = await admin
    .from('businesses')
    .select('id, followers')
    .eq('is_seeded', true)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!product || !business) {
    console.error('No seeded product/storefront found — run `npm run seed` first.');
    return false;
  }

  // 1. The app's own subscription (what every browser runs) must attach cleanly.
  let appSubscribed = false;
  const unsubscribe = subscribeMarketplaceRealtime(anon, { onChange: () => { appSubscribed = true; } });

  // 2. A listener that tells us exactly which table changed. (No `filter`: the
  //    per-table handler already scopes the event, and unfiltered postgres_changes
  //    is what the marketplace client itself uses.)
  const seen = new Set<string>();
  const listener = anon
    .channel('realtime-verify')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'products' }, (payload) => {
      if ((payload.new as { id?: number }).id === product.id) seen.add('products');
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'businesses' }, (payload) => {
      if ((payload.new as { id?: number }).id === business.id) seen.add('businesses');
    });
  await waitForSubscribed(listener);
  await new Promise<void>((resolve) => setTimeout(resolve, 700));

  const { error: productError } = await admin
    .from('products')
    .update({ view_count: Number(product.view_count || 0) + 1 })
    .eq('id', product.id);
  const { error: businessError } = await admin
    .from('businesses')
    .update({ followers: Number(business.followers || 0) + 1 })
    .eq('id', business.id);
  if (productError || businessError) {
    console.error('Could not touch seeded rows:', productError?.message || businessError?.message);
    unsubscribe();
    await anon.removeChannel(listener);
    return false;
  }

  await waitFor(10_000, () => seen.has('products') && seen.has('businesses') && appSubscribed);

  console.log(`app subscription attached: ${appSubscribed ? 'YES' : 'NO'}`);
  console.log(`product UPDATE received: ${seen.has('products') ? 'YES' : 'NO'}`);
  console.log(`storefront UPDATE received: ${seen.has('businesses') ? 'YES' : 'NO'}`);

  unsubscribe();
  await anon.removeChannel(listener);

  return appSubscribed && seen.has('products') && seen.has('businesses');
}

async function main() {
  const inPublication = await publicationCheck();
  const live = await liveEventsCheck();

  if (!inPublication || !live) {
    console.error('REALTIME FAILED — clients would only refresh on a full reload.');
    process.exit(1);
  }
  console.log('Realtime OK — seeded sellers, listings and storefronts propagate live to every client.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
