-- =============================================================================
-- 029 — Promotion persistence and server-authoritative purchase
--
-- Older app code inserted featured_listings rows with feature_type, starts_at,
-- ends_at and amount_paid, while the table only had duration_days/expires_at.
-- Those writes failed and the UI still showed a local-only promotion. This
-- migration aligns the table with the real promotion model and moves purchase
-- into one atomic wallet debit + listing promotion transaction.
-- =============================================================================

ALTER TABLE public.featured_listings
  ADD COLUMN IF NOT EXISTS feature_type text NOT NULL DEFAULT 'FEATURED',
  ADD COLUMN IF NOT EXISTS starts_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_reference text;

UPDATE public.featured_listings
SET ends_at = expires_at
WHERE ends_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_featured_listings_feature_type
  ON public.featured_listings(feature_type, status, ends_at);

-- Promotion rows are server-owned. Sellers can read public placements, while
-- admin writes remain possible through the admin policy.
DROP POLICY IF EXISTS featured_listings_seller_insert ON public.featured_listings;
DROP POLICY IF EXISTS featured_listings_seller_update ON public.featured_listings;
DROP POLICY IF EXISTS featured_listings_seller_delete ON public.featured_listings;
DROP POLICY IF EXISTS featured_listings_admin_all ON public.featured_listings;
CREATE POLICY featured_listings_admin_all ON public.featured_listings
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Price and eligibility are re-read from the database. The caller cannot pick
-- its own price, and only the service role can run this function.
CREATE OR REPLACE FUNCTION public.purchase_listing_promotion(
  p_user_id bigint,
  p_product_id bigint,
  p_feature_type text,
  p_duration_days integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_cost numeric;
  v_duration integer;
  v_reference text;
  v_promotion_id bigint;
  v_start timestamptz := now();
  v_end timestamptz;
  v_balance numeric;
  v_feature text := upper(trim(p_feature_type));
BEGIN
  IF p_user_id IS NULL OR p_user_id <= 0 THEN
    RAISE EXCEPTION 'A signed-in seller is required';
  END IF;

  SELECT * INTO v_product
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;
  IF v_product.seller_id <> p_user_id THEN
    RAISE EXCEPTION 'You can only promote your own listing';
  END IF;
  IF v_product.stock_status NOT IN ('IN_STOCK', 'LOW_STOCK') THEN
    RAISE EXCEPTION 'Only active, in-stock listings can be promoted';
  END IF;
  IF v_product.moderation_status IS NOT NULL AND v_product.moderation_status <> 'APPROVED' THEN
    RAISE EXCEPTION 'This listing is not approved for promotion';
  END IF;

  IF v_feature = 'FEATURED' THEN
    v_duration := coalesce(p_duration_days, 7);
    IF v_duration NOT IN (3, 7, 14) THEN
      RAISE EXCEPTION 'Featured promotions are available for 3, 7 or 14 days';
    END IF;
    SELECT CASE
      WHEN v_duration = 3 THEN coalesce(featured_3_days_price, 2500)
      WHEN v_duration = 7 THEN coalesce(featured_7_days_price, 5000)
      ELSE coalesce(featured_14_days_price, 9000)
    END INTO v_cost
    FROM public.revenue_settings ORDER BY id LIMIT 1;
  ELSIF v_feature = 'FLASH_SALE' THEN
    v_duration := 1;
    SELECT coalesce(flash_sale_feature_price, 7500)
      INTO v_cost
    FROM public.revenue_settings ORDER BY id LIMIT 1;
  ELSE
    RAISE EXCEPTION 'Unknown promotion type';
  END IF;

  v_cost := coalesce(v_cost, 0);
  IF v_cost <= 0 THEN
    RAISE EXCEPTION 'This promotion is not available for purchase right now';
  END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Add funds to your wallet before buying a promotion';
  END IF;
  IF coalesce(v_wallet.balance, 0) < v_cost THEN
    RAISE EXCEPTION 'Insufficient wallet balance for this promotion';
  END IF;

  v_reference := format('GPR_%s_%s', p_user_id, extract(epoch from clock_timestamp())::bigint);
  v_end := v_start + make_interval(days => v_duration);
  v_balance := v_wallet.balance - v_cost;

  UPDATE public.wallets
  SET balance = v_balance
  WHERE id = v_wallet.id;

  INSERT INTO public.wallet_transactions
    (wallet_id, amount, type, description, status, created_at)
  VALUES
    (v_wallet.id, -v_cost, 'DEBIT_FEES',
     format('%s promotion for "%s" (%s day%s)',
            CASE WHEN v_feature = 'FLASH_SALE' THEN 'Flash Sale' ELSE 'Featured listing' END,
            v_product.title, v_duration, CASE WHEN v_duration = 1 THEN '' ELSE 's' END),
     'COMPLETED', now());

  INSERT INTO public.featured_listings
    (product_id, seller_id, duration_days, expires_at, status,
     feature_type, starts_at, ends_at, amount_paid, payment_reference)
  VALUES
    (p_product_id, p_user_id, v_duration, v_end, 'ACTIVE',
     v_feature, v_start, v_end, v_cost, v_reference)
  RETURNING id INTO v_promotion_id;

  INSERT INTO public.notifications
    (user_id, title, message, type, is_read, created_at)
  VALUES
    (p_user_id,
     CASE WHEN v_feature = 'FLASH_SALE' THEN 'Flash Sale promotion active' ELSE 'Listing featured' END,
     format('"%s" is promoted for %s day(s), until %s.',
            v_product.title, v_duration,
            to_char(v_end AT TIME ZONE 'Africa/Lagos', 'DD Mon YYYY HH24:MI')),
     'PROMOTION', false, now());

  INSERT INTO public.audit_logs
    (user_id, action, entity_type, entity_id, details)
  VALUES
    (p_user_id, 'PURCHASE_LISTING_PROMOTION', 'FEATURED_LISTING', v_promotion_id,
     format('%s promotion purchased for %s; charged ₦%s; reference %s',
            v_feature, p_product_id, v_cost, v_reference));

  RETURN jsonb_build_object(
    'success', true,
    'promotionId', v_promotion_id,
    'featureType', v_feature,
    'durationDays', v_duration,
    'amountCharged', v_cost,
    'balance', v_balance,
    'startsAt', v_start,
    'expiresAt', v_end,
    'reference', v_reference
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_listing_promotion(bigint, bigint, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purchase_listing_promotion(bigint, bigint, text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.purchase_listing_promotion(bigint, bigint, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_listing_promotion(bigint, bigint, text, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
