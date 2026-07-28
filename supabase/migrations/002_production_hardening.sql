-- =============================================================================
-- GoodSale production hardening (run AFTER schema.sql)
-- - Lock profile.role / wallet.balance from client self-update
-- - Escrow release RPC (PIN verified server-side)
-- - Order status transitions
-- - Storage buckets + policies
-- - Extra realtime tables
-- =============================================================================

-- Prevent clients from elevating their own role or minting wallet balance
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
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
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_sensitive ON public.profiles;
CREATE TRIGGER profiles_protect_sensitive
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_sensitive_columns();

CREATE OR REPLACE FUNCTION public.protect_wallet_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    IF NEW.balance IS DISTINCT FROM OLD.balance THEN
      RAISE EXCEPTION 'Updating wallet balance directly is not allowed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wallets_protect_balance ON public.wallets;
CREATE TRIGGER wallets_protect_balance
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.protect_wallet_balance();

-- Credit seller wallet (service / SECURITY DEFINER only)
CREATE OR REPLACE FUNCTION public.credit_wallet(p_user_id bigint, p_amount numeric, p_description text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wid bigint;
BEGIN
  IF p_amount <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.wallets (user_id, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id INTO wid FROM public.wallets WHERE user_id = p_user_id LIMIT 1;

  UPDATE public.wallets SET balance = balance + p_amount WHERE id = wid;

  INSERT INTO public.wallet_transactions (wallet_id, amount, type, description, status)
  VALUES (wid, p_amount, 'CREDIT_SALE', COALESCE(p_description, 'Escrow release'), 'COMPLETED');
END;
$$;

-- Buyer releases escrow with delivery PIN
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

  UPDATE public.orders
  SET status = 'DELIVERED_SUCCESS', updated_at = now()
  WHERE id = p_order_id;

  UPDATE public.escrows
  SET is_released = true, updated_at = now()
  WHERE order_id = p_order_id;

  PERFORM public.credit_wallet(o.seller_id, e.held_amount, 'Escrow release for ' || o.order_number);

  INSERT INTO public.notifications (user_id, title, message, type, is_read)
  VALUES
    (o.seller_id, 'Escrow Released', 'Buyer confirmed delivery for ' || o.order_number || '. Funds credited to your wallet.', 'ESCROW', false),
    (o.buyer_id, 'Delivery Confirmed', 'You confirmed ' || o.order_number || '. Escrow released to seller.', 'ESCROW', false);

  UPDATE public.delivery_jobs
  SET status = 'COMPLETED', updated_at = now()
  WHERE order_id = p_order_id AND status <> 'COMPLETED';

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'released_amount', e.held_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.release_escrow_with_pin(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_escrow_with_pin(bigint, text) TO authenticated;

-- Seller/admin order status transitions
CREATE OR REPLACE FUNCTION public.update_order_status(p_order_id bigint, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
  caller bigint;
  allowed boolean := false;
BEGIN
  caller := public.current_profile_id();
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF public.is_admin() OR o.seller_id = caller THEN
    allowed := true;
  END IF;
  IF NOT allowed THEN
    RAISE EXCEPTION 'Not allowed to update this order';
  END IF;

  IF p_status = 'SHIPPED' AND o.status = 'PAID_ESCROW' THEN
    NULL;
  ELSIF p_status = 'OUT_FOR_DELIVERY' AND o.status IN ('SHIPPED', 'PAID_ESCROW') THEN
    NULL;
  ELSIF p_status = 'CANCELLED' AND o.status IN ('PENDING', 'PENDING_BANK_TRANSFER', 'INVOICE_SENT', 'COD_PENDING') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Invalid status transition from % to %', o.status, p_status;
  END IF;

  UPDATE public.orders SET status = p_status, updated_at = now() WHERE id = p_order_id;

  INSERT INTO public.notifications (user_id, title, message, type, is_read)
  VALUES (
    o.buyer_id,
    'Order Update',
    'Order ' || o.order_number || ' is now ' || p_status || '.',
    'ORDER',
    false
  );

  RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.update_order_status(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_order_status(bigint, text) TO authenticated;

-- Mark order paid after Paystack verify (service role / admin)
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

  IF p_amount_kobo IS NOT NULL AND p_amount_kobo > 0 THEN
    IF round(o.total_amount * 100) <> p_amount_kobo THEN
      -- Allow small float tolerance
      IF abs(round(o.total_amount * 100) - p_amount_kobo) > 100 THEN
        RAISE EXCEPTION 'Amount mismatch';
      END IF;
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

  -- Ensure escrow row exists / held
  INSERT INTO public.escrows (order_id, held_amount, is_released, is_refunded)
  VALUES (o.id, o.total_amount, false, false)
  ON CONFLICT (order_id) DO UPDATE
  SET held_amount = EXCLUDED.held_amount
  WHERE public.escrows.is_released = false;

  RETURN jsonb_build_object('success', true, 'order_id', o.id, 'reference', p_reference);
END;
$$;

-- Admin-only role assignment
CREATE OR REPLACE FUNCTION public.admin_set_profile_role(p_user_id bigint, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF p_role NOT IN (
    'BUYER','SELLER','VERIFIED_SELLER','BUSINESS','VERIFIED_BUSINESS','MODERATOR','ADMIN','SUPER_ADMIN'
  ) THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;
  UPDATE public.profiles SET role = p_role WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_profile_role(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_role(bigint, text) TO authenticated;

-- Storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('government-ids', 'government-ids', false, 5242880, ARRAY['image/jpeg','image/png','image/webp','application/pdf']),
  ('product-images', 'product-images', true, 5242880, ARRAY['image/jpeg','image/png','image/webp']),
  ('chat-media', 'chat-media', true, 10485760, ARRAY['image/jpeg','image/png','image/webp','video/mp4','audio/mpeg','audio/webm'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "gov_ids_own_upload" ON storage.objects;
CREATE POLICY "gov_ids_own_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'government-ids' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "gov_ids_own_read" ON storage.objects;
CREATE POLICY "gov_ids_own_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'government-ids'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin())
  );

DROP POLICY IF EXISTS "product_images_public_read" ON storage.objects;
CREATE POLICY "product_images_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product_images_auth_upload" ON storage.objects;
CREATE POLICY "product_images_auth_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "chat_media_public_read" ON storage.objects;
CREATE POLICY "chat_media_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'chat-media');

DROP POLICY IF EXISTS "chat_media_auth_upload" ON storage.objects;
CREATE POLICY "chat_media_auth_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-media');

-- Extra realtime tables used by the app
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.escrows;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.identity_verifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wallets;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Ensure wallets.user_id is unique for upserts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallets_user_id_key'
  ) THEN
    ALTER TABLE public.wallets ADD CONSTRAINT wallets_user_id_key UNIQUE (user_id);
  END IF;
END $$;
