-- =============================================================================
-- 008: Admin-controlled per-item platform fee
-- Run AFTER 007_avatars_bucket.sql
--
-- Adds a toggle so an admin can turn the platform fee on/off from the Admin
-- dashboard and set the percentage charged per item (escrow_percentage_fee,
-- clamped by escrow_min_fee / escrow_max_fee).
--
-- Launch default: OFF — buyers pay nothing but the item price plus delivery.
-- =============================================================================

ALTER TABLE public.revenue_settings
  ADD COLUMN IF NOT EXISTS platform_fee_enabled boolean NOT NULL DEFAULT false;

-- Make the launch state explicit for any pre-existing settings row.
UPDATE public.revenue_settings
   SET platform_fee_enabled = false
 WHERE platform_fee_enabled IS NULL;

-- Refresh PostgREST's schema cache so the new column is queryable immediately.
NOTIFY pgrst, 'reload schema';
