#!/usr/bin/env node
/**
 * Phase 3 logistics verification — exercises real database functions inside a
 * single transaction and rolls everything back. No test delivery is persisted.
 *
 * Usage: node scripts/verify-delivery-phase3.mjs
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

async function expectRoleError(name, role, authId, sql, params, fragment) {
  await client.query('savepoint expected_role_error');
  let message = '';
  try {
    await client.query(`set local role ${role}`);
    await client.query(
      `select set_config('request.jwt.claim.sub', $1, true),
              set_config('request.jwt.claims', $2, true)`,
      [String(authId), JSON.stringify({ sub: String(authId) })]
    );
    await client.query(sql, params);
  } catch (error) {
    message = String(error.message);
  } finally {
    await client.query('rollback to savepoint expected_role_error');
  }
  check(name, message.toLowerCase().includes(fragment.toLowerCase()), message || 'call unexpectedly succeeded');
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
    [seller.id, `Phase 3 logistics verification — ${label}`]
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
      `R3-${Date.now()}-${label}`,
      buyer.id,
      seller.id,
      productRows[0].id,
      `Phase 3 logistics verification — ${label}`,
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

async function markReady(seller, deliveryId) {
  await asProfile(seller.auth_id, () =>
    client.query(`select public.delivery_transition($1, 'READY_FOR_PICKUP', 'Ready for Phase 3 verification')`, [deliveryId])
  );
}

async function main() {
  await client.connect();
  await client.query('begin');

  const { rows: profiles } = await client.query(
    `select id, auth_id, role, full_name, email from public.profiles where auth_id is not null order by id`
  );
  const admin = profiles.find((p) => ['ADMIN', 'SUPER_ADMIN'].includes(p.role));
  const seller = profiles.find((p) =>
    ['SELLER', 'VERIFIED_SELLER', 'BUSINESS', 'VERIFIED_BUSINESS'].includes(p.role)
  );
  const candidates = profiles.filter(
    (p) =>
      p.id !== seller?.id &&
      p.id !== admin?.id &&
      !['ADMIN', 'SUPER_ADMIN', 'SELLER', 'VERIFIED_SELLER', 'BUSINESS', 'VERIFIED_BUSINESS'].includes(p.role)
  );
  const [buyer, riderProfile, secondRiderProfile] = candidates;

  if (!admin || !seller || !buyer || !riderProfile || !secondRiderProfile) {
    console.log('SKIP  not enough seeded profiles to run the Phase 3 verification.');
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
  await client.query(
    `update public.profiles
        set email = 'phase3-buyer@example.com', email_enabled = true,
            phone_number = '08030000001', sms_enabled = true
      where id = $1`,
    [buyer.id]
  );

  const beforeAnalytics = await asProfile(admin.auth_id, async () => {
    const result = await client.query(`select public.admin_delivery_analytics() as payload`);
    return result.rows[0].payload;
  });

  const settings = await asProfile(admin.auth_id, async () => {
    const result = await client.query(
      `select public.admin_set_delivery_settings($1::jsonb) as payload`,
      [
        JSON.stringify({
          auto_assign_enabled: true,
          offer_timeout_minutes: 30,
          max_active_deliveries: 5,
          max_pickup_distance_km: 25,
          max_offers_per_delivery: 5,
          location_update_interval_seconds: 15,
          tracking_stale_minutes: 10,
        }),
      ]
    );
    return result.rows[0].payload;
  });
  check('admin can enable automated matching', settings.auto_assign_enabled === true, JSON.stringify(settings));

  const publicSettings = await asProfile(buyer.auth_id, async () => {
    const result = await client.query(`select public.delivery_settings_public() as payload`);
    return result.rows[0].payload;
  });
  check('authenticated users can read public logistics settings', publicSettings.auto_assign_enabled === true);

  const riderOne = (
    await client.query(
      `insert into public.delivery_partners
         (user_id, full_name, phone, vehicle_type, status, is_available, city, state, service_states,
          last_lat, last_lng, last_location_at, rating, acceptance_rate, trust_score)
       values ($1, 'Phase 3 Rider One', '08030000011', 'MOTORCYCLE', 'APPROVED', true,
               'Ikeja', 'Lagos State', array['Lagos State'], 6.4500, 3.3900, now(), 4.9, 98, 90)
       returning id`,
      [riderProfile.id]
    )
  ).rows[0];
  const riderTwo = (
    await client.query(
      `insert into public.delivery_partners
         (user_id, full_name, phone, vehicle_type, status, is_available, city, state, service_states,
          last_lat, last_lng, last_location_at, rating, acceptance_rate, trust_score)
       values ($1, 'Phase 3 Rider Two', '08030000012', 'BICYCLE', 'APPROVED', true,
               'Lekki', 'Lagos State', array['Lagos State'], 6.6000, 3.5000, now(), 4.6, 95, 80)
       returning id`,
      [secondRiderProfile.id]
    )
  ).rows[0];

  // ------------------------------------------------------- automated matching
  const d1 = await createDelivery({ seller, buyer, label: 'auto-match' });
  await asProfile(seller.auth_id, () =>
    client.query(
      `select public.delivery_set_route($1, 12.4, 28, 'HAVERSINE_ESTIMATE', true, 6.45, 3.39, 6.50, 3.45)`,
      [d1.id]
    )
  );
  await markReady(seller, d1.id);

  const offered = (await client.query(
    `select rider_id, assignment_status, assignment_mode, auto_offer_round, assignment_expires_at
       from public.deliveries where id = $1`,
    [d1.id]
  )).rows[0];
  check(
    'ready delivery is automatically offered to the best approved online rider',
    Number(offered.rider_id) === Number(riderOne.id) && offered.assignment_status === 'OFFERED' && offered.assignment_mode === 'AUTO',
    JSON.stringify(offered)
  );
  check('automatic offer has an acceptance deadline', Boolean(offered.assignment_expires_at));
  check(
    'automatic offer is recorded once',
    (await client.query(`select count(*)::int as c from public.delivery_assignment_offers where delivery_id = $1`, [d1.id])).rows[0].c === 1
  );
  check(
    'automated assignment notifies the rider',
    (await client.query(
      `select count(*)::int as c from public.notifications where user_id = $1 and title = 'New delivery request'`,
      [riderProfile.id]
    )).rows[0].c >= 1
  );

  await asProfile(admin.auth_id, async () => {
    const result = await client.query(`select public.admin_auto_assign_delivery($1) as payload`, [d1.id]);
    const duplicate = result.rows[0].payload;
    check('a second automated offer is refused while an offer is active', duplicate.offered === false, JSON.stringify(duplicate));
  });
  check(
    'duplicate automated assignment creates no extra offer row',
    (await client.query(`select count(*)::int as c from public.delivery_assignment_offers where delivery_id = $1`, [d1.id])).rows[0].c === 1
  );

  await expectError(
    'an unrelated rider cannot see live tracking',
    secondRiderProfile.auth_id,
    `select public.delivery_tracking_view($1)`,
    [d1.id],
    'do not have access'
  );

  await asProfile(riderProfile.auth_id, () =>
    client.query(`select public.rider_accept_delivery($1)`, [d1.id])
  );
  const accepted = (await client.query(
    `select assignment_status, rider_id, status from public.deliveries where id = $1`,
    [d1.id]
  )).rows[0];
  check('eligible rider can accept the automated offer', accepted.assignment_status === 'ACCEPTED' && Number(accepted.rider_id) === Number(riderOne.id));
  check(
    'accepted offer is marked accepted exactly once',
    (await client.query(
      `select count(*)::int as c from public.delivery_assignment_offers where delivery_id = $1 and status = 'ACCEPTED'`,
      [d1.id]
    )).rows[0].c === 1
  );

  await asProfile(riderProfile.auth_id, () =>
    client.query(`select public.rider_mark_arrival($1, 'PICKUP')`, [d1.id])
  );
  check(
    'pickup arrival notifies the buyer that the rider is approaching',
    (await client.query(
      `select count(*)::int as c from public.notifications where user_id = $1 and title = 'Rider approaching pickup'`,
      [buyer.id]
    )).rows[0].c === 1
  );

  // --------------------------------------------------------- live tracking
  await asProfile(riderProfile.auth_id, async () => {
    await client.query(`select public.rider_set_location_sharing(true, 'GRANTED')`);
    await client.query(`select public.rider_update_location($1, 6.4550, 3.3950, 8, 24, 90)`, [d1.id]);
  });
  const live = await asProfile(buyer.auth_id, async () => {
    const result = await client.query(`select public.delivery_tracking_view($1) as payload`, [d1.id]);
    return result.rows[0].payload;
  });
  check(
    'buyer sees a live rider location during an accepted active delivery',
    live.tracking_active === true && live.tracking_status === 'LIVE' && Number(live.rider_location?.lat) === 6.455,
    JSON.stringify(live)
  );
  check('buyer tracking includes the real destination coordinates', Number(live.destination?.lat) === 6.5 && Number(live.destination?.lng) === 3.45);
  check('route is explicitly marked as a straight-line estimate', live.route_is_estimate === true && live.route_provider === 'HAVERSINE_ESTIMATE');

  const hiddenLocation = await asRole('authenticated', secondRiderProfile.auth_id, () =>
    client.query(`select count(*)::int as c from public.delivery_live_locations where delivery_id = $1`, [d1.id])
  );
  check('live-location table RLS hides rows from unrelated users', hiddenLocation.rows[0].c === 0);

  await asProfile(riderProfile.auth_id, () =>
    client.query(`select public.rider_set_location_sharing(false, 'DENIED')`)
  );
  const denied = await asProfile(buyer.auth_id, async () => {
    const result = await client.query(`select public.delivery_tracking_view($1) as payload`, [d1.id]);
    return result.rows[0].payload;
  });
  check(
    'permission denial is surfaced and no fake location is returned',
    denied.tracking_active === false && denied.tracking_status === 'PERMISSION_DENIED' && denied.rider_location === null,
    JSON.stringify(denied)
  );

  await asProfile(riderProfile.auth_id, async () => {
    await client.query(`select public.rider_set_location_sharing(true, 'GRANTED')`);
    await client.query(`select public.rider_update_location($1, 6.4550, 3.3950, 8, 24, 90)`, [d1.id]);
    await client.query(`select public.delivery_transition($1, 'PICKED_UP', 'Picked up')`, [d1.id]);
    await client.query(`select public.delivery_transition($1, 'IN_TRANSIT', 'In transit')`, [d1.id]);
    await client.query(`select public.delivery_transition($1, 'OUT_FOR_DELIVERY', 'Near buyer')`, [d1.id]);
  });

  const code = await asProfile(buyer.auth_id, async () => {
    const result = await client.query(`select public.delivery_generate_confirmation_code($1) as payload`, [d1.id]);
    return result.rows[0].payload.code;
  });
  await asProfile(riderProfile.auth_id, () =>
    client.query(`select public.delivery_confirm_with_code($1, $2)`, [d1.id, code])
  );
  const completed = (await client.query(`select status from public.deliveries where id = $1`, [d1.id])).rows[0].status;
  check('buyer confirmation code completes the delivery', completed === 'DELIVERED');
  check(
    'completion stops and deletes live location',
    (await client.query(`select count(*)::int as c from public.delivery_live_locations where delivery_id = $1`, [d1.id])).rows[0].c === 0
  );
  const ended = await asProfile(buyer.auth_id, async () => {
    const result = await client.query(`select public.delivery_tracking_view($1) as payload`, [d1.id]);
    return result.rows[0].payload;
  });
  check('tracking reports ended after delivery', ended.tracking_status === 'ENDED' && ended.rider_location === null);
  check(
    'status notifications are written to the existing notifications table',
    (await client.query(
      `select count(*)::int as c from public.notifications where user_id = $1 and type = 'DELIVERY' and title in ('Rider assigned','Package picked up','Package in transit','Out for delivery','Delivered')`,
      [buyer.id]
    )).rows[0].c >= 4
  );
  check(
    'configured email/SMS channels are queued with deduplication keys',
    (await client.query(
      `select count(distinct channel)::int as c from public.delivery_notification_outbox where delivery_id = $1`,
      [d1.id]
    )).rows[0].c === 2
  );

  // ------------------------------------------------ timeout and reassignment
  const d2 = await createDelivery({ seller, buyer, label: 'timeout' });
  await asProfile(seller.auth_id, () =>
    client.query(`select public.delivery_set_route($1, 8, 20, 'HAVERSINE_ESTIMATE', true, 6.45, 3.39, 6.50, 3.45)`, [d2.id])
  );
  await markReady(seller, d2.id);
  const firstOffer = (await client.query(`select rider_id, auto_offer_round from public.deliveries where id = $1`, [d2.id])).rows[0];
  await client.query(
    `update public.deliveries set assignment_expires_at = now() - interval '1 minute' where id = $1`,
    [d2.id]
  );
  const expired = await client.query(`select public.expire_rider_assignments() as count`);
  const afterExpiry = (await client.query(
    `select rider_id, assignment_status, auto_offer_round from public.deliveries where id = $1`,
    [d2.id]
  )).rows[0];
  check('expiry job processes the timed-out offer', Number(expired.rows[0].count) >= 1);
  check(
    'expired offer is reassigned to the next eligible rider',
    afterExpiry.assignment_status === 'OFFERED' &&
      Number(afterExpiry.rider_id) === Number(riderTwo.id) &&
      Number(afterExpiry.rider_id) !== Number(firstOffer.rider_id) &&
      Number(afterExpiry.auto_offer_round) === Number(firstOffer.auto_offer_round) + 1,
    JSON.stringify({ firstOffer, afterExpiry })
  );
  check(
    'expired offer is retained in audit history',
    (await client.query(
      `select count(*)::int as c from public.delivery_assignment_offers where delivery_id = $1 and status = 'EXPIRED'`,
      [d2.id]
    )).rows[0].c === 1
  );

  // ------------------------------------------------------------- rejection
  const d3 = await createDelivery({ seller, buyer, label: 'reject' });
  await asProfile(seller.auth_id, () =>
    client.query(`select public.delivery_set_route($1, 8, 20, 'HAVERSINE_ESTIMATE', true, 6.45, 3.39, 6.50, 3.45)`, [d3.id])
  );
  await markReady(seller, d3.id);
  const rejectedOffer = (await client.query(`select rider_id from public.deliveries where id = $1`, [d3.id])).rows[0];
  await asProfile(riderProfile.auth_id, () =>
    client.query(`select public.rider_reject_delivery($1, 'Too far for this trip')`, [d3.id])
  );
  const afterReject = (await client.query(
    `select rider_id, assignment_status from public.deliveries where id = $1`,
    [d3.id]
  )).rows[0];
  check(
    'rejected offer is immediately offered to another rider',
    afterReject.assignment_status === 'OFFERED' && Number(afterReject.rider_id) === Number(riderTwo.id) && Number(afterReject.rider_id) !== Number(rejectedOffer.rider_id),
    JSON.stringify(afterReject)
  );

  // --------------------------------------------------------- manual override
  const d4 = await createDelivery({ seller, buyer, label: 'manual-override' });
  await markReady(seller, d4.id);
  await asProfile(admin.auth_id, () =>
    client.query(`select public.delivery_assign_rider($1, $2)`, [d4.id, riderTwo.id])
  );
  const manual = (await client.query(
    `select rider_id, assignment_mode, assignment_status from public.deliveries where id = $1`,
    [d4.id]
  )).rows[0];
  check(
    'admin manual assignment overrides automated matching',
    Number(manual.rider_id) === Number(riderTwo.id) && manual.assignment_mode === 'MANUAL' && manual.assignment_status === 'OFFERED',
    JSON.stringify(manual)
  );
  const manualShipment = await asProfile(admin.auth_id, async () => {
    const result = await client.query(
      `select public.admin_manual_courier_update($1, 'Manual Courier', 'MANUAL-PHASE3-001', 'CREATED', 'Booked by phone') as payload`,
      [d4.id]
    );
    return result.rows[0].payload;
  });
  check(
    'manual courier fallback records a shipment without a provider API',
    manualShipment.success === true &&
      (await client.query(
        `select provider, status from public.courier_shipments where delivery_id = $1`,
        [d4.id]
      )).rows[0]?.provider === 'manual'
  );
  await client.query(
    `update public.deliveries set estimated_delivery_date = current_date - 1 where id = $1`,
    [d4.id]
  );

  // ------------------------------------------------------ failure and return
  const d5 = await createDelivery({ seller, buyer, label: 'return' });
  await markReady(seller, d5.id);
  const failure = await asProfile(admin.auth_id, async () => {
    const result = await client.query(
      `select public.delivery_report_failure($1, 'SELLER_UNAVAILABLE', 'Seller could not hand over the package') as payload`,
      [d5.id]
    );
    return result.rows[0].payload;
  });
  check('admin can record a structured delivery failure', failure.success === true && failure.status === 'OPEN');
  await asProfile(admin.auth_id, () =>
    client.query(
      `select public.admin_resolve_delivery_failure($1, 'RETURN', 'Return package to seller')`,
      [failure.failure_id]
    )
  );
  const returned = (await client.query(`select status, returned_at from public.deliveries where id = $1`, [d5.id])).rows[0];
  check('admin return resolution closes the delivery as returned', returned.status === 'RETURNED_TO_SELLER' && Boolean(returned.returned_at));
  const returnRow = (await client.query(`select status from public.delivery_returns where delivery_id = $1`, [d5.id])).rows[0];
  check('return-to-seller workflow creates a tracked return', returnRow?.status === 'INITIATED');
  const returnView = await asProfile(buyer.auth_id, async () => {
    const result = await client.query(`select public.delivery_tracking_view($1) as payload`, [d5.id]);
    return result.rows[0].payload;
  });
  check('tracking is stopped for a returned delivery', returnView.tracking_status === 'ENDED' && returnView.rider_location === null);

  // ------------------------------------------------------- courier lifecycle
  const d6 = await createDelivery({ seller, buyer, label: 'courier' });
  const shipment = await asProfile(admin.auth_id, async () => {
    const result = await client.query(
      `select public.admin_record_courier_shipment($1, 'testcourier', 'TC-PHASE3-001', 'EXT-001', 'Test Courier', '', 'CREATED') as payload`,
      [d6.id]
    );
    return result.rows[0].payload;
  });
  check('courier shipment stores tracking number', shipment.tracking_number === 'TC-PHASE3-001');

  const apply = (eventId, status, note = '') =>
    client.query(
      `select public.courier_apply_tracking_event(
         'testcourier', $1, 'TC-PHASE3-001', $2, $3, now(), md5($1), 'OTHER', 'Lagos', '{}'::jsonb
       ) as payload`,
      [eventId, status, note]
    );

  const firstEvent = (await apply('evt-phase3-1', 'PICKED_UP', 'Collected')).rows[0].payload;
  const duplicateEvent = (await apply('evt-phase3-1', 'PICKED_UP', 'Collected')).rows[0].payload;
  check('courier tracking event applies to the delivery', firstEvent.success === true && firstEvent.status === 'PICKED_UP');
  check('duplicate courier webhook is idempotent', duplicateEvent.duplicate === true);
  check(
    'duplicate webhook stores only one event',
    (await client.query(
      `select count(*)::int as c from public.courier_webhook_events where event_id = 'evt-phase3-1'`
    )).rows[0].c === 1
  );

  await apply('evt-phase3-2', 'DELIVERED', 'Courier reports delivered');
  const afterCourierDelivered = (await client.query(
    `select status, courier_status from public.deliveries where id = $1`,
    [d6.id]
  )).rows[0];
  check(
    'courier DELIVERED only updates courier status, not the buyer-protected delivery',
    afterCourierDelivered.courier_status === 'DELIVERED' && afterCourierDelivered.status !== 'DELIVERED',
    JSON.stringify(afterCourierDelivered)
  );

  await apply('evt-phase3-3', 'OUT_FOR_DELIVERY', 'With rider');
  check(
    'courier in-flight updates synchronize delivery status',
    (await client.query(`select status from public.deliveries where id = $1`, [d6.id])).rows[0].status === 'OUT_FOR_DELIVERY'
  );
  const courierCode = await asProfile(buyer.auth_id, async () => {
    const result = await client.query(`select public.delivery_generate_confirmation_code($1) as payload`, [d6.id]);
    return result.rows[0].payload.code;
  });
  await asProfile(admin.auth_id, () =>
    client.query(`select public.delivery_confirm_with_code($1, $2)`, [d6.id, courierCode])
  );
  check(
    'buyer code still completes a courier delivery',
    (await client.query(`select status from public.deliveries where id = $1`, [d6.id])).rows[0].status === 'DELIVERED'
  );

  // -------------------------------------------------------------- analytics
  const analytics = await asProfile(admin.auth_id, async () => {
    const result = await client.query(`select public.admin_delivery_analytics() as payload`);
    return result.rows[0].payload;
  });
  const before = beforeAnalytics.totals;
  const now = analytics.totals;
  check(
    'analytics counts every new delivery from real rows',
    Number(now.total) - Number(before.total) === 6,
    `${before.total} → ${now.total}`
  );
  check(
    'analytics counts completed and failed deliveries accurately',
    Number(now.completed) - Number(before.completed) === 2 && Number(now.failed) - Number(before.failed) === 1,
    JSON.stringify({ before, now })
  );
  const expectedPct = now.completed + now.failed === 0 ? null : Math.round((now.completed * 10000) / (now.completed + now.failed)) / 100;
  check('successful delivery percentage uses completed/(completed+failed)', Number(now.successful_delivery_percentage) === Number(expectedPct), `${now.successful_delivery_percentage} / ${expectedPct}`);
  check(
    'analytics separates estimated routes from actual route data',
    analytics.route_distance_estimate_count >= Number(beforeAnalytics.route_distance_estimate_count) &&
      analytics.notes.route_distances.toLowerCase().includes('estimate')
  );
  check(
    'analytics includes state, city and courier performance from real data',
    analytics.by_state.some((row) => row.state === 'Lagos State') &&
      analytics.by_city.some((row) => row.city === 'Lekki') &&
      analytics.courier_performance.length > 0
  );
  check(
    'analytics counts a past-due active delivery as delayed',
    Number(now.delayed) >= Number(before.delayed) + 1,
    `${before.delayed} → ${now.delayed}`
  );

  await expectError(
    'non-admin cannot read delivery analytics',
    buyer.auth_id,
    `select public.admin_delivery_analytics()`,
    [],
    'admins only'
  );
  await expectError(
    'non-admin cannot resolve delivery failures',
    buyer.auth_id,
    `select public.admin_resolve_delivery_failure($1, 'REASSIGN', '')`,
    [failure.failure_id],
    'admins only'
  );
  await expectRoleError(
    'authenticated users cannot execute the courier apply function directly',
    'authenticated',
    buyer.auth_id,
    `select public.courier_apply_tracking_event('testcourier','evt-direct','TC-PHASE3-001','DELIVERED','',now(),'x','OTHER','','{}'::jsonb)`,
    [],
    'permission denied'
  );

  const jobs = await client.query(`select public.run_delivery_jobs() as payload`);
  check('background job entry point runs and reports its work', jobs.rows[0].payload.success === true, JSON.stringify(jobs.rows[0].payload));
  check(
    'scheduled jobs notify the buyer about a delayed delivery',
    (await client.query(
      `select count(*)::int as c from public.notifications where user_id = $1 and title = 'Delivery delayed'`,
      [buyer.id]
    )).rows[0].c >= 1
  );

  const failures = results.filter((row) => !row.ok);
  await client.query('rollback');
  await client.end();
  console.log(`\n${results.length - failures.length}/${results.length} Phase 3 checks passed.`);
  if (failures.length) {
    console.log('Failed checks:');
    for (const failure of failures) console.log(`  - ${failure.name}: ${failure.detail}`);
    process.exit(1);
  }
}

main().catch(async (error) => {
  console.error(error);
  try {
    await client.query('rollback');
    await client.end();
  } catch {
    // ignore rollback cleanup errors
  }
  process.exit(1);
});
