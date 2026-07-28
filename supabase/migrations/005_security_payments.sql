-- =============================================================================
-- 005: Payment / escrow security + disputes, refunds, withdrawals
-- Run AFTER 002_production_hardening.sql
-- =============================================================================

-- ----- Lock dangerous SECURITY DEFINER RPCs (service_role only) -----
REVOKE ALL ON FUNCTION public.credit_wallet(bigint, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.credit_wallet(bigint, numeric, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_wallet(bigint, numeric, text) TO service_role;

REVOKE ALL ON FUNCTION public.mark_order_paid_by_reference(bigint, text, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_order_paid_by_reference(bigint, text, bigint, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_paid_by_reference(bigint, text, bigint, text) TO service_role;

-- Harden mark_order_paid: idempotent if already paid; block terminal states
CREATE OR REPLACE FUNCTION public.mark_order_paid_by_reference(
  p_order_id bigint,
  p_reference text,
  p_amount_kobo bigint,
  p_channel text DEFAULT 'card'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF o.status IN ('DELIVERED_SUCCESS', 'REFUNDED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Order is in a terminal state (%)', o.status;
  END IF;

  IF o.status IN ('PAID_ESCROW', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DISPUTED') THEN
    INSERT INTO public.payment_transactions (
      transaction_id, order_id, order_number, buyer_id, seller_id, amount, payment_method, status, purpose
    ) VALUES (
      p_reference, o.id, o.order_number, o.buyer_id, o.seller_id, o.total_amount,
      COALESCE(NULLIF(p_channel, ''), o.payment_method), 'SUCCESS', 'ORDER_PAYMENT'
    )
    ON CONFLICT (transaction_id) DO NOTHING;

    RETURN jsonb_build_object('success', true, 'order_id', o.id, 'already_paid', true, 'reference', p_reference);
  END IF;

  IF o.status NOT IN ('PENDING', 'PENDING_BANK_TRANSFER', 'PARTIAL_DEPOSIT_PAID', 'INVOICE_SENT', 'COD_PENDING') THEN
    RAISE EXCEPTION 'Order status % cannot be marked paid', o.status;
  END IF;

  IF p_amount_kobo IS NOT NULL AND p_amount_kobo > 0 THEN
    IF abs(round(o.total_amount * 100) - p_amount_kobo) > 100 THEN
      RAISE EXCEPTION 'Amount mismatch';
    END IF;
  END IF;

  UPDATE public.orders
  SET status = 'PAID_ESCROW',
      payment_method = COALESCE(NULLIF(p_channel, ''), payment_method),
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.payment_transactions (
    transaction_id, order_id, order_number, buyer_id, seller_id, amount, payment_method, status, purpose
  ) VALUES (
    p_reference, o.id, o.order_number, o.buyer_id, o.seller_id, o.total_amount,
    COALESCE(NULLIF(p_channel, ''), o.payment_method), 'SUCCESS', 'ORDER_PAYMENT'
  )
  ON CONFLICT (transaction_id) DO NOTHING;

  INSERT INTO public.escrows (order_id, held_amount, is_released, is_refunded)
  VALUES (o.id, o.total_amount, false, false)
  ON CONFLICT (order_id) DO UPDATE
  SET held_amount = EXCLUDED.held_amount
  WHERE public.escrows.is_released = false AND public.escrows.is_refunded = false;

  INSERT INTO public.notifications (user_id, title, message, type, is_read)
  VALUES
    (o.buyer_id, 'Escrow Secured', 'Payment verified for ' || o.order_number || '. Funds locked in escrow.', 'ORDER', false),
    (o.seller_id, 'Escrow Payment Received', 'Buyer paid for ' || o.order_number || '. Prepare shipment.', 'ORDER', false);

  RETURN jsonb_build_object('success', true, 'order_id', o.id, 'reference', p_reference);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_order_paid_by_reference(bigint, text, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_order_paid_by_reference(bigint, text, bigint, text) TO service_role;

-- Escrow release: block disputes; deduct platform fee from seller credit
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

  fee := GREATEST(COALESCE(fee_min, 100), LEAST(COALESCE(fee_max, 15000), e.held_amount * (COALESCE(fee_pct, 1.5) / 100.0)));
  payout := GREATEST(0, e.held_amount - COALESCE(o.delivery_fee, 0) - fee);

  UPDATE public.orders
  SET status = 'DELIVERED_SUCCESS', updated_at = now()
  WHERE id = p_order_id;

  UPDATE public.escrows
  SET is_released = true, updated_at = now()
  WHERE order_id = p_order_id;

  PERFORM public.credit_wallet(o.seller_id, payout, 'Escrow release for ' || o.order_number || ' (fee ₦' || round(fee)::text || ')');

  -- Credit courier earnings if a completed/active job exists
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

-- Courier completes job with buyer delivery PIN → escrow release + courier credit
CREATE OR REPLACE FUNCTION public.complete_delivery_job_with_pin(p_job_id bigint, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j public.delivery_jobs%ROWTYPE;
  o public.orders%ROWTYPE;
  partner public.delivery_partners%ROWTYPE;
  caller bigint;
  release_result jsonb;
BEGIN
  caller := public.current_profile_id();
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO j FROM public.delivery_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery job not found';
  END IF;

  IF j.partner_id IS NULL THEN
    RAISE EXCEPTION 'Job has no assigned partner';
  END IF;

  SELECT * INTO partner FROM public.delivery_partners WHERE id = j.partner_id;
  IF partner.user_id <> caller AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only the assigned courier can complete this job';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = j.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF o.delivery_pin IS DISTINCT FROM p_pin AND j.pin IS DISTINCT FROM p_pin THEN
    RAISE EXCEPTION 'Incorrect delivery PIN';
  END IF;

  IF o.status = 'DISPUTED' THEN
    RAISE EXCEPTION 'Order is disputed; escrow is frozen';
  END IF;

  -- Release escrow as admin path via internal update + credit (buyer PIN verified by courier)
  IF o.status IN ('PAID_ESCROW', 'SHIPPED', 'OUT_FOR_DELIVERY') THEN
    -- Temporarily allow release by calling logic inline for courier-assisted confirmation
    PERFORM set_config('request.jwt.claim.sub', '', true); -- no-op placeholder
  END IF;

  -- Credit courier first
  IF j.courier_earnings > 0 THEN
    PERFORM public.credit_wallet(partner.user_id, j.courier_earnings, 'Delivery earnings job #' || j.id::text);
  END IF;

  UPDATE public.delivery_partners
  SET active_deliveries_count = GREATEST(0, active_deliveries_count - 1),
      completed_deliveries = completed_deliveries + 1,
      updated_at = now()
  WHERE id = partner.id;

  UPDATE public.delivery_jobs
  SET status = 'COMPLETED', updated_at = now()
  WHERE id = p_job_id;

  -- Release seller escrow (same fee rules) if not yet released
  DECLARE
    e public.escrows%ROWTYPE;
    fee numeric := 0;
    payout numeric := 0;
    fee_pct numeric := 1.5;
    fee_min numeric := 100;
    fee_max numeric := 15000;
  BEGIN
    SELECT * INTO e FROM public.escrows WHERE order_id = o.id FOR UPDATE;
    IF FOUND AND NOT e.is_released AND NOT e.is_refunded THEN
      SELECT escrow_percentage_fee, escrow_min_fee, escrow_max_fee
        INTO fee_pct, fee_min, fee_max
      FROM public.revenue_settings ORDER BY id ASC LIMIT 1;

      fee := GREATEST(COALESCE(fee_min, 100), LEAST(COALESCE(fee_max, 15000), e.held_amount * (COALESCE(fee_pct, 1.5) / 100.0)));
      payout := GREATEST(0, e.held_amount - COALESCE(o.delivery_fee, 0) - fee);

      UPDATE public.orders SET status = 'DELIVERED_SUCCESS', updated_at = now() WHERE id = o.id;
      UPDATE public.escrows SET is_released = true, updated_at = now() WHERE order_id = o.id;
      PERFORM public.credit_wallet(o.seller_id, payout, 'Escrow release via courier PIN for ' || o.order_number);
    ELSIF o.status <> 'DELIVERED_SUCCESS' AND o.status <> 'REFUNDED' THEN
      UPDATE public.orders SET status = 'DELIVERED_SUCCESS', updated_at = now() WHERE id = o.id;
    END IF;
  END;

  RETURN jsonb_build_object('success', true, 'job_id', p_job_id, 'order_id', o.id);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_delivery_job_with_pin(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_delivery_job_with_pin(bigint, text) TO authenticated;

-- Open dispute (buyer or seller)
CREATE OR REPLACE FUNCTION public.open_dispute(p_order_id bigint, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
  caller bigint;
  did bigint;
  uname text;
BEGIN
  caller := public.current_profile_id();
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF caller <> o.buyer_id AND caller <> o.seller_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not a participant on this order';
  END IF;

  IF o.status NOT IN ('PENDING', 'PAID_ESCROW', 'SHIPPED', 'OUT_FOR_DELIVERY', 'PARTIAL_DEPOSIT_PAID') THEN
    RAISE EXCEPTION 'Order cannot be disputed in status %', o.status;
  END IF;

  IF EXISTS (SELECT 1 FROM public.disputes d WHERE d.order_id = p_order_id AND d.resolution = 'PENDING') THEN
    RAISE EXCEPTION 'An open dispute already exists for this order';
  END IF;

  SELECT full_name INTO uname FROM public.profiles WHERE id = caller;

  INSERT INTO public.disputes (order_id, order_number, opened_by_id, opened_by_name, reason, resolution)
  VALUES (o.id, o.order_number, caller, COALESCE(uname, 'User'), left(trim(p_reason), 2000), 'PENDING')
  RETURNING id INTO did;

  UPDATE public.orders SET status = 'DISPUTED', updated_at = now() WHERE id = o.id;

  INSERT INTO public.notifications (user_id, title, message, type, is_read)
  VALUES
    (o.seller_id, 'Escrow Dispute Opened', 'Dispute opened on ' || o.order_number || '. Payouts frozen.', 'DISPUTE', false),
    (o.buyer_id, 'Escrow Dispute Opened', 'Your dispute on ' || o.order_number || ' is under review.', 'DISPUTE', false);

  RETURN jsonb_build_object('success', true, 'dispute_id', did, 'order_id', o.id);
END;
$$;

REVOKE ALL ON FUNCTION public.open_dispute(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_dispute(bigint, text) TO authenticated;

-- Admin resolve dispute + release or refund escrow
CREATE OR REPLACE FUNCTION public.resolve_dispute(
  p_dispute_id bigint,
  p_resolution text,
  p_admin_notes text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.disputes%ROWTYPE;
  o public.orders%ROWTYPE;
  e public.escrows%ROWTYPE;
  fee numeric := 0;
  payout numeric := 0;
  fee_pct numeric := 1.5;
  fee_min numeric := 100;
  fee_max numeric := 15000;
  rid bigint;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  IF p_resolution NOT IN ('REFUND_BUYER', 'RELEASE_SELLER') THEN
    RAISE EXCEPTION 'Invalid resolution';
  END IF;

  SELECT * INTO d FROM public.disputes WHERE id = p_dispute_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dispute not found';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = d.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  SELECT * INTO e FROM public.escrows WHERE order_id = o.id FOR UPDATE;

  UPDATE public.disputes
  SET resolution = p_resolution, admin_notes = COALESCE(p_admin_notes, ''), updated_at = now()
  WHERE id = p_dispute_id;

  IF p_resolution = 'REFUND_BUYER' THEN
    UPDATE public.orders SET status = 'REFUNDED', updated_at = now() WHERE id = o.id;
    IF FOUND AND e.id IS NOT NULL THEN
      UPDATE public.escrows SET is_refunded = true, updated_at = now() WHERE order_id = o.id;
    END IF;

    INSERT INTO public.refunds (order_id, transaction_id, amount, reason, status)
    VALUES (o.id, 'REFUND-' || o.order_number || '-' || p_dispute_id::text, o.total_amount, COALESCE(p_admin_notes, 'Dispute refund'), 'PENDING')
    RETURNING id INTO rid;

    INSERT INTO public.notifications (user_id, title, message, type, is_read)
    VALUES
      (o.buyer_id, 'Dispute Resolved: Refunded', 'Admin refunded ' || o.order_number || '.', 'DISPUTE', false),
      (o.seller_id, 'Dispute Resolved against you', 'Admin refunded ' || o.order_number || ' to the buyer.', 'DISPUTE', false);
  ELSE
    SELECT escrow_percentage_fee, escrow_min_fee, escrow_max_fee
      INTO fee_pct, fee_min, fee_max
    FROM public.revenue_settings ORDER BY id ASC LIMIT 1;

    IF e.id IS NOT NULL AND NOT e.is_released AND NOT e.is_refunded THEN
      fee := GREATEST(COALESCE(fee_min, 100), LEAST(COALESCE(fee_max, 15000), e.held_amount * (COALESCE(fee_pct, 1.5) / 100.0)));
      payout := GREATEST(0, e.held_amount - COALESCE(o.delivery_fee, 0) - fee);
      UPDATE public.escrows SET is_released = true, updated_at = now() WHERE order_id = o.id;
      PERFORM public.credit_wallet(o.seller_id, payout, 'Dispute release for ' || o.order_number);
    END IF;

    UPDATE public.orders SET status = 'DELIVERED_SUCCESS', updated_at = now() WHERE id = o.id;

    INSERT INTO public.notifications (user_id, title, message, type, is_read)
    VALUES
      (o.buyer_id, 'Dispute Ruled: Escrow Released', 'Admin released escrow on ' || o.order_number || ' to seller.', 'DISPUTE', false),
      (o.seller_id, 'Dispute Ruled in your favor', 'Escrow released for ' || o.order_number || '.', 'DISPUTE', false);
  END IF;

  RETURN jsonb_build_object('success', true, 'dispute_id', p_dispute_id, 'resolution', p_resolution, 'refund_id', rid);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_dispute(bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_dispute(bigint, text, text) TO authenticated;

-- Admin force escrow (no dispute required)
CREATE OR REPLACE FUNCTION public.admin_force_escrow(
  p_order_id bigint,
  p_action text,
  p_notes text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
  e public.escrows%ROWTYPE;
  fee numeric := 0;
  payout numeric := 0;
  fee_pct numeric := 1.5;
  fee_min numeric := 100;
  fee_max numeric := 15000;
  rid bigint;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  SELECT * INTO e FROM public.escrows WHERE order_id = p_order_id FOR UPDATE;

  IF p_action = 'RELEASE_SELLER' THEN
    IF e.id IS NOT NULL AND NOT e.is_released AND NOT e.is_refunded THEN
      SELECT escrow_percentage_fee, escrow_min_fee, escrow_max_fee
        INTO fee_pct, fee_min, fee_max
      FROM public.revenue_settings ORDER BY id ASC LIMIT 1;
      fee := GREATEST(COALESCE(fee_min, 100), LEAST(COALESCE(fee_max, 15000), e.held_amount * (COALESCE(fee_pct, 1.5) / 100.0)));
      payout := GREATEST(0, e.held_amount - COALESCE(o.delivery_fee, 0) - fee);
      UPDATE public.escrows SET is_released = true, updated_at = now() WHERE order_id = p_order_id;
      PERFORM public.credit_wallet(o.seller_id, payout, 'Admin escrow release ' || o.order_number);
    END IF;
    UPDATE public.orders SET status = 'DELIVERED_SUCCESS', updated_at = now() WHERE id = p_order_id;
  ELSIF p_action = 'REFUND_BUYER' THEN
    IF e.id IS NOT NULL THEN
      UPDATE public.escrows SET is_refunded = true, updated_at = now() WHERE order_id = p_order_id;
    END IF;
    UPDATE public.orders SET status = 'REFUNDED', updated_at = now() WHERE id = p_order_id;
    INSERT INTO public.refunds (order_id, transaction_id, amount, reason, status)
    VALUES (o.id, 'ADMIN-REFUND-' || o.order_number, o.total_amount, COALESCE(p_notes, 'Admin refund'), 'PENDING')
    RETURNING id INTO rid;
  ELSE
    RAISE EXCEPTION 'Invalid action';
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, is_read)
  VALUES
    (o.buyer_id, 'Admin Escrow Action', COALESCE(p_notes, p_action) || ' on ' || o.order_number, 'ESCROW', false),
    (o.seller_id, 'Admin Escrow Action', COALESCE(p_notes, p_action) || ' on ' || o.order_number, 'ESCROW', false);

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'action', p_action, 'refund_id', rid);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_force_escrow(bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_force_escrow(bigint, text, text) TO authenticated;

-- Debit wallet helper (DEFINER)
CREATE OR REPLACE FUNCTION public.debit_wallet(p_user_id bigint, p_amount numeric, p_description text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wid bigint;
  bal numeric;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  SELECT id, balance INTO wid, bal FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF wid IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;
  IF bal < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  UPDATE public.wallets SET balance = balance - p_amount WHERE id = wid;
  INSERT INTO public.wallet_transactions (wallet_id, amount, type, description, status)
  VALUES (wid, -p_amount, 'DEBIT_WITHDRAWAL', COALESCE(p_description, 'Withdrawal'), 'PENDING');
END;
$$;

REVOKE ALL ON FUNCTION public.debit_wallet(bigint, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.debit_wallet(bigint, numeric, text) TO service_role;

-- Request withdrawal (authenticated)
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
  wid bigint;
  req_id bigint;
BEGIN
  caller := public.current_profile_id();
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount < 1000 THEN
    RAISE EXCEPTION 'Minimum withdrawal is ₦1000';
  END IF;

  PERFORM public.debit_wallet(caller, p_amount, 'Withdrawal to ' || p_bank_name || ' ' || p_account_number);

  UPDATE public.wallets
  SET bank_name = p_bank_name,
      bank_account_name = p_account_name,
      bank_account_number = p_account_number,
      updated_at = now()
  WHERE user_id = caller;

  INSERT INTO public.withdrawal_requests (user_id, amount, bank_name, account_name, account_number, status)
  VALUES (caller, p_amount, p_bank_name, p_account_name, p_account_number, 'PENDING')
  RETURNING id INTO req_id;

  RETURN jsonb_build_object('success', true, 'withdrawal_id', req_id, 'amount', p_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.request_withdrawal(numeric, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, text, text) TO authenticated;

-- Admin approve/reject withdrawal
CREATE OR REPLACE FUNCTION public.admin_process_withdrawal(p_withdrawal_id bigint, p_approve boolean, p_notes text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w public.withdrawal_requests%ROWTYPE;
  wallet_id bigint;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO w FROM public.withdrawal_requests WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal not found';
  END IF;
  IF w.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Withdrawal already processed';
  END IF;

  IF p_approve THEN
    UPDATE public.withdrawal_requests
    SET status = 'APPROVED', admin_notes = COALESCE(p_notes, ''), updated_at = now()
    WHERE id = p_withdrawal_id;

    SELECT id INTO wallet_id FROM public.wallets WHERE user_id = w.user_id;
    IF wallet_id IS NOT NULL THEN
      UPDATE public.wallet_transactions wt
      SET status = 'COMPLETED'
      WHERE wt.id = (
        SELECT id FROM public.wallet_transactions
        WHERE wallet_id = wallet_id AND type = 'DEBIT_WITHDRAWAL' AND status = 'PENDING'
          AND abs(amount) = w.amount
        ORDER BY created_at DESC
        LIMIT 1
      );
    END IF;

    INSERT INTO public.notifications (user_id, title, message, type, is_read)
    VALUES (w.user_id, 'Withdrawal Approved', '₦' || round(w.amount)::text || ' payout approved to ' || w.bank_name || '.', 'WALLET', false);
  ELSE
    UPDATE public.withdrawal_requests
    SET status = 'REJECTED', admin_notes = COALESCE(p_notes, ''), updated_at = now()
    WHERE id = p_withdrawal_id;

    -- Refund balance
    PERFORM public.credit_wallet(w.user_id, w.amount, 'Withdrawal rejected — funds returned');

    INSERT INTO public.notifications (user_id, title, message, type, is_read)
    VALUES (w.user_id, 'Withdrawal Rejected', COALESCE(p_notes, 'Your withdrawal was rejected and funds returned.'), 'WALLET', false);
  END IF;

  RETURN jsonb_build_object('success', true, 'withdrawal_id', p_withdrawal_id, 'approved', p_approve);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_process_withdrawal(bigint, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_process_withdrawal(bigint, boolean, text) TO authenticated;

-- Mark refund paid (after Paystack refund API success) — service role
CREATE OR REPLACE FUNCTION public.mark_refund_completed(p_refund_id bigint, p_provider_reference text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.refunds
  SET status = 'COMPLETED',
      transaction_id = COALESCE(p_provider_reference, transaction_id),
      updated_at = now()
  WHERE id = p_refund_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Refund not found';
  END IF;

  RETURN jsonb_build_object('success', true, 'refund_id', p_refund_id);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_refund_completed(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_refund_completed(bigint, text) TO service_role;

-- =============================================================================
-- RLS lockdown
-- =============================================================================

DROP POLICY IF EXISTS orders_participants_update ON public.orders;
-- Participants may no longer UPDATE orders directly; use RPCs (update_order_status, escrow, disputes)
CREATE POLICY orders_admin_update ON public.orders
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS notifications_insert ON public.notifications;
CREATE POLICY notifications_insert ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.current_profile_id() OR public.is_admin());

DROP POLICY IF EXISTS wallet_transactions_own_insert ON public.wallet_transactions;
-- No direct client inserts; wallet tx via DEFINER RPCs only

DROP POLICY IF EXISTS payment_transactions_insert ON public.payment_transactions;
CREATE POLICY payment_transactions_admin_insert ON public.payment_transactions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS payment_logs_insert ON public.payment_logs;
CREATE POLICY payment_logs_admin_insert ON public.payment_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS withdrawal_requests_admin_update ON public.withdrawal_requests;
CREATE POLICY withdrawal_requests_admin_update ON public.withdrawal_requests
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS refunds_insert ON public.refunds;
CREATE POLICY refunds_admin_insert ON public.refunds
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- Allow buyers to insert disputes via table as fallback (RPC is preferred)
DROP POLICY IF EXISTS disputes_insert ON public.disputes;
DROP POLICY IF EXISTS disputes_participants_insert ON public.disputes;
CREATE POLICY disputes_participant_insert ON public.disputes
  FOR INSERT TO authenticated
  WITH CHECK (
    opened_by_id = public.current_profile_id()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND (o.buyer_id = public.current_profile_id() OR o.seller_id = public.current_profile_id())
    )
  );
