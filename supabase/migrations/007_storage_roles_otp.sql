-- 007: Signup role from metadata, user-changeable roles, user-media storage bucket
-- Run after 006_payouts_and_suspend.sql

-- ---------------------------------------------------------------------------
-- 1) Create profile with role chosen at signup (BUYER | SELLER | BUSINESS)
-- ---------------------------------------------------------------------------
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
  meta_role text;
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
  meta_role := upper(COALESCE(NEW.raw_user_meta_data->>'role', 'BUYER'));
  IF meta_role NOT IN ('BUYER', 'SELLER', 'BUSINESS') THEN
    meta_role := 'BUYER';
  END IF;

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
    referral_code
  ) VALUES (
    NEW.id,
    meta_full_name,
    final_username,
    COALESCE(NEW.email, ''),
    meta_phone,
    meta_role,
    'GS-' || upper(left(final_username, 8)) || '-' || lpad((floor(random() * 100))::int::text, 2, '0')
  );

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) Allow users to switch among BUYER / SELLER / BUSINESS (not admin/verify)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      -- Users may only move between base marketplace roles
      IF NEW.role NOT IN ('BUYER', 'SELLER', 'BUSINESS') THEN
        RAISE EXCEPTION 'Updating role is not allowed';
      END IF;
      IF OLD.role IN ('ADMIN', 'SUPER_ADMIN', 'MODERATOR') THEN
        RAISE EXCEPTION 'Updating role is not allowed';
      END IF;
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

CREATE OR REPLACE FUNCTION public.set_own_account_role(p_role text)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  target text := upper(trim(p_role));
  row public.profiles;
  next_role text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF target NOT IN ('BUYER', 'SELLER', 'BUSINESS') THEN
    RAISE EXCEPTION 'Role must be BUYER, SELLER, or BUSINESS';
  END IF;

  SELECT * INTO row FROM public.profiles WHERE auth_id = uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF row.role IN ('ADMIN', 'SUPER_ADMIN', 'MODERATOR') THEN
    RAISE EXCEPTION 'Staff roles cannot be changed here';
  END IF;

  -- Preserve verification when switching within the same track
  IF target = 'SELLER' AND row.role = 'VERIFIED_SELLER' THEN
    next_role := 'VERIFIED_SELLER';
  ELSIF target = 'BUSINESS' AND row.role = 'VERIFIED_BUSINESS' THEN
    next_role := 'VERIFIED_BUSINESS';
  ELSE
    next_role := target;
  END IF;

  UPDATE public.profiles
  SET role = next_role
  WHERE id = row.id
  RETURNING * INTO row;

  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_own_account_role(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_own_account_role(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) user-media bucket (avatars, covers, business branding, receipts, courier)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-media',
  'user-media',
  true,
  10485760,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'video/mp4', 'video/webm',
    'audio/mpeg', 'audio/webm'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Allow larger product images / videos
UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/webm']
WHERE id = 'product-images';

DROP POLICY IF EXISTS "user_media_public_read" ON storage.objects;
CREATE POLICY "user_media_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'user-media');

DROP POLICY IF EXISTS "user_media_auth_upload" ON storage.objects;
CREATE POLICY "user_media_auth_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'user-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "user_media_own_update" ON storage.objects;
CREATE POLICY "user_media_own_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'user-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "user_media_own_delete" ON storage.objects;
CREATE POLICY "user_media_own_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'user-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
