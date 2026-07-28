-- Migration 004: Real-time Google Maps / GoodDispatch geo columns
-- Adds lat/lng for buyer delivery, partner last-known position, and profile home.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_lat double precision,
  ADD COLUMN IF NOT EXISTS delivery_lng double precision,
  ADD COLUMN IF NOT EXISTS pickup_lat double precision,
  ADD COLUMN IF NOT EXISTS pickup_lng double precision;

ALTER TABLE public.delivery_partners
  ADD COLUMN IF NOT EXISTS last_lat double precision,
  ADD COLUMN IF NOT EXISTS last_lng double precision,
  ADD COLUMN IF NOT EXISTS last_location_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_delivery_partners_last_lat_lng
  ON public.delivery_partners(last_lat, last_lng)
  WHERE last_lat IS NOT NULL AND last_lng IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_delivery_lat_lng
  ON public.orders(delivery_lat, delivery_lng)
  WHERE delivery_lat IS NOT NULL AND delivery_lng IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_jobs_current_lat_lng
  ON public.delivery_jobs(current_lat, current_lng)
  WHERE current_lat IS NOT NULL AND current_lng IS NOT NULL;
