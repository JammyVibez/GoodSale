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
];

/** Tables the schema is expected to create (mirrors supabase/schema.sql). */
const VERIFY_TABLES = [
  'announcements',
  'auctions',
  'audit_logs',
  'bids',
  'business_subscriptions',
  'businesses',
  'chat_rooms',
  'delivery_jobs',
  'delivery_partners',
  'disputes',
  'escrows',
  'featured_listings',
  'follower_relations',
  'good_points_transactions',
  'identity_verifications',
  'invoices',
  'messages',
  'notifications',
  'orders',
  'payment_logs',
  'payment_settings',
  'payment_transactions',
  'product_bundles',
  'products',
  'profiles',
  'referrals',
  'refunds',
  'revenue_settings',
  'review_replies',
  'reviews',
  'safe_meet_locations',
  'safe_meet_meetups',
  'sponsored_ads',
  'verified_plus_subscriptions',
  'wallet_transactions',
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

const args = process.argv.slice(2);
const verifyOnly = args.includes('--verify');
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
