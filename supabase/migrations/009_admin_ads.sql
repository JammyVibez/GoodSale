-- =============================================================================
-- 009: Ads system — admin-created ads with image/video media + placements
-- Run AFTER 008_platform_fee_toggle.sql
--
-- Extends sponsored_ads so an admin can create an ad with an image or video
-- uploaded from their device, choose where it shows (placements), and manage
-- it (pause / resume / delete) from the Admin panel.
-- =============================================================================

ALTER TABLE public.sponsored_ads
  ADD COLUMN IF NOT EXISTS media_url   text   NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS media_type  text   NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS cta_text    text   NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS click_view  text   NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS placements  jsonb  NOT NULL DEFAULT '["HOME"]'::jsonb;

-- Admin house ads are not tied to a product.
ALTER TABLE public.sponsored_ads ALTER COLUMN target_id SET DEFAULT 0;
ALTER TABLE public.sponsored_ads ALTER COLUMN banner_url DROP NOT NULL;

DROP INDEX IF EXISTS idx_sponsored_ads_status;
CREATE INDEX IF NOT EXISTS idx_sponsored_ads_active ON public.sponsored_ads(status);

-- ---------------------------------------------------------------------------
-- Public ad-media bucket (images + video), created on first upload as well.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ad-media', 'ad-media', true, 26214400,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "ad_media_public_read" ON storage.objects;
CREATE POLICY "ad_media_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'ad-media');

DROP POLICY IF EXISTS "ad_media_auth_insert" ON storage.objects;
CREATE POLICY "ad_media_auth_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ad-media');

DROP POLICY IF EXISTS "ad_media_owner_update" ON storage.objects;
CREATE POLICY "ad_media_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'ad-media' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'ad-media' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "ad_media_owner_delete" ON storage.objects;
CREATE POLICY "ad_media_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'ad-media' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Refresh PostgREST's schema cache.
NOTIFY pgrst, 'reload schema';
