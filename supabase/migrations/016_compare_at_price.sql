-- =============================================================================
-- 016 — compare-at price
-- The marketplace shows a "-30%" badge and a struck-through price only when the
-- seller (or an admin) actually set a higher reference price. Without this
-- column the UI would have to invent discounts, which it must never do.
-- =============================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS compare_at_price numeric;

COMMENT ON COLUMN public.products.compare_at_price IS
  'Optional seller-provided reference price (e.g. original retail). Discount badges render only when this is greater than price.';
