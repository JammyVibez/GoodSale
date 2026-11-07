-- 024_seller_verification.sql
-- Seller verification: application lifecycle, private document records, audit
-- trail and the only code paths that may grant or remove the Verified badge.
--
-- Design rules enforced here (not in the UI):
--   · Submitting an application never verifies a seller.
--   · Only public.is_admin() (ADMIN / SUPER_ADMIN) can approve, reject,
--     suspend, revoke or expire a verification.
--   · profiles.verification_status is the single public source of truth for
--     the badge. is_verified and the VERIFIED_* role are mirrors kept in sync
--     for existing marketplace code, never written by the client.
--   · Identity documents live in the private `government-ids` bucket. This
--     schema stores storage paths only — never signed URLs — so nothing
--     expires and nothing leaks through a public URL.
--
-- Additive only.

-- ---------------------------------------------------------------------------
-- 1. Application detail collected by the guided seller flow
-- ---------------------------------------------------------------------------
ALTER TABLE public.identity_verifications
  ADD COLUMN IF NOT EXISTS seller_type                  text NOT NULL DEFAULT 'INDIVIDUAL',
  ADD COLUMN IF NOT EXISTS date_of_birth                date,
  ADD COLUMN IF NOT EXISTS contact_phone                text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_email                text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS residence_state              text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS residence_city               text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS residence_address            text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS business_registration_number text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS business_contact_name        text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS store_name                   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS store_description            text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS store_city                   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS store_state                  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS store_phone                  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS store_logo_path              text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS info_request_note            text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status_reason                text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS submitted_at                 timestamptz,
  ADD COLUMN IF NOT EXISTS review_started_at            timestamptz,
  ADD COLUMN IF NOT EXISTS decided_at                   timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at                   timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by                  bigint REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS declaration_accepted_at      timestamptz;

CREATE INDEX IF NOT EXISTS idx_identity_verifications_kind_status
  ON public.identity_verifications (application_kind, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_identity_verifications_seller
  ON public.identity_verifications (user_id, created_at DESC);

-- Keep one open application per seller. DRAFT / INFO_REQUIRED / REJECTED rows
-- are reusable; everything else blocks a second submission.
CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_verifications_one_open
  ON public.identity_verifications (user_id)
  WHERE application_kind IN ('SELLER', 'BUSINESS')
    AND status IN ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'SUSPENDED');

-- ---------------------------------------------------------------------------
-- 2. Public badge state on the profile (no sensitive data in these columns)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_status    text NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN IF NOT EXISTS verification_type      text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS verified_at            timestamptz,
  ADD COLUMN IF NOT EXISTS verification_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_verification_status
  ON public.profiles (verification_status);

-- Backfill from records that already exist so nobody loses a badge they earned.
UPDATE public.profiles p
   SET verification_status = 'VERIFIED',
       verified_at = COALESCE(p.verified_at, now())
 WHERE p.verification_status = 'UNVERIFIED'
   AND p.role IN ('VERIFIED_SELLER', 'VERIFIED_BUSINESS');

-- ---------------------------------------------------------------------------
-- 2b. Lock the badge columns against client writes
--
-- The profile RLS policy lets a user update their own row, so without this a
-- seller could simply set verification_status = 'VERIFIED'. The guard runs as
-- the invoking role: direct client writes (authenticated/anon) are refused,
-- while the SECURITY DEFINER review functions below run as the table owner and
-- are allowed. Admin sessions keep their existing override.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
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

-- ---------------------------------------------------------------------------
-- 3. Private document records (storage paths, never public URLs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verification_documents (
  id             bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  application_id bigint NOT NULL REFERENCES public.identity_verifications(id) ON DELETE CASCADE,
  seller_id      bigint NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  slot           text NOT NULL,
  label          text NOT NULL DEFAULT '',
  storage_path   text NOT NULL,
  mime_type      text NOT NULL DEFAULT '',
  size_bytes     integer NOT NULL DEFAULT 0,
  uploaded_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verification_documents_slot_check CHECK (
    slot IN ('ID_FRONT', 'ID_BACK', 'SELFIE', 'ADDRESS_PROOF', 'CAC_CERT', 'STORE_LOGO')
  )
);

CREATE INDEX IF NOT EXISTS idx_verification_documents_application
  ON public.verification_documents (application_id, slot);
CREATE INDEX IF NOT EXISTS idx_verification_documents_seller
  ON public.verification_documents (seller_id);

-- ---------------------------------------------------------------------------
-- 4. Audit trail — one row per state change, every admin action
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verification_events (
  id             bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  application_id bigint NOT NULL REFERENCES public.identity_verifications(id) ON DELETE CASCADE,
  seller_id      bigint NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  admin_id       bigint REFERENCES public.profiles(id) ON DELETE SET NULL,
  action         text NOT NULL,
  from_status    text NOT NULL DEFAULT '',
  to_status      text NOT NULL DEFAULT '',
  reason         text NOT NULL DEFAULT '',
  internal_note  text NOT NULL DEFAULT '',
  is_internal    boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_events_application
  ON public.verification_events (application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_events_seller
  ON public.verification_events (seller_id, created_at DESC);

ALTER TABLE public.verification_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_events ENABLE ROW LEVEL SECURITY;

-- Sellers may see their own application's file list and the reviewer-visible
-- side of their history. Internal notes and other sellers' files stay hidden.
DROP POLICY IF EXISTS verification_documents_own_read ON public.verification_documents;
CREATE POLICY verification_documents_own_read ON public.verification_documents
  FOR SELECT TO authenticated
  USING (seller_id = public.current_profile_id() OR public.is_admin());

DROP POLICY IF EXISTS verification_documents_own_delete ON public.verification_documents;
CREATE POLICY verification_documents_own_delete ON public.verification_documents
  FOR DELETE TO authenticated
  USING (
    seller_id = public.current_profile_id()
    AND EXISTS (
      SELECT 1 FROM public.identity_verifications a
      WHERE a.id = application_id AND a.status IN ('DRAFT','REJECTED','INFO_REQUIRED')
    )
  );

DROP POLICY IF EXISTS verification_events_own_read ON public.verification_events;
CREATE POLICY verification_events_own_read ON public.verification_events
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (seller_id = public.current_profile_id() AND is_internal = false)
  );

-- No client INSERT/UPDATE/DELETE policies: writes happen only through the
-- SECURITY DEFINER functions below (or the service role in the upload route).

-- ---------------------------------------------------------------------------
-- 5. Storage: private bucket + policies (already present in 002 — re-asserted)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('government-ids', 'government-ids', false, 5242880,
        ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','application/pdf'];

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

-- ---------------------------------------------------------------------------
-- 6. Seller: save a draft / attach documents / submit
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seller_save_verification(
  p_payload jsonb,
  p_submit  boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     bigint := public.current_profile_id();
  v_profile  public.profiles;
  v_app      public.identity_verifications;
  v_type     text;
  v_kind     text;
  v_docs     integer;
  v_store    public.businesses;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in to apply for verification' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user;

  IF v_profile.role NOT IN ('SELLER','BUSINESS','VERIFIED_SELLER','VERIFIED_BUSINESS','ADMIN','SUPER_ADMIN')
     AND NOT COALESCE(v_profile.wants_selling, false) THEN
    RAISE EXCEPTION 'Open a seller store before applying for verification';
  END IF;

  -- One open application at a time: a seller cannot start a second draft while
  -- an application is queued, in review, approved or suspended.
  IF EXISTS (
    SELECT 1 FROM public.identity_verifications
     WHERE user_id = v_user
       AND application_kind IN ('SELLER','BUSINESS')
       AND status IN ('PENDING','UNDER_REVIEW','APPROVED','SUSPENDED')
  ) THEN
    RAISE EXCEPTION 'You already have a verification application in review';
  END IF;

  v_type := CASE
    WHEN lower(coalesce(p_payload->>'sellerType','')) = 'business' THEN 'BUSINESS'
    ELSE 'INDIVIDUAL'
  END;
  v_kind := CASE WHEN v_type = 'BUSINESS' THEN 'BUSINESS' ELSE 'SELLER' END;

  SELECT * INTO v_app
    FROM public.identity_verifications
   WHERE user_id = v_user
     AND application_kind IN ('SELLER','BUSINESS')
     AND status IN ('DRAFT','INFO_REQUIRED','REJECTED')
   ORDER BY id DESC
   LIMIT 1;

  IF v_app.id IS NULL THEN
    INSERT INTO public.identity_verifications (
      user_id, full_name, document_type, document_number, application_kind,
      seller_type, status
    ) VALUES (
      v_user,
      btrim(coalesce(p_payload->>'legalName','')),
      coalesce(nullif(p_payload->>'documentType',''), 'NATIONAL_ID'),
      '',
      v_kind,
      v_type,
      'DRAFT'
    )
    RETURNING * INTO v_app;

    INSERT INTO public.verification_events (application_id, seller_id, action, to_status, is_internal)
    VALUES (v_app.id, v_user, 'DRAFT_CREATED', 'DRAFT', false);
  END IF;

  UPDATE public.identity_verifications
     SET full_name                   = coalesce(nullif(btrim(p_payload->>'legalName'), ''), full_name),
         document_type               = coalesce(nullif(p_payload->>'documentType', ''), document_type),
         -- Only a masked reference is persisted. The full number stays on the
         -- document image the reviewer opens, never in a queryable column.
         document_number             = CASE
             WHEN nullif(p_payload->>'documentNumber','') IS NULL THEN document_number
             ELSE '••••' || right(regexp_replace(p_payload->>'documentNumber', '[^A-Za-z0-9]', '', 'g'), 4)
           END,
         seller_type                 = v_type,
         application_kind            = v_kind,
         date_of_birth               = coalesce(nullif(p_payload->>'dateOfBirth','')::date, date_of_birth),
         contact_phone               = coalesce(nullif(btrim(p_payload->>'phone'), ''), contact_phone),
         contact_email               = coalesce(nullif(btrim(p_payload->>'email'), ''), contact_email),
         residence_state             = coalesce(nullif(btrim(p_payload->>'state'), ''), residence_state),
         residence_city              = coalesce(nullif(btrim(p_payload->>'city'), ''), residence_city),
         residence_address           = coalesce(nullif(btrim(p_payload->>'address'), ''), residence_address),
         business_name               = coalesce(nullif(btrim(p_payload->>'businessName'), ''), business_name),
         business_registration_number = coalesce(nullif(btrim(p_payload->>'businessRegistrationNumber'), ''), business_registration_number),
         business_contact_name       = coalesce(nullif(btrim(p_payload->>'businessContactName'), ''), business_contact_name),
         business_address            = coalesce(nullif(btrim(p_payload->>'businessAddress'), ''), business_address),
         store_name                  = coalesce(nullif(btrim(p_payload->>'storeName'), ''), store_name),
         store_description           = coalesce(nullif(btrim(p_payload->>'storeDescription'), ''), store_description),
         store_city                  = coalesce(nullif(btrim(p_payload->>'storeCity'), ''), store_city),
         store_state                 = coalesce(nullif(btrim(p_payload->>'storeState'), ''), store_state),
         store_phone                 = coalesce(nullif(btrim(p_payload->>'storePhone'), ''), store_phone),
         status                      = CASE WHEN status IN ('REJECTED','INFO_REQUIRED') THEN 'DRAFT' ELSE status END
   WHERE id = v_app.id
   RETURNING * INTO v_app;

  IF NOT p_submit THEN
    RETURN jsonb_build_object('applicationId', v_app.id, 'status', v_app.status);
  END IF;

  -- ── Submit-time validation (server side; the wizard is only a convenience) ──
  SELECT count(*) INTO v_docs
    FROM public.verification_documents
   WHERE application_id = v_app.id;

  IF coalesce(v_app.full_name,'') = '' THEN
    RAISE EXCEPTION 'Legal name is required';
  END IF;
  IF coalesce(v_app.residence_state,'') = '' OR coalesce(v_app.residence_city,'') = '' THEN
    RAISE EXCEPTION 'State and city are required';
  END IF;
  IF coalesce(v_app.contact_phone,'') = '' THEN
    RAISE EXCEPTION 'A contact phone number is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.verification_documents WHERE application_id = v_app.id AND slot = 'ID_FRONT') THEN
    RAISE EXCEPTION 'Upload your identity document before submitting';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.verification_documents WHERE application_id = v_app.id AND slot = 'SELFIE') THEN
    RAISE EXCEPTION 'Upload a selfie holding your ID before submitting';
  END IF;

  IF v_type = 'BUSINESS' THEN
    IF coalesce(v_app.business_name,'') = '' THEN
      RAISE EXCEPTION 'Registered business name is required';
    END IF;
    IF coalesce(v_app.business_registration_number,'') = '' THEN
      RAISE EXCEPTION 'Business registration number is required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.verification_documents WHERE application_id = v_app.id AND slot = 'CAC_CERT') THEN
      RAISE EXCEPTION 'Upload your business registration certificate';
    END IF;
  END IF;

  SELECT * INTO v_store FROM public.businesses WHERE owner_id = v_user ORDER BY id LIMIT 1;
  IF v_store.id IS NULL THEN
    RAISE EXCEPTION 'Create your store before submitting for verification';
  END IF;
  IF coalesce(v_store.name,'') = '' THEN
    RAISE EXCEPTION 'Your store needs a name before verification';
  END IF;

  IF p_payload->>'declarationAccepted' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Confirm the declaration before submitting';
  END IF;

  UPDATE public.identity_verifications
     SET status                  = 'PENDING',
         submitted_at            = now(),
         declaration_accepted_at = now(),
         status_reason           = '',
         info_request_note       = '',
         store_name              = coalesce(nullif(store_name,''), v_store.name),
         store_description       = coalesce(nullif(store_description,''), v_store.description),
         store_city              = coalesce(nullif(store_city,''), v_store.city),
         store_state             = coalesce(nullif(store_state,''), v_store.state),
         store_phone             = coalesce(nullif(store_phone,''), v_store.contact_phone)
   WHERE id = v_app.id
   RETURNING * INTO v_app;

  UPDATE public.profiles
     SET verification_status = 'PENDING',
         verification_type   = v_type
   WHERE id = v_user
     AND verification_status NOT IN ('VERIFIED','SUSPENDED');

  INSERT INTO public.verification_events (application_id, seller_id, action, from_status, to_status, is_internal)
  VALUES (v_app.id, v_user, 'SUBMITTED', 'DRAFT', 'PENDING', false);

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (
    v_user,
    'Verification submitted',
    'Your seller verification application is in the review queue. We will notify you as soon as a decision is made.',
    'VERIFICATION'
  );

  INSERT INTO public.notifications (user_id, title, message, type)
  SELECT p.id,
         'New seller verification',
         v_profile.full_name || ' submitted a ' || lower(v_type) || ' seller verification for review.',
         'VERIFICATION'
    FROM public.profiles p
   WHERE p.role IN ('ADMIN','SUPER_ADMIN');

  RETURN jsonb_build_object('applicationId', v_app.id, 'status', v_app.status);
END;
$$;

REVOKE ALL ON FUNCTION public.seller_save_verification(jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seller_save_verification(jsonb, boolean) TO authenticated;

-- Attach (or replace) one uploaded document. The storage path must belong to
-- the caller's auth uid — the upload route writes it, and the caller can only
-- reference their own prefix.
CREATE OR REPLACE FUNCTION public.seller_attach_verification_document(
  p_application_id bigint,
  p_slot           text,
  p_storage_path   text,
  p_label          text DEFAULT '',
  p_mime           text DEFAULT '',
  p_size           integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user bigint := public.current_profile_id();
  v_app  public.identity_verifications;
  v_uid  text := auth.uid()::text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in to upload documents' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_app FROM public.identity_verifications WHERE id = p_application_id;
  IF v_app.id IS NULL OR v_app.user_id <> v_user THEN
    RAISE EXCEPTION 'Application not found';
  END IF;
  IF v_app.status NOT IN ('DRAFT','INFO_REQUIRED','REJECTED') THEN
    RAISE EXCEPTION 'This application can no longer be edited';
  END IF;
  IF p_slot NOT IN ('ID_FRONT','ID_BACK','SELFIE','ADDRESS_PROOF','CAC_CERT','STORE_LOGO') THEN
    RAISE EXCEPTION 'Unknown document slot';
  END IF;
  IF p_storage_path NOT LIKE (v_uid || '/%') THEN
    RAISE EXCEPTION 'Document path is not yours';
  END IF;

  DELETE FROM public.verification_documents
   WHERE application_id = p_application_id AND slot = p_slot;

  INSERT INTO public.verification_documents
    (application_id, seller_id, slot, label, storage_path, mime_type, size_bytes)
  VALUES
    (p_application_id, v_user, p_slot, coalesce(p_label,''), p_storage_path,
     coalesce(p_mime,''), greatest(coalesce(p_size,0), 0));

  RETURN jsonb_build_object('slot', p_slot);
END;
$$;

REVOKE ALL ON FUNCTION public.seller_attach_verification_document(bigint, text, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seller_attach_verification_document(bigint, text, text, text, text, integer) TO authenticated;

-- Withdraw a pending application (seller-initiated, never approval).
CREATE OR REPLACE FUNCTION public.seller_withdraw_verification(p_application_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user bigint := public.current_profile_id();
  v_app  public.identity_verifications;
BEGIN
  SELECT * INTO v_app FROM public.identity_verifications WHERE id = p_application_id;
  IF v_app.id IS NULL OR v_app.user_id <> v_user THEN
    RAISE EXCEPTION 'Application not found';
  END IF;
  IF v_app.status NOT IN ('PENDING','UNDER_REVIEW','INFO_REQUIRED') THEN
    RAISE EXCEPTION 'This application cannot be withdrawn';
  END IF;

  UPDATE public.identity_verifications
     SET status = 'DRAFT', submitted_at = NULL
   WHERE id = p_application_id;

  UPDATE public.profiles
     SET verification_status = 'DRAFT'
   WHERE id = v_user AND verification_status IN ('PENDING','UNDER_REVIEW','INFO_REQUIRED');

  INSERT INTO public.verification_events (application_id, seller_id, action, from_status, to_status, is_internal)
  VALUES (p_application_id, v_user, 'WITHDRAWN', v_app.status, 'DRAFT', false);

  RETURN jsonb_build_object('status', 'DRAFT');
END;
$$;

REVOKE ALL ON FUNCTION public.seller_withdraw_verification(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seller_withdraw_verification(bigint) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Admin: the only path that can change a verification decision
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_verification_action(
  p_application_id bigint,
  p_action         text,
  p_reason         text DEFAULT '',
  p_internal_note  text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin     bigint := public.current_profile_id();
  v_role      text;
  v_app       public.identity_verifications;
  v_action    text := upper(coalesce(p_action,''));
  v_from      text;
  v_to        text;
  v_type      text;
  v_reason    text := btrim(coalesce(p_reason,''));
  v_note      text := btrim(coalesce(p_internal_note,''));
  v_title     text;
  v_message   text;
  v_new_role  text;
  v_expires   timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only GoodSale administrators can review verifications' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = v_admin;
  IF v_role NOT IN ('ADMIN','SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Only ADMIN or SUPER_ADMIN can decide a verification' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_app FROM public.identity_verifications WHERE id = p_application_id FOR UPDATE;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'Application not found';
  END IF;
  v_from := v_app.status;
  v_type := CASE WHEN v_app.seller_type = 'BUSINESS' OR v_app.application_kind = 'BUSINESS' THEN 'BUSINESS' ELSE 'INDIVIDUAL' END;

  IF v_action = 'START_REVIEW' THEN
    IF v_from NOT IN ('PENDING','INFO_REQUIRED') THEN
      RAISE EXCEPTION 'Only a submitted application can enter review';
    END IF;
    v_to := 'UNDER_REVIEW';

  ELSIF v_action = 'REQUEST_INFO' THEN
    IF v_from NOT IN ('PENDING','UNDER_REVIEW') THEN
      RAISE EXCEPTION 'Only a submitted application can request more information';
    END IF;
    IF v_reason = '' THEN
      RAISE EXCEPTION 'Tell the seller what is missing';
    END IF;
    v_to := 'INFO_REQUIRED';

  ELSIF v_action = 'APPROVE' THEN
    IF v_from NOT IN ('PENDING','UNDER_REVIEW','INFO_REQUIRED') THEN
      RAISE EXCEPTION 'This application cannot be approved from its current state';
    END IF;
    v_to := 'APPROVED';

  ELSIF v_action = 'REJECT' THEN
    IF v_from NOT IN ('PENDING','UNDER_REVIEW','INFO_REQUIRED') THEN
      RAISE EXCEPTION 'This application cannot be rejected from its current state';
    END IF;
    IF v_reason = '' THEN
      RAISE EXCEPTION 'A rejection reason is required';
    END IF;
    v_to := 'REJECTED';

  ELSIF v_action = 'SUSPEND' THEN
    IF v_from <> 'APPROVED' THEN
      RAISE EXCEPTION 'Only a verified seller can be suspended';
    END IF;
    IF v_reason = '' THEN
      RAISE EXCEPTION 'A suspension reason is required';
    END IF;
    v_to := 'SUSPENDED';

  ELSIF v_action = 'REVOKE' THEN
    IF v_from NOT IN ('APPROVED','SUSPENDED','EXPIRED') THEN
      RAISE EXCEPTION 'Only a verified or suspended seller can have verification revoked';
    END IF;
    IF v_reason = '' THEN
      RAISE EXCEPTION 'A revocation reason is required';
    END IF;
    v_to := 'REVOKED';

  ELSIF v_action = 'EXPIRE' THEN
    IF v_from <> 'APPROVED' THEN
      RAISE EXCEPTION 'Only an approved verification can expire';
    END IF;
    v_to := 'EXPIRED';

  ELSIF v_action = 'NOTE' THEN
    IF v_note = '' THEN
      RAISE EXCEPTION 'Enter a note';
    END IF;
    INSERT INTO public.verification_events
      (application_id, seller_id, admin_id, action, from_status, to_status, internal_note, is_internal)
    VALUES
      (v_app.id, v_app.user_id, v_admin, 'NOTE', v_from, v_from, v_note, true);
    RETURN jsonb_build_object('status', v_from, 'noted', true);
  ELSE
    RAISE EXCEPTION 'Unknown verification action';
  END IF;

  -- ── State transition ─────────────────────────────────────────────────────
  UPDATE public.identity_verifications
     SET status           = v_to,
         reviewed_by      = v_admin,
         reviewed_at      = now(),
         decided_at       = CASE WHEN v_to IN ('APPROVED','REJECTED','SUSPENDED','REVOKED','EXPIRED') THEN now() ELSE decided_at END,
         expires_at       = CASE WHEN v_to = 'APPROVED' THEN now() + interval '12 months' ELSE expires_at END,
         approved_by      = CASE WHEN v_to = 'APPROVED' THEN v_admin ELSE approved_by END,
         rejection_reason = CASE WHEN v_to IN ('REJECTED','SUSPENDED','REVOKED','EXPIRED') THEN v_reason ELSE rejection_reason END,
         status_reason    = CASE WHEN v_to IN ('REJECTED','SUSPENDED','REVOKED','EXPIRED') THEN v_reason ELSE '' END,
         info_request_note = CASE WHEN v_to = 'INFO_REQUIRED' THEN v_reason ELSE '' END,
         review_started_at = CASE WHEN v_to = 'UNDER_REVIEW' THEN now() ELSE review_started_at END
   WHERE id = v_app.id
   RETURNING * INTO v_app;

  v_expires := v_app.expires_at;

  -- ── Public badge + mirrored legacy fields ────────────────────────────────
  IF v_to = 'APPROVED' THEN
    SELECT CASE
             WHEN role IN ('BUSINESS','VERIFIED_BUSINESS') THEN 'VERIFIED_BUSINESS'
             WHEN role IN ('ADMIN','SUPER_ADMIN','MODERATOR') THEN role
             ELSE 'VERIFIED_SELLER'
           END
      INTO v_new_role
      FROM public.profiles WHERE id = v_app.user_id;

    UPDATE public.profiles
       SET verification_status = 'VERIFIED',
           verification_type   = v_type,
           verified_at         = now(),
           verification_expires_at = v_expires,
           role                = v_new_role
     WHERE id = v_app.user_id;

    UPDATE public.businesses SET is_verified = true WHERE owner_id = v_app.user_id;

    v_title := 'You are now a GoodSale Verified seller';
    v_message := 'Your verification was approved. The GoodSale Verified badge now appears on your storefront and listings, and buyers can view what was checked.';

  ELSIF v_to = 'SUSPENDED' THEN
    UPDATE public.profiles
       SET verification_status = 'SUSPENDED'
     WHERE id = v_app.user_id;
    UPDATE public.businesses SET is_verified = false WHERE owner_id = v_app.user_id;

    v_title := 'Seller verification suspended';
    v_message := 'Your GoodSale Verified badge has been hidden while we review your account. Reason: ' || v_reason;

  ELSIF v_to = 'REVOKED' OR v_to = 'EXPIRED' THEN
    SELECT CASE
             WHEN role IN ('VERIFIED_BUSINESS','BUSINESS') THEN 'BUSINESS'
             ELSE 'SELLER'
           END
      INTO v_new_role
      FROM public.profiles WHERE id = v_app.user_id;

    UPDATE public.profiles
       SET verification_status = CASE WHEN v_to = 'EXPIRED' THEN 'EXPIRED' ELSE 'REVOKED' END,
           role = CASE WHEN role IN ('VERIFIED_SELLER','VERIFIED_BUSINESS') THEN v_new_role ELSE role END
     WHERE id = v_app.user_id;
    UPDATE public.businesses SET is_verified = false WHERE owner_id = v_app.user_id;

    v_title := CASE WHEN v_to = 'EXPIRED' THEN 'Seller verification expired' ELSE 'Seller verification revoked' END;
    v_message := CASE
      WHEN v_to = 'EXPIRED' THEN 'Your verification period ended. Re-apply to restore the GoodSale Verified badge.'
      ELSE 'Your GoodSale Verified badge has been removed. Reason: ' || v_reason
    END;

  ELSIF v_to = 'REJECTED' THEN
    UPDATE public.profiles
       SET verification_status = 'REJECTED'
     WHERE id = v_app.user_id;

    v_title := 'Verification not approved';
    v_message := 'Your verification application was not approved. Reason: ' || v_reason || ' You can correct the details and apply again.';

  ELSIF v_to = 'INFO_REQUIRED' THEN
    UPDATE public.profiles
       SET verification_status = 'INFO_REQUIRED'
     WHERE id = v_app.user_id;

    v_title := 'More information needed';
    v_message := 'We need a little more from you to finish reviewing your verification: ' || v_reason;

  ELSIF v_to = 'UNDER_REVIEW' THEN
    UPDATE public.profiles
       SET verification_status = 'UNDER_REVIEW'
     WHERE id = v_app.user_id AND verification_status NOT IN ('VERIFIED','SUSPENDED');

    v_title := 'Your verification is being reviewed';
    v_message := 'A GoodSale reviewer has started checking your documents. We will notify you when there is a decision.';
  END IF;

  INSERT INTO public.verification_events
    (application_id, seller_id, admin_id, action, from_status, to_status, reason, internal_note, is_internal)
  VALUES
    (v_app.id, v_app.user_id, v_admin, v_action, v_from, v_to, v_reason, v_note, true);

  INSERT INTO public.verification_events
    (application_id, seller_id, admin_id, action, from_status, to_status, reason, is_internal)
  VALUES
    (v_app.id, v_app.user_id, v_admin, v_action, v_from, v_to, v_reason, false);

  IF v_title IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (v_app.user_id, v_title, v_message, 'VERIFICATION');
  END IF;

  RETURN jsonb_build_object(
    'applicationId', v_app.id,
    'status', v_to,
    'expiresAt', v_expires
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_verification_action(bigint, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_verification_action(bigint, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Expiry sweep — safe, idempotent, callable on read
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_verification_expiry()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row     record;
  v_count   integer := 0;
  v_new_role text;
BEGIN
  FOR v_row IN
    SELECT * FROM public.identity_verifications
     WHERE status = 'APPROVED'
       AND expires_at IS NOT NULL
       AND expires_at <= now()
  LOOP
    UPDATE public.identity_verifications
       SET status = 'EXPIRED', decided_at = now(),
           status_reason = 'Verification period ended'
     WHERE id = v_row.id;

    SELECT CASE WHEN role IN ('VERIFIED_BUSINESS','BUSINESS') THEN 'BUSINESS' ELSE 'SELLER' END
      INTO v_new_role
      FROM public.profiles WHERE id = v_row.user_id;

    UPDATE public.profiles
       SET verification_status = 'EXPIRED',
           role = CASE WHEN role IN ('VERIFIED_SELLER','VERIFIED_BUSINESS') THEN v_new_role ELSE role END
     WHERE id = v_row.user_id;
    UPDATE public.businesses SET is_verified = false WHERE owner_id = v_row.user_id;

    INSERT INTO public.verification_events
      (application_id, seller_id, action, from_status, to_status, reason, is_internal)
    VALUES
      (v_row.id, v_row.user_id, 'EXPIRED', 'APPROVED', 'EXPIRED', 'Verification period ended', false);

    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (v_row.user_id, 'Seller verification expired',
            'Your verification period ended and the GoodSale Verified badge has been removed. Re-apply to renew it.',
            'VERIFICATION');

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.run_verification_expiry() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_verification_expiry() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Public, privacy-safe verification summary for the buyer badge panel
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seller_public_verification(p_seller_id bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'status', CASE
        WHEN p.verification_status = 'VERIFIED'
             AND p.verification_expires_at IS NOT NULL
             AND p.verification_expires_at <= now() THEN 'EXPIRED'
        ELSE p.verification_status
      END,
    'verifiedAt', p.verified_at,
    'expiresAt', p.verification_expires_at,
    'sellerType', coalesce(nullif(p.verification_type,''), nullif(b.seller_type,''), 'INDIVIDUAL'),
    'storeName', coalesce(nullif(b.name,''), p.full_name),
    'city', b.city,
    'state', b.state,
    'memberSince', p.created_at
  )
  FROM public.profiles p
  LEFT JOIN public.businesses b ON b.owner_id = p.id
  WHERE p.id = p_seller_id
  ORDER BY b.id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.seller_public_verification(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seller_public_verification(bigint) TO anon, authenticated, service_role;
