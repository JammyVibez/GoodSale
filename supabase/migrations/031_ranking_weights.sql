-- =============================================================================
-- 031 — Configurable marketplace ranking weights
--
-- Relevance, category, location and eligibility filters still run before these
-- additive tie-breakers. Paid visibility can help an eligible, relevant listing
-- compete, but cannot inject an irrelevant product into a filtered result set.
-- =============================================================================

ALTER TABLE public.revenue_settings
  ADD COLUMN IF NOT EXISTS featured_ranking_boost numeric NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS verified_plus_ranking_boost numeric NOT NULL DEFAULT 8;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'revenue_settings_ranking_boost_check'
  ) THEN
    ALTER TABLE public.revenue_settings
      ADD CONSTRAINT revenue_settings_ranking_boost_check
      CHECK (
        featured_ranking_boost BETWEEN 0 AND 500
        AND verified_plus_ranking_boost BETWEEN 0 AND 500
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
