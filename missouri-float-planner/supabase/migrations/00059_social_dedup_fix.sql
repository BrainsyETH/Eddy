-- 00059_social_dedup_fix.sql
-- Fix social post deduplication to allow staggered posting across the day.
--
-- The old per-calendar-day index (idx_social_posts_dedup) prevented ALL posts
-- after the first cron run each day. Since eddy_updates refresh every 6 hours,
-- we want to allow new posts with fresh content while preventing the exact same
-- update from being posted twice.

-- Drop the overly restrictive per-calendar-day unique index
DROP INDEX IF EXISTS idx_social_posts_dedup;

-- Replace with per-update dedup: same eddy_update can't be posted twice to same platform
CREATE UNIQUE INDEX idx_social_posts_update_dedup
  ON social_posts (platform, eddy_update_id)
  WHERE eddy_update_id IS NOT NULL;

-- Keep daily_digest dedup (one digest per platform per day)
CREATE UNIQUE INDEX idx_social_posts_digest_dedup
  ON social_posts (post_type, platform, ((created_at AT TIME ZONE 'UTC')::date))
  WHERE post_type = 'daily_digest';
