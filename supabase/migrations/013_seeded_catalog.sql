-- ============================================================================
-- 013 — Seeded launch catalog
--
-- Marks the accounts and listings created by the admin "Launch catalog" seeding
-- (see lib/seed/catalog.ts and /api/admin/seed) so they can be managed in bulk
-- without ever touching a real seller's data.
--
--   * profiles.is_seeded   — seeded seller / buyer accounts
--   * businesses.is_seeded — seeded storefronts
--   * products.is_seeded   — seeded listings
--
-- Also grants admins update/delete on those tables (the seed API uses the
-- service role, but the policies keep in-app admin edits possible) and adds the
-- review tables to Realtime so product ratings update live.
-- ============================================================================

ALTER TABLE public.profiles   ADD COLUMN IF NOT EXISTS is_seeded boolean NOT NULL DEFAULT false;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS is_seeded boolean NOT NULL DEFAULT false;
ALTER TABLE public.products   ADD COLUMN IF NOT EXISTS is_seeded boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_is_seeded   ON public.profiles(is_seeded) WHERE is_seeded;
CREATE INDEX IF NOT EXISTS idx_businesses_is_seeded ON public.businesses(is_seeded) WHERE is_seeded;
CREATE INDEX IF NOT EXISTS idx_products_is_seeded   ON public.products(is_seeded) WHERE is_seeded;
CREATE INDEX IF NOT EXISTS idx_products_seeded_seller ON public.products(seller_id) WHERE is_seeded;

-- Reviews written by the seeded buyers so the launch catalog can be cleaned up.
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer_id_seeded ON public.reviews(reviewer_id);

-- ---------------------------------------------------------------------------
-- Let the server (service role, no auth session) set seller metadata
--
-- 002 locks role / good_points / trust_score / seller_level behind is_admin().
-- The seed API runs with the service-role key, where auth.uid() is NULL and
-- is_admin() is therefore false, so those writes would abort. Anonymous and
-- signed-in users are unaffected: RLS still blocks anonymous updates entirely
-- and a signed-in user always has auth.uid() set.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Updating role is not allowed';
  END IF;
  IF NEW.good_points IS DISTINCT FROM OLD.good_points THEN
    RAISE EXCEPTION 'Updating good_points is not allowed';
  END IF;
  IF NEW.trust_score IS DISTINCT FROM OLD.trust_score THEN
    RAISE EXCEPTION 'Updating trust_score is not allowed';
  END IF;
  IF NEW.seller_level IS DISTINCT FROM OLD.seller_level THEN
    RAISE EXCEPTION 'Updating seller_level is not allowed';
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Admin policies for the seeded catalog screens
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS products_admin_update ON public.products;
CREATE POLICY products_admin_update ON public.products
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS products_admin_delete ON public.products;
CREATE POLICY products_admin_delete ON public.products
  FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS businesses_admin_update ON public.businesses;
CREATE POLICY businesses_admin_update ON public.businesses
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS profiles_admin_update ON public.profiles;
CREATE POLICY profiles_admin_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- Realtime: product ratings and replies update live on product pages
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.reviews;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.review_replies;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.businesses;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- Refresh PostgREST's schema cache so the new columns are visible immediately.
NOTIFY pgrst, 'reload schema';
