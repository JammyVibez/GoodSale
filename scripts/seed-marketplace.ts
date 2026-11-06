// scripts/seed-marketplace.ts
/**
 * Executes the launch-catalog seeding against the live project.
 *
 *   npx tsx scripts/seed-marketplace.ts          # create anything missing
 *   npx tsx scripts/seed-marketplace.ts --force  # wipe seeded rows and rebuild
 *
 * Same code path the admin "Launch catalog" button uses (lib/seed/db.ts), run
 * from the terminal so the catalog can be created without an admin session.
 * Reads SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL / DATABASE_URL from the
 * environment and never prints a secret.
 */
import { createClient } from '@supabase/supabase-js';
import { seedCatalog, listSeededCatalog, seededSchemaMessage } from '../lib/seed/db';

const force = process.argv.includes('--force');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log(
  `env: SUPABASE_URL=${Boolean(url)} SERVICE_ROLE=${Boolean(serviceKey)} ANON_KEY=${Boolean(anonKey)} ` +
    `DATABASE_URL=${Boolean(process.env.DATABASE_URL)}`
);

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  if (!url || !anonKey || !serviceKey) {
    console.error(
      `Missing env: SUPABASE_URL=${Boolean(url)} SERVICE_ROLE=${Boolean(serviceKey)} ANON_KEY=${Boolean(anonKey)}`
    );
    process.exit(1);
  }

  const schemaIssue = await seededSchemaMessage(admin);
  if (schemaIssue) {
    console.error(schemaIssue);
    process.exit(1);
  }

  const summary = await seedCatalog(admin, { force });
  console.log('seed summary:', JSON.stringify(summary));

  const snapshot = await listSeededCatalog(admin);
  console.log('catalog totals:', JSON.stringify(snapshot.totals));
  console.log('seller states:', JSON.stringify(snapshot.sellers.map((s) => `${s.city}, ${s.state}`)));

  // Verify an anonymous visitor (the marketplace client) can read the seeded rows.
  if (anonKey) {
    const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const checks: Record<string, number | string> = {};
    for (const [label, query] of [
      ['profiles', anon.from('profiles').select('id', { count: 'exact', head: true }).eq('is_seeded', true)],
      ['businesses', anon.from('businesses').select('id', { count: 'exact', head: true }).eq('is_seeded', true)],
      ['products', anon.from('products').select('id', { count: 'exact', head: true }).eq('is_seeded', true)],
      ['reviews', anon.from('reviews').select('id', { count: 'exact', head: true }).gt('rating', 0)],
    ] as const) {
      const { count, error } = await query;
      checks[label] = error ? `ERROR ${error.message}` : (count ?? 0);
    }
    console.log('anon-key visibility:', JSON.stringify(checks));
  } else {
    console.log('anon-key visibility: SKIPPED (NEXT_PUBLIC_SUPABASE_ANON_KEY not set)');
  }
}

main()
  .then(() => {
    console.log('DONE');
    process.exit(0);
  })
  .catch((err) => {
    console.error('FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
