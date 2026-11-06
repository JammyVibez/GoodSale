-- =============================================================================
-- 014 — product video
-- Adds an optional product video so a seller's or the admin's listing can show
-- a short clip alongside its photos. Admins edit this from Admin panel →
-- Products (and Launch catalog), and buyers play it on the product page.
-- =============================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS video_url text;

COMMENT ON COLUMN public.products.video_url IS
  'Optional short product video (mp4/webm or a storage URL). Rendered on the product page.';
