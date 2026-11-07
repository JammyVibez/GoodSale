-- =============================================================================
-- 026: Referral campaigns, attribution, qualification and GoodSale Coin rewards
--
-- Additive only. Existing profiles, orders, products, notifications and
-- good_points_transactions remain the source of truth. This migration:
--   * gives every profile a unique, server-generated referral code;
--   * records privacy-safe referral clicks and immutable attribution;
--   * adds admin-configurable campaigns with real qualification rules;
--   * awards GoodSale Coins only after verified, genuine marketplace activity;
--   * makes reward issuance idempotent and reversible for fraud/refund review.
--
-- No referral reward moves money into a wallet. GoodSale Coins stay promotional
-- and cannot be withdrawn or converted automatically.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Profiles: unique codes and fraud signals
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signup_ip_hash text;

-- Keep existing codes upper-case, then make collisions deterministic.
UPDATE public.profiles
SET referral_code = upper(regexp_replace(referral_code, '[^a-zA-Z0-9-]', '', 'g'))
WHERE referral_code IS NOT NULL
  AND referral_code <> '';

WITH ranked AS (
  SELECT id,
         referral_code,
         row_number() OVER (
           PARTITION BY upper(referral_code)
           ORDER BY id
         ) AS rn
  FROM public.profiles
  WHERE referral_code IS NOT NULL AND referral_code <> ''
)
UPDATE public.profiles p
SET referral_code = ranked.referral_code || '-' || p.id
FROM ranked
WHERE p.id = ranked.id AND ranked.rn > 1;

CREATE OR REPLACE FUNCTION public.generate_referral_code(
  p_name text,
  p_username text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base text;
  candidate text;
  attempt int := 0;
BEGIN
  base := upper(regexp_replace(
    split_part(COALESCE(NULLIF(btrim(p_name), ''), NULLIF(btrim(p_username), ''), 'GOODSALE'), ' ', 1),
    '[^a-zA-Z0-9]', '', 'g'
  ));
  IF base = '' THEN
    base := 'GOODSALE';
  END IF;
  base := left(base, 8);

  LOOP
    candidate := base || '-GS' || lpad((floor(random() * 900) + 100)::int::text, 3, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE upper(referral_code) = candidate
    );
    attempt := attempt + 1;
    IF attempt >= 60 THEN
      candidate := base || '-GS' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
      EXIT;
    END IF;
  END LOOP;

  RETURN candidate;
END;
$$;

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT id, full_name, username
    FROM public.profiles
    WHERE referral_code IS NULL OR btrim(referral_code) = ''
  LOOP
    UPDATE public.profiles
    SET referral_code = public.generate_referral_code(rec.full_name, rec.username)
    WHERE id = rec.id;
  END LOOP;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_referral_code
  ON public.profiles (upper(referral_code));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta_full_name text;
  meta_username text;
  meta_phone text;
  meta_signup_ip_hash text;
  base_username text;
  final_username text;
  suffix int := 0;
BEGIN
  meta_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'fullName', '');
  meta_username := COALESCE(NEW.raw_user_meta_data->>'username', '');
  meta_phone := COALESCE(
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'phone_number',
    NEW.raw_user_meta_data->>'phoneNumber',
    ''
  );
  meta_signup_ip_hash := NULLIF(NEW.raw_user_meta_data->>'signup_ip_hash', '');

  IF meta_username = '' OR meta_username IS NULL THEN
    base_username := lower(regexp_replace(split_part(COALESCE(NEW.email, 'user'), '@', 1), '[^a-zA-Z0-9_]', '', 'g'));
    IF base_username = '' THEN
      base_username := 'user';
    END IF;
  ELSE
    base_username := lower(regexp_replace(meta_username, '[^a-zA-Z0-9_]', '', 'g'));
  END IF;

  final_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    suffix := suffix + 1;
    final_username := base_username || suffix::text;
  END LOOP;

  INSERT INTO public.profiles (
    auth_id,
    full_name,
    username,
    email,
    phone_number,
    role,
    referral_code,
    signup_ip_hash
  ) VALUES (
    NEW.id,
    meta_full_name,
    final_username,
    COALESCE(NEW.email, ''),
    meta_phone,
    'BUYER',
    public.generate_referral_code(meta_full_name, final_username),
    meta_signup_ip_hash
  );

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Campaigns and click attribution
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referral_campaigns (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED')),
  audience text NOT NULL DEFAULT 'ANY'
    CHECK (audience IN ('ANY', 'BUYER', 'SELLER')),
  reward_type text NOT NULL DEFAULT 'GOODSALE_COINS'
    CHECK (reward_type = 'GOODSALE_COINS'),
  referrer_reward integer NOT NULL DEFAULT 500
    CHECK (referrer_reward >= 0 AND referrer_reward <= 100000),
  referee_reward integer NOT NULL DEFAULT 250
    CHECK (referee_reward >= 0 AND referee_reward <= 100000),
  require_email_verified boolean NOT NULL DEFAULT true,
  require_onboarding boolean NOT NULL DEFAULT true,
  require_verified_referrer boolean NOT NULL DEFAULT false,
  min_referrer_age_hours integer NOT NULL DEFAULT 0
    CHECK (min_referrer_age_hours >= 0 AND min_referrer_age_hours <= 8760),
  qualifying_actions text[] NOT NULL DEFAULT ARRAY['PURCHASE']::text[]
    CHECK (qualifying_actions <@ ARRAY['PURCHASE', 'LISTING', 'SELLER_SALE']::text[]),
  disqualify_refunded boolean NOT NULL DEFAULT true,
  max_rewards_per_user integer NOT NULL DEFAULT 20
    CHECK (max_rewards_per_user >= 0 AND max_rewards_per_user <= 100000),
  max_rewards_per_campaign integer NOT NULL DEFAULT 1000
    CHECK (max_rewards_per_campaign >= 0 AND max_rewards_per_campaign <= 1000000),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  terms text NOT NULL DEFAULT '',
  created_by bigint REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS referral_campaigns_set_updated_at ON public.referral_campaigns;
CREATE TRIGGER referral_campaigns_set_updated_at
  BEFORE UPDATE ON public.referral_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.referral_campaigns (
  name, slug, description, status, audience, referrer_reward, referee_reward,
  require_email_verified, require_onboarding, qualifying_actions,
  max_rewards_per_user, max_rewards_per_campaign, terms
) VALUES (
  'GoodSale Launch Referrals',
  'goodsale-launch',
  'Invite a buyer or seller. Rewards unlock after a completed purchase, an approved verified listing, or a completed seller sale.',
  'ACTIVE',
  'ANY',
  500,
  250,
  true,
  true,
  ARRAY['PURCHASE', 'LISTING', 'SELLER_SALE']::text[],
  20,
  1000,
  'Rewards are promotional GoodSale Coins. They are not cash, cannot be withdrawn, and are issued once per new account after the configured qualifying action. Refunded, cancelled or disputed transactions do not qualify.'
)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.referral_clicks (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  code text NOT NULL,
  campaign_id bigint REFERENCES public.referral_campaigns(id) ON DELETE SET NULL,
  visitor_hash text NOT NULL,
  user_agent text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_clicks_code
  ON public.referral_clicks (upper(code), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_clicks_visitor
  ON public.referral_clicks (visitor_hash, code, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. Referral attribution and reward records
-- ---------------------------------------------------------------------------
ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS campaign_id bigint REFERENCES public.referral_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS referrer_reward integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referee_reward integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_type text NOT NULL DEFAULT 'GOODSALE_COINS',
  ADD COLUMN IF NOT EXISTS qualified_at timestamptz,
  ADD COLUMN IF NOT EXISTS rewarded_at timestamptz,
  ADD COLUMN IF NOT EXISTS disqualified_at timestamptz,
  ADD COLUMN IF NOT EXISTS disqualification_reason text,
  ADD COLUMN IF NOT EXISTS qualification_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS fraud_flags text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS risk_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fraud_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS fraud_reviewed_by bigint REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Normalise legacy status values before adding the new state constraint.
UPDATE public.referrals SET status = 'QUALIFIED' WHERE status = 'FIRST_ORDER_COMPLETED';
UPDATE public.referrals SET status = 'REWARDED' WHERE reward_released = true AND status = 'QUALIFIED';
UPDATE public.referrals SET status = 'REGISTERED' WHERE status NOT IN (
  'REGISTERED', 'VERIFICATION_PENDING', 'QUALIFIED', 'REWARD_PENDING',
  'REWARDED', 'DISQUALIFIED'
);

-- One account may be attributed only once, to one referrer.
DELETE FROM public.referrals a
USING public.referrals b
WHERE a.referee_id = b.referee_id AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_referrals_referee
  ON public.referrals (referee_id);
CREATE INDEX IF NOT EXISTS idx_referrals_campaign
  ON public.referrals (campaign_id, status);

ALTER TABLE public.referrals
  DROP CONSTRAINT IF EXISTS referrals_status_check;
ALTER TABLE public.referrals
  ADD CONSTRAINT referrals_status_check
  CHECK (status IN (
    'REGISTERED', 'VERIFICATION_PENDING', 'QUALIFIED',
    'REWARD_PENDING', 'REWARDED', 'DISQUALIFIED'
  ));

DROP TRIGGER IF EXISTS referrals_set_updated_at ON public.referrals;
CREATE TRIGGER referrals_set_updated_at
  BEFORE UPDATE ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  referral_id bigint NOT NULL REFERENCES public.referrals(id) ON DELETE CASCADE,
  campaign_id bigint REFERENCES public.referral_campaigns(id) ON DELETE SET NULL,
  beneficiary_id bigint NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  beneficiary_role text NOT NULL CHECK (beneficiary_role IN ('REFERRER', 'REFEREE')),
  reward_type text NOT NULL DEFAULT 'GOODSALE_COINS',
  amount integer NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ISSUED', 'REVERSED')),
  reference text NOT NULL DEFAULT (
    'RFR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 18))
  ) UNIQUE,
  good_points_transaction_id bigint REFERENCES public.good_points_transactions(id) ON DELETE SET NULL,
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (referral_id, beneficiary_role)
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_beneficiary
  ON public.referral_rewards (beneficiary_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.referral_events (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  referral_id bigint NOT NULL REFERENCES public.referrals(id) ON DELETE CASCADE,
  event text NOT NULL,
  actor_id bigint REFERENCES public.profiles(id) ON DELETE SET NULL,
  details text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_events_referral
  ON public.referral_events (referral_id, created_at DESC);

ALTER TABLE public.good_points_transactions
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.good_points_transactions
SET reference = 'GPT-LEGACY-' || id
WHERE reference IS NULL;

ALTER TABLE public.good_points_transactions
  ALTER COLUMN reference SET DEFAULT (
    'GPT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 18))
  );

ALTER TABLE public.good_points_transactions
  ALTER COLUMN reference SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_good_points_reference
  ON public.good_points_transactions (reference);

-- ---------------------------------------------------------------------------
-- 4. Write guards and RLS
-- ---------------------------------------------------------------------------
-- Service-role reward functions need to move GoodSale Coins. This preserves
-- every 024 restriction for browser sessions while allowing only the trusted
-- server path to write the coin balance.
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role'
     OR current_setting('goodsale.goodpoints_write', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_admin() THEN
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

    IF current_user IN ('authenticated', 'anon') AND (
         NEW.verification_status      IS DISTINCT FROM OLD.verification_status
      OR NEW.verification_type        IS DISTINCT FROM OLD.verification_type
      OR NEW.verified_at              IS DISTINCT FROM OLD.verified_at
      OR NEW.verification_expires_at  IS DISTINCT FROM OLD.verification_expires_at
    ) THEN
      RAISE EXCEPTION 'Updating verification status is not allowed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_profile_referral_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trusted boolean;
BEGIN
  trusted := (
    auth.role() = 'service_role'
    OR public.is_admin()
    OR current_setting('goodsale.referral_write', true) = 'on'
  );

  IF NOT trusted
     AND (NEW.referral_code IS DISTINCT FROM OLD.referral_code
          OR NEW.referred_by_id IS DISTINCT FROM OLD.referred_by_id) THEN
    RAISE EXCEPTION 'Referral ownership and codes can only be changed by GoodSale';
  END IF;

  IF NOT trusted
     AND current_setting('goodsale.rewards_write', true) <> 'on'
     AND NEW.good_points IS DISTINCT FROM OLD.good_points THEN
    RAISE EXCEPTION 'GoodSale Coins can only be credited by GoodSale';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_referral_fields ON public.profiles;
CREATE TRIGGER profiles_protect_referral_fields
  BEFORE UPDATE OF referral_code, referred_by_id, good_points ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_referral_fields();

CREATE OR REPLACE FUNCTION public.protect_referral_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role'
     OR public.is_admin()
     OR current_setting('goodsale.referral_write', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Referral records are managed by GoodSale';
END;
$$;

DROP TRIGGER IF EXISTS referrals_server_only ON public.referrals;
CREATE TRIGGER referrals_server_only
  BEFORE INSERT OR UPDATE OR DELETE ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.protect_referral_row();

ALTER TABLE public.referral_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referral_campaigns_read ON public.referral_campaigns;
CREATE POLICY referral_campaigns_read ON public.referral_campaigns
  FOR SELECT TO authenticated
  USING (status = 'ACTIVE' OR public.is_admin());

DROP POLICY IF EXISTS referral_rewards_own_read ON public.referral_rewards;
CREATE POLICY referral_rewards_own_read ON public.referral_rewards
  FOR SELECT TO authenticated
  USING (beneficiary_id = public.current_profile_id() OR public.is_admin());

DROP POLICY IF EXISTS referral_events_own_read ON public.referral_events;
CREATE POLICY referral_events_own_read ON public.referral_events
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.referrals r
      WHERE r.id = referral_events.referral_id
        AND (r.referrer_id = public.current_profile_id() OR r.referee_id = public.current_profile_id())
    )
  );

-- Attribution is server-only. Referrers read their safe dashboard through the
-- API; direct table reads are limited to the referred member and admins so a
-- referrer cannot enumerate account ids or stored display names.
DROP POLICY IF EXISTS referrals_own_read ON public.referrals;
CREATE POLICY referrals_own_read ON public.referrals
  FOR SELECT TO authenticated
  USING (referee_id = public.current_profile_id() OR public.is_admin());

DROP POLICY IF EXISTS referrals_auth_insert ON public.referrals;
DROP POLICY IF EXISTS referrals_admin_update ON public.referrals;
REVOKE INSERT, UPDATE, DELETE ON public.referrals FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.referral_campaigns FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.referral_rewards FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.referral_events FROM authenticated, anon;
REVOKE ALL ON public.referral_clicks FROM authenticated, anon;

DROP POLICY IF EXISTS good_points_admin_insert ON public.good_points_transactions;
CREATE POLICY good_points_admin_insert ON public.good_points_transactions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. Server attribution
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attribute_referral(
  p_referee_id bigint,
  p_code text,
  p_ip_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  referrer public.profiles%ROWTYPE;
  referee public.profiles%ROWTYPE;
  campaign public.referral_campaigns%ROWTYPE;
  referral_id bigint;
  risk int := 0;
  flags text[] := ARRAY[]::text[];
  recent_count int;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Referral attribution is server only';
  END IF;

  v_code := upper(btrim(COALESCE(p_code, '')));
  IF v_code !~ '^[A-Z0-9-]{3,40}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_code');
  END IF;

  SELECT * INTO referee FROM public.profiles WHERE id = p_referee_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'referee_not_found');
  END IF;

  IF referee.referred_by_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.referrals WHERE referee_id = p_referee_id) THEN
    RETURN jsonb_build_object('success', true, 'already_attributed', true);
  END IF;

  SELECT * INTO referrer
  FROM public.profiles
  WHERE upper(referral_code) = v_code
  LIMIT 1;

  IF NOT FOUND OR referrer.referral_code IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_code');
  END IF;
  IF referrer.id = p_referee_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'self_referral');
  END IF;
  IF referrer.is_suspended THEN
    RETURN jsonb_build_object('success', false, 'error', 'referrer_inactive');
  END IF;

  SELECT * INTO campaign
  FROM public.referral_campaigns
  WHERE status = 'ACTIVE'
    AND audience IN ('ANY', 'BUYER')
    AND starts_at <= now()
    AND (ends_at IS NULL OR ends_at > now())
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'campaign_unavailable');
  END IF;

  IF campaign.require_verified_referrer
     AND COALESCE(referrer.verification_status, 'UNVERIFIED') <> 'VERIFIED' THEN
    flags := array_append(flags, 'REFERRER_NOT_VERIFIED');
    risk := risk + 50;
  END IF;

  IF campaign.min_referrer_age_hours > 0
     AND referrer.created_at > now() - make_interval(hours => campaign.min_referrer_age_hours) THEN
    flags := array_append(flags, 'NEW_REFERRER_ACCOUNT');
    risk := risk + 25;
  END IF;

  IF p_ip_hash IS NOT NULL AND referrer.signup_ip_hash IS NOT NULL
     AND p_ip_hash = referrer.signup_ip_hash THEN
    flags := array_append(flags, 'SHARED_SIGNUP_IP');
    risk := risk + 40;
  END IF;

  SELECT count(*) INTO recent_count
  FROM public.referrals
  WHERE referrer_id = referrer.id
    AND created_at >= now() - interval '24 hours';
  IF recent_count >= 10 THEN
    flags := array_append(flags, 'HIGH_REFERRAL_VELOCITY');
    risk := risk + 30;
  END IF;

  PERFORM set_config('goodsale.referral_write', 'on', true);

  INSERT INTO public.referrals (
    referrer_id, referee_id, referee_name, status, campaign_id, code,
    referrer_reward, referee_reward, reward_type, fraud_flags, risk_score
  ) VALUES (
    referrer.id,
    referee.id,
    split_part(referee.full_name, ' ', 1)
      || CASE
           WHEN strpos(btrim(referee.full_name), ' ') > 0
             THEN ' ' || left(split_part(btrim(referee.full_name), ' ', 2), 1) || '.'
           ELSE ''
         END,
    'REGISTERED',
    campaign.id,
    v_code,
    campaign.referrer_reward,
    campaign.referee_reward,
    campaign.reward_type,
    flags,
    risk
  )
  RETURNING id INTO referral_id;

  UPDATE public.profiles
  SET referred_by_id = referrer.id
  WHERE id = referee.id;

  INSERT INTO public.referral_events (referral_id, event, actor_id, details, metadata)
  VALUES (
    referral_id,
    'ATTRIBUTED',
    referee.id,
    'New account attributed to referral code ' || v_code,
    jsonb_build_object('campaign_id', campaign.id, 'risk_score', risk, 'flags', flags)
  );

  INSERT INTO public.notifications (user_id, title, message, type, is_read)
  VALUES (
    referrer.id,
    'New referral registered',
    'Someone joined GoodSale through your link. Your reward unlocks when they meet the campaign qualification rules.',
    'REFERRAL',
    false
  );

  RETURN jsonb_build_object(
    'success', true,
    'referral_id', referral_id,
    'campaign_id', campaign.id,
    'status', 'REGISTERED',
    'risk_score', risk,
    'flags', to_jsonb(flags)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.attribute_referral(bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attribute_referral(bigint, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Qualification and reward primitives
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.referral_has_action(
  p_referee_id bigint,
  p_action text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_action
    WHEN 'PURCHASE' THEN EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.buyer_id = p_referee_id
        AND o.status = 'DELIVERED_SUCCESS'
        AND NOT EXISTS (
          SELECT 1 FROM public.refunds r
          WHERE r.order_id = o.id
            AND r.status NOT IN ('REJECTED', 'FAILED', 'CANCELLED')
        )
    )
    WHEN 'SELLER_SALE' THEN EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.seller_id = p_referee_id
        AND o.status = 'DELIVERED_SUCCESS'
        AND NOT EXISTS (
          SELECT 1 FROM public.refunds r
          WHERE r.order_id = o.id
            AND r.status NOT IN ('REJECTED', 'FAILED', 'CANCELLED')
        )
    )
    WHEN 'LISTING' THEN EXISTS (
      SELECT 1
      FROM public.products p
      JOIN public.profiles seller ON seller.id = p.seller_id
      WHERE p.seller_id = p_referee_id
        AND seller.verification_status = 'VERIFIED'
    )
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.referral_reverse_rewards(
  p_referral_id bigint,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reward public.referral_rewards%ROWTYPE;
  new_balance integer;
BEGIN
  PERFORM set_config('goodsale.referrals_write', 'on', true);
  PERFORM set_config('goodsale.referral_write', 'on', true);
  PERFORM set_config('goodsale.rewards_write', 'on', true);
  PERFORM set_config('goodsale.goodpoints_write', 'on', true);

  FOR reward IN
    SELECT * FROM public.referral_rewards
    WHERE referral_id = p_referral_id AND status = 'ISSUED'
    FOR UPDATE
  LOOP
    UPDATE public.profiles
    SET good_points = greatest(0, good_points - reward.amount)
    WHERE id = reward.beneficiary_id
    RETURNING good_points INTO new_balance;

    INSERT INTO public.good_points_transactions (
      user_id, points, reason, reference, source, metadata
    ) VALUES (
      reward.beneficiary_id,
      -reward.amount,
      'Referral reward reversed: ' || p_reason,
      'GPT-REV-' || reward.reference,
      'REFERRAL_REVERSAL',
      jsonb_build_object('referral_id', p_referral_id, 'reward_id', reward.id, 'balance_after', new_balance)
    );

    UPDATE public.referral_rewards
    SET status = 'REVERSED'
    WHERE id = reward.id;

    INSERT INTO public.notifications (user_id, title, message, type, is_read)
    VALUES (
      reward.beneficiary_id,
      'Referral reward reversed',
      'A referral reward was reversed after review: ' || p_reason,
      'REFERRAL',
      false
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.referral_issue_rewards(
  p_referral_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref public.referrals%ROWTYPE;
  campaign public.referral_campaigns%ROWTYPE;
  referrer public.profiles%ROWTYPE;
  referee public.profiles%ROWTYPE;
  referrer_campaign_count int;
  campaign_reward_count int;
  referrer_points int;
  referee_points int;
  referrer_balance int;
  referee_balance int;
  reward public.referral_rewards%ROWTYPE;
  referrer_tx bigint;
  referee_tx bigint;
  issued_total int := 0;
BEGIN
  SELECT * INTO ref FROM public.referrals WHERE id = p_referral_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  IF ref.status = 'REWARDED' THEN
    RETURN jsonb_build_object('success', true, 'already_rewarded', true, 'referral_id', ref.id);
  END IF;
  IF ref.status <> 'QUALIFIED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_qualified', 'status', ref.status);
  END IF;

  SELECT * INTO campaign
  FROM public.referral_campaigns
  WHERE id = ref.campaign_id
  FOR UPDATE;
  IF NOT FOUND OR campaign.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object('success', false, 'error', 'campaign_inactive', 'status', ref.status);
  END IF;
  IF campaign.starts_at > now() OR (campaign.ends_at IS NOT NULL AND campaign.ends_at <= now()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'campaign_outside_dates', 'status', ref.status);
  END IF;

  SELECT * INTO referrer FROM public.profiles WHERE id = ref.referrer_id FOR UPDATE;
  SELECT * INTO referee FROM public.profiles WHERE id = ref.referee_id FOR UPDATE;

  IF referrer.is_suspended OR referee.is_suspended THEN
    UPDATE public.referrals
    SET status = 'DISQUALIFIED',
        disqualified_at = now(),
        disqualification_reason = 'A participant account is suspended'
    WHERE id = ref.id;
    RETURN jsonb_build_object('success', false, 'error', 'account_suspended');
  END IF;

  SELECT count(*) INTO referrer_campaign_count
  FROM public.referrals
  WHERE referrer_id = ref.referrer_id
    AND campaign_id = ref.campaign_id
    AND status = 'REWARDED';
  IF campaign.max_rewards_per_user > 0
     AND referrer_campaign_count >= campaign.max_rewards_per_user THEN
    UPDATE public.referrals
    SET status = 'DISQUALIFIED',
        disqualified_at = now(),
        disqualification_reason = 'Campaign per-user reward limit reached'
    WHERE id = ref.id;
    INSERT INTO public.notifications (user_id, title, message, type, is_read)
    VALUES (ref.referrer_id, 'Referral reward limit reached',
            'This referral qualified, but you have reached this campaign''s per-user reward limit.',
            'REFERRAL', false);
    RETURN jsonb_build_object('success', false, 'error', 'user_cap_reached');
  END IF;

  SELECT count(*) INTO campaign_reward_count
  FROM public.referrals
  WHERE campaign_id = ref.campaign_id
    AND status = 'REWARDED';
  IF campaign.max_rewards_per_campaign > 0
     AND campaign_reward_count >= campaign.max_rewards_per_campaign THEN
    UPDATE public.referrals
    SET status = 'DISQUALIFIED',
        disqualified_at = now(),
        disqualification_reason = 'Campaign reward limit reached'
    WHERE id = ref.id;
    INSERT INTO public.notifications (user_id, title, message, type, is_read)
    VALUES (ref.referrer_id, 'Campaign reward limit reached',
            'This referral qualified, but the campaign reward limit has been reached.',
            'REFERRAL', false);
    RETURN jsonb_build_object('success', false, 'error', 'campaign_cap_reached');
  END IF;

  -- Preserve the amounts and rules captured when the account was attributed.
  referrer_points := greatest(0, COALESCE(ref.referrer_reward, campaign.referrer_reward, 0));
  referee_points := greatest(0, COALESCE(ref.referee_reward, campaign.referee_reward, 0));

  PERFORM set_config('goodsale.referral_write', 'on', true);
  PERFORM set_config('goodsale.rewards_write', 'on', true);
  PERFORM set_config('goodsale.goodpoints_write', 'on', true);

  IF referrer_points > 0 THEN
    INSERT INTO public.referral_rewards (
      referral_id, campaign_id, beneficiary_id, beneficiary_role,
      reward_type, amount, status, metadata
    ) VALUES (
      ref.id, ref.campaign_id, ref.referrer_id, 'REFERRER',
      'GOODSALE_COINS', referrer_points, 'PENDING',
      jsonb_build_object('campaign_slug', campaign.slug)
    )
    ON CONFLICT (referral_id, beneficiary_role) DO NOTHING;

    SELECT * INTO reward
    FROM public.referral_rewards
    WHERE referral_id = ref.id AND beneficiary_role = 'REFERRER'
    FOR UPDATE;

    IF FOUND AND reward.status = 'PENDING' THEN
      UPDATE public.profiles
      SET good_points = good_points + reward.amount
      WHERE id = ref.referrer_id
      RETURNING good_points INTO referrer_balance;

      INSERT INTO public.good_points_transactions (
        user_id, points, reason, reference, source, metadata
      ) VALUES (
        ref.referrer_id,
        reward.amount,
        'Referral reward: ' || ref.referee_name || ' qualified',
        'GPT-RFR-' || reward.reference,
        'REFERRAL_REWARD',
        jsonb_build_object('referral_id', ref.id, 'reward_id', reward.id, 'balance_after', referrer_balance)
      )
      RETURNING id INTO referrer_tx;

      UPDATE public.referral_rewards
      SET status = 'ISSUED', issued_at = now(), good_points_transaction_id = referrer_tx
      WHERE id = reward.id;

      INSERT INTO public.notifications (user_id, title, message, type, is_read)
      VALUES (
        ref.referrer_id,
        'Referral reward credited',
        reward.amount || ' GoodSale Coins were added for a qualified referral. Coins are promotional and cannot be withdrawn.',
        'REFERRAL',
        false
      );
      issued_total := issued_total + reward.amount;
    END IF;
  END IF;

  IF referee_points > 0 THEN
    INSERT INTO public.referral_rewards (
      referral_id, campaign_id, beneficiary_id, beneficiary_role,
      reward_type, amount, status, metadata
    ) VALUES (
      ref.id, ref.campaign_id, ref.referee_id, 'REFEREE',
      'GOODSALE_COINS', referee_points, 'PENDING',
      jsonb_build_object('campaign_slug', campaign.slug)
    )
    ON CONFLICT (referral_id, beneficiary_role) DO NOTHING;

    SELECT * INTO reward
    FROM public.referral_rewards
    WHERE referral_id = ref.id AND beneficiary_role = 'REFEREE'
    FOR UPDATE;

    IF FOUND AND reward.status = 'PENDING' THEN
      UPDATE public.profiles
      SET good_points = good_points + reward.amount
      WHERE id = ref.referee_id
      RETURNING good_points INTO referee_balance;

      INSERT INTO public.good_points_transactions (
        user_id, points, reason, reference, source, metadata
      ) VALUES (
        ref.referee_id,
        reward.amount,
        'Welcome referral reward',
        'GPT-RFR-' || reward.reference,
        'REFERRAL_REWARD',
        jsonb_build_object('referral_id', ref.id, 'reward_id', reward.id, 'balance_after', referee_balance)
      )
      RETURNING id INTO referee_tx;

      UPDATE public.referral_rewards
      SET status = 'ISSUED', issued_at = now(), good_points_transaction_id = referee_tx
      WHERE id = reward.id;

      INSERT INTO public.notifications (user_id, title, message, type, is_read)
      VALUES (
        ref.referee_id,
        'Welcome reward credited',
        reward.amount || ' GoodSale Coins were added because you joined through a referral and qualified. Coins are promotional and cannot be withdrawn.',
        'REFERRAL',
        false
      );
      issued_total := issued_total + reward.amount;
    END IF;
  END IF;

  UPDATE public.referrals
  SET status = 'REWARDED',
      rewarded_at = now(),
      reward_released = true,
      points_reward = ref.referrer_reward,
      updated_at = now()
  WHERE id = ref.id;

  INSERT INTO public.referral_events (referral_id, event, actor_id, details, metadata)
  VALUES (
    ref.id,
    'REWARDED',
    NULL,
    'Issued ' || issued_total || ' GoodSale Coins',
    jsonb_build_object('referrer_coins', ref.referrer_reward, 'referee_coins', ref.referee_reward)
  );

  RETURN jsonb_build_object(
    'success', true,
    'referral_id', ref.id,
    'status', 'REWARDED',
    'referrer_coins', ref.referrer_reward,
    'referee_coins', ref.referee_reward
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.referral_evaluate(
  p_referral_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref public.referrals%ROWTYPE;
  campaign public.referral_campaigns%ROWTYPE;
  referee public.profiles%ROWTYPE;
  referrer public.profiles%ROWTYPE;
  email_ok boolean := false;
  onboarding_ok boolean := false;
  purchase_ok boolean := false;
  listing_ok boolean := false;
  seller_sale_ok boolean := false;
  action_ok boolean := false;
  required_ok boolean := true;
  audience_ok boolean := true;
  referrer_eligible boolean := true;
  has_any_action boolean := false;
  desired_status text := 'REGISTERED';
  snapshot jsonb;
BEGIN
  SELECT * INTO ref FROM public.referrals WHERE id = p_referral_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  SELECT * INTO referee FROM public.profiles WHERE id = ref.referee_id;
  SELECT * INTO referrer FROM public.profiles WHERE id = ref.referrer_id;
  SELECT * INTO campaign FROM public.referral_campaigns WHERE id = ref.campaign_id;

  IF NOT FOUND THEN
    UPDATE public.referrals
    SET status = 'DISQUALIFIED',
        disqualified_at = now(),
        disqualification_reason = 'Referral campaign no longer exists'
    WHERE id = ref.id;
    RETURN jsonb_build_object('success', false, 'error', 'campaign_missing');
  END IF;

  SELECT (u.email_confirmed_at IS NOT NULL)
  INTO email_ok
  FROM auth.users u
  WHERE u.id = referee.auth_id;

  onboarding_ok := referee.onboarding_completed_at IS NOT NULL;
  purchase_ok := public.referral_has_action(ref.referee_id, 'PURCHASE');
  listing_ok := public.referral_has_action(ref.referee_id, 'LISTING');
  seller_sale_ok := public.referral_has_action(ref.referee_id, 'SELLER_SALE');

  action_ok :=
    (purchase_ok AND 'PURCHASE' = ANY(campaign.qualifying_actions))
    OR (listing_ok AND 'LISTING' = ANY(campaign.qualifying_actions))
    OR (seller_sale_ok AND 'SELLER_SALE' = ANY(campaign.qualifying_actions));

  has_any_action := purchase_ok OR listing_ok OR seller_sale_ok;

  IF campaign.require_email_verified AND NOT COALESCE(email_ok, false) THEN
    required_ok := false;
  END IF;
  IF campaign.require_onboarding AND NOT onboarding_ok THEN
    required_ok := false;
  END IF;
  IF campaign.require_verified_referrer
     AND COALESCE(referrer.verification_status, 'UNVERIFIED') <> 'VERIFIED' THEN
    referrer_eligible := false;
  END IF;
  IF campaign.min_referrer_age_hours > 0
     AND referrer.created_at > now() - make_interval(hours => campaign.min_referrer_age_hours) THEN
    referrer_eligible := false;
  END IF;

  IF campaign.audience = 'BUYER' AND referee.role NOT IN ('BUYER', 'ADMIN', 'SUPER_ADMIN') THEN
    audience_ok := false;
  ELSIF campaign.audience = 'SELLER'
        AND referee.role NOT IN ('SELLER', 'VERIFIED_SELLER', 'BUSINESS', 'VERIFIED_BUSINESS', 'ADMIN', 'SUPER_ADMIN') THEN
    audience_ok := false;
  END IF;

  snapshot := jsonb_build_object(
    'email_verified', COALESCE(email_ok, false),
    'onboarding_completed', onboarding_ok,
    'purchase', purchase_ok,
    'listing', listing_ok,
    'seller_sale', seller_sale_ok,
    'audience_match', audience_ok,
    'referrer_eligible', referrer_eligible,
    'required_checks_passed', required_ok,
    'qualifying_action', action_ok,
    'evaluated_at', now()
  );

  IF ref.status = 'REWARDED' THEN
    IF campaign.disqualify_refunded AND NOT has_any_action THEN
      PERFORM public.referral_reverse_rewards(
        ref.id,
        'The qualifying transaction was refunded, cancelled or disputed'
      );

      PERFORM set_config('goodsale.referral_write', 'on', true);
      UPDATE public.referrals
      SET status = 'DISQUALIFIED',
          disqualified_at = now(),
          disqualification_reason = 'The qualifying transaction was refunded, cancelled or disputed',
          qualification_snapshot = snapshot
      WHERE id = ref.id;

      INSERT INTO public.referral_events (referral_id, event, details, metadata)
      VALUES (ref.id, 'REVERSED', 'Reward reversed after the qualifying activity became ineligible', snapshot);

      INSERT INTO public.notifications (user_id, title, message, type, is_read)
      VALUES
        (
          ref.referee_id,
          'Referral reward reversed',
          'Your referral reward was reversed because the qualifying transaction was refunded, cancelled or disputed.',
          'REFERRAL',
          false
        ),
        (
          ref.referrer_id,
          'Referral reward reversed',
          'A referral reward was reversed because its qualifying transaction was refunded, cancelled or disputed.',
          'REFERRAL',
          false
        );
    END IF;
    RETURN jsonb_build_object('success', true, 'status', 'REWARDED', 'already_rewarded', true);
  END IF;

  IF ref.status = 'DISQUALIFIED' THEN
    RETURN jsonb_build_object('success', true, 'status', 'DISQUALIFIED', 'reason', ref.disqualification_reason);
  END IF;

  IF referrer.is_suspended OR referee.is_suspended THEN
    desired_status := 'DISQUALIFIED';
  ELSIF NOT audience_ok OR NOT referrer_eligible THEN
    desired_status := 'DISQUALIFIED';
  ELSIF required_ok AND action_ok THEN
    desired_status := 'QUALIFIED';
  ELSIF (campaign.require_email_verified AND NOT COALESCE(email_ok, false))
        OR (campaign.require_onboarding AND NOT onboarding_ok) THEN
    desired_status := 'VERIFICATION_PENDING';
  ELSE
    desired_status := 'REGISTERED';
  END IF;

  PERFORM set_config('goodsale.referral_write', 'on', true);

  IF desired_status = 'QUALIFIED' THEN
    IF ref.status NOT IN ('QUALIFIED', 'REWARD_PENDING') THEN
      INSERT INTO public.notifications (user_id, title, message, type, is_read)
      VALUES
        (
          ref.referrer_id,
          'Referral qualified — reward pending',
          'Your referral met the campaign requirements. ' || ref.referrer_reward || ' GoodSale Coins are being processed.',
          'REFERRAL',
          false
        ),
        (
          ref.referee_id,
          'You qualified for a welcome reward',
          'Your referred account met the campaign requirements. ' || ref.referee_reward || ' GoodSale Coins are being processed.',
          'REFERRAL',
          false
        );
    END IF;

    UPDATE public.referrals
    SET status = 'QUALIFIED',
        qualified_at = COALESCE(qualified_at, now()),
        qualification_snapshot = snapshot,
        updated_at = now()
    WHERE id = ref.id;

    INSERT INTO public.referral_events (referral_id, event, details, metadata)
    VALUES (ref.id, 'QUALIFIED', 'All configured referral conditions were met', snapshot);

    -- A qualification never fails silently: if campaign limits are hit the
    -- referral moves to DISQUALIFIED with a reason and remains auditable.
    RETURN public.referral_issue_rewards(ref.id);
  END IF;

  IF desired_status = 'DISQUALIFIED' THEN
    UPDATE public.referrals
    SET status = 'DISQUALIFIED',
        disqualified_at = now(),
        disqualification_reason = CASE
          WHEN referrer.is_suspended OR referee.is_suspended THEN 'A participant account is suspended'
          WHEN NOT referrer_eligible THEN 'The referrer does not meet the campaign eligibility rules'
          ELSE 'The account does not match this campaign audience'
        END,
        qualification_snapshot = snapshot,
        updated_at = now()
    WHERE id = ref.id;
    RETURN jsonb_build_object('success', true, 'status', 'DISQUALIFIED');
  END IF;

  UPDATE public.referrals
  SET status = desired_status,
      qualification_snapshot = snapshot,
      updated_at = now()
  WHERE id = ref.id;

  RETURN jsonb_build_object(
    'success', true,
    'status', desired_status,
    'snapshot', snapshot
  );
END;
$$;

REVOKE ALL ON FUNCTION public.referral_evaluate(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.referral_evaluate(bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.evaluate_my_referral()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller bigint;
  rid bigint;
BEGIN
  caller := public.current_profile_id();
  IF caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT id INTO rid FROM public.referrals WHERE referee_id = caller LIMIT 1;
  IF rid IS NULL THEN
    RETURN jsonb_build_object('success', true, 'status', 'NOT_REFERRED');
  END IF;

  RETURN public.referral_evaluate(rid);
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_my_referral() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_my_referral() TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_my_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller public.profiles%ROWTYPE;
  code text;
BEGIN
  SELECT * INTO caller FROM public.profiles WHERE id = public.current_profile_id() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;
  IF caller.referral_code IS NOT NULL AND btrim(caller.referral_code) <> '' THEN
    RETURN caller.referral_code;
  END IF;

  code := public.generate_referral_code(caller.full_name, caller.username);
  PERFORM set_config('goodsale.referral_write', 'on', true);
  UPDATE public.profiles SET referral_code = code WHERE id = caller.id;
  RETURN code;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_referral_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_referral_code() TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Admin review, reversal and analytics
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_disqualify_referral(
  p_referral_id bigint,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref public.referrals%ROWTYPE;
  admin_id bigint;
  reason text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  reason := btrim(COALESCE(p_reason, ''));
  IF length(reason) < 3 THEN
    RAISE EXCEPTION 'A disqualification reason is required';
  END IF;

  admin_id := public.current_profile_id();
  SELECT * INTO ref FROM public.referrals WHERE id = p_referral_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referral not found';
  END IF;

  IF ref.status = 'REWARDED' THEN
    PERFORM public.referral_reverse_rewards(ref.id, reason);
  END IF;

  PERFORM set_config('goodsale.referral_write', 'on', true);
  UPDATE public.referrals
  SET status = 'DISQUALIFIED',
      disqualified_at = now(),
      disqualification_reason = reason,
      fraud_reviewed_at = now(),
      fraud_reviewed_by = admin_id,
      updated_at = now()
  WHERE id = ref.id;

  INSERT INTO public.referral_events (referral_id, event, actor_id, details)
  VALUES (ref.id, 'ADMIN_DISQUALIFIED', admin_id, reason);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (admin_id, 'REFERRAL_DISQUALIFIED', 'REFERRAL', ref.id, reason);

  INSERT INTO public.notifications (user_id, title, message, type, is_read)
  SELECT r.beneficiary_id, 'Referral disqualified',
         'A referral was disqualified after review: ' || reason, 'REFERRAL', false
  FROM (
    SELECT ref.referrer_id AS beneficiary_id
    UNION
    SELECT ref.referee_id
  ) r;

  RETURN jsonb_build_object('success', true, 'referral_id', ref.id, 'status', 'DISQUALIFIED');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_disqualify_referral(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_disqualify_referral(bigint, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_mark_referral_reviewed(
  p_referral_id bigint,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_id bigint;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  admin_id := public.current_profile_id();

  UPDATE public.referrals
  SET fraud_reviewed_at = now(),
      fraud_reviewed_by = admin_id,
      updated_at = now()
  WHERE id = p_referral_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referral not found';
  END IF;

  INSERT INTO public.referral_events (referral_id, event, actor_id, details)
  VALUES (p_referral_id, 'FRAUD_REVIEWED', admin_id, COALESCE(p_notes, 'Suspicious activity reviewed'));

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (admin_id, 'REFERRAL_FRAUD_REVIEWED', 'REFERRAL', p_referral_id, COALESCE(p_notes, ''));

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_mark_referral_reviewed(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_referral_reviewed(bigint, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_referral_analytics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT jsonb_build_object(
    'registered', count(*) FILTER (WHERE status = 'REGISTERED'),
    'verification_pending', count(*) FILTER (WHERE status = 'VERIFICATION_PENDING'),
    'qualified', count(*) FILTER (WHERE status = 'QUALIFIED'),
    'rewarded', count(*) FILTER (WHERE status = 'REWARDED'),
    'disqualified', count(*) FILTER (WHERE status = 'DISQUALIFIED'),
    'total', count(*),
    'flagged', count(*) FILTER (WHERE cardinality(fraud_flags) > 0),
    'unreviewed_flagged', count(*) FILTER (
      WHERE cardinality(fraud_flags) > 0 AND fraud_reviewed_at IS NULL
    ),
    'coins_issued', COALESCE((
      SELECT sum(amount) FROM public.referral_rewards WHERE status = 'ISSUED'
    ), 0),
    'clicks', (SELECT count(*) FROM public.referral_clicks),
    'clicks_30d', (
      SELECT count(*) FROM public.referral_clicks
      WHERE created_at >= now() - interval '30 days'
    ),
    'registered_30d', count(*) FILTER (WHERE created_at >= now() - interval '30 days')
  )
  INTO result
  FROM public.referrals;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_referral_analytics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_referral_analytics() TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Event-driven evaluation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.referral_evaluate_profile(p_profile_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rid bigint;
BEGIN
  SELECT id INTO rid FROM public.referrals WHERE referee_id = p_profile_id LIMIT 1;
  IF rid IS NULL THEN
    RETURN;
  END IF;
  PERFORM public.referral_evaluate(rid);
EXCEPTION
  WHEN OTHERS THEN
    -- Referral evaluation must never block a real order, listing or onboarding.
    RAISE WARNING 'Referral evaluation failed for profile %: %', p_profile_id, SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.referrals_on_order_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.referral_evaluate_profile(NEW.buyer_id);
    PERFORM public.referral_evaluate_profile(NEW.seller_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_evaluate_referrals ON public.orders;
CREATE TRIGGER orders_evaluate_referrals
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.referrals_on_order_change();

CREATE OR REPLACE FUNCTION public.referrals_on_product_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.referral_evaluate_profile(NEW.seller_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_evaluate_referrals ON public.products;
CREATE TRIGGER products_evaluate_referrals
  AFTER INSERT OR UPDATE OF seller_id, stock_status ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.referrals_on_product_change();

CREATE OR REPLACE FUNCTION public.referrals_on_profile_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.referral_evaluate_profile(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_evaluate_referrals ON public.profiles;
CREATE TRIGGER profiles_evaluate_referrals
  AFTER UPDATE OF onboarding_completed_at, role, verification_status, phone_number ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.referrals_on_profile_change();

COMMIT;
