#!/usr/bin/env node
/**
 * Phase 1 delivery verification — runs the real database functions inside one
 * transaction and rolls everything back. Nothing is persisted.
 *
 * Usage: node scripts/verify-delivery-phase1.mjs
 * Requires DATABASE_URL (same as the migration runner).
 */

import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '';
if (!connectionString) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function asProfile(authId, fn) {
  await client.query(
    `select set_config('request.jwt.claim.sub', $1, true),
            set_config('request.jwt.claims', $2, true)`,
    [String(authId), JSON.stringify({ sub: String(authId) })]
  );
  return fn();
}

async function expectError(name, authId, sql, params, fragment) {
  await client.query('savepoint expected_error');
  try {
    await asProfile(authId, () => client.query(sql, params));
    check(name, false, 'call unexpectedly succeeded');
  } catch (error) {
    check(name, String(error.message).toLowerCase().includes(fragment.toLowerCase()), error.message);
  } finally {
    await client.query('rollback to savepoint expected_error');
  }
}

async function main() {
  await client.connect();
  await client.query('begin');

  const { rows: profiles } = await client.query(
    `select id, auth_id, role, full_name from public.profiles where auth_id is not null order by id`
  );
  const seller = profiles.find((p) => ['SELLER', 'VERIFIED_SELLER', 'BUSINESS', 'VERIFIED_BUSINESS'].includes(p.role))
    || profiles.find((p) => !['ADMIN', 'SUPER_ADMIN'].includes(p.role));
  const buyer = profiles.find((p) => p.id !== seller?.id && !['ADMIN', 'SUPER_ADMIN'].includes(p.role));
  const admin = profiles.find((p) => ['ADMIN', 'SUPER_ADMIN'].includes(p.role));
  const riderProfile = profiles.find((p) => p.id !== seller?.id && p.id !== buyer?.id && !['ADMIN', 'SUPER_ADMIN'].includes(p.role));

  if (!seller || !buyer || !admin || !riderProfile) {
    console.log('SKIP  not enough seeded profiles to run the delivery verification.');
    await client.query('rollback');
    return;
  }

  await client.query(
    `insert into public.seller_shipping_settings (seller_id, pickup_address, pickup_city, pickup_state)
     values ($1, '12 Allen Avenue', 'Ikeja', 'Lagos State')
     on conflict (seller_id) do update
       set pickup_address = excluded.pickup_address,
           pickup_city = excluded.pickup_city,
           pickup_state = excluded.pickup_state`,
    [seller.id]
  );

  const { rows: productRows } = await client.query(
    `insert into public.products (seller_id, title, price, quantity, stock_status, images, delivery_method)
     values ($1, 'Phase 1 delivery verification item', 25000, 5, 'IN_STOCK', '[]'::jsonb, 'GOODSALE_PARTNER')
     returning id`,
    [seller.id]
  );
  const productId = productRows[0].id;

  const snapshot = {
    sellerId: Number(seller.id),
    sellerName: seller.full_name,
    method: 'GOODSALE_PARTNER',
    service: 'STANDARD',
    baseFee: 0,
    distanceFee: 1500,
    weightFee: 0,
    sizeFee: 0,
    remoteFee: 0,
    handlingFee: 0,
    platformFee: 0,
    zoneFee: 0,
    discount: 0,
    total: 1500,
    etaMinDays: 1,
    etaMaxDays: 2,
    freeShipping: false,
    manualQuote: false,
  };

  const { rows: orderRows } = await client.query(
    `insert into public.orders (
       order_number, buyer_id, seller_id, product_id, product_title, total_amount,
       delivery_fee, payment_method, delivery_method, delivery_address, delivery_city,
       delivery_state, delivery_pin, status, service_type, shipping_snapshot,
       estimated_delivery_min_days, estimated_delivery_max_days
     ) values (
       $1, $2, $3, $4, 'Phase 1 delivery verification item', 26500,
       1500, 'CARD', 'GOODSALE_PARTNER', '5 Admiralty Way', 'Lekki',
       'Lagos State', '123456', 'PAID_ESCROW', 'STANDARD', $5::jsonb, 1, 2
     ) returning id, order_number`,
    [`TST-${Date.now()}`, buyer.id, seller.id, productId, JSON.stringify(snapshot)]
  );
  const orderId = orderRows[0].id;
  const orderNumber = orderRows[0].order_number;

  await client.query(
    `insert into public.escrows (order_id, held_amount, is_released, is_refunded)
     values ($1, 26500, false, false)`,
    [orderId]
  );

  // ---------------------------------------------------------------- creation
  const { rows: deliveryRows } = await client.query(
    `select * from public.deliveries where order_id = $1`,
    [orderId]
  );
  const created = deliveryRows[0];
  check('order insert auto-creates exactly one delivery record', deliveryRows.length === 1);
  check('delivery starts at AWAITING_SELLER_PREPARATION', created?.status === 'AWAITING_SELLER_PREPARATION', created?.status);
  check('delivery copies the server fee snapshot', created && Number(created.delivery_fee) === 1500 && Number(created.fee_snapshot.total) === 1500, JSON.stringify(created?.fee_snapshot?.total));
  check('delivery copies pickup and destination addresses', created?.pickup_address === '12 Allen Avenue' && created?.delivery_address === '5 Admiralty Way', `${created?.pickup_address} → ${created?.delivery_address}`);
  check('delivery number derives from the order number', created?.delivery_number === `DLV-${orderNumber}`, created?.delivery_number);
  check('estimated delivery date comes from the quoted ETA', Boolean(created?.estimated_delivery_date), String(created?.estimated_delivery_date));
  check('creation is recorded in the event history', (await client.query(`select count(*)::int as c from public.delivery_events where delivery_id = $1`, [created.id])).rows[0].c >= 1);

  const deliveryId = created.id;

  // --------------------------------------------------------------- lifecycle
  await asProfile(seller.auth_id, () =>
    client.query(`select public.delivery_transition($1, 'READY_FOR_PICKUP', 'Item packed and ready')`, [deliveryId])
  );
  check('seller can mark ready for pickup', (await client.query(`select status from public.deliveries where id = $1`, [deliveryId])).rows[0].status === 'READY_FOR_PICKUP');

  await expectError(
    'seller cannot mark a delivery delivered',
    seller.auth_id,
    `select public.delivery_transition($1, 'DELIVERED', 'forced')`,
    [deliveryId],
    'confirmation code'
  );

  await expectError(
    'buyer cannot drive delivery lifecycle transitions',
    buyer.auth_id,
    `select public.delivery_transition($1, 'CANCELLED', 'buyer cancel')`,
    [deliveryId],
    'your role cannot'
  );

  await expectError(
    'buyer cannot assign a rider',
    buyer.auth_id,
    `select public.delivery_assign_rider($1, 1)`,
    [deliveryId],
    'admins only'
  );

  // -------------------------------------------------------- rider assignment
  const { rows: partnerRows } = await client.query(
    `insert into public.delivery_partners (user_id, full_name, phone, vehicle_type, status, is_available, city, state)
     values ($1, 'Verification Rider', '08000000000', 'MOTORCYCLE', 'APPROVED', true, 'Lekki', 'Lagos State')
     returning id`,
    [riderProfile.id]
  );
  const partnerId = partnerRows[0].id;

  const { rows: jobRows } = await client.query(
    `insert into public.delivery_jobs (order_id, partner_id, status, service_type, delivery_fee, pin)
     values ($1, null, 'PENDING', 'STANDARD', 1500, '1234') returning id`,
    [orderId]
  );
  const jobId = jobRows[0].id;

  await asProfile(admin.auth_id, () =>
    client.query(`select public.delivery_assign_rider($1, $2)`, [deliveryId, partnerId])
  );
  const afterAssign = (await client.query(`select status, rider_id, assignment_status from public.deliveries where id = $1`, [deliveryId])).rows[0];
  check('admin offers the rider and moves to RIDER_ASSIGNED', afterAssign.status === 'RIDER_ASSIGNED' && Number(afterAssign.rider_id) === Number(partnerId), afterAssign.status);
  check('admin assignment starts as an offer, not an acceptance', afterAssign.assignment_status === 'OFFERED', afterAssign.assignment_status);

  const jobPartner = (await client.query(`select partner_id from public.delivery_jobs where id = $1`, [jobId])).rows[0].partner_id;
  check('assignment keeps the dispatch job on the same rider', Number(jobPartner) === Number(partnerId));

  await asProfile(riderProfile.auth_id, () =>
    client.query(`select public.rider_accept_delivery($1)`, [deliveryId])
  );
  const accepted = (await client.query(`select assignment_status, rider_accepted_at from public.deliveries where id = $1`, [deliveryId])).rows[0];
  check('rider accepts the assignment', accepted.assignment_status === 'ACCEPTED' && Boolean(accepted.rider_accepted_at), accepted.assignment_status);

  await asProfile(riderProfile.auth_id, async () => {
    await client.query(`select public.rider_mark_arrival($1, 'PICKUP')`, [deliveryId]);
    await client.query(`select public.delivery_transition($1, 'PICKED_UP', 'Collected from seller')`, [deliveryId]);
    await client.query(`select public.delivery_transition($1, 'IN_TRANSIT', 'Heading to Lekki')`, [deliveryId]);
    await client.query(`select public.rider_mark_arrival($1, 'DESTINATION')`, [deliveryId]);
    await client.query(`select public.delivery_transition($1, 'OUT_FOR_DELIVERY', 'Rider is close')`, [deliveryId]);
  });
  const outForDelivery = (await client.query(`select status from public.deliveries where id = $1`, [deliveryId])).rows[0].status;
  check('assigned rider advances PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY', outForDelivery === 'OUT_FOR_DELIVERY', outForDelivery);

  await expectError(
    'rider cannot skip straight to delivered',
    riderProfile.auth_id,
    `select public.delivery_transition($1, 'DELIVERED', 'forced')`,
    [deliveryId],
    'confirmation code'
  );

  // ------------------------------------------------------- confirmation code
  await expectError(
    'only the buyer can reveal the confirmation code',
    seller.auth_id,
    `select public.delivery_generate_confirmation_code($1)`,
    [deliveryId],
    'only the buyer'
  );

  const codeResult = await asProfile(buyer.auth_id, () =>
    client.query(`select public.delivery_generate_confirmation_code($1) as payload`, [deliveryId])
  );
  const code = codeResult.rows[0].payload.code;
  check('buyer can generate a six-digit code', /^\d{6}$/.test(code), code);
  check('only a hash of the code is stored', (await client.query(`select confirmation_hash, confirmation_salt from public.deliveries where id = $1`, [deliveryId])).rows[0].confirmation_hash !== code);

  await expectError(
    'buyer cannot confirm their own delivery',
    buyer.auth_id,
    `select public.delivery_confirm_with_code($1, $2)`,
    [deliveryId, code],
    'only the assigned rider'
  );

  const wrongCode = await asProfile(riderProfile.auth_id, () =>
    client.query(`select public.delivery_confirm_with_code($1, '000000') as payload`, [deliveryId])
  );
  check(
    'wrong confirmation code is rejected',
    wrongCode.rows[0].payload.success === false && /incorrect/i.test(wrongCode.rows[0].payload.error || ''),
    JSON.stringify(wrongCode.rows[0].payload)
  );
  check('failed attempt is counted', Number((await client.query(`select confirmation_attempts from public.deliveries where id = $1`, [deliveryId])).rows[0].confirmation_attempts) === 1);

  await asProfile(riderProfile.auth_id, () =>
    client.query(`select public.delivery_confirm_with_code($1, $2)`, [deliveryId, code])
  );
  const delivered = (await client.query(`select status, delivered_at, confirmed_at, confirmed_by from public.deliveries where id = $1`, [deliveryId])).rows[0];
  check('correct code marks the delivery delivered with a timestamp', delivered.status === 'DELIVERED' && Boolean(delivered.delivered_at) && Boolean(delivered.confirmed_at));
  check('confirmation records who confirmed', Number(delivered.confirmed_by) === Number(riderProfile.id));

  const orderAfter = (await client.query(`select status from public.orders where id = $1`, [orderId])).rows[0].status;
  const escrowAfter = (await client.query(`select is_released from public.escrows where order_id = $1`, [orderId])).rows[0].is_released;
  check('delivery completion does not change order status', orderAfter === 'PAID_ESCROW', orderAfter);
  check('delivery completion does not release escrow', escrowAfter === false, String(escrowAfter));

  await expectError(
    'a closed delivery rejects further transitions',
    riderProfile.auth_id,
    `select public.delivery_transition($1, 'IN_TRANSIT', 'reopen')`,
    [deliveryId],
    'cannot move delivery'
  );

  // -------------------------------------------------------------- fee freeze
  await client.query(`update public.shipping_settings set local_base_fee = 99999, standard_fee = 88888 where id = 1`);
  const frozen = (await client.query(`select delivery_fee, fee_snapshot from public.deliveries where id = $1`, [deliveryId])).rows[0];
  check('admin price changes never re-price a paid delivery', Number(frozen.delivery_fee) === 1500 && Number(frozen.fee_snapshot.total) === 1500, `${frozen.delivery_fee}/${frozen.fee_snapshot.total}`);

  // ------------------------------------------------------------------- audit
  const auditCount = (await client.query(`select count(*)::int as c from public.delivery_audit_logs where delivery_id = $1`, [deliveryId])).rows[0].c;
  check('every action is written to the delivery audit log', auditCount >= 4, `${auditCount} entries`);

  await client.query('rollback');
  console.log('\nAll changes rolled back — no test data was persisted.');
}

main()
  .catch(async (error) => {
    console.error('Verification failed:', error.message);
    try { await client.query('rollback'); } catch {}
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end().catch(() => {});
    const failed = results.filter((entry) => !entry.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
    if (failed.length > 0) process.exitCode = 1;
  });
