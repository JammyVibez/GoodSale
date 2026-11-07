#!/usr/bin/env node
/**
 * Phase 4 premium checkout/tracking verification.
 * Runs inside one transaction and rolls everything back.
 *
 * Usage: node scripts/verify-premium-tracking.mjs
 * Requires DATABASE_URL.
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

async function asRole(role, authId, fn) {
  await client.query('savepoint role_scope');
  try {
    await client.query(`set local role ${role}`);
    await client.query(
      `select set_config('request.jwt.claim.sub', $1, true),
              set_config('request.jwt.claims', $2, true)`,
      [authId ? String(authId) : '', authId ? JSON.stringify({ sub: String(authId) }) : '{}']
    );
    return await fn();
  } catch (error) {
    await client.query('rollback to savepoint role_scope');
    throw error;
  } finally {
    await client.query('reset role');
  }
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

async function createOrder({ buyer, seller, label, group = '', number = null }) {
  const { rows: productRows } = await client.query(
    `insert into public.products (seller_id, title, price, quantity, stock_status, images, delivery_method)
     values ($1, $2, 25000, 5, 'IN_STOCK', '[]'::jsonb, 'GOODSALE_PARTNER')
     returning id`,
    [seller.id, `Phase 4 verification — ${label}`]
  );
  const orderNumber = number || `GS-20261106-${String(Math.floor(Math.random() * 90000) + 10000)}`;
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
       delivery_state, delivery_phone, delivery_instructions, checkout_group_id,
       delivery_pin, status, service_type, shipping_snapshot,
       estimated_delivery_min_days, estimated_delivery_max_days
     ) values (
       $1, $2, $3, $4, $5, $6,
       $7, 'CARD', 'GOODSALE_PARTNER', '5 Admiralty Way', 'Lekki',
       'Lagos State', '08030000001', 'Call at the gate', $8,
       '123456', 'PAID_ESCROW', 'STANDARD', $9::jsonb, 1, 2
     ) returning id, order_number, checkout_group_id`,
    [
      orderNumber,
      buyer.id,
      seller.id,
      productRows[0].id,
      `Phase 4 verification — ${label}`,
      queueAmount(),
      1500,
      group,
      JSON.stringify(snapshot),
    ]
  );
  await client.query(
    `insert into public.escrows (order_id, held_amount, is_released, is_refunded)
     values ($1, $2, false, false)`,
    [orderRows[0].id, queueAmount()]
  );
  const { rows: deliveries } = await client.query(
    `select * from public.deliveries where order_id = $1`,
    [orderRows[0].id]
  );
  return { order: orderRows[0], delivery: deliveries[0] };
}

function queueAmount() {
  return 26500;
}

async function lookup(authId, query, role = null) {
  const run = async () => {
    const result = await client.query(`select public.shipment_tracking_lookup($1) as payload`, [query]);
    return result.rows[0].payload;
  };
  if (role) return asRole(role, authId, run);
  return asProfile(authId, run);
}

async function main() {
  await client.connect();
  await client.query('begin');

  const { rows: profiles } = await client.query(
    `select id, auth_id, role, full_name, email from public.profiles where auth_id is not null order by id`
  );
  const admin = profiles.find((profile) => ['ADMIN', 'SUPER_ADMIN'].includes(profile.role));
  const seller = profiles.find((profile) =>
    ['SELLER', 'VERIFIED_SELLER', 'BUSINESS', 'VERIFIED_BUSINESS'].includes(profile.role)
  );
  const buyer = profiles.find(
    (profile) =>
      profile.id !== seller?.id &&
      profile.id !== admin?.id &&
      !['ADMIN', 'SUPER_ADMIN', 'SELLER', 'VERIFIED_SELLER', 'BUSINESS', 'VERIFIED_BUSINESS'].includes(profile.role)
  );
  const other = profiles.find(
    (profile) => ![admin?.id, seller?.id, buyer?.id].includes(profile.id)
  );
  const riderProfile = profiles.find(
    (profile) => ![admin?.id, seller?.id, buyer?.id, other?.id].includes(profile.id)
  );
  const secondSeller = profiles.find(
    (profile) => ![admin?.id, seller?.id, buyer?.id].includes(profile.id)
  );

  if (!admin || !seller || !buyer || !other || !riderProfile || !secondSeller) {
    console.log('SKIP  not enough seeded profiles to run the Phase 4 verification.');
    await client.query('rollback');
    await client.end();
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

  // ----------------------------------------------------------- identifiers
  const checkoutGroup = `GSG-20261106-48291`;
  const first = await createOrder({
    buyer,
    seller,
    label: 'first seller',
    group: checkoutGroup,
    number: 'GS-2026-123456', // legacy format deliberately, trigger must normalise
  });
  const second = await createOrder({
    buyer,
    seller: secondSeller,
    label: 'second seller',
    group: checkoutGroup,
  });

  check(
    'legacy order numbers are normalised to GS-YYYYMMDD-NNNNN',
    /^GS-\d{8}-\d{5}$/.test(first.order.order_number),
    first.order.order_number
  );
  check(
    'new checkout order numbers are preserved',
    /^GS-\d{8}-\d{5}$/.test(second.order.order_number),
    second.order.order_number
  );
  check(
    'every shipment receives a unique GSD tracking ID',
    /^GSD-\d{9}$/.test(first.delivery.tracking_id || '') &&
      /^GSD-\d{9}$/.test(second.delivery.tracking_id || '') &&
      first.delivery.tracking_id !== second.delivery.tracking_id,
    `${first.delivery.tracking_id} / ${second.delivery.tracking_id}`
  );
  check(
    'order contact and instructions flow into the delivery',
    first.delivery.delivery_phone === '08030000001' &&
      first.delivery.delivery_instructions === 'Call at the gate'
  );
  check('checkout group links both seller shipments', first.order.checkout_group_id === checkoutGroup && second.order.checkout_group_id === checkoutGroup);

  await expectError(
    'database rejects duplicate shipment tracking IDs',
    buyer.auth_id,
    `update public.deliveries set tracking_id = $1 where id = $2`,
    [first.delivery.tracking_id, second.delivery.id],
    'duplicate key'
  );

  // ------------------------------------------------------- saved addresses
  await asRole('authenticated', buyer.auth_id, async () => {
    await client.query(
      `insert into public.buyer_addresses
         (profile_id, label, contact_name, phone, state, city, area, street, landmark, instructions, is_default)
       values ($1, 'Home', 'Phase 4 Buyer', '08030000001', 'Lagos State', 'Lekki', 'Admiralty', '5 Admiralty Way', 'Near the roundabout', 'Call on arrival', true)`,
      [buyer.id]
    );
  });
  const ownAddresses = await asRole('authenticated', buyer.auth_id, async () => {
    const result = await client.query(`select count(*)::int as c from public.buyer_addresses where profile_id = $1`, [buyer.id]);
    return result.rows[0].c;
  });
  const otherAddresses = await asRole('authenticated', other.auth_id, async () => {
    const result = await client.query(`select count(*)::int as c from public.buyer_addresses`);
    return result.rows[0].c;
  });
  check('buyer can save and read their own delivery addresses', ownAddresses === 1);
  check('saved addresses are hidden from other authenticated users', otherAddresses === 0, `${otherAddresses} visible`);

  // ---------------------------------------------------------- public lookup
  const publicLookup = await lookup(null, first.delivery.tracking_id, 'anon');
  check(
    'anonymous tracking lookup finds the shipment by tracking ID',
    publicLookup.found === true && publicLookup.tracking_id === first.delivery.tracking_id
  );
  check(
    'public lookup exposes progress but redacts buyer/seller/order details',
    publicLookup.authorized === false &&
      publicLookup.access_level === 'PUBLIC' &&
      publicLookup.destination.address === '' &&
      publicLookup.destination.phone === '' &&
      publicLookup.order === null &&
      publicLookup.seller_name === '',
    JSON.stringify({ authorized: publicLookup.authorized, access: publicLookup.access_level, destination: publicLookup.destination, order: publicLookup.order, seller: publicLookup.seller_name })
  );
  check(
    'public lookup hides every private event note and rider identity',
    publicLookup.rider === null &&
      publicLookup.live === null &&
      Array.isArray(publicLookup.events) &&
      publicLookup.events.every((event) => event.note === '' && event.actor_role === '')
  );
  check(
    'public lookup still returns real timestamps and status',
    publicLookup.events.length >= 1 && Boolean(publicLookup.events[0].created_at) && publicLookup.status === first.delivery.status
  );

  const unrelatedLookup = await lookup(other.auth_id, first.delivery.tracking_id);
  check(
    'unrelated signed-in users get the same redacted public view',
    unrelatedLookup.authorized === false && unrelatedLookup.destination.address === '' && unrelatedLookup.order === null
  );

  const byOrderNumber = await lookup(buyer.auth_id, first.order.order_number);
  check(
    'order ID and tracking ID resolve to the same shipment',
    byOrderNumber.found === true && byOrderNumber.tracking_id === first.delivery.tracking_id
  );

  await client.query(`update public.deliveries set tracking_number = 'COURIER-P4-001' where id = $1`, [first.delivery.id]);
  const byCourier = await lookup(buyer.auth_id, 'courier-p4-001');
  check('courier reference is searchable and case-insensitive', byCourier.tracking_id === first.delivery.tracking_id);
  const missing = await lookup(buyer.auth_id, 'GSD-000000000');
  check('unknown tracking IDs return found:false rather than another shipment', missing.found === false);

  // ------------------------------------------------------- participant view
  const buyerLookup = await lookup(buyer.auth_id, first.delivery.tracking_id);
  check(
    'buyer sees the private delivery view',
    buyerLookup.authorized === true &&
      buyerLookup.viewer_role === 'BUYER' &&
      buyerLookup.destination.address === '5 Admiralty Way' &&
      buyerLookup.order?.order_number === first.order.order_number
  );
  check(
    'multi-seller checkout exposes both shipment tracking IDs',
    Array.isArray(buyerLookup.shipments) &&
      buyerLookup.shipments.length === 2 &&
      buyerLookup.shipments.some((shipment) => shipment.tracking_id === second.delivery.tracking_id)
  );
  check(
    'timeline contains only real delivery_events rows',
    buyerLookup.events.length ===
      (
        await client.query(`select count(*)::int as c from public.delivery_events where delivery_id = $1`, [first.delivery.id])
      ).rows[0].c
  );

  const sellerLookup = await lookup(seller.auth_id, first.delivery.tracking_id);
  check(
    'seller is authorized for their shipment without sibling seller details',
    sellerLookup.authorized === true &&
      sellerLookup.viewer_role === 'SELLER' &&
      Array.isArray(sellerLookup.shipments) &&
      sellerLookup.shipments.length === 1
  );
  const adminLookup = await lookup(admin.auth_id, first.delivery.tracking_id);
  check('admin receives the admin access level', adminLookup.authorized === true && adminLookup.access_level === 'ADMIN');

  // --------------------------------------------------------------- live GPS
  const { rows: riderPartnerRows } = await client.query(
    `insert into public.delivery_partners
       (user_id, full_name, phone, vehicle_type, status, is_available, city, state, service_states,
        last_lat, last_lng, last_location_at, rating, acceptance_rate, trust_score,
        location_permission, location_sharing, location_sharing_updated_at)
     values ($1, 'Phase 4 Rider', '08030000099', 'MOTORCYCLE', 'APPROVED', true,
             'Lekki', 'Lagos State', array['Lagos State'], 6.4500, 3.3900, now(), 4.8, 95, 88,
             'GRANTED', true, now())
     returning id`,
    [riderProfile.id]
  );
  const riderPartner = riderPartnerRows[0];
  await client.query(
    `update public.deliveries
        set rider_id = $1, status = 'OUT_FOR_DELIVERY', assignment_status = 'ACCEPTED'
      where id = $2`,
    [riderPartner.id, first.delivery.id]
  );
  await client.query(
    `insert into public.delivery_live_locations (delivery_id, rider_id, lat, lng, accuracy_m, speed_kmh, heading_degrees, updated_at)
     values ($1, $2, 6.4512, 3.3912, 8, 24, 90, now())
     on conflict (delivery_id) do update
       set rider_id = excluded.rider_id, lat = excluded.lat, lng = excluded.lng,
           accuracy_m = excluded.accuracy_m, speed_kmh = excluded.speed_kmh,
           heading_degrees = excluded.heading_degrees, updated_at = excluded.updated_at`,
    [first.delivery.id, riderPartner.id]
  );

  const liveBuyer = await lookup(buyer.auth_id, first.delivery.tracking_id);
  check(
    'authorized buyer receives real rider GPS while sharing',
    liveBuyer.live?.tracking_active === true &&
      liveBuyer.live?.rider_location?.lat === 6.4512 &&
      liveBuyer.live?.rider_location?.lng === 3.3912
  );
  check(
    'authorized buyer receives rider identity and controlled contact',
    liveBuyer.rider?.name === 'Phase 4 Rider' && liveBuyer.rider?.phone === '08030000099'
  );
  const livePublic = await lookup(null, first.delivery.tracking_id, 'anon');
  check(
    'public lookup never exposes rider GPS or identity',
    livePublic.live === null && livePublic.rider === null
  );
  const riderLookup = await lookup(riderProfile.auth_id, first.delivery.tracking_id);
  check('assigned rider is authorized to see the shipment', riderLookup.authorized === true && riderLookup.viewer_role === 'RIDER');

  // ------------------------------------------------- confirmation + escrow
  const code = await asProfile(buyer.auth_id, async () => {
    const result = await client.query(`select public.delivery_generate_confirmation_code($1) as payload`, [first.delivery.id]);
    return result.rows[0].payload.code;
  });
  await asProfile(admin.auth_id, () =>
    client.query(`select public.delivery_confirm_with_code($1, $2)`, [first.delivery.id, code])
  );
  const completed = (
    await client.query(
      `select d.status, d.delivered_at, e.is_released, e.held_amount
         from public.deliveries d join public.escrows e on e.order_id = d.order_id
        where d.id = $1`,
      [first.delivery.id]
    )
  ).rows[0];
  check('buyer confirmation code completes delivery with a real delivered timestamp', completed.status === 'DELIVERED' && Boolean(completed.delivered_at));
  check('delivery confirmation never releases escrow', completed.is_released === false && Number(completed.held_amount) > 0);
  const afterDelivery = await lookup(buyer.auth_id, first.delivery.tracking_id);
  check(
    'live tracking stops after delivery',
    afterDelivery.live?.tracking_active === false &&
      (afterDelivery.live?.tracking_status === 'ENDED' || afterDelivery.live?.reason === 'DELIVERY_ENDED')
  );
  check(
    'delivered shipment exposes receipt details and buyer confirmation',
    afterDelivery.delivered_at &&
      afterDelivery.order?.product_title?.startsWith('Phase 4 verification') &&
      afterDelivery.can_confirm_receipt === true &&
      afterDelivery.can_report_issue === true
  );

  const failures = results.filter((row) => !row.ok);
  await client.query('rollback');
  await client.end();
  console.log(`\n${results.length - failures.length}/${results.length} Phase 4 checks passed.`);
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
