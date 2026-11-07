-- =============================================================================
-- 033 — Launch monetization defaults, payment snapshots and atomic order stock
-- Extends the existing settings, payment, profile, product, order and promotion
-- records. No new account, listing, wallet, subscription or payment model.
-- =============================================================================
BEGIN;

-- Preserve intentional Admin changes; update only untouched legacy defaults.
UPDATE public.revenue_settings
SET verified_plus_price = CASE WHEN verified_plus_price = 10000 THEN 2500 ELSE verified_plus_price END,
    sub_premium_price = CASE WHEN sub_premium_price = 35000 THEN 12500 ELSE sub_premium_price END,
    featured_7_days_price = CASE WHEN featured_7_days_price = 5000 THEN 2000 ELSE featured_7_days_price END,
    flash_sale_feature_price = CASE WHEN flash_sale_feature_price = 7500 THEN 3000 ELSE flash_sale_feature_price END
WHERE id = 1;

-- Immutable Naira-provider and term snapshots on the existing payment intent.
ALTER TABLE public.premium_subscription_payments
  ADD COLUMN IF NOT EXISTS amount_kobo bigint,
  ADD COLUMN IF NOT EXISTS duration_days integer;
UPDATE public.premium_subscription_payments p
SET amount_kobo = coalesce(p.amount_kobo, round(p.amount * 100)::bigint),
    duration_days = coalesce(p.duration_days,
      (SELECT premium_duration_days FROM public.revenue_settings ORDER BY id LIMIT 1), 30);
ALTER TABLE public.premium_subscription_payments
  ALTER COLUMN amount_kobo SET NOT NULL,
  ALTER COLUMN duration_days SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.premium_subscription_payments'::regclass AND conname = 'premium_payment_amount_kobo_positive') THEN
    ALTER TABLE public.premium_subscription_payments ADD CONSTRAINT premium_payment_amount_kobo_positive CHECK (amount_kobo > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.premium_subscription_payments'::regclass AND conname = 'premium_payment_duration_days_valid') THEN
    ALTER TABLE public.premium_subscription_payments ADD CONSTRAINT premium_payment_duration_days_valid CHECK (duration_days BETWEEN 1 AND 366);
  END IF;
END $$;

-- Existing orders remain authoritative; these fields track held inventory.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS item_quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS flash_sale_id bigint REFERENCES public.featured_listings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inventory_reserved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inventory_committed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flash_sale_counted boolean NOT NULL DEFAULT false;
ALTER TABLE public.featured_listings
  ADD COLUMN IF NOT EXISTS quantity_reserved integer NOT NULL DEFAULT 0;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_item_quantity_positive;
ALTER TABLE public.orders ADD CONSTRAINT orders_item_quantity_positive CHECK (item_quantity > 0);

-- Server-authoritative order + escrow transaction. Identity, listing fields,
-- current unit price, quantity, platform/protection fees and points redemption
-- are derived from locked profile/product/settings rows. Delivery starts at zero
-- and is added by the existing quote-verified apply endpoint before payment.
CREATE OR REPLACE FUNCTION public.create_marketplace_order(
  p_order jsonb,
  p_expected_unit_price numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_settings public.revenue_settings%ROWTYPE;
  v_sale public.featured_listings%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_buyer bigint := public.current_profile_id();
  v_product_id bigint;
  v_quantity integer;
  v_unit_price numeric;
  v_subtotal numeric;
  v_tax numeric := 0;
  v_protect numeric := 0;
  v_points_used integer := 0;
  v_discount numeric := 0;
  v_total numeric;
  v_flash_id bigint;
  v_status text;
  v_method text;
  v_deposit_percent numeric;
  v_deposit_days integer;
  v_deposit numeric;
  v_held numeric;
BEGIN
  IF v_buyer IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_order IS NULL THEN RAISE EXCEPTION 'Order details are required'; END IF;
  v_product_id := (p_order->>'product_id')::bigint;
  v_quantity := (p_order->>'item_quantity')::integer;
  IF v_product_id IS NULL OR v_quantity IS NULL OR v_quantity < 1 OR v_quantity > 999 THEN
    RAISE EXCEPTION 'A valid listing and quantity are required';
  END IF;
  v_status := coalesce(p_order->>'status', 'PENDING');
  v_method := upper(coalesce(p_order->>'payment_method', ''));
  IF v_status NOT IN ('PENDING','PENDING_BANK_TRANSFER','COD_PENDING','INVOICE_SENT') THEN
    RAISE EXCEPTION 'Invalid initial order status';
  END IF;
  IF v_method NOT IN ('ESCROW','CARD','PARTIAL','BANK','COD','INVOICE') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_buyer FOR UPDATE;
  IF NOT FOUND OR v_profile.is_suspended THEN RAISE EXCEPTION 'This account cannot place orders'; END IF;
  SELECT * INTO v_product FROM public.products WHERE id = v_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF v_product.seller_id = v_buyer THEN RAISE EXCEPTION 'You cannot buy your own listing'; END IF;
  IF v_product.stock_status NOT IN ('IN_STOCK','LOW_STOCK') OR v_product.quantity < v_quantity THEN
    RAISE EXCEPTION 'Listing does not have enough available stock';
  END IF;
  SELECT * INTO v_settings FROM public.revenue_settings ORDER BY id LIMIT 1;

  v_unit_price := v_product.price;
  SELECT * INTO v_sale FROM public.featured_listings
  WHERE product_id = v_product_id AND feature_type = 'FLASH_SALE'
    AND status = 'ACTIVE' AND moderation_status = 'APPROVED'
    AND starts_at <= now() AND ends_at > now()
  ORDER BY starts_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF v_sale.sale_price IS NULL OR v_sale.sale_price <= 0 OR v_sale.sale_price >= v_product.price THEN
      RAISE EXCEPTION 'Flash Sale price is invalid';
    END IF;
    IF v_sale.quantity_limit IS NOT NULL
       AND v_sale.quantity_sold + v_sale.quantity_reserved + v_quantity > v_sale.quantity_limit THEN
      RAISE EXCEPTION 'Flash Sale does not have enough campaign quantity';
    END IF;
    v_unit_price := v_sale.sale_price;
    v_flash_id := v_sale.id;
    UPDATE public.featured_listings SET quantity_reserved = quantity_reserved + v_quantity WHERE id = v_sale.id;
  END IF;
  IF p_expected_unit_price IS NULL OR abs(p_expected_unit_price - v_unit_price) > 0.01 THEN
    RAISE EXCEPTION 'Listing price changed. Refresh checkout and try again';
  END IF;

  v_subtotal := v_unit_price * v_quantity;
  IF coalesce(v_settings.platform_fee_enabled, false) AND coalesce(v_settings.escrow_percentage_fee, 0) > 0 THEN
    v_tax := round(v_subtotal * v_settings.escrow_percentage_fee / 100);
    IF coalesce(v_settings.escrow_min_fee, 0) > 0 THEN v_tax := greatest(v_tax, v_settings.escrow_min_fee); END IF;
    IF coalesce(v_settings.escrow_max_fee, 0) > 0 THEN v_tax := least(v_tax, v_settings.escrow_max_fee); END IF;
  END IF;
  IF coalesce((p_order->>'has_good_sale_protect')::boolean, false) THEN
    v_protect := coalesce(v_settings.good_sale_protect_fee, 1500);
  END IF;
  IF coalesce((p_order->>'good_points_used')::integer, 0) > 0 AND v_profile.good_points > 50 THEN
    v_points_used := least(v_profile.good_points, floor(v_subtotal / 10)::integer);
    v_discount := v_points_used * 10;
  END IF;
  v_total := greatest(v_subtotal + v_tax + v_protect - v_discount, 0);
  IF v_points_used > 0 THEN
    UPDATE public.profiles SET good_points = good_points - v_points_used WHERE id = v_buyer;
    INSERT INTO public.good_points_transactions(user_id, points, reason)
    VALUES(v_buyer, -v_points_used, 'GoodPoints escrow discount');
  END IF;
  v_deposit_percent := CASE WHEN v_method = 'PARTIAL' THEN coalesce(v_product.partial_percent, 30) ELSE NULL END;
  v_deposit_days := CASE WHEN v_method = 'PARTIAL' THEN coalesce(v_product.partial_remaining_days, 7) ELSE NULL END;
  v_deposit := CASE WHEN v_method = 'PARTIAL' THEN round(v_total * v_deposit_percent / 100) ELSE NULL END;
  v_held := CASE WHEN v_method IN ('COD','INVOICE') THEN 0
                 WHEN v_method = 'PARTIAL' THEN coalesce(v_deposit, 0)
                 ELSE v_total END;

  INSERT INTO public.orders (
    order_number, buyer_id, seller_id, product_id, product_title, product_image,
    total_amount, discount_amount, delivery_fee, tax_amount, payment_method, delivery_method,
    delivery_address, delivery_city, delivery_state, delivery_lat, delivery_lng,
    delivery_pin, qr_code_token, status, good_points_used, selected_partner_id,
    service_type, has_good_sale_protect, protect_fee, deposit_percent, deposit_remaining_days,
    deposit_amount_paid, balance_remaining, is_balance_settled, bank_transfer_receipt, invoice_terms,
    created_at, updated_at, delivery_phone, delivery_instructions, checkout_group_id,
    shipping_rule_id, shipping_zone_id, shipping_quote_id, shipping_snapshot,
    estimated_delivery_min_days, estimated_delivery_max_days, item_quantity, flash_sale_id,
    inventory_reserved, inventory_committed, flash_sale_counted
  ) VALUES (
    NULL, v_buyer, v_product.seller_id, v_product.id, v_product.title, coalesce(v_product.images->>0, ''),
    v_total, v_discount, 0, v_tax, v_method, coalesce(p_order->>'delivery_method',''),
    coalesce(p_order->>'delivery_address',''), coalesce(p_order->>'delivery_city',''), coalesce(p_order->>'delivery_state',''),
    nullif(p_order->>'delivery_lat','')::double precision, nullif(p_order->>'delivery_lng','')::double precision,
    coalesce(p_order->>'delivery_pin',''), coalesce(p_order->>'qr_code_token',''), v_status, v_points_used,
    nullif(p_order->>'selected_partner_id','')::bigint, nullif(p_order->>'service_type',''),
    -- depositing nothing yet: the paid amount is written only when verified
    v_protect > 0, v_protect, v_deposit_percent, v_deposit_days, NULL,
    CASE WHEN v_method = 'PARTIAL' THEN v_total ELSE NULL END,
    v_method <> 'PARTIAL', nullif(p_order->>'bank_transfer_receipt',''), nullif(p_order->>'invoice_terms',''),
    now(), now(), coalesce(p_order->>'delivery_phone',''), coalesce(p_order->>'delivery_instructions',''),
    coalesce(p_order->>'checkout_group_id',''), NULL, NULL, NULL, '{}'::jsonb, NULL, NULL,
    v_quantity, v_flash_id, true, false, false
  ) RETURNING * INTO v_order;

  INSERT INTO public.escrows(order_id, held_amount, is_released, is_refunded)
  VALUES (v_order.id, v_held, false, false);
  UPDATE public.products SET quantity = quantity - v_quantity,
    stock_status = CASE WHEN quantity - v_quantity <= 0 THEN 'SOLD'
                        WHEN quantity - v_quantity <= 5 THEN 'LOW_STOCK' ELSE 'IN_STOCK' END
  WHERE id = v_product.id;
  RETURN to_jsonb(v_order);
END;
$$;
REVOKE ALL ON FUNCTION public.create_marketplace_order(jsonb, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_marketplace_order(jsonb, numeric) TO authenticated, service_role;

-- Deposit-first payment for PARTIAL orders; service role only. A partial order
-- pays the deposit now and the remaining balance on a later verified payment.
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
  v_due numeric;
  v_held numeric;
  v_new_status text;
  v_is_deposit boolean := false;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  IF o.status IN ('DELIVERED_SUCCESS','REFUNDED','CANCELLED') THEN
    RAISE EXCEPTION 'Order is in a terminal state (%)', o.status;
  END IF;

  IF o.status IN ('PAID_ESCROW','SHIPPED','OUT_FOR_DELIVERY','DISPUTED') THEN
    INSERT INTO public.payment_transactions (
      transaction_id, order_id, order_number, buyer_id, seller_id, amount, payment_method, status, purpose
    ) VALUES (
      p_reference, o.id, o.order_number, o.buyer_id, o.seller_id, o.total_amount,
      COALESCE(NULLIF(p_channel,''), o.payment_method), 'SUCCESS', 'ORDER_PAYMENT'
    ) ON CONFLICT (transaction_id) DO NOTHING;
    RETURN jsonb_build_object('success',true,'order_id',o.id,'already_paid',true,'reference',p_reference);
  END IF;

  IF o.status NOT IN ('PENDING','PENDING_BANK_TRANSFER','PARTIAL_DEPOSIT_PAID','INVOICE_SENT','COD_PENDING') THEN
    RAISE EXCEPTION 'Order status % cannot be marked paid', o.status;
  END IF;

  IF upper(coalesce(o.payment_method,'')) = 'PARTIAL' THEN
    IF o.status = 'PARTIAL_DEPOSIT_PAID' THEN
      v_due := coalesce(o.balance_remaining, o.total_amount);
      v_new_status := 'PAID_ESCROW';
      v_held := o.total_amount;
    ELSE
      v_due := round(o.total_amount * coalesce(o.deposit_percent, 30) / 100);
      v_new_status := 'PARTIAL_DEPOSIT_PAID';
      v_held := v_due;
      v_is_deposit := true;
    END IF;
  ELSE
    v_due := o.total_amount;
    v_new_status := 'PAID_ESCROW';
    v_held := o.total_amount;
  END IF;

  IF p_amount_kobo IS NOT NULL AND p_amount_kobo > 0 AND abs(round(v_due * 100) - p_amount_kobo) > 100 THEN
    RAISE EXCEPTION 'Amount mismatch';
  END IF;

  UPDATE public.orders
  SET status = v_new_status,
      payment_method = COALESCE(NULLIF(p_channel,''), payment_method),
      deposit_amount_paid = CASE WHEN v_is_deposit THEN v_due ELSE deposit_amount_paid END,
      balance_remaining = CASE
        WHEN upper(coalesce(payment_method,'')) <> 'PARTIAL' THEN balance_remaining
        WHEN v_is_deposit THEN greatest(o.total_amount - v_due, 0)
        ELSE 0 END,
      is_balance_settled = CASE
        WHEN upper(coalesce(payment_method,'')) <> 'PARTIAL' THEN is_balance_settled
        WHEN v_is_deposit THEN false
        ELSE true END,
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.payment_transactions (
    transaction_id, order_id, order_number, buyer_id, seller_id, amount, payment_method, status, purpose
  ) VALUES (
    p_reference, o.id, o.order_number, o.buyer_id, o.seller_id, v_due,
    COALESCE(NULLIF(p_channel,''), o.payment_method), 'SUCCESS', 'ORDER_PAYMENT'
  ) ON CONFLICT (transaction_id) DO NOTHING;

  INSERT INTO public.escrows (order_id, held_amount, is_released, is_refunded)
  VALUES (o.id, v_held, false, false)
  ON CONFLICT (order_id) DO UPDATE
  SET held_amount = EXCLUDED.held_amount
  WHERE public.escrows.is_released = false AND public.escrows.is_refunded = false;

  INSERT INTO public.notifications (user_id, title, message, type, is_read)
  VALUES
    (o.buyer_id, CASE WHEN v_is_deposit THEN 'Deposit secured' ELSE 'Escrow Secured' END,
     CASE WHEN v_is_deposit
       THEN 'Your deposit for ' || o.order_number || ' is secured. The balance is due later.'
       ELSE 'Payment verified for ' || o.order_number || '. Funds locked in escrow.' END,
     'ORDER', false),
    (o.seller_id, CASE WHEN v_is_deposit THEN 'Deposit received' ELSE 'Escrow Payment Received' END,
     CASE WHEN v_is_deposit
       THEN 'Buyer paid the deposit for ' || o.order_number || '. The balance follows before release.'
       ELSE 'Buyer paid for ' || o.order_number || '. Prepare shipment.' END,
     'ORDER', false);

  RETURN jsonb_build_object('success',true,'order_id',o.id,'reference',p_reference,'status',v_new_status);
END;
$$;
REVOKE ALL ON FUNCTION public.mark_order_paid_by_reference(bigint, text, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_paid_by_reference(bigint, text, bigint, text) TO service_role;

-- Payment commits stock; cancellation/refund releases/resets it exactly once.
CREATE OR REPLACE FUNCTION public.finalize_order_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF NEW.status IN ('PAID_ESCROW','PARTIAL_DEPOSIT_PAID','SHIPPED','OUT_FOR_DELIVERY','DELIVERED_SUCCESS') THEN
    IF NEW.inventory_reserved THEN
      IF NEW.flash_sale_id IS NOT NULL AND NOT NEW.flash_sale_counted THEN
        UPDATE public.featured_listings SET quantity_reserved = greatest(quantity_reserved - NEW.item_quantity, 0),
          quantity_sold = quantity_sold + NEW.item_quantity WHERE id = NEW.flash_sale_id;
        NEW.flash_sale_counted := true;
      END IF;
      NEW.inventory_reserved := false; NEW.inventory_committed := true;
    END IF;
  ELSIF NEW.status = 'CANCELLED' AND NEW.inventory_reserved THEN
    IF NEW.flash_sale_id IS NOT NULL THEN
      UPDATE public.featured_listings
      SET quantity_reserved = greatest(quantity_reserved - NEW.item_quantity, 0)
      WHERE id = NEW.flash_sale_id;
    END IF;
    UPDATE public.products SET quantity = quantity + NEW.item_quantity,
      stock_status = CASE WHEN quantity + NEW.item_quantity <= 5 THEN 'LOW_STOCK' ELSE 'IN_STOCK' END
    WHERE id = NEW.product_id;
    NEW.inventory_reserved := false;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS orders_finalize_inventory ON public.orders;
CREATE TRIGGER orders_finalize_inventory BEFORE UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.finalize_order_inventory();

CREATE OR REPLACE FUNCTION public.expire_unpaid_order_reservations()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.orders SET status = 'CANCELLED', updated_at = now()
  WHERE inventory_reserved AND status IN ('PENDING','PENDING_BANK_TRANSFER')
    AND created_at <= now() - interval '30 minutes';
  GET DIAGNOSTICS v_count = ROW_COUNT; RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.expire_unpaid_order_reservations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_unpaid_order_reservations() TO service_role;
DROP POLICY IF EXISTS orders_buyer_insert ON public.orders;
CREATE POLICY orders_buyer_insert ON public.orders FOR INSERT TO authenticated WITH CHECK (false);

-- Activation consumes the duration snapshot taken at payment initialization.
CREATE OR REPLACE FUNCTION public.activate_premium_subscription(p_reference text, p_provider_reference text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment public.premium_subscription_payments%ROWTYPE;
  v_base timestamptz := now(); v_expiry timestamptz; v_current_expiry timestamptz;
  v_subscription_id bigint; v_plan text;
BEGIN
  IF p_reference IS NULL OR length(trim(p_reference)) = 0 THEN RAISE EXCEPTION 'A payment reference is required'; END IF;
  SELECT * INTO v_payment FROM public.premium_subscription_payments WHERE reference = p_reference FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Premium payment was not created by GoodSale'; END IF;
  IF v_payment.status = 'SUCCESS' THEN RETURN jsonb_build_object('success',true,'alreadyActive',true,'reference',v_payment.reference,
    'product',v_payment.product,'planCode',v_payment.plan_code,'expiresAt',v_payment.expires_at); END IF;
  IF v_payment.status <> 'PENDING' THEN RAISE EXCEPTION 'This subscription payment is no longer payable'; END IF;
  IF v_payment.product = 'VERIFIED_PLUS' THEN
    SELECT id, expires_at INTO v_subscription_id, v_current_expiry FROM public.verified_plus_subscriptions
    WHERE user_id = v_payment.user_id ORDER BY expires_at DESC LIMIT 1 FOR UPDATE;
    IF v_current_expiry > now() THEN v_base := v_current_expiry; END IF;
    v_expiry := v_base + make_interval(days => v_payment.duration_days);
    IF v_subscription_id IS NULL THEN
      INSERT INTO public.verified_plus_subscriptions(user_id,starts_at,expires_at,status,auto_renew,last_payment_reference)
      VALUES(v_payment.user_id,v_base,v_expiry,'ACTIVE',false,p_reference) RETURNING id INTO v_subscription_id;
    ELSE UPDATE public.verified_plus_subscriptions SET starts_at=v_base,expires_at=v_expiry,status='ACTIVE',auto_renew=false,
      cancelled_at=NULL,last_payment_reference=p_reference WHERE id=v_subscription_id; END IF;
    v_plan := 'VERIFIED_PLUS';
  ELSE
    SELECT id, expires_at INTO v_subscription_id, v_current_expiry FROM public.business_subscriptions
    WHERE user_id = v_payment.user_id ORDER BY expires_at DESC LIMIT 1 FOR UPDATE;
    IF v_current_expiry > now() THEN v_base := v_current_expiry; END IF;
    v_expiry := v_base + make_interval(days => v_payment.duration_days);
    IF v_subscription_id IS NULL THEN
      INSERT INTO public.business_subscriptions(user_id,plan,starts_at,expires_at,status,auto_renew,last_payment_reference)
      VALUES(v_payment.user_id,v_payment.plan_code,v_base,v_expiry,'ACTIVE',false,p_reference) RETURNING id INTO v_subscription_id;
    ELSE UPDATE public.business_subscriptions SET plan=v_payment.plan_code,starts_at=v_base,expires_at=v_expiry,status='ACTIVE',
      auto_renew=false,cancelled_at=NULL,last_payment_reference=p_reference WHERE id=v_subscription_id; END IF;
    v_plan := v_payment.plan_code;
  END IF;
  UPDATE public.premium_subscription_payments SET status='SUCCESS',provider_reference=coalesce(p_provider_reference,provider_reference,p_reference),
    starts_at=v_base,expires_at=v_expiry,paid_at=now() WHERE id=v_payment.id;
  INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,details) VALUES(v_payment.user_id,'PREMIUM_SUBSCRIPTION_ACTIVATED',
    'PREMIUM_SUBSCRIPTION',v_subscription_id,format('%s activated for %s day(s) through payment %s',v_plan,v_payment.duration_days,p_reference));
  INSERT INTO public.notifications(user_id,title,message,type,is_read,created_at) VALUES(v_payment.user_id,'Premium membership active',
    format('Your %s membership is active until %s.',CASE WHEN v_payment.product='VERIFIED_PLUS' THEN 'Verified+' ELSE 'Business' END,
    to_char(v_expiry AT TIME ZONE 'Africa/Lagos','DD Mon YYYY')),'WALLET',false,now());
  RETURN jsonb_build_object('success',true,'alreadyActive',false,'reference',p_reference,'product',v_payment.product,'planCode',v_plan,'startsAt',v_base,'expiresAt',v_expiry);
END; $$;
REVOKE ALL ON FUNCTION public.activate_premium_subscription(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_premium_subscription(text,text) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
