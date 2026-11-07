-- =============================================================================
-- 030 — Sponsored campaign persistence, moderation and wallet accounting
--
-- Seller ads were previously written only to browser state. This migration
-- turns campaign creation into an atomic server transaction:
--   • validate the product and budget against admin settings,
--   • reserve the budget from the seller wallet,
--   • create a PENDING_REVIEW campaign,
--   • let an admin approve it or reject it with an automatic wallet refund.
-- =============================================================================

ALTER TABLE public.sponsored_ads
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN IF NOT EXISTS moderation_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reviewed_by bigint REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at timestamptz;

DROP POLICY IF EXISTS sponsored_ads_seller_insert ON public.sponsored_ads;
DROP POLICY IF EXISTS sponsored_ads_seller_update ON public.sponsored_ads;
DROP POLICY IF EXISTS sponsored_ads_seller_delete ON public.sponsored_ads;
DROP POLICY IF EXISTS sponsored_ads_admin_all ON public.sponsored_ads;
CREATE POLICY sponsored_ads_admin_all ON public.sponsored_ads
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.purchase_sponsored_campaign(
  p_user_id bigint,
  p_ad_type text,
  p_target_id bigint,
  p_title text,
  p_budget numeric,
  p_banner_url text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_cpc numeric;
  v_budget numeric := p_budget;
  v_ad_id bigint;
  v_balance numeric;
  v_type text := upper(trim(p_ad_type));
BEGIN
  IF p_user_id IS NULL OR p_user_id <= 0 THEN
    RAISE EXCEPTION 'A signed-in advertiser is required';
  END IF;
  IF length(trim(coalesce(p_title, ''))) < 3 THEN
    RAISE EXCEPTION 'Campaign title is required';
  END IF;
  IF v_type NOT IN ('PRODUCT', 'BUSINESS', 'BANNER_HOME', 'BANNER_CATEGORY') THEN
    RAISE EXCEPTION 'Unknown campaign type';
  END IF;

  SELECT coalesce(ad_cpc_price, 150)
    INTO v_cpc
  FROM public.revenue_settings
  ORDER BY id
  LIMIT 1;
  v_cpc := coalesce(v_cpc, 150);

  IF v_budget IS NULL OR v_budget < v_cpc THEN
    RAISE EXCEPTION 'Campaign budget must cover at least one click';
  END IF;
  IF v_budget > 5000000 THEN
    RAISE EXCEPTION 'Campaign budget exceeds the platform limit';
  END IF;

  IF v_type = 'PRODUCT' THEN
    SELECT * INTO v_product
    FROM public.products
    WHERE id = p_target_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Promoted listing not found';
    END IF;
    IF v_product.seller_id <> p_user_id THEN
      RAISE EXCEPTION 'You can only advertise your own listing';
    END IF;
    IF v_product.stock_status NOT IN ('IN_STOCK', 'LOW_STOCK') THEN
      RAISE EXCEPTION 'Only active, in-stock listings can be advertised';
    END IF;
    IF v_product.moderation_status IS NOT NULL AND v_product.moderation_status <> 'APPROVED' THEN
      RAISE EXCEPTION 'This listing is not approved for advertising';
    END IF;
  END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Add funds to your wallet before creating a campaign';
  END IF;
  IF coalesce(v_wallet.balance, 0) < v_budget THEN
    RAISE EXCEPTION 'Insufficient wallet balance for this campaign budget';
  END IF;

  v_balance := v_wallet.balance - v_budget;
  UPDATE public.wallets SET balance = v_balance WHERE id = v_wallet.id;

  INSERT INTO public.wallet_transactions
    (wallet_id, amount, type, description, status, created_at)
  VALUES
    (v_wallet.id, -v_budget, 'DEBIT_AD',
     format('Sponsored campaign budget reserved: "%s"', trim(p_title)),
     'COMPLETED', now());

  INSERT INTO public.sponsored_ads
    (seller_id, type, target_id, title, banner_url, status, budget, spent,
     clicks, impressions, moderation_status, moderation_reason, created_at)
  VALUES
    (p_user_id, v_type, coalesce(p_target_id, 0), trim(p_title),
     nullif(trim(coalesce(p_banner_url, '')), ''), 'PENDING_REVIEW',
     v_budget, 0, 0, 0, 'PENDING', '', now())
  RETURNING id INTO v_ad_id;

  INSERT INTO public.notifications
    (user_id, title, message, type, is_read, created_at)
  VALUES
    (p_user_id, 'Campaign submitted for review',
     format('"%s" is awaiting moderation. Its ₦%s budget is reserved and the campaign will only serve after approval.',
            trim(p_title), trim(to_char(v_budget, 'FM999,999,990'))),
     'PROMOTION', false, now());

  INSERT INTO public.audit_logs
    (user_id, action, entity_type, entity_id, details)
  VALUES
    (p_user_id, 'CREATE_SPONSORED_CAMPAIGN', 'SPONSORED_AD', v_ad_id,
     format('%s campaign submitted; ₦%s reserved from wallet', v_type, v_budget));

  RETURN jsonb_build_object(
    'success', true,
    'campaignId', v_ad_id,
    'status', 'PENDING_REVIEW',
    'budget', v_budget,
    'cpc', v_cpc,
    'balance', v_balance
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_sponsored_campaign(
  p_ad_id bigint,
  p_admin_id bigint,
  p_action text,
  p_reason text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ad public.sponsored_ads%ROWTYPE;
  v_action text := upper(trim(p_action));
  v_wallet public.wallets%ROWTYPE;
  v_balance numeric;
BEGIN
  IF v_action NOT IN ('APPROVE', 'REJECT') THEN
    RAISE EXCEPTION 'Unknown moderation action';
  END IF;
  IF v_action = 'REJECT' AND length(trim(coalesce(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'A rejection reason is required';
  END IF;

  SELECT * INTO v_ad
  FROM public.sponsored_ads
  WHERE id = p_ad_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;
  IF v_ad.status <> 'PENDING_REVIEW' THEN
    RAISE EXCEPTION 'Only campaigns awaiting review can be moderated';
  END IF;

  IF v_action = 'APPROVE' THEN
    UPDATE public.sponsored_ads
    SET status = 'ACTIVE',
        moderation_status = 'APPROVED',
        moderation_reason = '',
        reviewed_by = p_admin_id,
        reviewed_at = now(),
        starts_at = now()
    WHERE id = p_ad_id;
  ELSE
    UPDATE public.sponsored_ads
    SET status = 'REJECTED',
        moderation_status = 'REJECTED',
        moderation_reason = trim(p_reason),
        reviewed_by = p_admin_id,
        reviewed_at = now()
    WHERE id = p_ad_id;

    -- The whole campaign budget was reserved at submission and no delivery has
    -- occurred, so rejection returns it in full.
    IF v_ad.budget > 0 THEN
      SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_ad.seller_id FOR UPDATE;
      IF FOUND THEN
        v_balance := coalesce(v_wallet.balance, 0) + v_ad.budget;
        UPDATE public.wallets SET balance = v_balance WHERE id = v_wallet.id;
        INSERT INTO public.wallet_transactions
          (wallet_id, amount, type, description, status, created_at)
        VALUES
          (v_wallet.id, v_ad.budget, 'REFUND',
           format('Sponsored campaign rejected — budget returned: "%s"', v_ad.title),
           'COMPLETED', now());
      END IF;
    END IF;
  END IF;

  INSERT INTO public.audit_logs
    (user_id, action, entity_type, entity_id, details)
  VALUES
    (p_admin_id,
     CASE WHEN v_action = 'APPROVE' THEN 'APPROVE_SPONSORED_CAMPAIGN' ELSE 'REJECT_SPONSORED_CAMPAIGN' END,
     'SPONSORED_AD', p_ad_id,
     format('%s campaign "%s". %s', v_action, v_ad.title, coalesce(p_reason, '')));

  INSERT INTO public.notifications
    (user_id, title, message, type, is_read, created_at)
  VALUES
    (v_ad.seller_id,
     CASE WHEN v_action = 'APPROVE' THEN 'Campaign approved' ELSE 'Campaign rejected' END,
     CASE WHEN v_action = 'APPROVE'
       THEN format('"%s" passed moderation and can begin serving.', v_ad.title)
       ELSE format('"%s" was rejected. ₦%s was returned to your wallet. %s',
                   v_ad.title, v_ad.budget, trim(coalesce(p_reason, '')))
     END,
     'PROMOTION', false, now());

  RETURN jsonb_build_object(
    'success', true,
    'campaignId', p_ad_id,
    'status', CASE WHEN v_action = 'APPROVE' THEN 'ACTIVE' ELSE 'REJECTED' END,
    'refunded', CASE WHEN v_action = 'REJECT' THEN v_ad.budget ELSE 0 END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_sponsored_campaign(bigint, text, bigint, text, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purchase_sponsored_campaign(bigint, text, bigint, text, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public.purchase_sponsored_campaign(bigint, text, bigint, text, numeric, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_sponsored_campaign(bigint, text, bigint, text, numeric, text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_review_sponsored_campaign(bigint, bigint, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_review_sponsored_campaign(bigint, bigint, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_review_sponsored_campaign(bigint, bigint, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_sponsored_campaign(bigint, bigint, text, text) TO service_role;

-- Valid clicks are recorded server-side with a short dedup window so repeated
-- browser clicks cannot inflate delivery or exhaust a campaign budget at once.
CREATE TABLE IF NOT EXISTS public.sponsored_ad_events (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  ad_id bigint NOT NULL REFERENCES public.sponsored_ads(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('IMPRESSION', 'CLICK')),
  dedup_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_id, event_type, dedup_key)
);
CREATE INDEX IF NOT EXISTS idx_sponsored_ad_events_created_at
  ON public.sponsored_ad_events(created_at DESC);
ALTER TABLE public.sponsored_ad_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.record_sponsored_ad_event(
  p_ad_id bigint,
  p_event_type text,
  p_dedup_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ad public.sponsored_ads%ROWTYPE;
  v_event text := upper(trim(p_event_type));
  v_cpc numeric;
  v_event_id bigint;
BEGIN
  IF v_event NOT IN ('IMPRESSION', 'CLICK') THEN
    RAISE EXCEPTION 'Unknown ad event';
  END IF;
  IF p_dedup_key IS NULL OR length(trim(p_dedup_key)) = 0 THEN
    RAISE EXCEPTION 'An event identity is required';
  END IF;

  SELECT * INTO v_ad FROM public.sponsored_ads WHERE id = p_ad_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;
  IF v_ad.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'campaign_not_active');
  END IF;

  INSERT INTO public.sponsored_ad_events (ad_id, event_type, dedup_key)
  VALUES (p_ad_id, v_event, p_dedup_key)
  ON CONFLICT (ad_id, event_type, dedup_key) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'deduplicated', true);
  END IF;

  IF v_event = 'IMPRESSION' THEN
    UPDATE public.sponsored_ads
    SET impressions = impressions + 1
    WHERE id = p_ad_id;
  ELSE
    IF v_ad.budget > 0 THEN
      SELECT coalesce(ad_cpc_price, 150) INTO v_cpc
      FROM public.revenue_settings ORDER BY id LIMIT 1;
      v_cpc := coalesce(v_cpc, 150);
      IF v_ad.spent + v_cpc > v_ad.budget THEN
        UPDATE public.sponsored_ads SET status = 'COMPLETED' WHERE id = p_ad_id;
        RETURN jsonb_build_object('success', false, 'reason', 'budget_exhausted');
      END IF;
      UPDATE public.sponsored_ads
      SET clicks = clicks + 1,
          spent = spent + v_cpc,
          status = CASE WHEN spent + v_cpc >= budget THEN 'COMPLETED' ELSE status END
      WHERE id = p_ad_id;
    ELSE
      UPDATE public.sponsored_ads SET clicks = clicks + 1 WHERE id = p_ad_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'deduplicated', false);
END;
$$;

REVOKE ALL ON FUNCTION public.record_sponsored_ad_event(bigint, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_sponsored_ad_event(bigint, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.record_sponsored_ad_event(bigint, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_sponsored_ad_event(bigint, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
