-- 00149_social_insights_canonical.sql
--
-- Canonical insights columns for social_posts. Production carries the
-- insights_-prefixed set (see src/types/database.ts) — the bare columns from
-- 00088 (impressions/reach/saves/shares/engagement_rate) never shipped there.
-- This migration makes migration-built environments match production, and the
-- insights fetcher / weekly review now write and read these names.
-- Everything is IF NOT EXISTS so it is a no-op where the columns already live.

ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS insights_impressions INTEGER;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS insights_reach INTEGER;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS insights_saves INTEGER;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS insights_shares INTEGER;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS insights_clicks INTEGER;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS insights_engagement_rate NUMERIC;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS insights_fetched_at TIMESTAMPTZ;

-- Weekly review storage (from 00088, which may not have run everywhere).
CREATE TABLE IF NOT EXISTS social_weekly_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  review_data JSONB NOT NULL,
  content_mix JSONB,
  top_performers JSONB,
  learnings TEXT,
  bias_guidance TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_reviews_week
  ON social_weekly_reviews(week_start);

-- Service-role-only access, matching 00140's treatment of the other social
-- tables (crons use the service-role key, which bypasses RLS anyway).
ALTER TABLE social_weekly_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role can manage social_weekly_reviews" ON social_weekly_reviews;
CREATE POLICY "Service role can manage social_weekly_reviews"
  ON social_weekly_reviews FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
