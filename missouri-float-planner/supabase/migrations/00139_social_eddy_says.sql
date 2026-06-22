-- "Eddy Says" social post — a quote-forward reel that reuses the river-highlight
-- composition (social-gauge-portrait) to spotlight Eddy's local read on a river
-- as the hero, instead of the live gauge instrument. Per-river, rotating daily.
--
-- This adds:
--   1) an eddy_says JSONB reel config on social_config (mirrors weekly_trend)
--   2) an eddy_says key inside the media_schedule matrix for existing rows
--   3) 'eddy_says' to the social_posts.post_type CHECK so inserts succeed

-- 1) Reel config column (time_cst convention, see 00127). DEFAULT applies to
--    the existing single row too, so the scheduler/admin always read a value.
ALTER TABLE social_config
  ADD COLUMN IF NOT EXISTS eddy_says jsonb NOT NULL DEFAULT jsonb_build_object(
    'enabled', false,
    'day_of_week', 2,      -- Tuesday: a midweek dose of Eddy's local read
    'time_cst', '11:00',   -- late morning CT
    'media', 'video'
  );

-- 2) Seed the media_schedule matrix cell for any existing config row that
--    predates this migration (Tuesday on, rest off). getOrCreateConfig also
--    backfills this in-memory, but keep the stored JSON consistent.
UPDATE social_config
SET media_schedule = media_schedule || jsonb_build_object(
  'eddy_says', jsonb_build_object(
    'mon', NULL, 'tue', 'video', 'wed', NULL, 'thu', NULL,
    'fri', NULL, 'sat', NULL, 'sun', NULL
  )
)
WHERE media_schedule IS NOT NULL
  AND NOT (media_schedule ? 'eddy_says');

-- 3) Allow the new post_type. Same allow-list as 00135 plus 'eddy_says'.
ALTER TABLE social_posts DROP CONSTRAINT IF EXISTS social_posts_post_type_check;

ALTER TABLE social_posts
  ADD CONSTRAINT social_posts_post_type_check
  CHECK (post_type IN (
    'daily_digest',
    'river_highlight',
    'eddy_says',
    'manual',
    'condition_change',
    'weekly_forecast',
    'section_guide',
    'favorite_float',
    'weekly_trend',
    'route_draw'
  ));
