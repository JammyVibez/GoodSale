#!/usr/bin/env node
/**
 * Wallet ledger integration check.
 *
 * Runs inside one Postgres transaction and ALWAYS rolls back. It uses temporary
 * provider references and an existing profile, but never leaves a balance,
 * withdrawal, funding intent or ledger row behind.
 *
 * Usage: node scripts/verify-wallet-ledger.mjs
 */
import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required to verify the wallet ledger.');
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

async function main() {
  await client.connect();
  await client.query('BEGIN');

  console.log('Wallet ledger verification (transaction will be rolled back)');

  const schema = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallet_transactions'
      AND column_name IN ('reference','provider_reference','balance_after','affects_balance')
  `);
  check(schema.rowCount === 4, 'ledger reference/provider/balance columns exist');

  const settings = await client.query('SELECT * FROM public.wallet_settings WHERE id = 1');
  check(settings.rowCount === 1, 'wallet_settings singleton exists');

  const profile = await client.query(`
    SELECT p.id, p.auth_id
    FROM public.profiles p
    WHERE p.auth_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.withdrawal_requests w
        WHERE w.user_id = p.id AND w.status IN ('PENDING', 'PROCESSING')
      )
    ORDER BY p.id
    LIMIT 1
  `);
  if (profile.rowCount !== 1) throw new Error('No profile available for the rollback test');
  const userId = Number(profile.rows[0].id);
  const authId = String(profile.rows[0].auth_id);

  await client.query(
    `INSERT INTO public.wallets (user_id, balance) VALUES ($1, 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
  await client.query(`SELECT set_config('goodsale.wallet_write', 'on', true)`);
  await client.query(`UPDATE public.wallets SET balance = 5000 WHERE user_id = $1`, [userId]);

  const reference = `TEST-FUND-${Date.now()}`;
  const funding = await client.query(
    `INSERT INTO public.wallet_funding_intents
       (user_id, reference, provider, amount, currency, status)
     VALUES ($1, $2, 'paystack', 100, 'NGN', 'PENDING')
     RETURNING id`,
    [userId, reference]
  );
  const fundingId = Number(funding.rows[0].id);

  const credit = await client.query(
    `SELECT public.credit_wallet_funding($1, $2, 'test') AS result`,
    [fundingId, reference]
  );
  check(credit.rows[0].result?.success === true, 'verified funding credits the wallet');

  const afterCredit = await client.query(`SELECT balance FROM public.wallets WHERE user_id = $1`, [userId]);
  check(Number(afterCredit.rows[0].balance) === 5100, 'funding increased the balance exactly once');

  const duplicate = await client.query(
    `SELECT public.credit_wallet_funding($1, $2, 'test') AS result`,
    [fundingId, reference]
  );
  check(duplicate.rows[0].result?.already_credited === true, 'duplicate funding is idempotent');

  const afterDuplicate = await client.query(`SELECT balance FROM public.wallets WHERE user_id = $1`, [userId]);
  check(Number(afterDuplicate.rows[0].balance) === 5100, 'duplicate funding did not credit twice');

  const ledger = await client.query(
    `SELECT reference, status, balance_after FROM public.wallet_transactions
     WHERE provider = 'paystack' AND provider_reference = $1`,
    [reference]
  );
  check(ledger.rowCount === 1, 'funding wrote one permanent ledger row');
  check(ledger.rows[0]?.status === 'COMPLETED', 'funding ledger row is completed');
  check(Boolean(ledger.rows[0]?.reference), 'funding ledger row has a unique reference');

  await expectFailure(
    'append-only trigger rejects ledger amount edits',
    `UPDATE public.wallet_transactions SET amount = 999
     WHERE provider = 'paystack' AND provider_reference = $1`,
    [reference]
  );

  await client.query(
    `SELECT set_config('request.jwt.claim.sub', $1, true)`,
    [authId]
  );
  await client.query(
    `SELECT set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: authId, role: 'authenticated' })]
  );

  const withdrawal = await client.query(
    `SELECT public.request_withdrawal(1000, 'Test Bank', 'Test Seller', '0000000000') AS result`
  );
  check(withdrawal.rows[0].result?.success === true, 'withdrawal reserves available funds');
  check(withdrawal.rows[0].result?.status === 'PENDING', 'withdrawal starts pending');

  const afterWithdrawal = await client.query(`SELECT balance FROM public.wallets WHERE user_id = $1`, [userId]);
  check(Number(afterWithdrawal.rows[0].balance) === 4100, 'withdrawal reduced available balance');

  await expectFailure(
    'duplicate withdrawal is rejected',
    `SELECT public.request_withdrawal(1000, 'Test Bank', 'Test Seller', '0000000000')`
  );

  let walletOrderId = null;
  const product = await client.query(
    `SELECT id, seller_id, title FROM public.products
     WHERE seller_id <> $1 ORDER BY id LIMIT 1`,
    [userId]
  );
  if (product.rowCount === 1) {
    const order = await client.query(
      `INSERT INTO public.orders
         (order_number, buyer_id, seller_id, product_id, product_title, total_amount, status)
       VALUES ($1, $2, $3, $4, $5, 500, 'PENDING')
       RETURNING id`,
      [
        `TEST-WALLET-${Date.now()}`,
        userId,
        Number(product.rows[0].seller_id),
        Number(product.rows[0].id),
        String(product.rows[0].title || 'Test item'),
      ]
    );
    const orderId = Number(order.rows[0].id);
    walletOrderId = orderId;
    const paid = await client.query(
      `SELECT public.pay_order_with_wallet($1) AS result`,
      [orderId]
    );
    check(paid.rows[0].result?.success === true, 'wallet checkout pays an eligible order');

    const afterOrder = await client.query(`SELECT balance FROM public.wallets WHERE user_id = $1`, [userId]);
    check(Number(afterOrder.rows[0].balance) === 3600, 'wallet checkout debited exactly the order total');

    const orderRow = await client.query(`SELECT status FROM public.orders WHERE id = $1`, [orderId]);
    check(orderRow.rows[0]?.status === 'PAID_ESCROW', 'wallet checkout locks the order into escrow');

    const escrowRow = await client.query(
      `SELECT held_amount, is_released, is_refunded FROM public.escrows WHERE order_id = $1`,
      [orderId]
    );
    check(
      escrowRow.rowCount === 1 && Number(escrowRow.rows[0].held_amount) === 500,
      'wallet checkout created the escrow hold'
    );

    const repeat = await client.query(
      `SELECT public.pay_order_with_wallet($1) AS result`,
      [orderId]
    );
    check(repeat.rows[0].result?.already_paid === true, 'duplicate wallet checkout is idempotent');
    const afterRepeat = await client.query(`SELECT balance FROM public.wallets WHERE user_id = $1`, [userId]);
    check(Number(afterRepeat.rows[0].balance) === 3600, 'duplicate wallet checkout did not debit twice');
  } else {
    console.log('  SKIP    wallet checkout — no second seller/product available for a temp order');
  }

  const admin = await client.query(
    `SELECT p.id, p.auth_id FROM public.profiles p
     WHERE p.role IN ('ADMIN', 'SUPER_ADMIN') AND p.auth_id IS NOT NULL
     ORDER BY p.id LIMIT 1`
  );
  check(admin.rowCount === 1, 'an admin profile exists for audit checks');
  if (admin.rowCount === 1) {
    const adminAuthId = String(admin.rows[0].auth_id);
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [adminAuthId]);
    await client.query(
      `SELECT set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: adminAuthId, role: 'authenticated' })]
    );
    const summary = await client.query(`SELECT public.admin_finance_summary() AS result`);
    check(
      typeof summary.rows[0].result?.wallet_liabilities === 'number',
      'admin finance summary returns wallet liabilities'
    );

    if (walletOrderId) {
      const refund = await client.query(
        `INSERT INTO public.refunds
           (refund_number, transaction_id, order_id, amount, reason, status)
         VALUES ($1, $2, $3, 500, 'Rollback test refund', 'PENDING')
         RETURNING id`,
        [`TEST-RF-${Date.now()}`, `TEST-TX-${Date.now()}`, walletOrderId]
      );
      const refundId = Number(refund.rows[0].id);
      const credited = await client.query(
        `SELECT public.admin_refund_to_wallet($1, 'Rollback test refund') AS result`,
        [refundId]
      );
      check(credited.rows[0].result?.success === true, 'admin refund credits the buyer wallet');
      const afterRefund = await client.query(`SELECT balance FROM public.wallets WHERE user_id = $1`, [userId]);
      check(Number(afterRefund.rows[0].balance) === 4100, 'refund credited exactly once');

      const duplicateRefund = await client.query(
        `SELECT public.admin_refund_to_wallet($1, 'Rollback test refund') AS result`,
        [refundId]
      );
      check(
        duplicateRefund.rows[0].result?.already_completed === true,
        'duplicate refund is idempotent'
      );
      const afterDuplicateRefund = await client.query(`SELECT balance FROM public.wallets WHERE user_id = $1`, [userId]);
      check(Number(afterDuplicateRefund.rows[0].balance) === 4100, 'duplicate refund did not credit twice');
    }
  }

  await client.query('ROLLBACK');
  console.log(failed ? '\nWallet ledger verification FAILED' : '\nWallet ledger verification passed ✅');
}

main()
  .catch(async (error) => {
    failed = true;
    console.error(error.message || error);
    await client.query('ROLLBACK').catch(() => {});
  })
  .finally(async () => {
    await client.end().catch(() => {});
    process.exit(failed ? 1 : 0);
  });
