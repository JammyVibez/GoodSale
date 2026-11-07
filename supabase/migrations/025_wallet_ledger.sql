-- =============================================================================
-- 025: GoodSale wallet ledger, Paystack funding, payouts and finance controls
--
-- Additive only. The existing wallets, wallet_transactions, escrow release,
-- withdrawal and refund tables remain the source of truth. This migration:
--   * gives every wallet transaction a stable reference and audit metadata;
--   * makes completed ledger rows immutable (no DELETE / no financial edits);
--   * adds provider-backed funding intents and wallet settings;
--   * makes withdrawals reserve funds atomically and settle only on provider
--     confirmation;
--   * adds idempotent wallet order payment, wallet refunds and admin
--     adjustments with mandatory reasons.
--
-- It does NOT credit a wallet from the browser, does not simulate provider
-- success, and does not move customer funds into a GoodSale bank account.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Ledger columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS order_id bigint,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_reference text,
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS balance_after numeric,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS affects_balance boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.wallet_transactions
SET reference = 'WTX-LEGACY-' || id
WHERE reference IS NULL;

ALTER TABLE public.wallet_transactions
  ALTER COLUMN reference SET DEFAULT (
    'WTX-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 18))
  );

ALTER TABLE public.wallet_transactions
  ALTER COLUMN reference SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_transactions_reference
  ON public.wallet_transactions(reference);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_transactions_provider_reference
  ON public.wallet_transactions(provider, provider_reference)
  WHERE provider_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_order_id
  ON public.wallet_transactions(order_id);

-- Completed financial rows are append-only. Status may move from PENDING to a
-- final state once; amounts, types, references and descriptions may never be
-- edited. Corrections must be new reversal/adjustment rows.
CREATE OR REPLACE FUNCTION public.protect_wallet_ledger_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Wallet ledger entries cannot be deleted';
  END IF;

  IF NEW.wallet_id IS DISTINCT FROM OLD.wallet_id
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.reference IS DISTINCT FROM OLD.reference
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.provider_reference IS DISTINCT FROM OLD.provider_reference
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.affects_balance IS DISTINCT FROM OLD.affects_balance THEN
    RAISE EXCEPTION 'Completed wallet ledger entries cannot be edited; record a reversal instead';
  END IF;

  IF OLD.status <> 'PENDING' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Only pending ledger entries may change status';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wallet_transactions_append_only ON public.wallet_transactions;
CREATE TRIGGER wallet_transactions_append_only
  BEFORE UPDATE OR DELETE ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.protect_wallet_ledger_row();

-- Balance changes are allowed only inside the audited SECURITY DEFINER
-- functions below. They set a transaction-local flag; direct client updates
-- remain blocked by the original trigger.
CREATE OR REPLACE FUNCTION public.protect_wallet_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('goodsale.wallet_write', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NOT public.is_admin() AND NEW.balance IS DISTINCT FROM OLD.balance THEN
    RAISE EXCEPTION 'Updating wallet balance directly is not allowed';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Withdrawal state and provider references
-- ---------------------------------------------------------------------------
ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount numeric,
  ADD COLUMN IF NOT EXISTS wallet_transaction_id bigint,
  ADD COLUMN IF NOT EXISTS processing_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_reason text;

UPDATE public.withdrawal_requests
SET net_amount = GREATEST(0, amount - COALESCE(fee, 0))
WHERE net_amount IS NULL;

ALTER TABLE public.withdrawal_requests
  ALTER COLUMN request_number SET DEFAULT (
    'WD-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  );

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_wallet_tx
  ON public.withdrawal_requests(wallet_transaction_id);

ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS provider_reference text,
  ADD COLUMN IF NOT EXISTS admin_notes text;

CREATE INDEX IF NOT EXISTS idx_refunds_provider_reference
  ON public.refunds(provider_reference);

-- ---------------------------------------------------------------------------
-- 3. Wallet settings and funding intents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallet_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  funding_min numeric NOT NULL DEFAULT 100,
  funding_max numeric NOT NULL DEFAULT 500000,
  withdrawal_min numeric NOT NULL DEFAULT 1000,
  withdrawal_max numeric NOT NULL DEFAULT 1000000,
  withdrawal_fee numeric NOT NULL DEFAULT 0,
  daily_withdrawal_limit numeric NOT NULL DEFAULT 1000000,
  updated_by bigint REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.wallet_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.wallet_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wallet_settings_read ON public.wallet_settings;
CREATE POLICY wallet_settings_read ON public.wallet_settings
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.wallet_funding_intents (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reference text UNIQUE NOT NULL,
  provider text NOT NULL DEFAULT 'paystack',
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'NGN',
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'ABANDONED')),
  provider_reference text,
  channel text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_wallet_funding_intents_user
  ON public.wallet_funding_intents(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_funding_provider_ref
  ON public.wallet_funding_intents(provider, provider_reference)
  WHERE provider_reference IS NOT NULL;

ALTER TABLE public.wallet_funding_intents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wallet_funding_intents_own_read ON public.wallet_funding_intents;
CREATE POLICY wallet_funding_intents_own_read ON public.wallet_funding_intents
  FOR SELECT TO authenticated
  USING (user_id = public.current_profile_id() OR public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Internal ledger primitives
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_wallet_ledger(
  p_user_id bigint,
  p_amount numeric,
  p_type text,
  p_description text,
  p_order_id bigint DEFAULT NULL,
  p_provider text DEFAULT NULL,
  p_provider_reference text DEFAULT NULL,
  p_affects_balance boolean DEFAULT true,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wid bigint;
  new_balance numeric;
  tx_id bigint;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  INSERT INTO public.wallets (user_id, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id, balance INTO wid, new_balance
  FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;

  IF wid IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  IF p_affects_balance THEN
    PERFORM set_config('goodsale.wallet_write', 'on', true);
    UPDATE public.wallets SET balance = balance + p_amount WHERE id = wid
    RETURNING balance INTO new_balance;
  END IF;

  INSERT INTO public.wallet_transactions (
    wallet_id, amount, type, description, status, order_id, provider,
    provider_reference, balance_after, affects_balance, metadata
  ) VALUES (
    wid, p_amount, p_type, COALESCE(p_description, 'Wallet credit'), 'COMPLETED',
    p_order_id, p_provider, p_provider_reference, new_balance,
    p_affects_balance, COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO tx_id;

  RETURN tx_id;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_wallet_ledger(bigint, numeric, text, text, bigint, text, text, boolean, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_wallet_ledger(bigint, numeric, text, text, bigint, text, text, boolean, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.debit_wallet_ledger(
  p_user_id bigint,
  p_amount numeric,
  p_type text,
  p_description text,
  p_order_id bigint DEFAULT NULL,
  p_provider text DEFAULT NULL,
  p_provider_reference text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wid bigint;
  bal numeric;
  new_balance numeric;
  tx_id bigint;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  SELECT id, balance INTO wid, bal
  FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;

  IF wid IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;
  IF bal < p_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  PERFORM set_config('goodsale.wallet_write', 'on', true);
  UPDATE public.wallets SET balance = balance - p_amount WHERE id = wid
  RETURNING balance INTO new_balance;

  INSERT INTO public.wallet_transactions (
    wallet_id, amount, type, description, status, order_id, provider,
    provider_reference, balance_after
  ) VALUES (
    wid, -p_amount, p_type, COALESCE(p_description, 'Wallet debit'), 'COMPLETED',
    p_order_id, p_provider, p_provider_reference, new_balance
  )
  RETURNING id INTO tx_id;

  RETURN tx_id;
END;
$$;

REVOKE ALL ON FUNCTION public.debit_wallet_ledger(bigint, numeric, text, text, bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.debit_wallet_ledger(bigint, numeric, text, text, bigint, text, text) TO service_role;

-- Keep the original helper signature working, but route it through the ledger.
CREATE OR REPLACE FUNCTION public.credit_wallet(
  p_user_id bigint,
  p_amount numeric,
  p_description text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount <= 0 THEN
    RETURN;
  END IF;
  PERFORM public.credit_wallet_ledger(
    p_user_id, p_amount, 'CREDIT_SALE', COALESCE(p_description, 'Escrow release')
  );
END;
$$;

-- Keep the old debit helper working for legacy callers.
CREATE OR REPLACE FUNCTION public.debit_wallet(
  p_user_id bigint,
  p_amount numeric,
  p_description text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.debit_wallet_ledger(
    p_user_id, p_amount, 'DEBIT_WITHDRAWAL', COALESCE(p_description, 'Withdrawal')
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Withdrawal lifecycle — reserve first, pay out only after provider result
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_amount numeric,
  p_bank_name text,
  p_account_name text,
  p_account_number text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller bigint;
  settings public.wallet_settings%ROWTYPE;
  wid bigint;
  bal numeric;
  new_balance numeric;
  tx_id bigint;
  req_id bigint;
  net numeric;
  today_total numeric;
BEGIN
  caller := public.current_profile_id();
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = caller AND is_suspended) THEN
    RAISE EXCEPTION 'This account is suspended and cannot withdraw';
  END IF;

  IF p_amount IS NULL OR p_amount <> round(p_amount, 2) OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Enter a valid withdrawal amount';
  END IF;

  SELECT * INTO settings FROM public.wallet_settings WHERE id = 1;
  IF NOT FOUND THEN
    settings.funding_min := 100;
    settings.funding_max := 500000;
    settings.withdrawal_min := 1000;
    settings.withdrawal_max := 1000000;
    settings.withdrawal_fee := 0;
    settings.daily_withdrawal_limit := 1000000;
  END IF;

  IF p_amount < settings.withdrawal_min THEN
    RAISE EXCEPTION 'Minimum withdrawal is ₦%', round(settings.withdrawal_min);
  END IF;
  IF p_amount > settings.withdrawal_max THEN
    RAISE EXCEPTION 'Maximum withdrawal is ₦%', round(settings.withdrawal_max);
  END IF;
  IF COALESCE(settings.withdrawal_fee, 0) >= p_amount THEN
    RAISE EXCEPTION 'Withdrawal fee must be lower than the amount';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.withdrawal_requests
    WHERE user_id = caller AND status IN ('PENDING', 'PROCESSING')
  ) THEN
    RAISE EXCEPTION 'You already have a withdrawal in progress';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO today_total
  FROM public.withdrawal_requests
  WHERE user_id = caller
    AND created_at >= date_trunc('day', now())
    AND status NOT IN ('REJECTED', 'FAILED', 'CANCELLED');

  IF today_total + p_amount > settings.daily_withdrawal_limit THEN
    RAISE EXCEPTION 'This exceeds your daily withdrawal limit of ₦%', round(settings.daily_withdrawal_limit);
  END IF;

  INSERT INTO public.wallets (user_id, balance)
  VALUES (caller, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id, balance INTO wid, bal
  FROM public.wallets WHERE user_id = caller FOR UPDATE;

  IF bal < p_amount THEN
    RAISE EXCEPTION 'Insufficient available balance';
  END IF;

  net := p_amount - COALESCE(settings.withdrawal_fee, 0);

  PERFORM set_config('goodsale.wallet_write', 'on', true);
  UPDATE public.wallets SET balance = balance - p_amount WHERE id = wid
  RETURNING balance INTO new_balance;

  INSERT INTO public.wallet_transactions (
    wallet_id, amount, type, description, status, balance_after
  ) VALUES (
    wid, -p_amount, 'DEBIT_WITHDRAWAL',
    'Withdrawal to ' || p_bank_name || ' ' || right(p_account_number, 4),
    'PENDING', new_balance
  )
  RETURNING id INTO tx_id;

  INSERT INTO public.withdrawal_requests (
    user_id, amount, fee, net_amount, bank_name, account_name, account_number,
    wallet_transaction_id, status
  ) VALUES (
    caller, p_amount, COALESCE(settings.withdrawal_fee, 0), net,
    p_bank_name, p_account_name, p_account_number, tx_id, 'PENDING'
  )
  RETURNING id INTO req_id;

  UPDATE public.wallets
  SET bank_name = p_bank_name,
      bank_account_name = p_account_name,
      bank_account_number = p_account_number,
      updated_at = now()
  WHERE id = wid;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    caller, 'WITHDRAWAL_REQUESTED', 'WITHDRAWAL', req_id,
    'Requested ₦' || round(p_amount)::text || ' to ' || p_bank_name
  );

  INSERT INTO public.notifications (user_id, title, message, type, is_read)
  VALUES (
    caller, 'Withdrawal requested',
    'Your ₦' || round(p_amount)::text || ' payout request is queued for review. It is not complete until Paystack confirms the transfer.',
    'WALLET', false
  );

  RETURN jsonb_build_object(
    'success', true, 'withdrawal_id', req_id, 'transaction_id', tx_id,
    'amount', p_amount, 'fee', COALESCE(settings.withdrawal_fee, 0),
    'net_amount', net, 'status', 'PENDING'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_withdrawal(numeric, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_payout_begin(p_withdrawal_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w public.withdrawal_requests%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO w FROM public.withdrawal_requests
  WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal not found';
  END IF;
  IF w.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Withdrawal is % and cannot be started again', w.status;
  END IF;

  UPDATE public.withdrawal_requests
  SET status = 'PROCESSING', processing_at = now(), updated_at = now()
  WHERE id = p_withdrawal_id;

  UPDATE public.wallet_transactions
  SET status = 'PENDING'
  WHERE id = w.wallet_transaction_id AND status = 'PENDING';

  RETURN jsonb_build_object('success', true, 'withdrawal_id', p_withdrawal_id, 'status', 'PROCESSING');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_payout_begin(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_payout_begin(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_payout_processing(
  p_withdrawal_id bigint,
  p_transfer_code text,
  p_provider_reference text,
  p_notes text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w public.withdrawal_requests%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO w FROM public.withdrawal_requests
  WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal not found';
  END IF;
  IF w.status <> 'PROCESSING' THEN
    RAISE EXCEPTION 'Withdrawal is not in processing state';
  END IF;

  UPDATE public.withdrawal_requests
  SET paystack_transfer_code = COALESCE(p_transfer_code, paystack_transfer_code),
      paystack_reference = COALESCE(p_provider_reference, paystack_reference),
      admin_notes = COALESCE(NULLIF(p_notes, ''), admin_notes),
      updated_at = now()
  WHERE id = p_withdrawal_id;

  RETURN jsonb_build_object('success', true, 'withdrawal_id', p_withdrawal_id, 'status', 'PROCESSING');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_payout_processing(bigint, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_payout_processing(bigint, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_payout_complete(
  p_withdrawal_id bigint,
  p_provider_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w public.withdrawal_requests%ROWTYPE;
BEGIN
  IF NOT (public.is_admin() OR public.is_service_role()) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO w FROM public.withdrawal_requests
  WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal not found';
  END IF;

  IF w.status = 'SUCCESS' THEN
    RETURN jsonb_build_object('success', true, 'already_completed', true);
  END IF;
  IF w.status <> 'PROCESSING' THEN
    RAISE EXCEPTION 'Withdrawal is % and cannot be completed', w.status;
  END IF;

  UPDATE public.withdrawal_requests
  SET status = 'SUCCESS',
      paystack_reference = COALESCE(p_provider_reference, paystack_reference),
      completed_at = now(),
      updated_at = now()
  WHERE id = p_withdrawal_id;

  UPDATE public.wallet_transactions
  SET status = 'COMPLETED'
  WHERE id = w.wallet_transaction_id AND status = 'PENDING';

  IF COALESCE(w.fee, 0) > 0 THEN
    PERFORM public.credit_wallet_ledger(
      w.user_id, w.fee, 'MARKETPLACE_COMMISSION',
      'Withdrawal fee for payout #' || w.id::text,
      NULL, 'goodsale', 'WITHDRAWAL-FEE-' || w.id::text, false
    );
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, is_read)
  VALUES (
    w.user_id, 'Payout confirmed',
    'Paystack confirmed your ₦' || round(w.amount)::text || ' payout to ' || w.bank_name || '.',
    'WALLET', false
  );

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    w.user_id, 'WITHDRAWAL_PROVIDER_CONFIRMED', 'WITHDRAWAL', p_withdrawal_id,
    'Provider reference: ' || COALESCE(p_provider_reference, w.paystack_reference, '—')
  );

  RETURN jsonb_build_object('success', true, 'withdrawal_id', p_withdrawal_id, 'status', 'SUCCESS');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_payout_complete(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_payout_complete(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_payout_complete(bigint, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_payout_fail(
  p_withdrawal_id bigint,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w public.withdrawal_requests%ROWTYPE;
  wid bigint;
  new_balance numeric;
  reversal_id bigint;
BEGIN
  IF NOT (public.is_admin() OR public.is_service_role()) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO w FROM public.withdrawal_requests
  WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal not found';
  END IF;

  IF w.status = 'FAILED' OR w.status = 'CANCELLED' THEN
    RETURN jsonb_build_object('success', true, 'already_failed', true);
  END IF;
  IF w.status = 'SUCCESS' THEN
    RAISE EXCEPTION 'A confirmed payout cannot be failed';
  END IF;
  IF COALESCE(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A failure reason is required';
  END IF;

  UPDATE public.withdrawal_requests
  SET status = 'FAILED',
      failed_reason = p_reason,
      completed_at = now(),
      updated_at = now()
  WHERE id = p_withdrawal_id;

  UPDATE public.wallet_transactions
  SET status = 'FAILED'
  WHERE id = w.wallet_transaction_id AND status = 'PENDING';

  SELECT id, balance INTO wid, new_balance
  FROM public.wallets WHERE user_id = w.user_id FOR UPDATE;

  PERFORM set_config('goodsale.wallet_write', 'on', true);
  UPDATE public.wallets SET balance = balance + w.amount WHERE id = wid
  RETURNING balance INTO new_balance;

  INSERT INTO public.wallet_transactions (
    wallet_id, amount, type, description, status, balance_after, metadata
  ) VALUES (
    wid, w.amount, 'WITHDRAWAL_REVERSAL',
    'Payout failed — funds returned',
    'COMPLETED', new_balance,
    jsonb_build_object('withdrawal_id', p_withdrawal_id, 'reason', p_reason)
  )
  RETURNING id INTO reversal_id;

  INSERT INTO public.notifications (user_id, title, message, type, is_read)
  VALUES (
    w.user_id, 'Payout failed — funds returned',
    'Your ₦' || round(w.amount)::text || ' withdrawal could not be completed. The funds are back in your available balance. Reason: ' || p_reason,
    'WALLET', false
  );

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    w.user_id, 'WITHDRAWAL_FAILED_REVERSED', 'WITHDRAWAL', p_withdrawal_id,
    p_reason || ' · reversal ledger #' || reversal_id
  );

  RETURN jsonb_build_object(
    'success', true, 'withdrawal_id', p_withdrawal_id,
    'status', 'FAILED', 'reversal_id', reversal_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_payout_fail(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_payout_fail(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_payout_fail(bigint, text) TO service_role;

-- Legacy admin RPC: approval now means "processing", never a silent success.
CREATE OR REPLACE FUNCTION public.admin_process_withdrawal(
  p_withdrawal_id bigint,
  p_approve boolean,
  p_notes text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_approve THEN
    RETURN public.admin_payout_begin(p_withdrawal_id);
  END IF;
  RETURN public.admin_payout_fail(p_withdrawal_id, COALESCE(NULLIF(p_notes, ''), 'Rejected by admin'));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_process_withdrawal(bigint, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_process_withdrawal(bigint, boolean, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Paystack funding — credit only after server/provider confirmation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_service_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) = 'service_role';
$$;

CREATE OR REPLACE FUNCTION public.credit_wallet_funding(
  p_funding_id bigint,
  p_provider_reference text,
  p_channel text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f public.wallet_funding_intents%ROWTYPE;
  wid bigint;
  new_balance numeric;
  tx_id bigint;
BEGIN
  SELECT * INTO f FROM public.wallet_funding_intents
  WHERE id = p_funding_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Funding intent not found';
  END IF;

  IF f.status = 'SUCCESS' THEN
    RETURN jsonb_build_object('success', true, 'already_credited', true, 'funding_id', f.id);
  END IF;
  IF f.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Funding intent is %', f.status;
  END IF;
  IF COALESCE(trim(p_provider_reference), '') = '' THEN
    RAISE EXCEPTION 'Provider reference required';
  END IF;

  INSERT INTO public.wallets (user_id, balance)
  VALUES (f.user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id, balance INTO wid, new_balance
  FROM public.wallets WHERE user_id = f.user_id FOR UPDATE;

  PERFORM set_config('goodsale.wallet_write', 'on', true);
  UPDATE public.wallets SET balance = balance + f.amount WHERE id = wid
  RETURNING balance INTO new_balance;

  INSERT INTO public.wallet_transactions (
    wallet_id, amount, type, description, status, provider, provider_reference,
    channel, balance_after, metadata
  ) VALUES (
    wid, f.amount, 'WALLET_FUNDING', 'Wallet funded via Paystack',
    'COMPLETED', 'paystack', p_provider_reference, p_channel, new_balance,
    jsonb_build_object('funding_id', f.id, 'funding_reference', f.reference)
  )
  RETURNING id INTO tx_id;

  UPDATE public.wallet_funding_intents
  SET status = 'SUCCESS',
      provider_reference = p_provider_reference,
      channel = p_channel,
      completed_at = now()
  WHERE id = f.id;

  INSERT INTO public.notifications (user_id, title, message, type, is_read)
  VALUES (
    f.user_id, 'Wallet funded',
    '₦' || round(f.amount)::text || ' was added to your GoodSale wallet after Paystack confirmed the payment.',
    'WALLET', false
  );

  RETURN jsonb_build_object(
    'success', true, 'funding_id', f.id, 'transaction_id', tx_id,
    'amount', f.amount, 'balance_after', new_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.credit_wallet_funding(bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_wallet_funding(bigint, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Wallet checkout for eligible pending orders
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_order_with_wallet(p_order_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
  caller bigint;
  wid bigint;
  bal numeric;
  new_balance numeric;
  tx_id bigint;
  ledger_ref text;
BEGIN
  caller := public.current_profile_id();
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF o.buyer_id <> caller THEN
    RAISE EXCEPTION 'Only the buyer can pay for this order';
  END IF;
  IF o.status IN ('PAID_ESCROW', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED_SUCCESS') THEN
    RETURN jsonb_build_object('success', true, 'already_paid', true, 'order_id', o.id);
  END IF;
  IF o.status NOT IN ('PENDING', 'PENDING_BANK_TRANSFER', 'INVOICE_SENT') THEN
    RAISE EXCEPTION 'This order cannot be paid with wallet balance';
  END IF;

  ledger_ref := 'ORDER-WALLET-' || o.id;

  IF EXISTS (
    SELECT 1 FROM public.wallet_transactions
    WHERE provider = 'goodsale' AND provider_reference = ledger_ref
  ) THEN
    RETURN jsonb_build_object('success', true, 'already_paid', true, 'order_id', o.id);
  END IF;

  SELECT id, balance INTO wid, bal
  FROM public.wallets WHERE user_id = caller FOR UPDATE;
  IF wid IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;
  IF bal < o.total_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  PERFORM set_config('goodsale.wallet_write', 'on', true);
  UPDATE public.wallets SET balance = balance - o.total_amount WHERE id = wid
  RETURNING balance INTO new_balance;

  INSERT INTO public.wallet_transactions (
    wallet_id, amount, type, description, status, order_id, provider,
    provider_reference, balance_after
  ) VALUES (
    wid, -o.total_amount, 'ORDER_PAYMENT',
    'Order ' || o.order_number || ' paid from wallet',
    'COMPLETED', o.id, 'goodsale', ledger_ref, new_balance
  )
  RETURNING id INTO tx_id;

  UPDATE public.orders
  SET status = 'PAID_ESCROW', payment_method = 'WALLET', updated_at = now()
  WHERE id = o.id;

  INSERT INTO public.payment_transactions (
    transaction_id, order_id, order_number, buyer_id, seller_id, amount,
    payment_method, status, purpose
  ) VALUES (
    'WALLET-' || o.order_number || '-' || tx_id, o.id, o.order_number,
    o.buyer_id, o.seller_id, o.total_amount, 'WALLET', 'SUCCESS', 'ORDER_PAYMENT'
  )
  ON CONFLICT (transaction_id) DO NOTHING;

  INSERT INTO public.escrows (order_id, held_amount, is_released, is_refunded)
  VALUES (o.id, o.total_amount, false, false)
  ON CONFLICT (order_id) DO UPDATE
  SET held_amount = EXCLUDED.held_amount
  WHERE public.escrows.is_released = false AND public.escrows.is_refunded = false;

  INSERT INTO public.notifications (user_id, title, message, type, is_read)
  VALUES
    (o.buyer_id, 'Order paid from wallet',
     'Order ' || o.order_number || ' is now protected by escrow. ₦' || round(o.total_amount)::text || ' was deducted from your wallet.',
     'WALLET', false),
    (o.seller_id, 'Buyer paid for ' || o.order_number,
     'Wallet payment is secured in escrow. Prepare the order for dispatch.',
     'ORDER', false);

  RETURN jsonb_build_object(
    'success', true, 'order_id', o.id, 'transaction_id', tx_id,
    'amount', o.total_amount, 'balance_after', new_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pay_order_with_wallet(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pay_order_with_wallet(bigint) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Refund to wallet (admin, idempotent)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_refund_to_wallet(
  p_refund_id bigint,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.refunds%ROWTYPE;
  o public.orders%ROWTYPE;
  ledger_ref text;
  tx_id bigint;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF COALESCE(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A refund reason is required';
  END IF;

  SELECT * INTO r FROM public.refunds WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Refund not found';
  END IF;

  IF r.status = 'COMPLETED' THEN
    RETURN jsonb_build_object('success', true, 'already_completed', true, 'refund_id', r.id);
  END IF;
  IF r.status NOT IN ('PENDING', 'APPROVED', 'PROCESSING') THEN
    RAISE EXCEPTION 'Refund is % and cannot be approved', r.status;
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = r.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  ledger_ref := 'REFUND-WALLET-' || r.id;

  IF EXISTS (
    SELECT 1 FROM public.wallet_transactions
    WHERE provider = 'goodsale' AND provider_reference = ledger_ref
  ) THEN
    RETURN jsonb_build_object('success', true, 'already_completed', true, 'refund_id', r.id);
  END IF;

  tx_id := public.credit_wallet_ledger(
    o.buyer_id, r.amount, 'REFUND',
    'Refund for ' || o.order_number || ': ' || p_reason,
    o.id, 'goodsale', ledger_ref, true,
    jsonb_build_object('refund_id', r.id, 'refund_number', r.refund_number)
  );

  UPDATE public.refunds
  SET status = 'COMPLETED', reason = COALESCE(NULLIF(reason, ''), p_reason),
      transaction_id = COALESCE(NULLIF(transaction_id, ''), ledger_ref)
  WHERE id = r.id;

  UPDATE public.orders SET status = 'REFUNDED', updated_at = now() WHERE id = o.id;
  UPDATE public.escrows
  SET is_refunded = true, is_released = false, updated_at = now()
  WHERE order_id = o.id;
  UPDATE public.payment_transactions
  SET status = 'REFUNDED'
  WHERE order_id = o.id AND status = 'SUCCESS';

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    o.buyer_id, 'REFUND_CREDITED_TO_WALLET', 'REFUND', r.id,
    p_reason || ' · ledger #' || tx_id
  );

  INSERT INTO public.notifications (user_id, title, message, type, is_read)
  VALUES (
    o.buyer_id, 'Refund added to wallet',
    '₦' || round(r.amount)::text || ' for ' || o.order_number || ' is now available in your GoodSale wallet.',
    'WALLET', false
  );

  RETURN jsonb_build_object(
    'success', true, 'refund_id', r.id, 'transaction_id', tx_id,
    'amount', r.amount, 'status', 'COMPLETED'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_refund_to_wallet(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_refund_to_wallet(bigint, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. Admin adjustments and wallet settings
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_adjust_wallet(
  p_user_id bigint,
  p_amount numeric,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_id bigint;
  wid bigint;
  bal numeric;
  new_balance numeric;
  tx_id bigint;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF p_amount IS NULL OR p_amount = 0 THEN
    RAISE EXCEPTION 'Adjustment amount cannot be zero';
  END IF;
  IF length(COALESCE(trim(p_reason), '')) < 10 THEN
    RAISE EXCEPTION 'A reason of at least 10 characters is required';
  END IF;

  admin_id := public.current_profile_id();

  INSERT INTO public.wallets (user_id, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id, balance INTO wid, bal
  FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;

  IF p_amount < 0 AND bal < abs(p_amount) THEN
    RAISE EXCEPTION 'Adjustment would overdraw the wallet';
  END IF;

  PERFORM set_config('goodsale.wallet_write', 'on', true);
  UPDATE public.wallets SET balance = balance + p_amount WHERE id = wid
  RETURNING balance INTO new_balance;

  INSERT INTO public.wallet_transactions (
    wallet_id, amount, type, description, status, balance_after, metadata
  ) VALUES (
    wid, p_amount, 'ADJUSTMENT',
    'Admin adjustment: ' || trim(p_reason),
    'COMPLETED', new_balance,
    jsonb_build_object('admin_id', admin_id, 'reason', trim(p_reason))
  )
  RETURNING id INTO tx_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    admin_id, 'WALLET_ADJUSTMENT', 'WALLET', wid,
    'User ' || p_user_id || ' · ₦' || round(p_amount)::text || ' · ' || trim(p_reason) || ' · ledger #' || tx_id
  );

  INSERT INTO public.notifications (user_id, title, message, type, is_read)
  VALUES (
    p_user_id, 'Wallet adjustment',
    'An authorised GoodSale adjustment of ₦' || round(abs(p_amount))::text || ' was applied to your wallet.',
    'WALLET', false
  );

  RETURN jsonb_build_object(
    'success', true, 'transaction_id', tx_id, 'balance_after', new_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_wallet(bigint, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_adjust_wallet(bigint, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_finance_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_service_role()) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  RETURN jsonb_build_object(
    'wallet_liabilities', (SELECT COALESCE(SUM(balance), 0) FROM public.wallets),
    'wallet_count', (SELECT COUNT(*) FROM public.wallets),
    'escrow_held', (
      SELECT COALESCE(SUM(held_amount), 0) FROM public.escrows
      WHERE NOT is_released AND NOT is_refunded
    ),
    'escrow_count', (
      SELECT COUNT(*) FROM public.escrows WHERE NOT is_released AND NOT is_refunded
    ),
    'pending_withdrawals', (
      SELECT COALESCE(SUM(amount), 0) FROM public.withdrawal_requests WHERE status = 'PENDING'
    ),
    'processing_withdrawals', (
      SELECT COALESCE(SUM(amount), 0) FROM public.withdrawal_requests WHERE status = 'PROCESSING'
    ),
    'successful_withdrawals', (
      SELECT COALESCE(SUM(amount), 0) FROM public.withdrawal_requests WHERE status = 'SUCCESS'
    ),
    'funding_total', (
      SELECT COALESCE(SUM(amount), 0) FROM public.wallet_transactions
      WHERE type = 'WALLET_FUNDING' AND status = 'COMPLETED'
    ),
    'order_payment_total', (
      SELECT COALESCE(SUM(abs(amount)), 0) FROM public.wallet_transactions
      WHERE type = 'ORDER_PAYMENT' AND status = 'COMPLETED'
    ),
    'refund_total', (
      SELECT COALESCE(SUM(amount), 0) FROM public.wallet_transactions
      WHERE type = 'REFUND' AND status = 'COMPLETED'
    ),
    'commission_total', (
      SELECT COALESCE(SUM(amount), 0) FROM public.wallet_transactions
      WHERE type = 'MARKETPLACE_COMMISSION' AND status = 'COMPLETED'
    ),
    'pending_refunds', (
      SELECT COUNT(*) FROM public.refunds WHERE status IN ('PENDING', 'APPROVED', 'PROCESSING')
    ),
    'ledger_count', (SELECT COUNT(*) FROM public.wallet_transactions)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_finance_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_finance_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_finance_summary() TO service_role;

CREATE OR REPLACE FUNCTION public.admin_update_wallet_settings(
  p_funding_min numeric,
  p_funding_max numeric,
  p_withdrawal_min numeric,
  p_withdrawal_max numeric,
  p_withdrawal_fee numeric,
  p_daily_withdrawal_limit numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF p_funding_min < 0 OR p_funding_max < p_funding_min THEN
    RAISE EXCEPTION 'Invalid funding limits';
  END IF;
  IF p_withdrawal_min < 0 OR p_withdrawal_max < p_withdrawal_min THEN
    RAISE EXCEPTION 'Invalid withdrawal limits';
  END IF;
  IF p_withdrawal_fee < 0 OR p_daily_withdrawal_limit < p_withdrawal_min THEN
    RAISE EXCEPTION 'Invalid fee or daily limit';
  END IF;

  UPDATE public.wallet_settings
  SET funding_min = p_funding_min,
      funding_max = p_funding_max,
      withdrawal_min = p_withdrawal_min,
      withdrawal_max = p_withdrawal_max,
      withdrawal_fee = p_withdrawal_fee,
      daily_withdrawal_limit = p_daily_withdrawal_limit,
      updated_by = public.current_profile_id(),
      updated_at = now()
  WHERE id = 1;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    public.current_profile_id(), 'WALLET_SETTINGS_UPDATED', 'WALLET_SETTINGS', 1,
    'Funding ₦' || round(p_funding_min)::text || '–₦' || round(p_funding_max)::text ||
    ' · Withdrawal ₦' || round(p_withdrawal_min)::text || '–₦' || round(p_withdrawal_max)::text ||
    ' · fee ₦' || round(p_withdrawal_fee)::text ||
    ' · daily ₦' || round(p_daily_withdrawal_limit)::text
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_wallet_settings(numeric, numeric, numeric, numeric, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_wallet_settings(numeric, numeric, numeric, numeric, numeric, numeric) TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. Escrow release now records seller earnings and commission separately
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_escrow_with_pin(p_order_id bigint, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
  e public.escrows%ROWTYPE;
  caller bigint;
  fee numeric := 0;
  payout numeric := 0;
  fee_pct numeric := 1.5;
  fee_min numeric := 100;
  fee_max numeric := 15000;
BEGIN
  caller := public.current_profile_id();
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF o.buyer_id <> caller AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only the buyer can release escrow';
  END IF;

  IF o.status = 'DISPUTED' THEN
    RAISE EXCEPTION 'Order is disputed; escrow is frozen';
  END IF;

  IF o.status NOT IN ('PAID_ESCROW', 'SHIPPED', 'OUT_FOR_DELIVERY') THEN
    RAISE EXCEPTION 'Order is not eligible for escrow release';
  END IF;

  IF o.delivery_pin IS DISTINCT FROM p_pin THEN
    RAISE EXCEPTION 'Incorrect delivery PIN';
  END IF;

  SELECT * INTO e FROM public.escrows WHERE order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Escrow not found';
  END IF;

  IF e.is_released THEN
    RETURN jsonb_build_object('success', true, 'already_released', true);
  END IF;
  IF e.is_refunded THEN
    RAISE EXCEPTION 'Escrow was refunded';
  END IF;

  SELECT escrow_percentage_fee, escrow_min_fee, escrow_max_fee
    INTO fee_pct, fee_min, fee_max
  FROM public.revenue_settings
  ORDER BY id ASC
  LIMIT 1;

  fee := GREATEST(
    COALESCE(fee_min, 100),
    LEAST(COALESCE(fee_max, 15000), e.held_amount * (COALESCE(fee_pct, 1.5) / 100.0))
  );
  payout := GREATEST(0, e.held_amount - COALESCE(o.delivery_fee, 0) - fee);

  UPDATE public.orders
  SET status = 'DELIVERED_SUCCESS', updated_at = now()
  WHERE id = p_order_id;

  UPDATE public.escrows
  SET is_released = true, updated_at = now()
  WHERE order_id = p_order_id;

  IF payout > 0 THEN
    PERFORM public.credit_wallet_ledger(
      o.seller_id, payout, 'SELLER_EARNINGS',
      'Escrow release for ' || o.order_number,
      o.id, 'goodsale', 'ESCROW-SELLER-' || o.id::text, true
    );
  END IF;

  IF fee > 0 THEN
    PERFORM public.credit_wallet_ledger(
      o.seller_id, fee, 'MARKETPLACE_COMMISSION',
      'Marketplace commission for ' || o.order_number,
      o.id, 'goodsale', 'ESCROW-FEE-' || o.id::text, false
    );
  END IF;

  UPDATE public.delivery_jobs
  SET status = 'COMPLETED', updated_at = now()
  WHERE order_id = p_order_id AND status <> 'COMPLETED';

  INSERT INTO public.notifications (user_id, title, message, type, is_read)
  VALUES
    (o.seller_id, 'Escrow Released', 'Buyer confirmed delivery for ' || o.order_number || '. ₦' || round(payout)::text || ' credited.', 'ESCROW', false),
    (o.buyer_id, 'Delivery Confirmed', 'You confirmed ' || o.order_number || '. Escrow released to seller.', 'ESCROW', false);

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'released_amount', payout,
    'platform_fee', fee
  );
END;
$$;

REVOKE ALL ON FUNCTION public.release_escrow_with_pin(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_escrow_with_pin(bigint, text) TO authenticated;

COMMIT;
