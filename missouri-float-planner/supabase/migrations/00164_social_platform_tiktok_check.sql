-- 00164_social_platform_tiktok_check.sql
-- Add 'tiktok' to the social_posts.platform allow-list so TikTok posts can be
-- inserted. The original constraint (00058_social_media.sql:10) was inline and
-- has never been altered, so it still rejects any platform outside
-- instagram/facebook. Mirrors the 00163 post_type rewrite: adding a CHECK
-- validates existing rows, so the existing values must stay in the list.

ALTER TABLE social_posts DROP CONSTRAINT IF EXISTS social_posts_platform_check;

ALTER TABLE social_posts
  ADD CONSTRAINT social_posts_platform_check
  CHECK (platform IN ('instagram', 'facebook', 'tiktok'));
