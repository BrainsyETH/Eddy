-- 00065_fix_social_dedup_exclude_failed.sql
-- Fix: failed posts should not block new scheduling attempts.
--
-- The idx_social_posts_update_dedup index previously prevented re-posting
-- the same eddy_update to the same platform, even if the first attempt failed.
-- This caused Instagram posts that failed (e.g., Meta image download timeout)
-- to be permanently stuck — the scheduler couldn't insert a new row, and the
-- retry queue would eventually exhaust its 3-attempt limit.
--
-- Fix: only count 'published' posts for dedup. Failed/pending posts should
-- not block new attempts.

DROP INDEX IF EXISTS idx_social_posts_update_dedup;

CREATE UNIQUE INDEX idx_social_posts_update_dedup
  ON social_posts (platform, eddy_update_id)
  WHERE eddy_update_id IS NOT NULL
    AND status = 'published';
