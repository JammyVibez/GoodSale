-- =============================================================================
-- 027: Chat experience — unread state, read receipts and message integrity
-- =============================================================================
-- The inbox previously counted conversations rather than unread messages and
-- had no durable read position. This migration adds per-participant read state,
-- mute/archive preferences, authoritative last-message metadata and one concise
-- in-app notification per message burst.
--
-- Apply after 026_referrals_rewards.sql
-- =============================================================================

ALTER TABLE public.chat_rooms
  ADD COLUMN IF NOT EXISTS buyer_last_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS seller_last_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS buyer_muted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seller_muted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS buyer_archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS seller_archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_message_sender_id bigint REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_message_kind text;

-- Existing conversations are treated as read up to their current last message.
-- New conversations start with no read position, so their first reply is unread.
UPDATE public.chat_rooms
SET buyer_last_read_at = COALESCE(buyer_last_read_at, last_message_time, created_at),
    seller_last_read_at = COALESCE(seller_last_read_at, last_message_time, created_at)
WHERE buyer_last_read_at IS NULL
   OR seller_last_read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_messages_room_created
  ON public.messages(room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_rooms_buyer_activity
  ON public.chat_rooms(buyer_id, last_message_time DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_chat_rooms_seller_activity
  ON public.chat_rooms(seller_id, last_message_time DESC NULLS LAST);

-- One thread per buyer, seller and listing. Older databases may already contain
-- duplicates, so only enforce this when the data is clean.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.chat_rooms
    GROUP BY buyer_id, seller_id, product_id
    HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_rooms_thread
      ON public.chat_rooms(buyer_id, seller_id, product_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Authoritative last-message preview + in-app notification
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_after_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  room public.chat_rooms%ROWTYPE;
  recipient_id bigint;
  sender_name text;
  preview text;
  kind text;
  recipient_muted boolean;
BEGIN
  SELECT * INTO room FROM public.chat_rooms WHERE id = NEW.room_id;
  IF room.id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.offer_details IS NOT NULL THEN
    kind := 'OFFER';
    preview := 'Sent a price offer';
  ELSIF NEW.receipt_details IS NOT NULL THEN
    kind := 'RECEIPT';
    preview := 'Shared an escrow receipt';
  ELSIF NEW.product_details IS NOT NULL THEN
    kind := 'PRODUCT';
    preview := 'Shared a listing';
  ELSIF NEW.image_url IS NOT NULL THEN
    kind := 'PHOTO';
    preview := 'Sent a photo';
  ELSIF NEW.video_url IS NOT NULL THEN
    kind := 'VIDEO';
    preview := 'Sent a video';
  ELSIF NEW.voice_note_url IS NOT NULL THEN
    kind := 'VOICE';
    preview := 'Sent a voice note';
  ELSE
    kind := 'TEXT';
    preview := COALESCE(NULLIF(btrim(NEW.message_text), ''), 'New message');
  END IF;

  UPDATE public.chat_rooms
  SET last_message = left(preview, 180),
      last_message_time = NEW.created_at,
      last_message_sender_id = NEW.sender_id,
      last_message_kind = kind
  WHERE id = NEW.room_id;

  IF NEW.sender_id = room.buyer_id THEN
    recipient_id := room.seller_id;
    recipient_muted := room.seller_muted;
  ELSIF NEW.sender_id = room.seller_id THEN
    recipient_id := room.buyer_id;
    recipient_muted := room.buyer_muted;
  ELSE
    RETURN NEW;
  END IF;

  SELECT full_name INTO sender_name FROM public.profiles WHERE id = NEW.sender_id;
  sender_name := COALESCE(NULLIF(sender_name, ''), 'A GoodSale member');

  -- One unread notification per sender burst is enough; the inbox badge carries
  -- the exact count. Respect a muted conversation.
  IF NOT recipient_muted AND NOT EXISTS (
    SELECT 1
    FROM public.notifications n
    WHERE n.user_id = recipient_id
      AND n.type = 'CHAT'
      AND n.is_read = false
      AND n.title = 'New message from ' || sender_name
      AND n.created_at > now() - interval '2 minutes'
  ) THEN
    INSERT INTO public.notifications (user_id, title, message, type, is_read)
    VALUES (
      recipient_id,
      'New message from ' || sender_name,
      left(preview, 160),
      'CHAT',
      false
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_after_message_insert ON public.messages;
CREATE TRIGGER chat_after_message_insert
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_after_message_insert();

-- ---------------------------------------------------------------------------
-- Participant-only read position and inbox preferences
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_mark_read(p_room_id bigint)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_id bigint := public.current_profile_id();
  read_at timestamptz := now();
BEGIN
  IF profile_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.chat_rooms
  SET buyer_last_read_at = CASE WHEN buyer_id = profile_id THEN read_at ELSE buyer_last_read_at END,
      seller_last_read_at = CASE WHEN seller_id = profile_id THEN read_at ELSE seller_last_read_at END
  WHERE id = p_room_id
    AND (buyer_id = profile_id OR seller_id = profile_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_a_participant';
  END IF;

  RETURN read_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_set_preferences(
  p_room_id bigint,
  p_muted boolean DEFAULT NULL,
  p_archived boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_id bigint := public.current_profile_id();
BEGIN
  IF profile_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.chat_rooms
  SET buyer_muted = CASE
        WHEN buyer_id = profile_id AND p_muted IS NOT NULL THEN p_muted
        ELSE buyer_muted
      END,
      seller_muted = CASE
        WHEN seller_id = profile_id AND p_muted IS NOT NULL THEN p_muted
        ELSE seller_muted
      END,
      buyer_archived_at = CASE
        WHEN buyer_id = profile_id AND p_archived IS NOT NULL
          THEN CASE WHEN p_archived THEN now() ELSE NULL END
        ELSE buyer_archived_at
      END,
      seller_archived_at = CASE
        WHEN seller_id = profile_id AND p_archived IS NOT NULL
          THEN CASE WHEN p_archived THEN now() ELSE NULL END
        ELSE seller_archived_at
      END
  WHERE id = p_room_id
    AND (buyer_id = profile_id OR seller_id = profile_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_a_participant';
  END IF;
END;
$$;

-- Inbox metadata is server-authoritative. Members can open a thread, but all
-- reads/preferences go through the participant-checked RPCs and message previews
-- are written by the trigger. This closes the previous direct-row update path.
REVOKE UPDATE ON TABLE public.chat_rooms FROM authenticated, anon;

REVOKE ALL ON FUNCTION public.chat_mark_read(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_mark_read(bigint) TO authenticated;

REVOKE ALL ON FUNCTION public.chat_set_preferences(bigint, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_set_preferences(bigint, boolean, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
