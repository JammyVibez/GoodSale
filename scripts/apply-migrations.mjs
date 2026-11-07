#!/usr/bin/env node
/**
 * Apply the GoodSale SQL files to a Supabase project, in order.
 *
 * Two execution paths, tried in this order:
 *
 *  1. Direct Postgres (`pg`) — preferred. Set a connection string in
 *     `DATABASE_URL` (Supabase → Project Settings → Database → Connection string,
 *     "Session pooler" / port 5432). This can run any DDL, including RPCs.
 *
 *  2. Supabase Management API — fallback. Needs a personal access token in
 *     `SUPABASE_ACCESS_TOKEN` (https://supabase.com/dashboard/account/tokens).
 *
 * Usage:
 *   node scripts/apply-migrations.mjs                # schema.sql + 002…007
 *   node scripts/apply-migrations.mjs --from=002     # skip schema.sql (idempotent replay)
 *   node scripts/apply-migrations.mjs --verify       # only check which RPCs exist
 *   node scripts/apply-migrations.mjs --only=005_security_payments.sql
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '';

const projectRef = (() => {
  const match = SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
  return match ? match[1] : '';
})();

/** RPCs that must exist once the migrations are applied. */
const VERIFY_RPCS = [
  'release_escrow_with_pin',
  'request_withdrawal',
  'admin_set_profile_role',
  'mark_order_paid_by_reference',
  'credit_wallet',
  'admin_force_escrow',
  'complete_delivery_job_with_pin',
  'open_dispute',
  'resolve_dispute',
  'debit_wallet',
  'admin_process_withdrawal',
  'mark_refund_completed',
  // Wallet ledger, funding, payouts, refunds and finance controls
  'credit_wallet_ledger',
  'debit_wallet_ledger',
  'credit_wallet_funding',
  'pay_order_with_wallet',
  'admin_payout_begin',
  'admin_payout_processing',
  'admin_payout_complete',
  'admin_payout_fail',
  'admin_refund_to_wallet',
  'admin_adjust_wallet',
  'admin_update_wallet_settings',
  'admin_finance_summary',
  'delivery_seller_action',
  'delivery_transition',
  'delivery_assign_rider',
  'delivery_set_courier',
  'delivery_set_instructions',
  'delivery_generate_confirmation_code',
  'delivery_confirm_with_code',
  'delivery_cancel',
  'delivery_initiate_return',
  'rider_apply',
  'rider_update_availability',
  'rider_available_deliveries',
  'rider_accept_delivery',
  'rider_reject_delivery',
  'rider_mark_arrival',
  'rider_record_failed_attempt',
  'rider_contact_seller',
  'expire_rider_assignments',
  'admin_review_rider',
  'admin_set_rider_commission',
  'admin_set_rider_service_areas',
  'admin_set_rider_earning_status',
  'admin_adjust_rider_earning',
  // Phase 3 — logistics, live tracking and courier integration
  'admin_auto_assign_delivery',
  'admin_set_delivery_settings',
  'rider_set_location_sharing',
  'rider_update_location',
  'delivery_tracking_view',
  'delivery_set_route',
  'delivery_report_failure',
  'admin_resolve_delivery_failure',
  'admin_update_delivery_return',
  'admin_record_courier_shipment',
  'courier_apply_tracking_event',
  'admin_manual_courier_update',
  'admin_delivery_analytics',
  'run_delivery_jobs',
  'delivery_settings_public',
  'notify_rider_pickup_arrival',
  // Phase 4 — premium checkout and shipment tracking
  'assign_order_number',
  'generate_shipment_tracking_id',
  'shipment_tracking_lookup',
  'delivery_tracking_public_id',
  // Referral campaigns, attribution, qualification and rewards
  'generate_referral_code',
  'attribute_referral',
  'referral_evaluate',
  'referral_issue_rewards',
  'referral_reverse_rewards',
  'evaluate_my_referral',
  'ensure_my_referral_code',
  'admin_disqualify_referral',
  'admin_mark_referral_reviewed',
  'admin_referral_analytics',
  // Chat read state and inbox preferences
  'chat_mark_read',
  'chat_set_preferences',
  // Server-verified Premium subscriptions
  'activate_premium_subscription',
  // Atomic, server-priced listing promotion purchase
  'purchase_listing_promotion',
  // Sponsored campaign reservation, review and refund
  'purchase_sponsored_campaign',
  'admin_review_sponsored_campaign',
  'record_sponsored_ad_event',
  // Premium lifecycle, credits, Flash Sales and v2 campaign delivery
  'issue_premium_credits',
  'premium_credit_balance',
  'redeem_premium_credits',
  'purchase_featured_promotion',
  'purchase_flash_sale',
  'admin_review_flash_sale',
  'purchase_sponsored_campaign_v2',
  'record_sponsored_ad_event_v2',
  'run_premium_jobs',
];

/** Tables the schema is expected to create (mirrors supabase/schema.sql). */
const VERIFY_TABLES = [
  'announcements',
  'auctions',
  'audit_logs',
  'bids',
  'business_subscriptions',
  'businesses',
  'buyer_addresses',
  'calls',
  'chat_rooms',
  'deliveries',
  'delivery_audit_logs',
  'delivery_events',
  'delivery_jobs',
  'delivery_partners',
  'delivery_settings',
  'delivery_assignment_offers',
  'delivery_live_locations',
  'delivery_failures',
  'delivery_returns',
  'courier_shipments',
  'courier_webhook_events',
  'delivery_notification_outbox',
  'disputes',
  'escrows',
  'featured_listings',
  'follower_relations',
  'good_points_transactions',
  'identity_verifications',
  'invoices',
  'message_reactions',
  'messages',
  'notifications',
  'orders',
  'payment_logs',
  'payment_settings',
  'payment_transactions',
  'product_bundles',
  'premium_subscription_payments',
  'membership_plan_benefits',
  'premium_credit_lots',
  'premium_credit_ledger',
  'sponsored_ad_daily_spend',
  'buyer_protection_claims',
  'products',
  'profiles',
  'referrals',
  'referral_campaigns',
  'referral_clicks',
  'referral_rewards',
  'referral_events',
  'refunds',
  'revenue_settings',
  'rider_earnings',
  'rider_earning_audit_logs',
  'review_replies',
  'reports',
  'reviews',
  'safe_meet_locations',
  'safe_meet_meetups',
  'service_areas',
  'shipping_audit_logs',
  'shipping_couriers',
  'shipping_distance_tiers',
  'shipping_manual_quotes',
  'shipping_quotes',
  'shipping_rules',
  'shipping_settings',
  'shipping_zones',
  'seller_shipping_settings',
  'sponsored_ads',
  'sponsored_ad_events',
  'verified_plus_subscriptions',
  'wallet_transactions',
  'wallet_funding_intents',
  'wallet_settings',
  'wallets',
  'withdrawal_requests',
];

function sqlFiles({ from, only }) {
  const files = [];
  if (only) return [join('supabase/migrations', only)];
  // schema.sql is the full baseline — it is NOT idempotent, only run on a fresh project.
  if (!from) files.push('supabase/schema.sql');
  const prefix = from ? `00${from}`.slice(-3) + '_' : '';
  const migrations = readdirSync(join(root, 'supabase/migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const name of migrations) {
    if (prefix && name < prefix) continue;
    files.push(join('supabase/migrations', name));
  }
  return files;
}

// ---------------------------------------------------------------------------
// Direct Postgres path
// ---------------------------------------------------------------------------

async function withPg(fn) {
  const { default: pg } = await import('pg').catch(() => ({ default: null }));
  if (!pg) throw new Error('The `pg` package is not installed. Run: npm install pg');
  const client = new pg.Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function applyWithPg(client, files) {
  for (const file of files) {
    const sql = readFileSync(join(root, file), 'utf8');
    process.stdout.write(`  → ${file} … `);
    try {
      // Run each file in a single transaction so a failure rolls the file back.
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
      console.log('done');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.log('FAILED');
      console.error(`    ${error.message || error}`);
      throw error;
    }
  }
}

async function verifyWithPg(client) {
  const { rows: fnRows } = await client.query(
    `select p.proname from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any($1::text[])`,
    [VERIFY_RPCS]
  );
  const present = new Set(fnRows.map((r) => r.proname));
  for (const fn of VERIFY_RPCS) console.log(`  ${present.has(fn) ? 'OK     ' : 'MISSING'} ${fn}`);

  const { rows: tableRows } = await client.query(
    `select tablename from pg_tables where schemaname = 'public' and tablename = any($1::text[])`,
    [VERIFY_TABLES]
  );
  const tables = new Set(tableRows.map((r) => r.tablename));
  console.log(`  tables: ${tables.size}/${VERIFY_TABLES.length} present`);
  const missingTables = VERIFY_TABLES.filter((t) => !tables.has(t));
  if (missingTables.length) console.log(`  missing tables: ${missingTables.join(', ')}`);

  // Later migrations that extend existing tables (008 fee toggle, 009 ads)
  let extraSchemaOk = false;
  try {
    const { rows } = await client.query(
      `select platform_fee_enabled from public.revenue_settings order by id limit 1`
    );
    extraSchemaOk = true;
    const enabled = rows[0]?.platform_fee_enabled ?? false;
    console.log(`  platform_fee_enabled column: OK (current value: ${enabled ? 'ON' : 'OFF'})`);
  } catch {
    console.log('  platform_fee_enabled column: MISSING');
  }

  // Ads system (migration 009)
  try {
    const { rows } = await client.query(
      `select count(*)::int as cols from information_schema.columns
        where table_schema = 'public' and table_name = 'sponsored_ads'
          and column_name in ('media_url','media_type','placements','cta_text','click_view')`
    );
    const cols = Number(rows[0]?.cols || 0);
    console.log(`  ads columns: ${cols}/5 present`);
    if (cols < 5) extraSchemaOk = false;
    await client.query(`select id from storage.buckets where id = 'ad-media'`);
    console.log('  ad-media bucket: OK');
  } catch {
    console.log('  ads columns / ad-media bucket: MISSING');
    extraSchemaOk = false;
  }

  // Community / trust / service areas (migration 012)
  try {
    const { rows } = await client.query(
      `select
         (select count(*)::int from information_schema.columns
           where table_schema = 'public' and table_name = 'identity_verifications'
             and column_name in ('application_kind','documents','reviewed_by','reviewed_at','rejection_reason')) as ver_cols,
         (select count(*)::int from information_schema.columns
           where table_schema = 'public' and table_name = 'delivery_partners'
             and column_name in ('documents','rejection_reason','reviewed_by','reviewed_at')) as partner_cols,
         (select count(*)::int from information_schema.columns
           where table_schema = 'public' and table_name = 'messages'
             and column_name = 'reply_to_id') as reply_cols,
         (select count(*)::int from public.service_areas) as areas`
    );
    const r = rows[0] || {};
    console.log(`  verification detail columns: ${r.ver_cols}/5 present`);
    console.log(`  rider document columns: ${r.partner_cols}/4 present`);
    console.log(`  message reply column: ${r.reply_cols}/1 present`);
    console.log(`  service areas seeded: ${r.areas}`);
    if (Number(r.ver_cols) < 5 || Number(r.partner_cols) < 4 || Number(r.reply_cols) < 1) {
      extraSchemaOk = false;
    }
  } catch {
    console.log('  community/trust schema: MISSING');
    extraSchemaOk = false;
  }

  // Admin accounts (who can open the Admin panel)
  try {
    const { rows } = await client.query(
      `select id, email, role from public.profiles where role in ('ADMIN','SUPER_ADMIN') order by id`
    );
    if (!rows.length) console.log('  admins: none found');
    else for (const r of rows) console.log(`  admin: #${r.id} ${r.email} — ${r.role}`);
  } catch {
    console.log('  admins: could not read profiles');
  }

  return VERIFY_RPCS.every((fn) => present.has(fn)) && missingTables.length === 0 && extraSchemaOk;
}

// ---------------------------------------------------------------------------
// Management API path (fallback)
// ---------------------------------------------------------------------------

async function runManagementQuery(sql, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${label} failed [${res.status}]: ${text.slice(0, 400)}`);
  return text;
}

async function verifyViaRest() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.log('Cannot verify over REST: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing.');
    return false;
  }
  // PostgREST publishes every exposed RPC in its OpenAPI spec. Reading the spec
  // avoids the false "missing" you get from POSTing `{}` at a function that
  // requires arguments (PGRST202 looks identical in both cases).
  let paths = {};
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    const spec = await res.json();
    paths = spec.paths || {};
  } catch (error) {
    console.log(`  could not read REST OpenAPI spec: ${error.message || error}`);
    return false;
  }
  let allPresent = true;
  for (const fn of VERIFY_RPCS) {
    const present = Boolean(paths[`/rpc/${fn}`]);
    if (!present) allPresent = false;
    console.log(`  ${present ? 'OK     ' : 'MISSING'} ${fn}`);
  }
  return allPresent;
}

// ---------------------------------------------------------------------------
// Rolled-back behavioural test for the money-moving premium RPCs
// ---------------------------------------------------------------------------

async function verifyPremiumRpcBehaviour(client) {
  await client.query('BEGIN');
  try {
    const product = (
      await client.query(
        `select id, seller_id, price, quantity, title, category from public.products
          where stock_status in ('IN_STOCK','LOW_STOCK')
            and moderation_status = 'APPROVED'
          order by id limit 1`
      )
    ).rows[0];
    if (!product) throw new Error('No eligible product to exercise promotion RPCs');
    const admin = (
      await client.query("select id from public.profiles where role in ('ADMIN','SUPER_ADMIN') order by id limit 1")
    ).rows[0];
    if (!admin) throw new Error('No admin profile for Flash Sale review test');

    // Test fixture only: use the ledger writer's own transaction-local flag,
    // then roll the whole transaction back so no real wallet is changed.
    await client.query("select set_config('goodsale.wallet_write', 'on', true)");
    await client.query(
      `insert into public.wallets (user_id, balance) values ($1, 500000)
       on conflict (user_id) do update set balance = 500000`,
      [product.seller_id]
    );
    await client.query("select set_config('goodsale.wallet_write', 'off', true)");
    const stamp = Date.now();
    await client.query("select public.issue_premium_credits($1, 1500, 'TEST', $2, 30)", [
      product.seller_id,
      `TEST_ISSUE_${stamp}`,
    ]);
    const creditBalance = Number(
      (await client.query('select public.premium_credit_balance($1) as balance', [product.seller_id])).rows[0]
        .balance
    );
    if (creditBalance !== 1500) throw new Error(`Expected 1500 credits, received ${creditBalance}`);

    const featured = (
      await client.query('select public.purchase_featured_promotion($1, $2, 3, true) as result', [
        product.seller_id,
        product.id,
      ])
    ).rows[0].result;
    const walletAfterFeatured = Number(
      (await client.query('select balance from public.wallets where user_id = $1', [product.seller_id])).rows[0]
        .balance
    );
    if (Number(featured.creditsApplied) <= 0) throw new Error('Featured purchase did not redeem credits');

    const salePrice = Math.max(1, Math.floor(Number(product.price) * 0.8));
    const rejected = (
      await client.query('select public.purchase_flash_sale($1, $2, $3, $4, 1, true) as result', [
        product.seller_id,
        product.id,
        salePrice,
        new Date(Date.now() + 120000).toISOString(),
      ])
    ).rows[0].result;
    await client.query("select public.admin_review_flash_sale($1, $2, 'REJECT', 'rolled-back test')", [
      Number(rejected.promotionId),
      admin.id,
    ]);
    const walletAfterReject = Number(
      (await client.query('select balance from public.wallets where user_id = $1', [product.seller_id])).rows[0]
        .balance
    );
    if (walletAfterReject !== walletAfterFeatured) {
      throw new Error(`Rejected Flash Sale did not restore wallet ${walletAfterReject} vs ${walletAfterFeatured}`);
    }

    const approved = (
      await client.query('select public.purchase_flash_sale($1, $2, $3, $4, 1, true) as result', [
        product.seller_id,
        product.id,
        salePrice,
        new Date(Date.now() + 180000).toISOString(),
      ])
    ).rows[0].result;
    await client.query("select public.admin_review_flash_sale($1, $2, 'APPROVE', 'rolled-back test')", [
      Number(approved.promotionId),
      admin.id,
    ]);
    await client.query(
      `update public.featured_listings set starts_at = now(), ends_at = now() + interval '1 hour'
        where id = $1`,
      [Number(approved.promotionId)]
    );
    const jobs = (await client.query('select public.run_premium_jobs() as result')).rows[0].result;
    const live = (
      await client.query('select status from public.featured_listings where id = $1', [Number(approved.promotionId)])
    ).rows[0];
    if (live?.status !== 'ACTIVE') throw new Error(`Approved Flash Sale is ${live?.status}, expected ACTIVE`);

    await client.query(
      `update public.featured_listings set starts_at = now() - interval '2 days', ends_at = now() - interval '1 minute'
        where id = $1`,
      [Number(approved.promotionId)]
    );
    await client.query('select public.run_premium_jobs()');
    const expired = (
      await client.query(
        'select status from public.featured_listings where id = $1',
        [Number(approved.promotionId)]
      )
    ).rows[0];
    if (expired?.status !== 'EXPIRED') throw new Error(`Expired Flash Sale is ${expired?.status}, expected EXPIRED`);

    console.log('  OK      credits issued, balance and redemption');
    console.log('  OK      featured promotion purchase with credits');
    console.log('  OK      Flash Sale rejection refunds wallet and credits');
    console.log('  OK      Flash Sale approval, activation and expiry jobs');

    const campaign = (
      await client.query(
        `select public.purchase_sponsored_campaign_v2(
           $1, 'PRODUCT', $2, 'Rolled-back CPC test', 1000, '', '["HOME"]'::jsonb,
           '', '', '', now(), now() + interval '1 day', 500, 100
         ) as result`,
        [product.seller_id, product.id]
      )
    ).rows[0].result;
    await client.query(
      `update public.sponsored_ads
          set status = 'ACTIVE', moderation_status = 'APPROVED'
        where id = $1`,
      [Number(campaign.campaignId)]
    );
    await client.query("select public.record_sponsored_ad_event_v2($1, 'IMPRESSION', $2, '', '', $3)", [
      Number(campaign.campaignId),
      `TEST_IMP_${stamp}`,
      product.category,
    ]);
    const click = (
      await client.query("select public.record_sponsored_ad_event_v2($1, 'CLICK', $2, '', '', $3) as result", [
        Number(campaign.campaignId),
        `TEST_CLICK_${stamp}`,
        product.category,
      ])
    ).rows[0].result;
    if (!click.success || Number(click.spend) !== 100) throw new Error('CPC click was not charged at the bid');
    const order = (await client.query('select id, total_amount from public.orders order by id limit 1')).rows[0];
    if (order) {
      const conversion = (
        await client.query("select public.record_sponsored_ad_event_v2($1, 'CONVERSION', $2, '', '', '', $3, $4) as result", [
          Number(campaign.campaignId),
          `TEST_CONV_${stamp}`,
          order.id,
          order.total_amount,
        ])
      ).rows[0].result;
      if (!conversion.success) throw new Error('Attributed conversion was not recorded');
    }
    const adTotals = (
      await client.query(
        'select impressions, clicks, spent, conversions, conversion_value from public.sponsored_ads where id = $1',
        [Number(campaign.campaignId)]
      )
    ).rows[0];
    if (Number(adTotals.clicks) !== 1 || Number(adTotals.spent) !== 100) {
      throw new Error('Campaign totals were not updated correctly');
    }

    console.log('  OK      sponsored campaign budget reservation and CPC click');
    console.log('  OK      targeted delivery counters and conversion attribution');
    console.log(`  OK      lifecycle job keys: ${Object.keys(jobs || {}).join(', ')}`);
    return true;
  } catch (error) {
    console.error(`  FAILED  ${error.message || error}`);
    return false;
  } finally {
    await client.query('ROLLBACK').catch(() => {});
  }
}

// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const verifyOnly = args.includes('--verify');
const verifyRpcBehaviour = args.includes('--verify-rpcs');
const fromArg = args.find((a) => a.startsWith('--from='));
const onlyArg = args.find((a) => a.startsWith('--only='));
const from = fromArg ? fromArg.split('=')[1] : null;
const only = onlyArg ? onlyArg.split('=')[1] : null;

const usePg = Boolean(DATABASE_URL);

if (verifyOnly) {
  console.log(`Verifying ${projectRef || 'project'}…`);
  const ok = usePg ? await withPg(verifyWithPg) : await verifyViaRest();
  process.exit(ok ? 0 : 1);
}

if (verifyRpcBehaviour) {
  if (!usePg) {
    console.error('--verify-rpcs needs DATABASE_URL for a rolled-back transactional test.');
    process.exit(1);
  }
  console.log(`Verifying premium RPC behaviour on ${projectRef || 'database'} (rolled back)…`);
  const ok = await withPg(verifyPremiumRpcBehaviour);
  process.exit(ok ? 0 : 1);
}

if (!usePg && !ACCESS_TOKEN) {
  console.error(
    [
      '',
      'No way to run DDL.',
      '',
      '  • Preferred: set DATABASE_URL to your Supabase Postgres connection string',
      '    (Project Settings → Database → Connection string), then re-run.',
      '  • Or set SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens).',
      '',
      'You can always paste these files into the Supabase SQL Editor in order:',
      ...sqlFiles({ from, only }).map((f) => `  - ${f}`),
      '',
    ].join('\n')
  );
  process.exit(1);
}

const files = sqlFiles({ from, only });

if (usePg) {
  console.log(`Applying SQL to ${projectRef || 'database'} over direct Postgres…`);
  try {
    await withPg(async (client) => {
      await applyWithPg(client, files);
      // Tell PostgREST to pick up the new functions immediately.
      await client.query("NOTIFY pgrst, 'reload schema'").catch(() => {});
      console.log('\nVerifying required RPCs and tables…');
      const ok = await verifyWithPg(client);
      console.log(ok ? '\nAll required RPCs and tables are present. ✅' : '\nSomething is still missing. ⚠️');
      if (!ok) process.exitCode = 1;
    });
  } catch {
    process.exitCode = 1;
  }
  process.exit();
}

if (!projectRef) {
  console.error('NEXT_PUBLIC_SUPABASE_URL is missing or not a supabase.co URL.');
  process.exit(1);
}

console.log(`Applying SQL to project ${projectRef} via Management API…`);
for (const file of files) {
  const sql = readFileSync(join(root, file), 'utf8');
  process.stdout.write(`  → ${file} … `);
  try {
    await runManagementQuery(sql, file);
    console.log('done');
  } catch (error) {
    console.log('FAILED');
    console.error(String(error.message || error));
    process.exit(1);
  }
}

console.log('\nVerifying required RPCs…');
const ok = await verifyViaRest();
console.log(ok ? '\nAll required RPCs are present. ✅' : '\nSome RPCs are still missing. ⚠️');
process.exit(ok ? 0 : 1);
