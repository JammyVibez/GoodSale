-- =============================================================================
-- 041: Live pre-dispatch condition proof, voice note duration, and instant payout audit
-- =============================================================================

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS dispatch_proof jsonb,
  ADD COLUMN IF NOT EXISTS safe_meet_location_id bigint,
  ADD COLUMN IF NOT EXISTS safe_meet_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS instant_payout_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_amount numeric;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS voice_duration_seconds integer;

CREATE INDEX IF NOT EXISTS idx_orders_dispatch_proof_status
  ON public.orders ((dispatch_proof->>'status'))
  WHERE dispatch_proof IS NOT NULL;

COMMIT;
