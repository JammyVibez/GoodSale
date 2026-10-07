-- =============================================================================
-- 011: Self-service account types
-- Run AFTER 010_announcements.sql
--
-- Buying is open to every signed-in role. Selling is not: a BUYER has to switch
-- their account type to SELLER or BUSINESS from Settings before they can list.
-- This migration lets users make that switch themselves while still keeping
-- GoodSale-verified tiers (*_SELLER / *_BUSINESS) and staff roles locked to
-- review.
--
-- 1. Rewrites the sensitive-column guard so a role change is allowed when both
--    the old and new role are public tiers (BUYER / SELLER / BUSINESS).
-- 2. Adds a small SECURITY DEFINER helper so the app can make the change
--    explicitly.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    -- Public tiers may switch among themselves (this is how a buyer starts
    -- selling). Anything else still requires GoodSale review.
    IF NEW.role IS DISTINCT FROM OLD.role
       AND NOT (
         OLD.role IN ('BUYER', 'SELLER', 'BUSINESS')
         AND NEW.role IN ('BUYER', 'SELLER', 'BUSINESS')
       ) THEN
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
  END IF;
  RETURN NEW;
END;
$$;

-- Explicit self-service switch used by the app. Only touches public tiers and
-- never lets a verified/staff account downgrade itself silently.
CREATE OR REPLACE FUNCTION public.set_own_role(p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller bigint;
BEGIN
  caller := public.current_profile_id();
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF p_role NOT IN ('BUYER', 'SELLER', 'BUSINESS') THEN
    RAISE EXCEPTION 'Invalid account type';
  END IF;
  UPDATE public.profiles
    SET role = p_role
    WHERE id = caller
      AND role IN ('BUYER', 'SELLER', 'BUSINESS');
END;
$$;

REVOKE ALL ON FUNCTION public.set_own_role(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_own_role(text) TO authenticated;
