#!/usr/bin/env node
/**
 * Referral attribution, qualification and reward integration check.
 *
 * Runs inside one Postgres transaction and ALWAYS rolls back. It creates a
 * temporary campaign, temporary attribution and a delivered order, then verifies
 * that coins are credited exactly once and reversed on admin disqualification.
 *
 * Usage: node scripts/verify-referrals.mjs
 */
import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required to verify referrals.');
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

async function setClaims({ sub = null, role = 'authenticated' }) {
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [
    sub || '',
  ]);
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub, role }),
  ]);
}

async function setReferralWrite(on) {
  await client.query(`SELECT set_config('goodsale.referral_write', $1, true)`, [
    on ? 'on' : 'off',
  ]);
  await client.query(`SELECT set_config('goodsale.rewards_write', $1, true)`, [
    on ? 'on' : 'off',
  ]);
}

async function main() {
  await client.connect();
  await client.query('BEGIN');

  console.log('Referral verification (transaction will be rolled back)');

  const columns = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'referrals'
      AND column_name IN ('campaign_id','referrer_reward','referee_reward','qualified_at','rewarded_at','fraud_flags')
  `);
  check(columns.rowCount === 6, 'referral lifecycle columns exist');

  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('referral_campaigns','referral_clicks','referral_rewards','referral_events')
  `);
  check(tables.rowCount === 4, 'campaign, click, reward and event tables exist');

  const indexes = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND indexname IN ('uq_profiles_referral_code','uq_referrals_referee')
  `);
  check(indexes.rowCount === 2, 'referral code and single-attribution uniqueness exist');

  const pair = await client.query(`
    SELECT
      (SELECT id FROM public.profiles WHERE auth_id IS NOT NULL AND is_suspended = false ORDER BY id LIMIT 1) AS referrer_id,
      (SELECT p.id FROM public.profiles p
        WHERE p.auth_id IS NOT NULL AND p.is_suspended = false
          AND p.role NOT IN ('ADMIN','SUPER_ADMIN')
          AND p.id <> (SELECT id FROM public.profiles WHERE auth_id IS NOT NULL ORDER BY id LIMIT 1)
          AND p.referred_by_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM public.referrals r WHERE r.referee_id = p.id)
        ORDER BY p.id LIMIT 1) AS referee_id
  `);
  const referrerId = Number(pair.rows[0]?.referrer_id);
  const refereeId = Number(pair.rows[0]?.referee_id);
  if (!referrerId || !refereeId) throw new Error('Two usable profiles are required for this test');

  const admin = await client.query(`
    SELECT id, auth_id FROM public.profiles
    WHERE role IN ('ADMIN','SUPER_ADMIN') AND auth_id IS NOT NULL
    ORDER BY id LIMIT 1
  `);
  if (!admin.rowCount) throw new Error('An admin profile is required');
  const adminId = Number(admin.rows[0].id);
  const adminAuthId = String(admin.rows[0].auth_id);

  const campaign = await client.query(
    `INSERT INTO public.referral_campaigns
       (name, slug, description, status, audience, referrer_reward, referee_reward,
        require_email_verified, require_onboarding, qualifying_actions,
        max_rewards_per_user, max_rewards_per_campaign, starts_at)
     VALUES ('Rollback referral test', $1, 'Temporary verification campaign', 'ACTIVE', 'ANY',
             500, 250, true, true, ARRAY['PURCHASE']::text[], 20, 1000, now() - interval '1 minute')
     RETURNING id`,
    [`rollback-referral-${Date.now()}`]
  );
  const campaignId = Number(campaign.rows[0].id);

  await setClaims({ role: 'service_role' });
  await setReferralWrite(true);
  await client.query(
    `UPDATE public.profiles
     SET referral_code = $1, referred_by_id = NULL, signup_ip_hash = 'same-test-ip-hash'
     WHERE id = $2`,
    [`TESTREF-GS${String(Date.now()).slice(-3)}`, referrerId]
  );
  await client.query(
    `UPDATE public.profiles
     SET referred_by_id = NULL, signup_ip_hash = 'same-test-ip-hash'
     WHERE id = $1`,
    [refereeId]
  );
  await client.query(`DELETE FROM public.referrals WHERE referee_id = $1`, [refereeId]);
  await client.query(
    `UPDATE auth.users SET email_confirmed_at = COALESCE(email_confirmed_at, now()) WHERE id = (
       SELECT auth_id FROM public.profiles WHERE id = $1
     )`,
    [refereeId]
  );
  await setReferralWrite(false);

  const code = await client.query(
    `SELECT referral_code FROM public.profiles WHERE id = $1`,
    [referrerId]
  );
  const referralCode = String(code.rows[0].referral_code);
  check(/^[A-Z0-9-]{3,40}$/.test(referralCode), 'profile has a valid unique referral code');

  await setClaims({ role: 'service_role' });
  const attributed = await client.query(
    `SELECT public.attribute_referral($1, $2, 'same-test-ip-hash') AS result`,
    [refereeId, referralCode.toLowerCase()]
  );
  check(attributed.rows[0].result?.success === true, 'server attribution accepts a valid code');
  check(
    ['REGISTERED', 'VERIFICATION_PENDING'].includes(String(attributed.rows[0].result?.status)),
    'attribution starts before qualification'
  );

  const referralRow = await client.query(
    `SELECT id, status, campaign_id, fraud_flags, referrer_reward, referee_reward
     FROM public.referrals WHERE referee_id = $1`,
    [refereeId]
  );
  check(referralRow.rowCount === 1, 'one attribution row was created');
  const referralId = Number(referralRow.rows[0].id);
  check(
    String(referralRow.rows[0].campaign_id) === String(campaignId),
    'attribution uses the active campaign'
  );
  check(
    (referralRow.rows[0].fraud_flags || []).includes('SHARED_SIGNUP_IP'),
    'shared signup network is flagged without automatic rejection'
  );
  check(
    Number(referralRow.rows[0].referrer_reward) === 500 &&
      Number(referralRow.rows[0].referee_reward) === 250,
    'reward amounts are snapshotted at attribution'
  );

  const duplicate = await client.query(
    `SELECT public.attribute_referral($1, $2, 'same-test-ip-hash') AS result`,
    [refereeId, referralCode]
  );
  check(
    duplicate.rows[0].result?.already_attributed === true,
    'a second attribution for the same account is ignored'
  );

  const self = await client.query(
    `SELECT public.attribute_referral($1, $2, NULL) AS result`,
    [referrerId, referralCode]
  );
  check(self.rows[0].result?.error === 'self_referral', 'self-referral is rejected');

  const ownershipBefore = await client.query(
    `SELECT referred_by_id FROM public.profiles WHERE id = $1`,
    [refereeId]
  );
  await setClaims({ sub: String((await client.query(
    `SELECT auth_id FROM public.profiles WHERE id = $1`,
    [refereeId]
  )).rows[0].auth_id), role: 'authenticated' });
  await client.query(`SELECT set_config('goodsale.referral_write', 'off', true)`);
  await client.query(`SELECT set_config('goodsale.rewards_write', 'off', true)`);
  await expectFailure(
    'authenticated users cannot change referral ownership',
    `UPDATE public.profiles SET referred_by_id = $1 WHERE id = $2`,
    [adminId, refereeId]
  );
  await expectFailure(
    'authenticated users cannot award themselves GoodSale Coins',
    `UPDATE public.profiles SET good_points = good_points + 9999 WHERE id = $1`,
    [refereeId]
  );
  const ownershipAfter = await client.query(
    `SELECT referred_by_id FROM public.profiles WHERE id = $1`,
    [refereeId]
  );
  check(
    Number(ownershipAfter.rows[0].referred_by_id) ===
      Number(ownershipBefore.rows[0].referred_by_id),
    'referral ownership stayed unchanged'
  );

  const balancesBefore = await client.query(
    `SELECT id, good_points FROM public.profiles WHERE id = ANY($1::bigint[])`,
    [[referrerId, refereeId]]
  );
  const beforeById = new Map(
    balancesBefore.rows.map((row) => [Number(row.id), Number(row.good_points)])
  );

  await setClaims({ role: 'service_role' });
  await setReferralWrite(true);
  await client.query(
    `UPDATE public.profiles SET onboarding_completed_at = now() WHERE id = $1`,
    [refereeId]
  );
  await setReferralWrite(false);

  const seller = await client.query(
    `SELECT id AS product_id, seller_id, title
     FROM public.products WHERE seller_id <> $1 ORDER BY id LIMIT 1`,
    [refereeId]
  );
  if (seller.rowCount !== 1) throw new Error('A product is required for the purchase test');
  await client.query(
    `INSERT INTO public.orders
       (order_number, buyer_id, seller_id, product_id, product_title, total_amount, status)
     VALUES ($1, $2, $3, $4, $5, 1000, 'DELIVERED_SUCCESS')`,
    [
      `TEST-REF-${Date.now()}`,
      refereeId,
      Number(seller.rows[0].seller_id),
      Number(seller.rows[0].product_id),
      String(seller.rows[0].title || 'Referral test item'),
    ]
  );

  const rewarded = await client.query(
    `SELECT status, rewarded_at FROM public.referrals WHERE id = $1`,
    [referralId]
  );
  check(rewarded.rows[0]?.status === 'REWARDED', 'completed purchase qualifies and rewards');
  const rewardRows = await client.query(
    `SELECT beneficiary_role, amount, status FROM public.referral_rewards WHERE referral_id = $1`,
    [referralId]
  );
  check(rewardRows.rowCount === 2, 'one reward transaction per beneficiary was created');
  check(
    rewardRows.rows.every((row) => row.status === 'ISSUED'),
    'reward transactions are issued'
  );

  const balancesAfter = await client.query(
    `SELECT id, good_points FROM public.profiles WHERE id = ANY($1::bigint[])`,
    [[referrerId, refereeId]]
  );
  const afterById = new Map(
    balancesAfter.rows.map((row) => [Number(row.id), Number(row.good_points)])
  );
  check(
    afterById.get(referrerId) === beforeById.get(referrerId) + 500,
    'referrer received exactly 500 GoodSale Coins'
  );
  check(
    afterById.get(refereeId) === beforeById.get(refereeId) + 250,
    'new member received exactly 250 GoodSale Coins'
  );

  const coinLedger = await client.query(
    `SELECT reference, points, source FROM public.good_points_transactions
     WHERE metadata->>'referral_id' = $1`,
    [String(referralId)]
  );
  check(coinLedger.rowCount === 2, 'reward coins wrote two ledger entries');
  check(
    coinLedger.rows.every((row) => row.source === 'REFERRAL_REWARD' && row.reference),
    'reward ledger entries have unique references and a referral source'
  );

  await client.query(`SELECT public.referral_evaluate($1)`, [referralId]);
  const balancesDuplicate = await client.query(
    `SELECT id, good_points FROM public.profiles WHERE id = ANY($1::bigint[])`,
    [[referrerId, refereeId]]
  );
  const duplicateById = new Map(
    balancesDuplicate.rows.map((row) => [Number(row.id), Number(row.good_points)])
  );
  check(
    duplicateById.get(referrerId) === afterById.get(referrerId) &&
      duplicateById.get(refereeId) === afterById.get(refereeId),
    're-evaluating a rewarded referral does not credit twice'
  );

  await setClaims({ sub: adminAuthId, role: 'authenticated' });
  const analytics = await client.query(`SELECT public.admin_referral_analytics() AS result`);
  check(
    Number(analytics.rows[0].result?.rewarded || 0) >= 1,
    'admin referral analytics counts rewarded referrals'
  );

  const disqualified = await client.query(
    `SELECT public.admin_disqualify_referral($1, 'Rollback test fraud review') AS result`,
    [referralId]
  );
  check(disqualified.rows[0].result?.success === true, 'admin disqualification succeeds');
  const finalReferral = await client.query(
    `SELECT status, disqualification_reason FROM public.referrals WHERE id = $1`,
    [referralId]
  );
  check(finalReferral.rows[0]?.status === 'DISQUALIFIED', 'disqualified referral state is stored');
  const reversed = await client.query(
    `SELECT status FROM public.referral_rewards WHERE referral_id = $1`,
    [referralId]
  );
  check(
    reversed.rows.length === 2 && reversed.rows.every((row) => row.status === 'REVERSED'),
    'issued coins are reversed on disqualification'
  );

  const finalBalances = await client.query(
    `SELECT id, good_points FROM public.profiles WHERE id = ANY($1::bigint[])`,
    [[referrerId, refereeId]]
  );
  const finalById = new Map(
    finalBalances.rows.map((row) => [Number(row.id), Number(row.good_points)])
  );
  check(
    finalById.get(referrerId) === beforeById.get(referrerId) &&
      finalById.get(refereeId) === beforeById.get(refereeId),
    'disqualification returns both balances to their starting values'
  );

  await client.query('ROLLBACK');
  await client.end();

  if (failed) {
    console.error('\nReferral verification failed ❌');
    process.exit(1);
  }
  console.log('\nReferral verification passed ✅');
}

main().catch(async (error) => {
  try {
    await client.query('ROLLBACK');
  } catch {
    // ignore
  }
  console.error(error);
  await client.end().catch(() => {});
  process.exit(1);
});
