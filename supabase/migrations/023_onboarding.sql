-- 023_onboarding.sql
-- Guided buyer + seller onboarding state.
--
-- Additive only: nothing here changes orders, escrow, payments, delivery or the
-- existing auth trigger. Every new profile column is writeable by its owner
-- through the existing `profiles_update_own` policy, and role changes still go
-- through `set_own_role` (migration 011) so a seller can never self-verify.

-- ---------------------------------------------------------------------------
-- 1. Buyer onboarding + account purpose + notification choices
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists onboarding_step integer not null default 0,
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists wants_buying boolean not null default true,
  add column if not exists wants_selling boolean not null default false,
  add column if not exists area text not null default '',
  add column if not exists marketplace_notifications boolean not null default true,
  add column if not exists marketing_opt_in boolean not null default false,
  add column if not exists seller_onboarding_step integer not null default 0,
  add column if not exists store_onboarding_completed_at timestamptz;

create index if not exists idx_profiles_onboarding_completed
  on public.profiles(onboarding_completed_at);

-- ---------------------------------------------------------------------------
-- 2. Seller store details collected by seller onboarding
--    `is_verified` stays false: only GoodSale review can verify a store.
-- ---------------------------------------------------------------------------
alter table public.businesses
  add column if not exists seller_type text not null default 'INDIVIDUAL',
  add column if not exists area text not null default '',
  add column if not exists contact_phone text not null default '',
  add column if not exists contact_email text not null default '',
  add column if not exists policies text not null default '';

do $$
begin
  alter table public.businesses
    add constraint businesses_seller_type_check
    check (seller_type in ('INDIVIDUAL', 'BUSINESS'));
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Backfill — accounts that already gave GoodSale a state + city through the
--    previous profile form have finished onboarding; don't make them repeat it.
-- ---------------------------------------------------------------------------
update public.profiles
set onboarding_completed_at = coalesce(onboarding_completed_at, updated_at, now()),
    onboarding_step = 6,
    wants_selling = role in ('SELLER', 'VERIFIED_SELLER', 'BUSINESS', 'VERIFIED_BUSINESS')
where onboarding_completed_at is null
  and coalesce(state, '') <> ''
  and coalesce(city, '') <> '';

update public.businesses b
set seller_type = 'BUSINESS'
from public.profiles p
where p.id = b.owner_id
  and p.role in ('BUSINESS', 'VERIFIED_BUSINESS')
  and b.seller_type = 'INDIVIDUAL';

update public.profiles p
set store_onboarding_completed_at = coalesce(
      p.store_onboarding_completed_at,
      (select b.created_at from public.businesses b where b.owner_id = p.id order by b.id limit 1)
    ),
    seller_onboarding_step = 5
where p.store_onboarding_completed_at is null
  and exists (select 1 from public.businesses b where b.owner_id = p.id);
