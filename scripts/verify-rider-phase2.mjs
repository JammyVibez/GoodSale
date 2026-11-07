#!/usr/bin/env node
/**
 * Phase 2 rider verification — exercises the real database functions in one
 * transaction and rolls everything back. Nothing is persisted.
 *
 * Usage: node scripts/verify-rider-phase2.mjs
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

async function asRole(role, authId, fn) {
  await client.query('savepoint rls_check');
  try {
    await client.query(`set local role ${role}`);
    await client.query(
      `select set_config('request.jwt.claim.sub', $1, true),
              set_config('request.jwt.claims', $2, true)`,
      [authId ? String(authId) : '', authId ? JSON.stringify({ sub: String(authId) }) : '{}']
    );
    return await fn();
  } finally {
    await client.query('reset role');
    await client.query('release savepoint rls_check');
  }
}

async function createDelivery({ seller, buyer, label, fee = 1500 }) {
  const { rows: productRows } = await client.query(
    `insert into public.products (seller_id, title, price, quantity, stock_status, images, delivery_method)
     values ($1, $2, 25000, 5, 'IN_STOCK', '[]'::jsonb, 'GOODSALE_PARTNER')
     returning id`,
    [seller.id, `Phase 2 rider verification — ${label}`]
  );
  const snapshot = {
    sellerId: Number(seller.id),
    sellerName: seller.full_name,
    method: 'GOODSALE_PARTNER',
    service: 'STANDARD',
    baseFee: 0,
    distanceFee: fee,
    weightFee: 0,
    sizeFee: 0,
    remoteFee: 0,
    handlingFee: 0,
    platformFee: 0,
    zoneFee: 0,
    discount: 0,
    total: fee,
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
       $1, $2, $3, $4, $5, $6,
       $7, 'CARD', 'GOODSALE_PARTNER', '5 Admiralty Way', 'Lekki',
       'Lagos State', '123456', 'PAID_ESCROW', 'STANDARD', $8::jsonb, 1, 2
     ) returning id, order_number`,
    [
      `R2-${Date.now()}-${label}`,
      buyer.id,
      seller.id,
      productRows[0].id,
      `Phase 2 rider verification — ${label}`,
      fee + 25000,
      fee,
      JSON.stringify(snapshot),
    ]
  );
  await client.query(
    `insert into public.escrows (order_id, held_amount, is_released, is_refunded)
     values ($1, $2, false, false)`,
    [orderRows[0].id, fee + 25000]
  );
  const { rows } = await client.query(`select * from public.deliveries where order_id = $1`, [orderRows[0].id]);
  return rows[0];
}

async function main() {
  await client.connect();
  await client.query('begin');

  const { rows: profiles } = await client.query(
    `select id, auth_id, role, full_name from public.profiles where auth_id is not null order by id`
  );
  const admin = profiles.find((p) => ['ADMIN', 'SUPER_ADMIN'].includes(p.role));
  const seller = profiles.find((p) => ['SELLER', 'VERIFIED_SELLER', 'BUSINESS', 'VERIFIED_BUSINESS'].includes(p.role));
  const riders = profiles.filter(
    (p) => p.id !== seller?.id && p.id !== admin?.id && !['ADMIN', 'SUPER_ADMIN', 'SELLER', 'VERIFIED_SELLER', 'BUSINESS', 'VERIFIED_BUSINESS'].includes(p.role)
  );
  const buyer = riders[0];
  const secondRider = riders[1];

  if (!admin || !seller || !buyer || !secondRider) {
    console.log('SKIP  not enough seeded profiles to run the rider verification.');
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

  const delivery = await createDelivery({ seller, buyer, label: 'main' });
  const deliveryId = delivery.id;

  await asProfile(seller.auth_id, () =>
    client.query(`select public.delivery_transition($1, 'READY_FOR_PICKUP', 'Ready for rider verification')`, [deliveryId])
  );

  // ------------------------------------------------------------ application
  const application = await asProfile(buyer.auth_id, () =>
    client.query(
      `select public.rider_apply($1::jsonb) as payload`,
      [JSON.stringify({
        full_name: 'Phase Two Rider',
        phone: '08010000001',
        email: 'rider-phase2@example.com',
        vehicle_type: 'MOTORCYCLE',
        brand: 'TVS',
        model: 'Neo',
        plate_number: 'LSR-222-AA',
        color: 'Blue',
        year: 2025,
        capacity: '40kg box',
        address: '1 Verification Close',
        state: 'Lagos State',
        city: 'Lekki',
        nin: '12345678901',
        selfie_url: 'private://selfie',
        documents: [{ label: 'NIN slip', url: 'private://nin', kind: 'IDENTITY' }],
        emergency_contact_name: 'Phase Contact',
        emergency_contact_phone: '08010000002',
        emergency_contact_relation: 'Sister',
        service_states: ['Lagos State', 'Ogun State'],
      })]
    )
  );
  const appliedRow = (await client.query(`select id from public.delivery_partners where user_id = $1`, [buyer.id])).rows[0];
  const riderId = application.rows[0].payload.rider_id ?? appliedRow?.id;
  check('rider application creates a PENDING profile', application.rows[0].payload.status === 'PENDING', JSON.stringify(application.rows[0].payload));
  check('rider application returns the new rider id', Number(application.rows[0].payload.rider_id) === Number(appliedRow?.id), `${application.rows[0].payload.rider_id} / ${appliedRow?.id}`);
  const roleAfterApply = (await client.query(`select role from public.profiles where id = $1`, [buyer.id])).rows[0].role;
  check('rider application assigns the dedicated RIDER role', roleAfterApply === 'RIDER', roleAfterApply);
  const appliedProfile = (await client.query(`select status, is_available, service_states from public.delivery_partners where id = $1`, [riderId])).rows[0];
  check('new rider starts offline and unverified', appliedProfile.status === 'PENDING' && appliedProfile.is_available === false);
  check('service states are stored', appliedProfile.service_states.includes('Ogun State'));

  await expectError(
    'unapproved rider cannot view requests',
    buyer.auth_id,
    `select public.rider_available_deliveries()`,
    [],
    'only approved'
  );

  await expectError(
    'unapproved rider cannot accept a delivery',
    buyer.auth_id,
    `select public.rider_accept_delivery($1)`,
    [deliveryId],
    'only approved'
  );

  await expectError(
    'unapproved rider cannot be assigned',
    admin.auth_id,
    `select public.delivery_assign_rider($1, $2)`,
    [deliveryId, riderId],
    'not approved'
  );

  await expectError(
    'seller accounts cannot apply as riders',
    seller.auth_id,
    `select public.rider_apply($1::jsonb)`,
    [JSON.stringify({ full_name: 'Seller Rider', phone: '1', state: 'Lagos State', city: 'Ikeja', nin: '1' })],
    'separate buyer account'
  );

  // --------------------------------------------------------------- approval
  await asProfile(admin.auth_id, () =>
    client.query(`select public.admin_review_rider($1, 'APPROVED', 'Documents verified')`, [riderId])
  );
  const approved = (await client.query(`select status, is_available from public.delivery_partners where id = $1`, [riderId])).rows[0];
  check('admin approval activates the rider but keeps them offline', approved.status === 'APPROVED' && approved.is_available === false);

  await asProfile(buyer.auth_id, () =>
    client.query(
      `select public.rider_update_availability(true, 6.45, 3.39, 'Lagos State', 'Lekki', array['Lagos State','Ogun State'])`
    )
  );
  check('approved rider can go online', (await client.query(`select is_available from public.delivery_partners where id = $1`, [riderId])).rows[0].is_available === true);

  const secondPartner = await client.query(
    `insert into public.delivery_partners (user_id, full_name, phone, vehicle_type, status, is_available, city, state, service_states)
     values ($1, 'Second Rider', '08010000003', 'BICYCLE', 'APPROVED', true, 'Lekki', 'Lagos State', array['Lagos State'])
     returning id`,
    [secondRider.id]
  );
  const secondRiderId = secondPartner.rows[0].id;

  // ------------------------------------------------------------ assignment
  const assignment = await asProfile(admin.auth_id, () =>
    client.query(`select public.delivery_assign_rider($1, $2) as payload`, [deliveryId, riderId])
  );
  const offered = (await client.query(`select assignment_status, assignment_expires_at, status from public.deliveries where id = $1`, [deliveryId])).rows[0];
  check('admin assignment creates an expiring offer', offered.assignment_status === 'OFFERED' && Boolean(offered.assignment_expires_at) && offered.status === 'RIDER_ASSIGNED');
  check('assignment payload reports an offer', assignment.rows[0].payload.assignment_status === 'OFFERED');

  await expectError(
    'offered rider cannot update the delivery before accepting',
    buyer.auth_id,
    `select public.delivery_transition($1, 'PICKED_UP', 'skip acceptance')`,
    [deliveryId],
    'has not been accepted'
  );

  await expectError(
    'a different rider cannot accept someone else owner offer',
    secondRider.auth_id,
    `select public.rider_accept_delivery($1)`,
    [deliveryId],
    'another rider'
  );

  await asProfile(buyer.auth_id, () =>
    client.query(`select public.rider_update_availability(false, null, null, null, null, null)`)
  );
  await expectError(
    'offline rider cannot accept',
    buyer.auth_id,
    `select public.rider_accept_delivery($1)`,
    [deliveryId],
    'go online'
  );
  await asProfile(buyer.auth_id, () =>
    client.query(`select public.rider_update_availability(true, null, null, null, null, null)`)
  );

  await asProfile(buyer.auth_id, () => client.query(`select public.rider_accept_delivery($1)`, [deliveryId]));
  const accepted = (await client.query(`select assignment_status, rider_id from public.deliveries where id = $1`, [deliveryId])).rows[0];
  check('rider acceptance is recorded atomically', accepted.assignment_status === 'ACCEPTED' && Number(accepted.rider_id) === Number(riderId));
  check(
    'acceptance increments the rider active counter',
    Number((await client.query(`select active_deliveries_count from public.delivery_partners where id = $1`, [riderId])).rows[0].active_deliveries_count) === 1
  );

  await asProfile(admin.auth_id, () =>
    client.query(`select public.delivery_assign_rider($1, $2)`, [deliveryId, riderId])
  );
  check(
    're-assigning the same rider does not revoke acceptance',
    (await client.query(`select assignment_status from public.deliveries where id = $1`, [deliveryId])).rows[0].assignment_status === 'ACCEPTED'
  );

  await expectError(
    'duplicate acceptance by another rider is blocked',
    secondRider.auth_id,
    `select public.rider_accept_delivery($1)`,
    [deliveryId],
    'another rider'
  );

  // -------------------------------------------------------------- workflow
  await asProfile(buyer.auth_id, () =>
    client.query(`select public.rider_mark_arrival($1, 'PICKUP')`, [deliveryId])
  );
  check('pickup arrival is timestamped', Boolean((await client.query(`select arrived_pickup_at from public.deliveries where id = $1`, [deliveryId])).rows[0].arrived_pickup_at));

  await asProfile(buyer.auth_id, async () => {
    await client.query(`select public.delivery_transition($1, 'PICKED_UP', 'Package collected')`, [deliveryId]);
    await client.query(`select public.delivery_transition($1, 'IN_TRANSIT', 'Heading to Lekki')`, [deliveryId]);
    await client.query(`select public.rider_mark_arrival($1, 'DESTINATION')`, [deliveryId]);
    await client.query(`select public.delivery_transition($1, 'OUT_FOR_DELIVERY', 'Rider is close')`, [deliveryId]);
  });
  check('destination arrival is timestamped', Boolean((await client.query(`select arrived_destination_at from public.deliveries where id = $1`, [deliveryId])).rows[0].arrived_destination_at));
  check('rider reaches OUT_FOR_DELIVERY', (await client.query(`select status from public.deliveries where id = $1`, [deliveryId])).rows[0].status === 'OUT_FOR_DELIVERY');

  await asProfile(buyer.auth_id, () =>
    client.query(`select public.rider_record_failed_attempt($1, 'Buyer unavailable')`, [deliveryId])
  );
  const attempted = (await client.query(`select status, attempt_count, failure_reason from public.deliveries where id = $1`, [deliveryId])).rows[0];
  check('failed attempt records the reason without delivering', attempted.status === 'DELIVERY_ATTEMPTED' && attempted.attempt_count === 1 && attempted.failure_reason === 'Buyer unavailable', JSON.stringify(attempted));

  await asProfile(buyer.auth_id, () =>
    client.query(`select public.delivery_transition($1, 'OUT_FOR_DELIVERY', 'Retry delivery')`, [deliveryId])
  );

  // ---------------------------------------------------------- confirmation
  const codeResult = await asProfile(buyer.auth_id, () =>
    client.query(`select public.delivery_generate_confirmation_code($1) as payload`, [deliveryId])
  );
  const code = codeResult.rows[0].payload.code;
  await expectError(
    'rider cannot fake completion without a code',
    buyer.auth_id,
    `select public.delivery_transition($1, 'DELIVERED', 'forced')`,
    [deliveryId],
    'confirmation code'
  );
  const wrong = await asProfile(buyer.auth_id, () =>
    client.query(`select public.delivery_confirm_with_code($1, '000000') as payload`, [deliveryId])
  );
  check('wrong buyer code is rejected', wrong.rows[0].payload.success === false);
  await asProfile(buyer.auth_id, () =>
    client.query(`select public.delivery_confirm_with_code($1, $2)`, [deliveryId, code])
  );
  check('buyer code completes the delivery', (await client.query(`select status from public.deliveries where id = $1`, [deliveryId])).rows[0].status === 'DELIVERED');

  // -------------------------------------------------------------- earnings
  const earning = (await client.query(`select * from public.rider_earnings where delivery_id = $1`, [deliveryId])).rows[0];
  const pct = Number(
    (await client.query(`select coalesce(dp.commission_percentage, (select delivery_commission_percentage from public.revenue_settings order by id limit 1), 10) as pct from public.delivery_partners dp where dp.id = $1`, [riderId])).rows[0].pct
  );
  const expectedCommission = Math.round(1500 * pct / 100);
  check('completion creates a PENDING earning', Boolean(earning) && earning.status === 'PENDING', earning ? `#${earning.id}` : 'missing');
  check('earning fee and commission are recorded', Number(earning?.gross_amount) === 1500 && Number(earning?.platform_commission) === expectedCommission, `${earning?.gross_amount}/${earning?.platform_commission}`);
  check('net earnings subtract the platform commission', Number(earning?.net_amount) === 1500 - expectedCommission, String(earning?.net_amount));
  const completedCounters = (await client.query(`select completed_deliveries, active_deliveries_count from public.delivery_partners where id = $1`, [riderId])).rows[0];
  check('completed delivery increments the rider counter', Number(completedCounters.completed_deliveries) === 1, JSON.stringify(completedCounters));
  check('completed delivery clears the active counter', Number(completedCounters.active_deliveries_count) === 0, JSON.stringify(completedCounters));

  await expectError(
    'riders cannot adjust their own earnings',
    buyer.auth_id,
    `select public.admin_adjust_rider_earning($1, 1000, 'self credit')`,
    [earning.id],
    'admins only'
  );

  await asProfile(admin.auth_id, () =>
    client.query(`select public.admin_adjust_rider_earning($1, 100, 'Goodwill adjustment')`, [earning.id])
  );
  const adjusted = (await client.query(`select net_amount, adjustment_amount from public.rider_earnings where id = $1`, [earning.id])).rows[0];
  check('admin adjustment changes net and records a delta', Number(adjusted.net_amount) === 1500 - expectedCommission + 100 && Number(adjusted.adjustment_amount) === 100, JSON.stringify(adjusted));
  check('earning adjustment is audited', (await client.query(`select count(*)::int as c from public.rider_earning_audit_logs where earning_id = $1 and action = 'ADJUSTMENT'`, [earning.id])).rows[0].c === 1);

  await asProfile(admin.auth_id, () =>
    client.query(`select public.admin_set_rider_earning_status($1, 'APPROVED')`, [earning.id])
  );
  check('admin can approve earnings', (await client.query(`select status from public.rider_earnings where id = $1`, [earning.id])).rows[0].status === 'APPROVED');

  await expectError(
    'earnings cannot be marked paid without a payout reference',
    admin.auth_id,
    `select public.admin_set_rider_earning_status($1, 'PAID', '', '')`,
    [earning.id],
    'payout reference'
  );
  await asProfile(admin.auth_id, () =>
    client.query(`select public.admin_set_rider_earning_status($1, 'PAID', 'PAYOUT-TEST-001', 'Manual test payout')`, [earning.id])
  );
  const paid = (await client.query(`select status, payout_reference, paid_at from public.rider_earnings where id = $1`, [earning.id])).rows[0];
  check('paid status requires and stores a real reference', paid.status === 'PAID' && paid.payout_reference === 'PAYOUT-TEST-001' && Boolean(paid.paid_at), JSON.stringify(paid));
  await expectError(
    'paid earnings cannot be adjusted',
    admin.auth_id,
    `select public.admin_adjust_rider_earning($1, 50, 'late adjustment')`,
    [earning.id],
    'cannot be adjusted'
  );

  // ------------------------------------------------------------------- RLS
  const unrelatedRead = await asRole('authenticated', secondRider.auth_id, () =>
    client.query(`select count(*)::int as c from public.deliveries where id = $1`, [deliveryId])
  );
  check('an unrelated rider cannot read the delivery row', unrelatedRead.rows[0].c === 0);

  const ownEarningRead = await asRole('authenticated', buyer.auth_id, () =>
    client.query(`select count(*)::int as c from public.rider_earnings where delivery_id = $1`, [deliveryId])
  );
  check('a rider can read only their own earnings', ownEarningRead.rows[0].c === 1);

  const otherEarningRead = await asRole('authenticated', secondRider.auth_id, () =>
    client.query(`select count(*)::int as c from public.rider_earnings where delivery_id = $1`, [deliveryId])
  );
  check('another rider cannot read the earning', otherEarningRead.rows[0].c === 0);

  const directoryRead = await asRole('anon', null, () =>
    client.query(`select count(*)::int as c from public.delivery_partners_directory`)
  );
  check('the public directory exposes safe rider rows', directoryRead.rows[0].c > 0, `${directoryRead.rows[0].c} rows`);

  // ------------------------------------------------------------- suspension
  await expectError(
    'suspension requires a reason',
    admin.auth_id,
    `select public.admin_review_rider($1, 'SUSPENDED', '')`,
    [riderId],
    'reason is required'
  );

  await asProfile(admin.auth_id, () =>
    client.query(`select public.admin_review_rider($1, 'SUSPENDED', 'Safety investigation')`, [riderId])
  );
  const suspended = (await client.query(`select status, is_available, suspension_reason from public.delivery_partners where id = $1`, [riderId])).rows[0];
  check('suspension forces the rider offline and stores a reason', suspended.status === 'SUSPENDED' && suspended.is_available === false && suspended.suspension_reason === 'Safety investigation');

  await expectError(
    'suspended rider cannot view requests',
    buyer.auth_id,
    `select public.rider_available_deliveries()`,
    [],
    'only approved'
  );
  await expectError(
    'suspended rider cannot change availability',
    buyer.auth_id,
    `select public.rider_update_availability(true, null, null, null, null, null)`,
    [],
    'only approved'
  );
  await expectError(
    'suspended rider cannot accept deliveries',
    buyer.auth_id,
    `select public.rider_accept_delivery($1)`,
    [deliveryId],
    'only approved'
  );

  await asProfile(admin.auth_id, () =>
    client.query(`select public.admin_set_rider_service_areas($1, array['Ogun State'], 'Ogun State', 'Abeokuta')`, [riderId])
  );
  const areas = (await client.query(`select service_states, state, city from public.delivery_partners where id = $1`, [riderId])).rows[0];
  check('admin can manage rider service areas', areas.service_states.includes('Ogun State') && areas.state === 'Ogun State', JSON.stringify(areas));

  // --------------------------------------------------------- expiry flow
  const delivery2 = await createDelivery({ seller, buyer: secondRider, label: 'expiry' });
  await asProfile(seller.auth_id, () =>
    client.query(`select public.delivery_transition($1, 'READY_FOR_PICKUP', 'Ready for expiry test')`, [delivery2.id])
  );
  await asProfile(admin.auth_id, () =>
    client.query(`select public.delivery_assign_rider($1, $2)`, [delivery2.id, secondRiderId])
  );
  await client.query(
    `update public.deliveries set assignment_expires_at = now() - interval '1 minute' where id = $1`,
    [delivery2.id]
  );
  await asProfile(admin.auth_id, () => client.query(`select public.expire_rider_assignments()`));
  const expired = (await client.query(`select rider_id, assignment_status, status from public.deliveries where id = $1`, [delivery2.id])).rows[0];
  check('expired offers release the delivery for reassignment', expired.rider_id === null && expired.assignment_status === 'EXPIRED' && expired.status === 'AWAITING_RIDER', JSON.stringify(expired));

  // ------------------------------------------------------------ protections
  await expectError(
    'rider cannot self-approve by editing the partner row',
    secondRider.auth_id,
    `update public.delivery_partners set status = 'APPROVED', completed_deliveries = 999 where id = $1`,
    [secondRiderId],
    'verification fields'
  );

  const notifications = (await client.query(`select count(*)::int as c from public.notifications where user_id = $1`, [buyer.id])).rows[0].c;
  check('rider notifications are generated through the existing system', notifications >= 4, `${notifications} notifications`);

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
