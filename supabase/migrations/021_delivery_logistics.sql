-- 021_delivery_logistics.sql
-- Phase 3: automated rider matching, location-aware delivery, live tracking,
-- courier shipment synchronisation, failure/return handling and analytics.
--
-- Additive only. Phase 1 deliveries and Phase 2 rider offers remain the source
-- of truth; this migration extends them instead of creating a parallel system.

-- ---------------------------------------------------------------------------
-- 1. Logistics settings (one admin-owned row)
-- ---------------------------------------------------------------------------
create table if not exists public.delivery_settings (
  id integer primary key default 1 check (id = 1),
  auto_assign_enabled boolean not null default false,
  offer_timeout_minutes integer not null default 30 check (offer_timeout_minutes between 5 and 180),
  max_active_deliveries integer not null default 3 check (max_active_deliveries between 1 and 20),
  max_pickup_distance_km numeric not null default 25 check (max_pickup_distance_km > 0 and max_pickup_distance_km <= 500),
  max_offers_per_delivery integer not null default 5 check (max_offers_per_delivery between 1 and 20),
  location_update_interval_seconds integer not null default 15 check (location_update_interval_seconds between 5 and 300),
  tracking_stale_minutes integer not null default 10 check (tracking_stale_minutes between 1 and 120),
  updated_by bigint references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.delivery_settings (id) values (1)
on conflict (id) do nothing;

alter table public.delivery_settings enable row level security;
drop policy if exists delivery_settings_authenticated_read on public.delivery_settings;
create policy delivery_settings_authenticated_read on public.delivery_settings
  for select to authenticated using (true);
grant select on public.delivery_settings to authenticated;

drop trigger if exists delivery_settings_set_updated_at on public.delivery_settings;
create trigger delivery_settings_set_updated_at
  before update on public.delivery_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Delivery/rider location and courier columns
-- ---------------------------------------------------------------------------
alter table public.deliveries
  add column if not exists pickup_lat double precision,
  add column if not exists pickup_lng double precision,
  add column if not exists delivery_lat double precision,
  add column if not exists delivery_lng double precision,
  add column if not exists route_distance_km numeric,
  add column if not exists route_duration_minutes integer,
  add column if not exists route_provider text not null default '',
  add column if not exists route_is_estimate boolean not null default true,
  add column if not exists route_computed_at timestamptz,
  add column if not exists assignment_mode text not null default 'MANUAL'
    check (assignment_mode in ('AUTO', 'MANUAL')),
  add column if not exists auto_offer_round integer not null default 0,
  add column if not exists courier_provider text not null default '',
  add column if not exists courier_external_id text not null default '',
  add column if not exists courier_status text not null default '',
  add column if not exists courier_last_synced_at timestamptz,
  add column if not exists courier_last_error text not null default '',
  add column if not exists courier_sync_attempts integer not null default 0;

alter table public.delivery_partners
  add column if not exists location_permission text not null default 'UNKNOWN'
    check (location_permission in ('UNKNOWN', 'GRANTED', 'DENIED')),
  add column if not exists location_sharing boolean not null default false,
  add column if not exists location_sharing_updated_at timestamptz;

-- Backfill coordinates already captured on orders by Phase 1.
update public.deliveries d
   set pickup_lat = coalesce(d.pickup_lat, o.pickup_lat),
       pickup_lng = coalesce(d.pickup_lng, o.pickup_lng),
       delivery_lat = coalesce(d.delivery_lat, o.delivery_lat),
       delivery_lng = coalesce(d.delivery_lng, o.delivery_lng)
  from public.orders o
 where o.id = d.order_id
   and (d.pickup_lat is null or d.pickup_lng is null or d.delivery_lat is null or d.delivery_lng is null);

-- Keep the canonical delivery coordinates in step with newly created orders.
create or replace function public.create_delivery_for_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pickup record;
  v_delivery_id bigint;
  v_status text;
  v_eta date;
begin
  if coalesce(new.delivery_method, '') = 'PICKUP' then
    return new;
  end if;

  select pickup_address, pickup_city, pickup_state, pickup_lat, pickup_lng
    into v_pickup
  from public.seller_shipping_settings
  where seller_id = new.seller_id;

  v_status := public.delivery_status_from_order(new.status);

  v_eta := case
    when new.estimated_delivery_max_days is not null
      then (new.created_at::date + new.estimated_delivery_max_days)
    else null
  end;

  insert into public.deliveries (
    order_id, delivery_number, buyer_id, seller_id,
    pickup_address, pickup_city, pickup_state,
    delivery_address, delivery_city, delivery_state,
    pickup_lat, pickup_lng, delivery_lat, delivery_lng,
    delivery_method, service_type, delivery_fee, fee_snapshot,
    status, rider_id, estimated_delivery_date, created_at
  ) values (
    new.id,
    'DLV-' || new.order_number,
    new.buyer_id,
    new.seller_id,
    coalesce(v_pickup.pickup_address, ''),
    coalesce(v_pickup.pickup_city, ''),
    coalesce(v_pickup.pickup_state, ''),
    coalesce(new.delivery_address, ''),
    coalesce(new.delivery_city, ''),
    coalesce(new.delivery_state, ''),
    coalesce(v_pickup.pickup_lat, new.pickup_lat),
    coalesce(v_pickup.pickup_lng, new.pickup_lng),
    new.delivery_lat,
    new.delivery_lng,
    coalesce(nullif(new.delivery_method, ''), 'GOODSALE_PARTNER'),
    coalesce(new.service_type, 'STANDARD'),
    coalesce(new.delivery_fee, 0),
    coalesce(new.shipping_snapshot, '{}'::jsonb),
    v_status,
    new.selected_partner_id,
    v_eta,
    new.created_at
  )
  on conflict (order_id) do nothing
  returning id into v_delivery_id;

  if v_delivery_id is not null then
    insert into public.delivery_events (delivery_id, status, note, actor_role)
    values (v_delivery_id, v_status, 'Delivery record created with the order', 'SYSTEM');
  end if;

  return new;
end;
$$;

-- Public directory rows must never leak a rider's precise coordinates. The
-- private delivery_partners row (self/admin) and the guarded tracking RPC are
-- the only sources of live location.
drop view if exists public.delivery_partners_directory;
create view public.delivery_partners_directory
with (security_barrier = true) as
select
  id, user_id, full_name, phone, vehicle_type, brand, model, plate_number,
  color, year, capacity, photo_url, status, is_available, trust_score, rating,
  completed_deliveries, acceptance_rate, active_deliveries_count,
  city, state, service_states, created_at, updated_at
from public.delivery_partners;

grant select on public.delivery_partners_directory to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Offer audit trail
-- ---------------------------------------------------------------------------
create table if not exists public.delivery_assignment_offers (
  id bigint generated by default as identity primary key,
  delivery_id bigint not null references public.deliveries(id) on delete cascade,
  rider_id bigint not null references public.delivery_partners(id) on delete cascade,
  round integer not null default 1 check (round > 0),
  status text not null default 'OFFERED'
    check (status in ('OFFERED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'SUPERSEDED')),
  score numeric,
  distance_km numeric,
  vehicle_suitable boolean not null default true,
  offered_at timestamptz not null default now(),
  expires_at timestamptz,
  responded_at timestamptz,
  reason text not null default '',
  unique (delivery_id, rider_id, round)
);

create index if not exists idx_delivery_offers_delivery
  on public.delivery_assignment_offers(delivery_id, offered_at desc);
create index if not exists idx_delivery_offers_rider
  on public.delivery_assignment_offers(rider_id, offered_at desc);

alter table public.delivery_assignment_offers enable row level security;

drop policy if exists delivery_offers_rider_read on public.delivery_assignment_offers;
create policy delivery_offers_rider_read on public.delivery_assignment_offers
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.delivery_partners dp
      where dp.id = delivery_assignment_offers.rider_id
        and dp.user_id = public.current_profile_id()
    )
  );

grant select on public.delivery_assignment_offers to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Distance helper (straight-line only; never labelled as road distance)
-- ---------------------------------------------------------------------------
create or replace function public.delivery_haversine_km(
  p_lat1 double precision,
  p_lng1 double precision,
  p_lat2 double precision,
  p_lng2 double precision
)
returns double precision
language sql
immutable
as $$
  select case
    when p_lat1 is null or p_lng1 is null or p_lat2 is null or p_lng2 is null then null
    else round((
      6371.0 * 2.0 * asin(sqrt(
        power(sin(radians(p_lat2 - p_lat1) / 2), 2) +
        cos(radians(p_lat1)) * cos(radians(p_lat2)) *
        power(sin(radians(p_lng2 - p_lng1) / 2), 2)
      ))
    )::numeric, 2)::double precision
  end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Automated matching
-- ---------------------------------------------------------------------------
create or replace function public.delivery_auto_offer(
  p_delivery_id bigint,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deliveries%rowtype;
  s public.delivery_settings%rowtype;
  v_rider record;
  v_prev bigint[];
  v_round integer;
  v_setting_on boolean;
begin
  select * into d from public.deliveries where id = p_delivery_id for update;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'Delivery not found');
  end if;

  if d.delivery_method <> 'GOODSALE_PARTNER' then
    return jsonb_build_object('success', true, 'offered', false, 'reason', 'Not a GoodDispatch delivery');
  end if;
  if d.status in ('DELIVERED', 'CANCELLED', 'RETURNED_TO_SELLER') then
    return jsonb_build_object('success', true, 'offered', false, 'reason', 'Delivery is closed');
  end if;
  if d.status not in ('READY_FOR_PICKUP', 'AWAITING_RIDER') then
    return jsonb_build_object('success', true, 'offered', false, 'reason', 'Delivery is not awaiting a rider');
  end if;
  if d.rider_id is not null and d.assignment_status = 'ACCEPTED' then
    return jsonb_build_object('success', true, 'offered', false, 'reason', 'Delivery is already accepted');
  end if;
  if d.assignment_status = 'OFFERED'
     and d.assignment_expires_at is not null
     and d.assignment_expires_at > now() then
    return jsonb_build_object('success', true, 'offered', false, 'reason', 'An offer is already active');
  end if;

  select * into s from public.delivery_settings where id = 1;
  v_setting_on := coalesce(s.auto_assign_enabled, false) or p_force;

  if not v_setting_on then
    -- Automatic matching is optional. When it is off, leaves READY_FOR_PICKUP
    -- and AWAITING_RIDER exactly as the existing manual workflow left them.
    return jsonb_build_object('success', true, 'offered', false, 'reason', 'Automated assignment is disabled');
  end if;

  select coalesce(array_agg(distinct rider_id), '{}'::bigint[])
    into v_prev
  from public.delivery_assignment_offers
  where delivery_id = d.id;

  select coalesce(max(round), 0) + 1
    into v_round
  from public.delivery_assignment_offers
  where delivery_id = d.id;

  if v_round > coalesce(s.max_offers_per_delivery, 5) then
    update public.deliveries
       set rider_id = null,
           status = 'AWAITING_RIDER',
           assignment_status = 'UNASSIGNED',
           assignment_mode = 'AUTO',
           auto_offer_round = v_round,
           assignment_offered_at = null,
           assignment_expires_at = null,
           updated_at = now()
     where id = d.id;
    insert into public.delivery_events (delivery_id, status, note, actor_role)
    values (d.id, 'AWAITING_RIDER', 'Automated matching exhausted the eligible rider offers', 'SYSTEM');
    perform public.delivery_audit(d.id, 'AUTO_ASSIGN_EXHAUSTED', d.status, 'AWAITING_RIDER',
                                  'No acceptance after ' || (v_round - 1) || ' offers');
    return jsonb_build_object('success', true, 'offered', false, 'reason', 'No eligible riders left');
  end if;

  -- Straight-line distance is the only distance available in SQL. Road
  -- distance/ETA is computed by the maps provider in the tracking API and is
  -- stored separately, marked as an estimate when no provider is configured.
  with candidates as (
    select
      dp.id,
      dp.user_id,
      dp.full_name,
      dp.active_deliveries_count,
      dp.rating,
      dp.acceptance_rate,
      dp.trust_score,
      dp.vehicle_type,
      case
        when d.pickup_lat is not null and d.pickup_lng is not null
         and dp.last_lat is not null and dp.last_lng is not null
          then public.delivery_haversine_km(d.pickup_lat, d.pickup_lng, dp.last_lat, dp.last_lng)
        else null
      end as distance_km,
      (
        d.service_type <> 'EXPRESS' or coalesce(dp.vehicle_type, '') <> 'BICYCLE'
      ) as vehicle_suitable
    from public.delivery_partners dp
    where dp.status = 'APPROVED'
      and dp.is_available
      and coalesce(dp.active_deliveries_count, 0) < coalesce(s.max_active_deliveries, 3)
      and dp.id <> all (v_prev)
      and (
        (
          coalesce(array_length(dp.service_states, 1), 0) > 0
          and (d.delivery_state = any(dp.service_states) or coalesce(d.delivery_state, '') = '')
        )
        or (
          coalesce(array_length(dp.service_states, 1), 0) = 0
          and (
            coalesce(dp.state, '') = ''
            or coalesce(d.delivery_state, '') = ''
            or d.delivery_state = dp.state
          )
        )
        or coalesce(dp.state, '') = ''
      )
      and (
        d.pickup_lat is null or d.pickup_lng is null
        or dp.last_lat is null or dp.last_lng is null
        or public.delivery_haversine_km(d.pickup_lat, d.pickup_lng, dp.last_lat, dp.last_lng)
           <= coalesce(s.max_pickup_distance_km, 25)
      )
      and (d.service_type <> 'EXPRESS' or coalesce(dp.vehicle_type, '') <> 'BICYCLE')
  ), scored as (
    select c.*,
      round((
        coalesce(greatest(0, 45 - c.distance_km * 2), 20)
        + greatest(0, 20 - coalesce(c.active_deliveries_count, 0) * 6)
        + coalesce(c.rating, 0) * 3
        + coalesce(c.acceptance_rate, 0) / 10
        + coalesce(c.trust_score, 50) / 10
        + case when c.vehicle_suitable then 5 else 0 end
      )::numeric, 2) as match_score
    from candidates c
  )
  select * into v_rider
  from scored
  order by match_score desc, distance_km asc nulls last, active_deliveries_count asc, id asc
  limit 1;

  if not found then
    update public.deliveries
       set rider_id = null,
           status = 'AWAITING_RIDER',
           assignment_status = 'UNASSIGNED',
           assignment_mode = 'AUTO',
           auto_offer_round = v_round,
           assignment_offered_at = null,
           assignment_expires_at = null,
           updated_at = now()
     where id = d.id;

    insert into public.delivery_events (delivery_id, status, note, actor_role)
    values (d.id, 'AWAITING_RIDER',
            'No approved online rider matched this delivery; it remains available for manual assignment', 'SYSTEM');
    perform public.delivery_audit(d.id, 'AUTO_ASSIGN_NO_MATCH', d.status, 'AWAITING_RIDER',
                                  'Checked approved online riders in the service area');
    return jsonb_build_object('success', true, 'offered', false, 'reason', 'No eligible rider found', 'round', v_round);
  end if;

  perform set_config('goodsale.rider_system', 'on', true);

  update public.deliveries
     set rider_id = v_rider.id,
         courier_name = case when coalesce(courier_name, '') = '' then v_rider.full_name else courier_name end,
         status = 'RIDER_ASSIGNED',
         assignment_status = 'OFFERED',
         assignment_mode = 'AUTO',
         auto_offer_round = v_round,
         assignment_offered_at = now(),
         assignment_expires_at = now() + make_interval(mins => coalesce(s.offer_timeout_minutes, 30)),
         rider_accepted_at = null,
         updated_at = now()
   where id = d.id;

  update public.delivery_jobs
     set partner_id = v_rider.id, updated_at = now()
   where order_id = d.order_id and status not in ('COMPLETED', 'CANCELLED');

  insert into public.delivery_assignment_offers (
    delivery_id, rider_id, round, status, score, distance_km, vehicle_suitable, expires_at
  ) values (
    d.id, v_rider.id, v_round, 'OFFERED', v_rider.match_score, v_rider.distance_km,
    v_rider.vehicle_suitable, now() + make_interval(mins => coalesce(s.offer_timeout_minutes, 30))
  )
  on conflict (delivery_id, rider_id, round) do nothing;

  insert into public.delivery_events (delivery_id, status, note, actor_role)
  values (
    d.id, 'RIDER_ASSIGNED',
    'Automated match offered to ' || v_rider.full_name ||
    case when v_rider.distance_km is not null
      then ' · ' || round(v_rider.distance_km::numeric, 1) || ' km straight-line from pickup'
      else ' · rider distance unavailable' end,
    'SYSTEM'
  );

  perform public.delivery_audit(
    d.id, 'AUTO_OFFER', d.status, 'RIDER_ASSIGNED',
    'Round ' || v_round || ' · rider #' || v_rider.id || ' · score ' || v_rider.match_score
  );

  insert into public.notifications (user_id, title, message, type)
  values (
    v_rider.user_id,
    'New delivery request',
    'A package is ready in ' || coalesce(nullif(d.pickup_city, ''), d.pickup_state, 'your area') ||
    '. Respond within ' || coalesce(s.offer_timeout_minutes, 30) || ' minutes.',
    'DELIVERY'
  );

  perform set_config('goodsale.rider_system', 'off', true);

  return jsonb_build_object(
    'success', true, 'offered', true, 'rider_id', v_rider.id,
    'rider_name', v_rider.full_name, 'round', v_round,
    'score', v_rider.match_score, 'distance_km', v_rider.distance_km,
    'expires_at', now() + make_interval(mins => coalesce(s.offer_timeout_minutes, 30))
  );
end;
$$;

create or replace function public.delivery_auto_offer_on_ready()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'READY_FOR_PICKUP'
     and old.status is distinct from 'READY_FOR_PICKUP'
     and new.rider_id is null
     and new.delivery_method = 'GOODSALE_PARTNER' then
    perform public.delivery_auto_offer(new.id, false);
  end if;
  return new;
end;
$$;

drop trigger if exists deliveries_auto_offer_on_ready on public.deliveries;
create trigger deliveries_auto_offer_on_ready
  after update of status on public.deliveries
  for each row execute function public.delivery_auto_offer_on_ready();

create or replace function public.admin_auto_assign_delivery(p_delivery_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;
  return public.delivery_auto_offer(p_delivery_id, true);
end;
$$;

create or replace function public.admin_set_delivery_settings(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin bigint := public.current_profile_id();
  s public.delivery_settings%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Settings payload is required';
  end if;

  update public.delivery_settings
     set auto_assign_enabled = coalesce((p_payload->>'auto_assign_enabled')::boolean, auto_assign_enabled),
         offer_timeout_minutes = coalesce((p_payload->>'offer_timeout_minutes')::integer, offer_timeout_minutes),
         max_active_deliveries = coalesce((p_payload->>'max_active_deliveries')::integer, max_active_deliveries),
         max_pickup_distance_km = coalesce((p_payload->>'max_pickup_distance_km')::numeric, max_pickup_distance_km),
         max_offers_per_delivery = coalesce((p_payload->>'max_offers_per_delivery')::integer, max_offers_per_delivery),
         location_update_interval_seconds = coalesce((p_payload->>'location_update_interval_seconds')::integer, location_update_interval_seconds),
         tracking_stale_minutes = coalesce((p_payload->>'tracking_stale_minutes')::integer, tracking_stale_minutes),
         updated_by = v_admin,
         updated_at = now()
   where id = 1
   returning * into s;

  insert into public.audit_logs (user_id, action, entity_type, entity_id, details)
  values (v_admin, 'DELIVERY_SETTINGS_UPDATED', 'delivery_settings', 1, p_payload::text);

  return jsonb_build_object(
    'success', true,
    'auto_assign_enabled', s.auto_assign_enabled,
    'offer_timeout_minutes', s.offer_timeout_minutes,
    'max_active_deliveries', s.max_active_deliveries,
    'max_pickup_distance_km', s.max_pickup_distance_km,
    'max_offers_per_delivery', s.max_offers_per_delivery,
    'location_update_interval_seconds', s.location_update_interval_seconds,
    'tracking_stale_minutes', s.tracking_stale_minutes
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Offer response + reassignment
-- ---------------------------------------------------------------------------
create or replace function public.delivery_mark_offer_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assignment_status = 'ACCEPTED' and old.assignment_status is distinct from 'ACCEPTED' then
    update public.delivery_assignment_offers
       set status = 'ACCEPTED', responded_at = now()
     where id = (
       select id from public.delivery_assignment_offers
       where delivery_id = new.id and status = 'OFFERED'
       order by offered_at desc limit 1
     );
    update public.delivery_assignment_offers
       set status = 'SUPERSEDED', responded_at = coalesce(responded_at, now())
     where delivery_id = new.id and status = 'OFFERED'
       and rider_id is distinct from new.rider_id;
  elsif new.assignment_status in ('REJECTED', 'EXPIRED')
        and old.assignment_status is distinct from new.assignment_status then
    update public.delivery_assignment_offers
       set status = case when new.assignment_status = 'REJECTED' then 'REJECTED' else 'EXPIRED' end,
           responded_at = coalesce(responded_at, now())
     where delivery_id = new.id and status = 'OFFERED';
  end if;
  return new;
end;
$$;

drop trigger if exists deliveries_mark_offer_response on public.deliveries;
create trigger deliveries_mark_offer_response
  after update of assignment_status on public.deliveries
  for each row execute function public.delivery_mark_offer_response();

create or replace function public.expire_rider_assignments()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_user bigint;
  v_count integer := 0;
  v_auto boolean;
begin
  select coalesce(auto_assign_enabled, false) into v_auto
  from public.delivery_settings where id = 1;

  perform set_config('goodsale.rider_system', 'on', true);

  for v_row in
    select d.id, d.rider_id, d.order_id, d.delivery_number
    from public.deliveries d
    where d.assignment_status = 'OFFERED'
      and d.assignment_expires_at is not null
      and d.assignment_expires_at < now()
      and d.status in ('RIDER_ASSIGNED', 'READY_FOR_PICKUP', 'AWAITING_RIDER')
    for update
  loop
    update public.deliveries
       set rider_id = null,
           assignment_status = 'EXPIRED',
           assignment_offered_at = null,
           assignment_expires_at = null,
           status = 'AWAITING_RIDER',
           updated_at = now()
     where id = v_row.id;

    update public.delivery_jobs
       set partner_id = null, updated_at = now()
     where order_id = v_row.order_id and status not in ('COMPLETED', 'CANCELLED');

    insert into public.delivery_events (delivery_id, status, note, actor_role)
    values (v_row.id, 'AWAITING_RIDER', 'Rider assignment offer expired', 'SYSTEM');

    perform public.delivery_audit(v_row.id, 'ASSIGNMENT_EXPIRED', 'RIDER_ASSIGNED', 'AWAITING_RIDER',
                                  'Offer expired without rider acceptance');

    select user_id into v_user from public.delivery_partners where id = v_row.rider_id;
    if v_user is not null then
      insert into public.notifications (user_id, title, message, type)
      values (v_user, 'Delivery offer expired',
              'The assignment for ' || v_row.delivery_number || ' expired before acceptance.', 'DELIVERY');
    end if;

    v_count := v_count + 1;
  end loop;

  if v_auto then
    for v_row in
      select d.id
      from public.deliveries d
      where d.status = 'AWAITING_RIDER'
        and d.rider_id is null
        and d.delivery_method = 'GOODSALE_PARTNER'
        and d.assignment_status in ('EXPIRED', 'REJECTED')
        and d.assignment_mode = 'AUTO'
        and not exists (
          select 1 from public.delivery_assignment_offers o
          where o.delivery_id = d.id and o.status = 'OFFERED'
        )
      order by d.updated_at asc
      limit 25
    loop
      perform public.delivery_auto_offer(v_row.id, false);
    end loop;
  end if;

  perform set_config('goodsale.rider_system', 'off', true);
  return v_count;
end;
$$;

create or replace function public.rider_reject_delivery(p_delivery_id bigint, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deliveries%rowtype;
  p public.delivery_partners%rowtype;
  caller bigint := public.current_profile_id();
  v_seller bigint;
  v_auto boolean;
  v_next jsonb;
  v_assignment text;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;
  select * into p from public.delivery_partners where user_id = caller;
  if not found then
    raise exception 'Rider profile not found';
  end if;

  select * into d from public.deliveries where id = p_delivery_id for update;
  if not found then
    raise exception 'Delivery not found';
  end if;
  if d.rider_id is distinct from p.id then
    raise exception 'This delivery is not assigned to you';
  end if;
  if d.status not in ('RIDER_ASSIGNED', 'READY_FOR_PICKUP', 'AWAITING_RIDER') then
    raise exception 'Report a failed delivery instead of rejecting a collected package';
  end if;

  select seller_id into v_seller from public.orders where id = d.order_id;

  perform set_config('goodsale.rider_system', 'on', true);

  update public.deliveries
     set rider_id = null,
         assignment_status = 'REJECTED',
         assignment_offered_at = null,
         assignment_expires_at = null,
         status = 'AWAITING_RIDER',
         updated_at = now()
   where id = d.id;

  update public.delivery_jobs
     set partner_id = null, updated_at = now()
   where order_id = d.order_id and status not in ('COMPLETED', 'CANCELLED');

  insert into public.delivery_events (delivery_id, status, note, actor_id, actor_role)
  values (d.id, 'AWAITING_RIDER',
          'Rider declined the assignment' || coalesce(': ' || nullif(btrim(p_reason), ''), ''),
          caller, 'RIDER');

  perform public.delivery_audit(d.id, 'RIDER_REJECTED', 'RIDER_ASSIGNED', 'AWAITING_RIDER',
                                coalesce(nullif(btrim(p_reason), ''), 'Rider declined the assignment'));

  if v_seller is not null then
    insert into public.notifications (user_id, title, message, type)
    values (v_seller, 'Rider declined assignment', 'GoodSale is reassigning delivery ' || d.delivery_number || '.', 'DELIVERY');
  end if;

  select coalesce(auto_assign_enabled, false) into v_auto from public.delivery_settings where id = 1;
  if v_auto then
    v_next := public.delivery_auto_offer(d.id, false);
  end if;

  perform set_config('goodsale.rider_system', 'off', true);

  select assignment_status into v_assignment from public.deliveries where id = d.id;
  return jsonb_build_object(
    'success', true,
    'status', 'AWAITING_RIDER',
    'assignment_status', v_assignment,
    'next', v_next
  );
end;
$$;

-- Keep manual admin assignment as the override path, but store the offer in
-- the same audit table and use the configured timeout.
create or replace function public.delivery_assign_rider(p_delivery_id bigint, p_rider_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deliveries%rowtype;
  p public.delivery_partners%rowtype;
  s public.delivery_settings%rowtype;
  v_status text;
  v_assignment text;
  v_round integer;
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;

  select * into d from public.deliveries where id = p_delivery_id for update;
  if not found then
    raise exception 'Delivery not found';
  end if;
  if d.status in ('DELIVERED', 'CANCELLED', 'RETURNED_TO_SELLER') then
    raise exception 'Delivery is closed';
  end if;

  select * into p from public.delivery_partners where id = p_rider_id;
  if not found then
    raise exception 'Rider not found';
  end if;
  if p.status <> 'APPROVED' then
    raise exception 'Rider is not approved yet';
  end if;

  if d.rider_id is not null and d.rider_id <> p.id then
    insert into public.notifications (user_id, title, message, type)
    select dp.user_id, 'Assignment cancelled',
           'Delivery ' || d.delivery_number || ' has been reassigned to another rider.', 'DELIVERY'
    from public.delivery_partners dp where dp.id = d.rider_id;
  end if;

  if d.delivery_method <> 'GOODSALE_PARTNER' then
    raise exception 'Only GoodDispatch deliveries can be assigned to riders';
  end if;
  if d.status not in ('READY_FOR_PICKUP', 'AWAITING_RIDER', 'RIDER_ASSIGNED') then
    raise exception 'The seller must mark this delivery ready for pickup before a rider is assigned';
  end if;

  select * into s from public.delivery_settings where id = 1;
  v_status := 'RIDER_ASSIGNED';
  v_assignment := case
    when d.rider_id = p.id and d.assignment_status = 'ACCEPTED' then 'ACCEPTED'
    else 'OFFERED'
  end;
  v_round := coalesce(d.auto_offer_round, 0) + 1;

  perform set_config('goodsale.rider_system', 'on', true);

  update public.delivery_assignment_offers
     set status = 'SUPERSEDED', responded_at = coalesce(responded_at, now())
   where delivery_id = d.id and status = 'OFFERED';

  update public.deliveries
     set rider_id = p.id,
         courier_name = case when coalesce(courier_name, '') = '' then p.full_name else courier_name end,
         status = v_status,
         assignment_status = v_assignment,
         assignment_mode = 'MANUAL',
         auto_offer_round = v_round,
         assignment_offered_at = case when v_assignment = 'OFFERED' then now() else assignment_offered_at end,
         assignment_expires_at = case when v_assignment = 'OFFERED'
           then now() + make_interval(mins => coalesce(s.offer_timeout_minutes, 30)) else assignment_expires_at end,
         rider_accepted_at = case when v_assignment = 'OFFERED' then null else rider_accepted_at end,
         updated_at = now()
   where id = d.id;

  update public.delivery_jobs
     set partner_id = p.id, updated_at = now()
   where order_id = d.order_id and status not in ('COMPLETED', 'CANCELLED');

  if v_assignment = 'OFFERED' then
    insert into public.delivery_assignment_offers (
      delivery_id, rider_id, round, status, expires_at
    ) values (
      d.id, p.id, v_round, 'OFFERED',
      now() + make_interval(mins => coalesce(s.offer_timeout_minutes, 30))
    )
    on conflict (delivery_id, rider_id, round) do nothing;
  end if;

  insert into public.delivery_events (delivery_id, status, note, actor_id, actor_role)
  values (d.id, v_status, 'Delivery offered to rider ' || p.full_name, public.current_profile_id(), 'ADMIN');

  perform public.delivery_audit(
    d.id, 'ASSIGN_RIDER', d.status, v_status,
    'Manual override: rider #' || p.id || ' (' || p.full_name || ') offered the delivery'
  );

  insert into public.notifications (user_id, title, message, type)
  values (p.user_id, 'New delivery assignment',
          'You have a new delivery request (' || d.delivery_number || '). Accept it within ' ||
          coalesce(s.offer_timeout_minutes, 30) || ' minutes.', 'DELIVERY');

  perform set_config('goodsale.rider_system', 'off', true);
  return jsonb_build_object('success', true, 'status', v_status, 'rider_id', p.id, 'assignment_status', v_assignment);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Live rider locations (latest point only; no public table access)
-- ---------------------------------------------------------------------------
create table if not exists public.delivery_live_locations (
  delivery_id bigint primary key references public.deliveries(id) on delete cascade,
  rider_id bigint not null references public.delivery_partners(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy_m numeric check (accuracy_m is null or accuracy_m >= 0),
  speed_kmh numeric check (speed_kmh is null or speed_kmh >= 0),
  heading_degrees numeric check (heading_degrees is null or (heading_degrees >= 0 and heading_degrees <= 360)),
  updated_at timestamptz not null default now()
);

alter table public.delivery_live_locations enable row level security;

drop policy if exists delivery_live_locations_admin_read on public.delivery_live_locations;
create policy delivery_live_locations_admin_read on public.delivery_live_locations
  for select to authenticated using (public.is_admin());

grant select on public.delivery_live_locations to authenticated;

create or replace function public.rider_set_location_sharing(
  p_share boolean,
  p_permission text default 'UNKNOWN'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.delivery_partners%rowtype;
  caller bigint := public.current_profile_id();
  v_permission text := upper(coalesce(p_permission, 'UNKNOWN'));
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;
  if v_permission not in ('UNKNOWN', 'GRANTED', 'DENIED') then
    raise exception 'Invalid location permission value';
  end if;

  select * into p from public.delivery_partners where user_id = caller for update;
  if not found then
    raise exception 'Rider profile not found';
  end if;
  if p.status <> 'APPROVED' then
    raise exception 'Only approved riders can share location';
  end if;
  if p_share and v_permission <> 'GRANTED' then
    raise exception 'Grant location permission before sharing your location';
  end if;

  update public.delivery_partners
     set location_permission = v_permission,
         location_sharing = case when v_permission = 'DENIED' then false else p_share end,
         location_sharing_updated_at = now(),
         updated_at = now()
   where id = p.id;

  if not p_share or v_permission = 'DENIED' then
    delete from public.delivery_live_locations where rider_id = p.id;
  end if;

  insert into public.audit_logs (user_id, action, entity_type, entity_id, details)
  values (
    caller,
    case when p_share and v_permission = 'GRANTED' then 'RIDER_LOCATION_SHARING_ON' else 'RIDER_LOCATION_SHARING_OFF' end,
    'delivery_partners', p.id,
    case when p_share and v_permission = 'GRANTED'
      then 'Rider granted live-location tracking for active deliveries'
      else 'Rider stopped live-location tracking (' || v_permission || ')' end
  );

  return jsonb_build_object(
    'success', true,
    'sharing', (p_share and v_permission = 'GRANTED'),
    'permission', v_permission
  );
end;
$$;

create or replace function public.rider_update_location(
  p_delivery_id bigint,
  p_lat double precision,
  p_lng double precision,
  p_accuracy_m numeric default null,
  p_speed_kmh numeric default null,
  p_heading_degrees numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deliveries%rowtype;
  p public.delivery_partners%rowtype;
  s public.delivery_settings%rowtype;
  caller bigint := public.current_profile_id();
  v_last timestamptz;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'A valid latitude and longitude are required';
  end if;
  if p_accuracy_m is not null and p_accuracy_m < 0 then
    raise exception 'Invalid location accuracy';
  end if;
  if p_heading_degrees is not null and (p_heading_degrees < 0 or p_heading_degrees > 360) then
    raise exception 'Invalid heading';
  end if;

  select * into p from public.delivery_partners where user_id = caller;
  if not found then
    raise exception 'Rider profile not found';
  end if;
  if p.status <> 'APPROVED' then
    raise exception 'Rider account is not active';
  end if;
  if not p.is_available then
    raise exception 'Go online before sharing live location';
  end if;
  if p.location_permission <> 'GRANTED' or not p.location_sharing then
    raise exception 'Live location sharing is not enabled';
  end if;

  select * into d from public.deliveries where id = p_delivery_id;
  if not found or d.rider_id is distinct from p.id or d.assignment_status <> 'ACCEPTED' then
    raise exception 'This delivery is not assigned to you';
  end if;
  if d.status not in ('RIDER_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_HUB', 'OUT_FOR_DELIVERY', 'DELIVERY_ATTEMPTED') then
    raise exception 'Live tracking is only available during an active delivery';
  end if;

  select * into s from public.delivery_settings where id = 1;
  select updated_at into v_last from public.delivery_live_locations where delivery_id = d.id;
  if v_last is not null
     and v_last > now() - make_interval(secs => coalesce(s.location_update_interval_seconds, 15)) then
    return jsonb_build_object('success', true, 'skipped', true, 'reason', 'Location update is too frequent', 'updated_at', v_last);
  end if;

  insert into public.delivery_live_locations (
    delivery_id, rider_id, lat, lng, accuracy_m, speed_kmh, heading_degrees, updated_at
  ) values (
    d.id, p.id, p_lat, p_lng, p_accuracy_m, p_speed_kmh, p_heading_degrees, now()
  )
  on conflict (delivery_id) do update
    set rider_id = excluded.rider_id,
        lat = excluded.lat,
        lng = excluded.lng,
        accuracy_m = excluded.accuracy_m,
        speed_kmh = excluded.speed_kmh,
        heading_degrees = excluded.heading_degrees,
        updated_at = now();

  update public.delivery_partners
     set last_lat = p_lat,
         last_lng = p_lng,
         last_location_at = now(),
         last_seen_at = now(),
         updated_at = now()
   where id = p.id;

  return jsonb_build_object('success', true, 'skipped', false, 'updated_at', now());
end;
$$;

-- Stop tracking as soon as the delivery leaves an active state, is reassigned,
-- or the rider goes offline.
create or replace function public.delivery_stop_tracking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.rider_id is null
     or new.rider_id is distinct from old.rider_id
     or new.status not in ('RIDER_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_HUB', 'OUT_FOR_DELIVERY', 'DELIVERY_ATTEMPTED') then
    delete from public.delivery_live_locations where delivery_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists deliveries_stop_tracking on public.deliveries;
create trigger deliveries_stop_tracking
  after update of rider_id, status on public.deliveries
  for each row execute function public.delivery_stop_tracking();

create or replace function public.rider_offline_stop_tracking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_available and not new.is_available then
    delete from public.delivery_live_locations where rider_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists delivery_partner_offline_stop_tracking on public.delivery_partners;
create trigger delivery_partner_offline_stop_tracking
  after update of is_available on public.delivery_partners
  for each row execute function public.rider_offline_stop_tracking();

create or replace function public.delivery_tracking_view(p_delivery_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deliveries%rowtype;
  p public.delivery_partners%rowtype;
  s public.delivery_settings%rowtype;
  l public.delivery_live_locations%rowtype;
  caller bigint := public.current_profile_id();
  v_allowed boolean := false;
  v_active_status boolean := false;
  v_active boolean := false;
  v_reason text := '';
  v_last timestamptz;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  select * into d from public.deliveries where id = p_delivery_id;
  if not found then
    raise exception 'Delivery not found';
  end if;

  v_allowed := public.is_admin() or d.buyer_id = caller or d.seller_id = caller;
  if not v_allowed and d.rider_id is not null then
    select * into p from public.delivery_partners where id = d.rider_id;
    v_allowed := found and p.user_id = caller;
  end if;
  if not v_allowed then
    raise exception 'You do not have access to this delivery';
  end if;

  select * into s from public.delivery_settings where id = 1;
  v_active_status := d.status in ('RIDER_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_HUB', 'OUT_FOR_DELIVERY', 'DELIVERY_ATTEMPTED');

  if not v_active_status then
    v_reason := case
      when d.status in ('DELIVERED', 'CANCELLED', 'RETURNED_TO_SELLER') then 'DELIVERY_ENDED'
      else 'NOT_ACTIVE'
    end;
  elsif d.rider_id is null then
    v_reason := 'NOT_ASSIGNED';
  else
    select * into p from public.delivery_partners where id = d.rider_id;
    if not found or p.status <> 'APPROVED' then
      v_reason := 'RIDER_UNAVAILABLE';
    elsif not p.is_available then
      v_reason := 'RIDER_OFFLINE';
    elsif p.location_permission = 'DENIED' then
      v_reason := 'PERMISSION_DENIED';
    elsif not p.location_sharing then
      v_reason := 'NOT_SHARING';
    else
      select * into l from public.delivery_live_locations where delivery_id = d.id;
      if not found then
        v_reason := 'NO_LOCATION';
      else
        v_last := l.updated_at;
        if l.updated_at < now() - make_interval(mins => coalesce(s.tracking_stale_minutes, 10)) then
          v_reason := 'STALE';
        else
          v_active := true;
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'delivery_id', d.id,
    'delivery_number', d.delivery_number,
    'status', d.status,
    'assignment_status', d.assignment_status,
    'tracking_active', v_active,
    'tracking_status', case
      when v_active then 'LIVE'
      when v_reason = 'DELIVERY_ENDED' then 'ENDED'
      when v_reason in ('PERMISSION_DENIED', 'NOT_SHARING', 'RIDER_OFFLINE', 'RIDER_UNAVAILABLE', 'NOT_ASSIGNED', 'NO_LOCATION', 'STALE') then v_reason
      else 'UNAVAILABLE'
    end,
    'reason', v_reason,
    'last_updated', v_last,
    'rider_location', case when v_active then jsonb_build_object(
      'lat', l.lat, 'lng', l.lng, 'accuracy_m', l.accuracy_m,
      'speed_kmh', l.speed_kmh, 'heading_degrees', l.heading_degrees
    ) else null end,
    'destination', case when d.delivery_lat is not null and d.delivery_lng is not null
      then jsonb_build_object('lat', d.delivery_lat, 'lng', d.delivery_lng) else null end,
    'pickup', case when d.pickup_lat is not null and d.pickup_lng is not null
      then jsonb_build_object('lat', d.pickup_lat, 'lng', d.pickup_lng) else null end,
    'route_distance_km', d.route_distance_km,
    'route_duration_minutes', d.route_duration_minutes,
    'route_provider', d.route_provider,
    'route_is_estimate', d.route_is_estimate
  );
end;
$$;

create or replace function public.delivery_set_route(
  p_delivery_id bigint,
  p_distance_km numeric default null,
  p_duration_minutes integer default null,
  p_provider text default '',
  p_is_estimate boolean default true,
  p_pickup_lat double precision default null,
  p_pickup_lng double precision default null,
  p_delivery_lat double precision default null,
  p_delivery_lng double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deliveries%rowtype;
  caller bigint := public.current_profile_id();
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;
  select * into d from public.deliveries where id = p_delivery_id for update;
  if not found then
    raise exception 'Delivery not found';
  end if;
  if not (public.is_admin() or d.buyer_id = caller or d.seller_id = caller) then
    raise exception 'You do not have access to this delivery';
  end if;
  if p_distance_km is not null and p_distance_km < 0 then
    raise exception 'Invalid route distance';
  end if;
  if p_duration_minutes is not null and p_duration_minutes < 0 then
    raise exception 'Invalid route duration';
  end if;
  if p_pickup_lat is not null and (p_pickup_lat < -90 or p_pickup_lat > 90) then
    raise exception 'Invalid pickup latitude';
  end if;
  if p_pickup_lng is not null and (p_pickup_lng < -180 or p_pickup_lng > 180) then
    raise exception 'Invalid pickup longitude';
  end if;
  if p_delivery_lat is not null and (p_delivery_lat < -90 or p_delivery_lat > 90) then
    raise exception 'Invalid delivery latitude';
  end if;
  if p_delivery_lng is not null and (p_delivery_lng < -180 or p_delivery_lng > 180) then
    raise exception 'Invalid delivery longitude';
  end if;

  update public.deliveries
     set pickup_lat = coalesce(p_pickup_lat, pickup_lat),
         pickup_lng = coalesce(p_pickup_lng, pickup_lng),
         delivery_lat = coalesce(p_delivery_lat, delivery_lat),
         delivery_lng = coalesce(p_delivery_lng, delivery_lng),
         route_distance_km = coalesce(p_distance_km, route_distance_km),
         route_duration_minutes = coalesce(p_duration_minutes, route_duration_minutes),
         route_provider = left(coalesce(nullif(btrim(p_provider), ''), route_provider, ''), 80),
         route_is_estimate = p_is_estimate,
         route_computed_at = now(),
         updated_at = now()
   where id = d.id;

  return jsonb_build_object(
    'success', true,
    'route_distance_km', coalesce(p_distance_km, d.route_distance_km),
    'route_duration_minutes', coalesce(p_duration_minutes, d.route_duration_minutes),
    'route_provider', left(coalesce(nullif(btrim(p_provider), ''), d.route_provider, ''), 80),
    'route_is_estimate', p_is_estimate
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Failure and return management
-- ---------------------------------------------------------------------------
create table if not exists public.delivery_failures (
  id bigint generated by default as identity primary key,
  delivery_id bigint not null references public.deliveries(id) on delete cascade,
  reason_code text not null default 'OTHER'
    check (reason_code in (
      'BUYER_UNAVAILABLE', 'SELLER_UNAVAILABLE', 'INCORRECT_ADDRESS',
      'RIDER_CANCELLATION', 'COURIER_DELAY', 'DAMAGED_PACKAGE', 'OTHER'
    )),
  note text not null default '',
  source text not null default 'SYSTEM'
    check (source in ('BUYER', 'SELLER', 'RIDER', 'ADMIN', 'COURIER', 'SYSTEM')),
  status text not null default 'OPEN'
    check (status in ('OPEN', 'REASSIGNED', 'RESCHEDULED', 'RETURNED', 'CANCELLED', 'REFUND_REQUESTED', 'RESOLVED')),
  reported_by bigint references public.profiles(id) on delete set null,
  resolved_by bigint references public.profiles(id) on delete set null,
  resolution_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_delivery_failures_delivery on public.delivery_failures(delivery_id, created_at desc);
create index if not exists idx_delivery_failures_status on public.delivery_failures(status, created_at desc);

drop trigger if exists delivery_failures_set_updated_at on public.delivery_failures;
create trigger delivery_failures_set_updated_at
  before update on public.delivery_failures
  for each row execute function public.set_updated_at();

create table if not exists public.delivery_returns (
  id bigint generated by default as identity primary key,
  delivery_id bigint not null unique references public.deliveries(id) on delete cascade,
  failure_id bigint references public.delivery_failures(id) on delete set null,
  status text not null default 'INITIATED'
    check (status in ('INITIATED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED')),
  reason text not null default '',
  notes text not null default '',
  initiated_by bigint references public.profiles(id) on delete set null,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_delivery_returns_status on public.delivery_returns(status, created_at desc);

drop trigger if exists delivery_returns_set_updated_at on public.delivery_returns;
create trigger delivery_returns_set_updated_at
  before update on public.delivery_returns
  for each row execute function public.set_updated_at();

alter table public.delivery_failures enable row level security;
alter table public.delivery_returns enable row level security;

drop policy if exists delivery_failures_participants_read on public.delivery_failures;
create policy delivery_failures_participants_read on public.delivery_failures
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.deliveries d
      where d.id = delivery_failures.delivery_id
        and (d.buyer_id = public.current_profile_id()
          or d.seller_id = public.current_profile_id()
          or exists (
            select 1 from public.delivery_partners dp
            where dp.id = d.rider_id and dp.user_id = public.current_profile_id()
          ))
    )
  );

drop policy if exists delivery_returns_participants_read on public.delivery_returns;
create policy delivery_returns_participants_read on public.delivery_returns
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.deliveries d
      where d.id = delivery_returns.delivery_id
        and (d.buyer_id = public.current_profile_id()
          or d.seller_id = public.current_profile_id()
          or exists (
            select 1 from public.delivery_partners dp
            where dp.id = d.rider_id and dp.user_id = public.current_profile_id()
          ))
    )
  );

grant select on public.delivery_failures, public.delivery_returns to authenticated;

create or replace function public.delivery_report_failure(
  p_delivery_id bigint,
  p_reason_code text,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deliveries%rowtype;
  p public.delivery_partners%rowtype;
  caller bigint := public.current_profile_id();
  v_code text := upper(coalesce(p_reason_code, 'OTHER'));
  v_note text := btrim(coalesce(p_note, ''));
  v_source text;
  v_id bigint;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;
  if v_code not in ('BUYER_UNAVAILABLE', 'SELLER_UNAVAILABLE', 'INCORRECT_ADDRESS', 'RIDER_CANCELLATION', 'COURIER_DELAY', 'DAMAGED_PACKAGE', 'OTHER') then
    raise exception 'Invalid delivery failure reason';
  end if;
  if v_code = 'OTHER' and v_note = '' then
    raise exception 'Describe the delivery issue';
  end if;

  select * into d from public.deliveries where id = p_delivery_id;
  if not found then
    raise exception 'Delivery not found';
  end if;

  if public.is_admin() then
    v_source := 'ADMIN';
  elsif d.seller_id = caller then
    v_source := 'SELLER';
  elsif d.buyer_id = caller then
    v_source := 'BUYER';
  else
    select * into p from public.delivery_partners where user_id = caller;
    if not found or d.rider_id is distinct from p.id or d.assignment_status <> 'ACCEPTED' then
      raise exception 'This delivery is not assigned to you';
    end if;
    v_source := 'RIDER';
  end if;

  insert into public.delivery_failures (delivery_id, reason_code, note, source, reported_by)
  values (d.id, v_code, v_note, v_source, caller)
  returning id into v_id;

  insert into public.delivery_events (delivery_id, status, note, actor_id, actor_role)
  values (d.id, d.status, 'Delivery issue reported: ' || replace(v_code, '_', ' ') ||
          case when v_note <> '' then ' — ' || v_note else '' end, caller, v_source);

  perform public.delivery_audit(d.id, 'DELIVERY_ISSUE_REPORTED', d.status, d.status,
                                v_source || ': ' || v_code || case when v_note <> '' then ' — ' || v_note else '' end);

  insert into public.notifications (user_id, title, message, type)
  select pr.id, 'Delivery issue to review',
         'Delivery ' || d.delivery_number || ': ' || replace(v_code, '_', ' ') || ' reported by ' || v_source || '.',
         'DELIVERY'
  from public.profiles pr
  where pr.role in ('ADMIN', 'SUPER_ADMIN');

  return jsonb_build_object('success', true, 'failure_id', v_id, 'status', 'OPEN');
end;
$$;

create or replace function public.admin_resolve_delivery_failure(
  p_failure_id bigint,
  p_resolution text,
  p_note text default '',
  p_reschedule_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.delivery_failures%rowtype;
  d public.deliveries%rowtype;
  v_admin bigint := public.current_profile_id();
  v_resolution text := upper(coalesce(p_resolution, ''));
  v_note text := btrim(coalesce(p_note, ''));
  v_auto boolean;
  v_next jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;
  if v_resolution not in ('REASSIGN', 'RESCHEDULE', 'RETURN', 'CANCEL', 'REFUND_REQUESTED', 'RESOLVE') then
    raise exception 'Invalid failure resolution';
  end if;

  select * into f from public.delivery_failures where id = p_failure_id for update;
  if not found then
    raise exception 'Failure record not found';
  end if;
  if f.status not in ('OPEN', 'REASSIGNED', 'RESCHEDULED', 'RETURNED', 'CANCELLED', 'REFUND_REQUESTED') then
    raise exception 'This failure has already been resolved';
  end if;

  select * into d from public.deliveries where id = f.delivery_id for update;
  if not found then
    raise exception 'Delivery not found';
  end if;

  perform set_config('goodsale.rider_system', 'on', true);

  if v_resolution = 'REASSIGN' then
    update public.deliveries
       set rider_id = null,
           assignment_status = 'UNASSIGNED',
           assignment_offered_at = null,
           assignment_expires_at = null,
           status = case when status in ('DELIVERED', 'CANCELLED', 'RETURNED_TO_SELLER') then status else 'AWAITING_RIDER' end,
           updated_at = now()
     where id = d.id;
    update public.delivery_jobs set partner_id = null, updated_at = now()
     where order_id = d.order_id and status not in ('COMPLETED', 'CANCELLED');
    select coalesce(auto_assign_enabled, false) into v_auto from public.delivery_settings where id = 1;
    if v_auto then v_next := public.delivery_auto_offer(d.id, false); end if;
  elsif v_resolution = 'RESCHEDULE' then
    update public.deliveries
       set rider_id = null,
           assignment_status = 'UNASSIGNED',
           assignment_offered_at = null,
           assignment_expires_at = null,
           status = case when status in ('DELIVERED', 'CANCELLED', 'RETURNED_TO_SELLER') then status else 'AWAITING_RIDER' end,
           estimated_delivery_date = coalesce(p_reschedule_date, estimated_delivery_date),
           failure_reason = '',
           updated_at = now()
     where id = d.id;
    update public.delivery_jobs set partner_id = null, updated_at = now()
     where order_id = d.order_id and status not in ('COMPLETED', 'CANCELLED');
  elsif v_resolution = 'RETURN' then
    if d.status in ('DELIVERED', 'CANCELLED', 'RETURNED_TO_SELLER') then
      raise exception 'A closed delivery cannot be returned';
    end if;
    update public.deliveries
       set status = 'RETURNED_TO_SELLER', failure_reason = coalesce(nullif(v_note, ''), failure_reason),
           returned_at = now(), updated_at = now()
     where id = d.id;
    insert into public.delivery_returns (delivery_id, failure_id, status, reason, initiated_by, notes)
    values (d.id, f.id, 'INITIATED', coalesce(nullif(v_note, ''), 'Returned after delivery failure'), v_admin, v_note)
    on conflict (delivery_id) do update
      set failure_id = excluded.failure_id, status = 'INITIATED',
          reason = excluded.reason, notes = excluded.notes, initiated_by = v_admin, updated_at = now();
    update public.delivery_jobs set status = 'CANCELLED', updated_at = now()
     where order_id = d.order_id and status not in ('COMPLETED', 'CANCELLED');
  elsif v_resolution = 'CANCEL' then
    if d.status in ('DELIVERED', 'CANCELLED', 'RETURNED_TO_SELLER') then
      raise exception 'This delivery is already closed';
    end if;
    update public.deliveries
       set status = 'CANCELLED', cancellation_reason = coalesce(nullif(v_note, ''), 'Cancelled after delivery failure'),
           cancelled_at = now(), updated_at = now()
     where id = d.id;
    update public.delivery_jobs set status = 'CANCELLED', updated_at = now()
     where order_id = d.order_id and status not in ('COMPLETED', 'CANCELLED');
  elsif v_resolution = 'REFUND_REQUESTED' then
    if d.status in ('DELIVERED', 'CANCELLED', 'RETURNED_TO_SELLER') then
      raise exception 'Refunds must be handled in the existing order/escrow workflow';
    end if;
    insert into public.notifications (user_id, title, message, type)
    values (d.buyer_id, 'Refund review requested',
            'An administrator is reviewing a refund for delivery ' || d.delivery_number || ' under the existing order policy.', 'DELIVERY');
  end if;

  update public.delivery_failures
     set status = case v_resolution
           when 'REASSIGN' then 'REASSIGNED'
           when 'RESCHEDULE' then 'RESCHEDULED'
           when 'RETURN' then 'RETURNED'
           when 'CANCEL' then 'CANCELLED'
           when 'REFUND_REQUESTED' then 'REFUND_REQUESTED'
           else 'RESOLVED' end,
         resolution_note = v_note,
         resolved_by = v_admin,
         resolved_at = now(),
         updated_at = now()
   where id = f.id;

  insert into public.delivery_events (delivery_id, status, note, actor_id, actor_role)
  values (d.id, d.status, 'Admin failure review: ' || v_resolution ||
          case when v_note <> '' then ' — ' || v_note else '' end, v_admin, 'ADMIN');

  perform public.delivery_audit(d.id, 'FAILURE_' || v_resolution, d.status, d.status,
                                'Failure #' || f.id || ': ' || v_resolution || case when v_note <> '' then ' — ' || v_note else '' end);

  perform set_config('goodsale.rider_system', 'off', true);

  return jsonb_build_object('success', true, 'status', v_resolution, 'next', v_next);
end;
$$;

create or replace function public.admin_update_delivery_return(
  p_return_id bigint,
  p_status text,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.delivery_returns%rowtype;
  d public.deliveries%rowtype;
  v_status text := upper(coalesce(p_status, ''));
  v_admin bigint := public.current_profile_id();
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;
  if v_status not in ('INITIATED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED') then
    raise exception 'Invalid return status';
  end if;
  select * into r from public.delivery_returns where id = p_return_id for update;
  if not found then
    raise exception 'Return record not found';
  end if;
  select * into d from public.deliveries where id = r.delivery_id;

  update public.delivery_returns
     set status = v_status,
         notes = case when btrim(coalesce(p_note, '')) <> '' then btrim(p_note) else notes end,
         received_at = case when v_status = 'RECEIVED' then coalesce(received_at, now()) else received_at end,
         updated_at = now()
   where id = r.id;

  insert into public.notifications (user_id, title, message, type)
  values (d.seller_id, 'Return update',
          'Return for delivery ' || d.delivery_number || ' is now ' || replace(v_status, '_', ' ') || '.', 'DELIVERY');

  perform public.delivery_audit(d.id, 'RETURN_' || v_status, d.status, d.status,
                                case when btrim(coalesce(p_note, '')) <> '' then btrim(p_note) else 'Return status updated' end);

  return jsonb_build_object('success', true, 'status', v_status);
end;
$$;

create or replace function public.delivery_failure_from_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'FAILED_DELIVERY' and old.status is distinct from 'FAILED_DELIVERY' then
    insert into public.delivery_failures (delivery_id, reason_code, note, source, status)
    select new.id, 'OTHER', coalesce(nullif(new.failure_reason, ''), 'Delivery failed'), 'SYSTEM', 'OPEN'
    where not exists (
      select 1 from public.delivery_failures f
      where f.delivery_id = new.id and f.status = 'OPEN'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists deliveries_failure_from_status on public.deliveries;
create trigger deliveries_failure_from_status
  after update of status on public.deliveries
  for each row execute function public.delivery_failure_from_status();

create or replace function public.delivery_return_from_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'RETURNED_TO_SELLER' and old.status is distinct from 'RETURNED_TO_SELLER' then
    insert into public.delivery_returns (delivery_id, status, reason, initiated_by)
    values (new.id, 'INITIATED', coalesce(nullif(new.failure_reason, ''), 'Returned to seller'), public.current_profile_id())
    on conflict (delivery_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists deliveries_return_from_status on public.deliveries;
create trigger deliveries_return_from_status
  after update of status on public.deliveries
  for each row execute function public.delivery_return_from_status();

-- ---------------------------------------------------------------------------
-- 9. Courier shipments and idempotent webhook events
-- ---------------------------------------------------------------------------
create table if not exists public.courier_shipments (
  id bigint generated by default as identity primary key,
  delivery_id bigint not null unique references public.deliveries(id) on delete cascade,
  provider text not null default 'manual',
  external_shipment_id text not null default '',
  tracking_number text not null default '',
  label_url text not null default '',
  status text not null default 'CREATED',
  last_event_at timestamptz,
  last_synced_at timestamptz,
  sync_attempts integer not null default 0,
  last_error text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, tracking_number)
);

create index if not exists idx_courier_shipments_status on public.courier_shipments(status, last_synced_at desc);

drop trigger if exists courier_shipments_set_updated_at on public.courier_shipments;
create trigger courier_shipments_set_updated_at
  before update on public.courier_shipments
  for each row execute function public.set_updated_at();

create table if not exists public.courier_webhook_events (
  id bigint generated by default as identity primary key,
  provider text not null,
  event_id text not null,
  tracking_number text not null default '',
  payload_hash text not null default '',
  shipment_id bigint references public.courier_shipments(id) on delete set null,
  delivery_id bigint references public.deliveries(id) on delete set null,
  status text not null default 'RECEIVED',
  error text not null default '',
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);

create index if not exists idx_courier_webhook_events_delivery
  on public.courier_webhook_events(delivery_id, received_at desc);

alter table public.courier_shipments enable row level security;
alter table public.courier_webhook_events enable row level security;

drop policy if exists courier_shipments_participants_read on public.courier_shipments;
create policy courier_shipments_participants_read on public.courier_shipments
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.deliveries d
      where d.id = courier_shipments.delivery_id
        and (d.buyer_id = public.current_profile_id()
          or d.seller_id = public.current_profile_id()
          or exists (
            select 1 from public.delivery_partners dp
            where dp.id = d.rider_id and dp.user_id = public.current_profile_id()
          ))
    )
  );

drop policy if exists courier_webhook_events_admin_read on public.courier_webhook_events;
create policy courier_webhook_events_admin_read on public.courier_webhook_events
  for select to authenticated using (public.is_admin());

grant select on public.courier_shipments, public.courier_webhook_events to authenticated;

alter table public.delivery_events
  add column if not exists event_key text;

create unique index if not exists idx_delivery_events_event_key
  on public.delivery_events(event_key)
  where event_key is not null;

create or replace function public.admin_record_courier_shipment(
  p_delivery_id bigint,
  p_provider text,
  p_tracking_number text,
  p_external_shipment_id text default '',
  p_courier_name text default '',
  p_label_url text default '',
  p_status text default 'CREATED'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deliveries%rowtype;
  v_provider text := lower(btrim(coalesce(p_provider, 'manual')));
  v_tracking text := btrim(coalesce(p_tracking_number, ''));
  v_status text := upper(coalesce(nullif(p_status, ''), 'CREATED'));
  v_id bigint;
  v_admin bigint := public.current_profile_id();
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;
  if v_provider = '' then
    raise exception 'Courier provider is required';
  end if;
  if v_tracking = '' then
    raise exception 'A tracking number is required';
  end if;

  select * into d from public.deliveries where id = p_delivery_id for update;
  if not found then
    raise exception 'Delivery not found';
  end if;

  insert into public.courier_shipments (
    delivery_id, provider, external_shipment_id, tracking_number, label_url, status, last_synced_at
  ) values (
    d.id, v_provider, btrim(coalesce(p_external_shipment_id, '')), v_tracking,
    btrim(coalesce(p_label_url, '')), v_status, now()
  )
  on conflict (delivery_id) do update
    set provider = excluded.provider,
        external_shipment_id = excluded.external_shipment_id,
        tracking_number = excluded.tracking_number,
        label_url = excluded.label_url,
        status = excluded.status,
        last_synced_at = now(),
        last_error = '',
        sync_attempts = 0,
        updated_at = now()
  returning id into v_id;

  update public.deliveries
     set courier_provider = v_provider,
         courier_external_id = btrim(coalesce(p_external_shipment_id, '')),
         courier_name = case
           when btrim(coalesce(p_courier_name, '')) <> '' then btrim(p_courier_name)
           when coalesce(courier_name, '') = '' then v_provider
           else courier_name end,
         tracking_number = v_tracking,
         courier_status = v_status,
         courier_last_synced_at = now(),
         courier_last_error = '',
         updated_at = now()
   where id = d.id;

  insert into public.delivery_events (delivery_id, status, note, actor_id, actor_role, event_key)
  values (d.id, d.status, 'Courier shipment recorded (' || v_provider || ' · ' || v_tracking || ')', v_admin, 'ADMIN',
          'courier-shipment:' || d.id || ':' || v_tracking)
  on conflict (event_key) where event_key is not null do nothing;

  perform public.delivery_audit(d.id, 'COURIER_SHIPMENT_RECORDED', d.status, d.status,
                                v_provider || ' · ' || v_tracking);

  return jsonb_build_object('success', true, 'shipment_id', v_id, 'tracking_number', v_tracking, 'provider', v_provider);
end;
$$;

create or replace function public.courier_apply_tracking_event(
  p_provider text,
  p_event_id text,
  p_tracking_number text,
  p_status text,
  p_note text default '',
  p_occurred_at timestamptz default now(),
  p_payload_hash text default '',
  p_reason_code text default 'OTHER',
  p_location text default '',
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sh public.courier_shipments%rowtype;
  d public.deliveries%rowtype;
  v_provider text := lower(btrim(coalesce(p_provider, '')));
  v_event text := coalesce(nullif(btrim(p_event_id), ''), nullif(btrim(p_payload_hash), ''));
  v_tracking text := btrim(coalesce(p_tracking_number, ''));
  v_raw text := upper(replace(btrim(coalesce(p_status, '')), ' ', '_'));
  v_status text;
  v_note text := btrim(coalesce(p_note, ''));
  v_event_row bigint;
  v_delivery_event text;
  v_failure_id bigint;
  v_code text := upper(coalesce(p_reason_code, 'OTHER'));
  v_valid boolean := false;
begin
  if v_provider = '' or v_tracking = '' or v_event is null then
    raise exception 'Provider, event id and tracking number are required';
  end if;

  v_status := case
    when v_raw in ('PICKED_UP', 'PICKEDUP', 'COLLECTED', 'IN_TRANSIT', 'INTRANSIT', 'OUT_FOR_DELIVERY', 'OUTFORDELIVERY',
                   'DELIVERED', 'FAILED', 'FAILED_DELIVERY', 'DELAYED', 'RETURNED', 'RETURNED_TO_SELLER', 'CANCELLED') then
      case
        when v_raw in ('PICKEDUP', 'COLLECTED') then 'PICKED_UP'
        when v_raw = 'INTRANSIT' then 'IN_TRANSIT'
        when v_raw = 'OUTFORDELIVERY' then 'OUT_FOR_DELIVERY'
        when v_raw = 'FAILED' then 'FAILED'
        when v_raw = 'RETURNED' then 'RETURNED'
        else v_raw
      end
    else 'UNKNOWN'
  end;

  insert into public.courier_webhook_events (provider, event_id, tracking_number, payload_hash, payload, status)
  values (v_provider, v_event, v_tracking, coalesce(p_payload_hash, ''), coalesce(p_payload, '{}'::jsonb), 'RECEIVED')
  on conflict (provider, event_id) do nothing
  returning id into v_event_row;

  if v_event_row is null then
    return jsonb_build_object('success', true, 'duplicate', true, 'message', 'Webhook event already processed');
  end if;

  select * into sh from public.courier_shipments
  where provider = v_provider and tracking_number = v_tracking
  for update;

  if not found then
    update public.courier_webhook_events
       set status = 'IGNORED', error = 'No matching shipment', processed_at = now()
     where id = v_event_row;
    return jsonb_build_object('success', true, 'ignored', true, 'message', 'No matching shipment');
  end if;

  select * into d from public.deliveries where id = sh.delivery_id for update;
  if not found then
    update public.courier_webhook_events
       set status = 'IGNORED', error = 'Shipment delivery not found', processed_at = now()
     where id = v_event_row;
    return jsonb_build_object('success', true, 'ignored', true, 'message', 'Delivery not found');
  end if;

  update public.courier_webhook_events
     set shipment_id = sh.id, delivery_id = d.id, status = 'PROCESSED', processed_at = now()
   where id = v_event_row;

  update public.courier_shipments
     set status = v_status,
         last_event_at = coalesce(p_occurred_at, now()),
         last_synced_at = now(),
         last_error = '',
         sync_attempts = 0,
         metadata = coalesce(p_payload, metadata),
         updated_at = now()
   where id = sh.id;

  update public.deliveries
     set courier_status = v_status,
         courier_last_synced_at = now(),
         courier_last_error = '',
         courier_sync_attempts = 0,
         updated_at = now()
   where id = d.id;

  -- Courier status is stored separately. Only the buyer's one-time code can
  -- ever move a delivery to DELIVERED.
  if v_status = 'PICKED_UP' and d.status not in ('DELIVERED', 'CANCELLED', 'RETURNED_TO_SELLER') then
    update public.deliveries
       set status = 'PICKED_UP', picked_up_at = coalesce(picked_up_at, now()), updated_at = now()
     where id = d.id;
    v_delivery_event := 'PICKED_UP';
    v_valid := true;
  elsif v_status = 'IN_TRANSIT' and d.status not in ('DELIVERED', 'CANCELLED', 'RETURNED_TO_SELLER') then
    update public.deliveries set status = 'IN_TRANSIT', updated_at = now() where id = d.id;
    v_delivery_event := 'IN_TRANSIT';
    v_valid := true;
  elsif v_status = 'OUT_FOR_DELIVERY' and d.status not in ('DELIVERED', 'CANCELLED', 'RETURNED_TO_SELLER') then
    update public.deliveries set status = 'OUT_FOR_DELIVERY', updated_at = now() where id = d.id;
    v_delivery_event := 'OUT_FOR_DELIVERY';
    v_valid := true;
  elsif v_status = 'FAILED' and d.status not in ('DELIVERED', 'CANCELLED', 'RETURNED_TO_SELLER') then
    update public.deliveries
       set status = 'FAILED_DELIVERY',
           failure_reason = coalesce(nullif(v_note, ''), 'Courier reported a failed delivery'),
           updated_at = now()
     where id = d.id;
    v_delivery_event := 'FAILED_DELIVERY';
    v_valid := true;
    insert into public.delivery_failures (delivery_id, reason_code, note, source, status)
    values (d.id, case when v_code in ('BUYER_UNAVAILABLE', 'SELLER_UNAVAILABLE', 'INCORRECT_ADDRESS', 'COURIER_DELAY', 'DAMAGED_PACKAGE', 'OTHER') then v_code else 'OTHER' end,
            coalesce(nullif(v_note, ''), 'Courier reported a failed delivery'), 'COURIER', 'OPEN')
    returning id into v_failure_id;
  elsif v_status = 'RETURNED' and d.status not in ('DELIVERED', 'RETURNED_TO_SELLER') then
    update public.deliveries
       set status = 'RETURNED_TO_SELLER', failure_reason = coalesce(nullif(v_note, ''), 'Courier returned the package'),
           returned_at = coalesce(returned_at, now()), updated_at = now()
     where id = d.id;
    v_delivery_event := 'RETURNED_TO_SELLER';
    v_valid := true;
  elsif v_status = 'DELIVERED' then
    v_delivery_event := d.status;
  elsif v_status = 'DELAYED' then
    v_delivery_event := d.status;
  else
    v_delivery_event := d.status;
  end if;

  insert into public.delivery_events (delivery_id, status, note, actor_role, event_key)
  values (
    d.id, v_delivery_event,
    'Courier ' || v_provider || ' update: ' || coalesce(nullif(v_note, ''), replace(v_status, '_', ' ')) ||
    case when p_location <> '' then ' · ' || p_location else '' end,
    'SYSTEM', 'courier:' || v_provider || ':' || v_event
  )
  on conflict (event_key) where event_key is not null do nothing;

  if v_status = 'DELIVERED' then
    insert into public.notifications (user_id, title, message, type)
    values (d.buyer_id, 'Courier reports delivered',
            'Courier ' || v_provider || ' reports delivery ' || d.delivery_number || ' as delivered. Confirm with your one-time code.', 'DELIVERY');
  elsif v_status = 'DELAYED' then
    insert into public.notifications (user_id, title, message, type)
    values (d.buyer_id, 'Delivery delayed',
            'Courier ' || v_provider || ' reports a delay on ' || d.delivery_number ||
            case when v_note <> '' then ': ' || v_note else '.' end, 'DELIVERY');
  elsif v_status = 'RETURNED' then
    insert into public.notifications (user_id, title, message, type)
    values (d.seller_id, 'Package returned', 'Courier ' || v_provider || ' returned delivery ' || d.delivery_number || '.', 'DELIVERY');
  end if;

  perform public.delivery_audit(
    d.id, 'COURIER_' || v_status, d.status,
    case when v_valid then v_delivery_event else d.status end,
    v_provider || ' event ' || v_event || case when v_note <> '' then ' — ' || v_note else '' end
  );

  return jsonb_build_object(
    'success', true, 'duplicate', false, 'status', v_status,
    'delivery_status', v_delivery_event, 'tracking_number', v_tracking
  );
end;
$$;

create or replace function public.admin_manual_courier_update(
  p_delivery_id bigint,
  p_courier_name text,
  p_tracking_number text,
  p_status text default '',
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;
  perform public.admin_record_courier_shipment(
    p_delivery_id,
    'manual',
    p_tracking_number,
    '',
    p_courier_name,
    '',
    case when btrim(coalesce(p_status, '')) = '' then 'CREATED' else upper(p_status) end
  );
  if btrim(coalesce(p_status, '')) = '' or upper(btrim(p_status)) = 'CREATED' then
    return jsonb_build_object('success', true, 'status', 'CREATED');
  end if;
  return public.courier_apply_tracking_event(
    'manual',
    'manual:' || p_delivery_id || ':' || extract(epoch from clock_timestamp())::text,
    p_tracking_number,
    p_status,
    p_note,
    now(),
    md5(p_delivery_id::text || p_tracking_number || p_status),
    'OTHER',
    '',
    jsonb_build_object('manual', true)
  );
end;
$$;

revoke all on function public.courier_apply_tracking_event(text, text, text, text, text, timestamptz, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.courier_apply_tracking_event(text, text, text, text, text, timestamptz, text, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 10. Delivery notifications + optional email/SMS outbox
-- ---------------------------------------------------------------------------
create table if not exists public.delivery_notification_outbox (
  id bigint generated by default as identity primary key,
  delivery_id bigint not null references public.deliveries(id) on delete cascade,
  profile_id bigint not null references public.profiles(id) on delete cascade,
  channel text not null check (channel in ('EMAIL', 'SMS')),
  recipient text not null default '',
  subject text not null default '',
  body text not null default '',
  dedup_key text not null unique,
  status text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
  attempts integer not null default 0,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists idx_delivery_outbox_pending on public.delivery_notification_outbox(status, created_at)
  where status in ('PENDING', 'FAILED');

alter table public.delivery_notification_outbox enable row level security;
drop policy if exists delivery_outbox_admin_read on public.delivery_notification_outbox;
create policy delivery_outbox_admin_read on public.delivery_notification_outbox
  for select to authenticated using (public.is_admin());
grant select on public.delivery_notification_outbox to authenticated;

create or replace function public.queue_delivery_status_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient record;
  v_title text;
  v_message text;
  v_kind text := new.status;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;
  if new.status not in (
    'RIDER_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY',
    'DELIVERY_ATTEMPTED', 'DELIVERED', 'FAILED_DELIVERY', 'RETURNED_TO_SELLER', 'CANCELLED'
  ) then
    return new;
  end if;

  v_title := case new.status
    when 'RIDER_ASSIGNED' then 'Rider assigned'
    when 'PICKED_UP' then 'Package picked up'
    when 'IN_TRANSIT' then 'Package in transit'
    when 'OUT_FOR_DELIVERY' then 'Out for delivery'
    when 'DELIVERY_ATTEMPTED' then 'Delivery attempted'
    when 'DELIVERED' then 'Delivered'
    when 'FAILED_DELIVERY' then 'Delivery failed'
    when 'RETURNED_TO_SELLER' then 'Package returned to seller'
    when 'CANCELLED' then 'Delivery cancelled'
    else 'Delivery update' end;

  v_message := case new.status
    when 'RIDER_ASSIGNED' then 'A rider has been assigned to delivery ' || new.delivery_number || '.'
    when 'PICKED_UP' then 'Your package for delivery ' || new.delivery_number || ' has been picked up.'
    when 'IN_TRANSIT' then 'Delivery ' || new.delivery_number || ' is in transit.'
    when 'OUT_FOR_DELIVERY' then 'Delivery ' || new.delivery_number || ' is out for delivery.'
    when 'DELIVERY_ATTEMPTED' then 'A delivery attempt was recorded for ' || new.delivery_number || '.'
    when 'DELIVERED' then 'Delivery ' || new.delivery_number || ' was confirmed. Escrow stays protected until the buyer releases it.'
    when 'FAILED_DELIVERY' then 'Delivery ' || new.delivery_number || ' could not be completed' ||
      case when new.failure_reason <> '' then ': ' || new.failure_reason else '.' end
    when 'RETURNED_TO_SELLER' then 'Delivery ' || new.delivery_number || ' is returning to the seller.'
    when 'CANCELLED' then 'Delivery ' || new.delivery_number || ' was cancelled.'
    else 'Delivery ' || new.delivery_number || ' was updated.' end;

  for v_recipient in
    select pr.id, pr.email, pr.phone_number, pr.email_enabled, pr.sms_enabled
    from public.profiles pr
    where pr.id in (new.buyer_id, new.seller_id)
      and (new.status <> 'RIDER_ASSIGNED' or pr.id = new.buyer_id)
  loop
    insert into public.notifications (user_id, title, message, type)
    values (v_recipient.id, v_title, v_message, 'DELIVERY');

    if v_recipient.email_enabled and v_recipient.email <> '' then
      insert into public.delivery_notification_outbox (
        delivery_id, profile_id, channel, recipient, subject, body, dedup_key
      ) values (
        new.id, v_recipient.id, 'EMAIL', v_recipient.email, v_title,
        '<p>' || replace(v_message, '&', '&amp;') || '</p>',
        'delivery:' || new.id || ':' || v_kind || ':' || v_recipient.id || ':EMAIL'
      ) on conflict (dedup_key) do nothing;
    end if;

    if v_recipient.sms_enabled and v_recipient.phone_number <> '' then
      insert into public.delivery_notification_outbox (
        delivery_id, profile_id, channel, recipient, subject, body, dedup_key
      ) values (
        new.id, v_recipient.id, 'SMS', v_recipient.phone_number, v_title, v_message,
        'delivery:' || new.id || ':' || v_kind || ':' || v_recipient.id || ':SMS'
      ) on conflict (dedup_key) do nothing;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists deliveries_queue_status_notifications on public.deliveries;
create trigger deliveries_queue_status_notifications
  after update of status on public.deliveries
  for each row execute function public.queue_delivery_status_notifications();

create or replace function public.notify_rider_pickup_arrival()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider_name text;
begin
  if new.rider_id is null
     or new.arrived_pickup_at is null
     or old.arrived_pickup_at is not null then
    return new;
  end if;

  select full_name into v_rider_name from public.delivery_partners where id = new.rider_id;
  insert into public.notifications (user_id, title, message, type)
  values (
    new.buyer_id,
    'Rider approaching pickup',
    coalesce(v_rider_name, 'Your rider') || ' has arrived at the pickup point for delivery ' ||
      new.delivery_number || '.',
    'DELIVERY'
  );
  insert into public.notifications (user_id, title, message, type)
  values (
    new.seller_id,
    'Rider at pickup',
    coalesce(v_rider_name, 'The rider') || ' has arrived to collect delivery ' || new.delivery_number || '.',
    'DELIVERY'
  );
  return new;
end;
$$;

drop trigger if exists deliveries_notify_pickup_arrival on public.deliveries;
create trigger deliveries_notify_pickup_arrival
  after update of arrived_pickup_at on public.deliveries
  for each row execute function public.notify_rider_pickup_arrival();

create or replace function public.notify_delayed_deliveries()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
  pr record;
  v_count integer := 0;
  v_message text;
begin
  for d in
    select dl.id, dl.delivery_number, dl.buyer_id, dl.estimated_delivery_date
    from public.deliveries dl
    where dl.status not in ('DELIVERED', 'CANCELLED', 'RETURNED_TO_SELLER')
      and dl.estimated_delivery_date is not null
      and dl.estimated_delivery_date < current_date
      and not exists (
        select 1 from public.notifications n
        where n.user_id = dl.buyer_id
          and n.type = 'DELIVERY'
          and n.title = 'Delivery delayed'
          and n.created_at > now() - interval '20 hours'
      )
    limit 100
  loop
    v_message := 'Delivery ' || d.delivery_number || ' is past its estimated delivery date. GoodSale is checking with the courier.';
    insert into public.notifications (user_id, title, message, type)
    values (d.buyer_id, 'Delivery delayed', v_message, 'DELIVERY');

    for pr in select id, email, phone_number, email_enabled, sms_enabled
              from public.profiles where id = d.buyer_id loop
      if pr.email_enabled and pr.email <> '' then
        insert into public.delivery_notification_outbox (
          delivery_id, profile_id, channel, recipient, subject, body, dedup_key
        ) values (
          d.id, pr.id, 'EMAIL', pr.email, 'Delivery delayed', '<p>' || v_message || '</p>',
          'delivery:' || d.id || ':DELAYED:' || current_date || ':' || pr.id || ':EMAIL'
        ) on conflict (dedup_key) do nothing;
      end if;
      if pr.sms_enabled and pr.phone_number <> '' then
        insert into public.delivery_notification_outbox (
          delivery_id, profile_id, channel, recipient, subject, body, dedup_key
        ) values (
          d.id, pr.id, 'SMS', pr.phone_number, 'Delivery delayed', v_message,
          'delivery:' || d.id || ':DELAYED:' || current_date || ':' || pr.id || ':SMS'
        ) on conflict (dedup_key) do nothing;
      end if;
    end loop;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Background job entry point (called by the protected internal API)
-- ---------------------------------------------------------------------------
create or replace function public.run_delivery_jobs()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expired integer := 0;
  v_delayed integer := 0;
  v_retried integer := 0;
  v_row record;
begin
  v_expired := public.expire_rider_assignments();

  -- Retry automated offers for deliveries that had no match, at most once
  -- every five minutes, so a rider coming online is picked up promptly.
  for v_row in
    select d.id
    from public.deliveries d
    where d.status = 'AWAITING_RIDER'
      and d.rider_id is null
      and d.delivery_method = 'GOODSALE_PARTNER'
      and d.assignment_mode = 'AUTO'
      and d.assignment_status in ('UNASSIGNED', 'EXPIRED', 'REJECTED')
      and d.updated_at < now() - interval '5 minutes'
      and exists (select 1 from public.delivery_settings s where s.id = 1 and s.auto_assign_enabled)
    order by d.updated_at asc
    limit 25
  loop
    perform public.delivery_auto_offer(v_row.id, false);
    v_retried := v_retried + 1;
  end loop;

  v_delayed := public.notify_delayed_deliveries();

  delete from public.delivery_live_locations l
  using public.deliveries d
  where d.id = l.delivery_id
    and d.status in ('DELIVERED', 'CANCELLED', 'RETURNED_TO_SELLER');

  delete from public.courier_webhook_events
  where processed_at is not null and received_at < now() - interval '90 days';

  delete from public.delivery_notification_outbox
  where status in ('SENT', 'SKIPPED') and created_at < now() - interval '30 days';

  return jsonb_build_object(
    'success', true,
    'expired_offers', v_expired,
    'delayed_notifications', v_delayed,
    'retried_auto_offers', v_retried,
    'ran_at', now()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Admin delivery analytics (actual database values)
-- ---------------------------------------------------------------------------
create or replace function public.admin_delivery_analytics(
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;

  with scoped as (
    select d.*
    from public.deliveries d
    where (p_from is null or d.created_at::date >= p_from)
      and (p_to is null or d.created_at::date <= p_to)
  ), metrics as (
    select
      count(*)::integer as total,
      count(*) filter (where status = 'DELIVERED')::integer as completed,
      count(*) filter (where status in ('FAILED_DELIVERY', 'RETURNED_TO_SELLER'))::integer as failed,
      count(*) filter (where status = 'CANCELLED')::integer as cancelled,
      count(*) filter (where status not in ('DELIVERED', 'CANCELLED', 'RETURNED_TO_SELLER'))::integer as active,
      count(*) filter (
        where status not in ('DELIVERED', 'CANCELLED', 'RETURNED_TO_SELLER')
          and ((estimated_delivery_date is not null and estimated_delivery_date < current_date)
            or updated_at < now() - interval '5 days')
      )::integer as delayed,
      coalesce(round(avg(extract(epoch from (delivered_at - created_at)) / 3600.0)
        filter (where status = 'DELIVERED' and delivered_at is not null)::numeric, 2), 0) as avg_delivery_hours,
      coalesce(sum(delivery_fee), 0) as delivery_costs,
      coalesce(sum(delivery_fee) filter (where status = 'DELIVERED'), 0) as completed_delivery_costs
    from scoped
  ), earnings as (
    select coalesce(sum(re.net_amount) filter (where re.status <> 'VOID'), 0) as rider_earnings
    from public.rider_earnings re
    join scoped s on s.id = re.delivery_id
  ), courier_rows as (
    select
      coalesce(nullif(trim(courier_name), ''), nullif(courier_provider, ''), 'Unassigned') as courier,
      count(*)::integer as shipments,
      count(*) filter (where status = 'DELIVERED')::integer as completed,
      count(*) filter (where status in ('FAILED_DELIVERY', 'RETURNED_TO_SELLER'))::integer as failed
    from scoped
    group by 1
  ), by_state as (
    select
      coalesce(nullif(delivery_state, ''), 'Unknown') as state,
      count(*)::integer as total,
      count(*) filter (where status = 'DELIVERED')::integer as completed,
      count(*) filter (where status in ('FAILED_DELIVERY', 'RETURNED_TO_SELLER'))::integer as failed,
      coalesce(round(avg(extract(epoch from (delivered_at - created_at)) / 3600.0)
        filter (where status = 'DELIVERED' and delivered_at is not null)::numeric, 2), 0) as avg_hours
    from scoped group by 1 order by total desc
  ), by_city as (
    select
      coalesce(nullif(delivery_city, ''), 'Unknown') as city,
      coalesce(nullif(delivery_state, ''), 'Unknown') as state,
      count(*)::integer as total,
      count(*) filter (where status = 'DELIVERED')::integer as completed,
      count(*) filter (where status in ('FAILED_DELIVERY', 'RETURNED_TO_SELLER'))::integer as failed,
      coalesce(round(avg(extract(epoch from (delivered_at - created_at)) / 3600.0)
        filter (where status = 'DELIVERED' and delivered_at is not null)::numeric, 2), 0) as avg_hours
    from scoped group by 1, 2 order by total desc limit 40
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'total', m.total,
      'completed', m.completed,
      'failed', m.failed,
      'cancelled', m.cancelled,
      'active', m.active,
      'delayed', m.delayed,
      'avg_delivery_hours', m.avg_delivery_hours,
      'delivery_costs', m.delivery_costs,
      'completed_delivery_costs', m.completed_delivery_costs,
      'rider_earnings', e.rider_earnings,
      'successful_delivery_percentage', case
        when (m.completed + m.failed) = 0 then null
        else round((m.completed::numeric * 100) / (m.completed + m.failed), 2)
      end,
      'average_delivery_hours_is_actual', true
    ),
    'courier_performance', coalesce((select jsonb_agg(to_jsonb(c) order by c.shipments desc) from courier_rows c), '[]'::jsonb),
    'by_state', coalesce((select jsonb_agg(to_jsonb(s) order by s.total desc) from by_state s), '[]'::jsonb),
    'by_city', coalesce((select jsonb_agg(to_jsonb(c) order by c.total desc) from by_city c), '[]'::jsonb),
    'route_distance_estimate_count', (select count(*) from scoped where route_is_estimate and route_distance_km is not null),
    'notes', jsonb_build_object(
      'delivery_costs_source', 'Captured delivery fees on delivery records',
      'rider_earnings_source', 'rider_earnings ledger, excluding VOID',
      'route_distances', 'Straight-line estimates unless route_provider is GOOGLE_DISTANCE_MATRIX'
    )
  ) into v_result
  from metrics m, earnings e;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. Grants and settings access
-- ---------------------------------------------------------------------------
create or replace function public.delivery_settings_public()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'auto_assign_enabled', s.auto_assign_enabled,
    'offer_timeout_minutes', s.offer_timeout_minutes,
    'max_active_deliveries', s.max_active_deliveries,
    'max_pickup_distance_km', s.max_pickup_distance_km,
    'max_offers_per_delivery', s.max_offers_per_delivery,
    'location_update_interval_seconds', s.location_update_interval_seconds,
    'tracking_stale_minutes', s.tracking_stale_minutes
  )
  from public.delivery_settings s where s.id = 1;
$$;

grant select on public.delivery_settings to authenticated;
grant execute on function public.delivery_settings_public() to authenticated;
grant execute on function public.delivery_auto_offer(bigint, boolean) to service_role;
grant execute on function public.admin_auto_assign_delivery(bigint) to authenticated;
grant execute on function public.admin_set_delivery_settings(jsonb) to authenticated;
grant execute on function public.expire_rider_assignments() to authenticated, service_role;
grant execute on function public.rider_reject_delivery(bigint, text) to authenticated;
grant execute on function public.delivery_assign_rider(bigint, bigint) to authenticated;
grant execute on function public.rider_set_location_sharing(boolean, text) to authenticated;
grant execute on function public.rider_update_location(bigint, double precision, double precision, numeric, numeric, numeric) to authenticated;
grant execute on function public.delivery_tracking_view(bigint) to authenticated;
grant execute on function public.delivery_set_route(bigint, numeric, integer, text, boolean, double precision, double precision, double precision, double precision) to authenticated;
grant execute on function public.delivery_report_failure(bigint, text, text) to authenticated;
grant execute on function public.admin_resolve_delivery_failure(bigint, text, text, date) to authenticated;
grant execute on function public.admin_update_delivery_return(bigint, text, text) to authenticated;
grant execute on function public.admin_record_courier_shipment(bigint, text, text, text, text, text, text) to authenticated;
grant execute on function public.admin_manual_courier_update(bigint, text, text, text, text) to authenticated;
grant execute on function public.admin_delivery_analytics(date, date) to authenticated;
grant execute on function public.run_delivery_jobs() to service_role;

notify pgrst, 'reload schema';

