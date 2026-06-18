-- "Eddy's Favorite Floats" social post — the evergreen, editorial cousin of the
-- Float of the Day (section_guide). Sourced from the river-guide blogs'
-- guide_data.sections and rendered through the same self-drawing route reel.
--
-- This adds:
--   1) a favorite_float JSONB reel config on social_config (mirrors section_guide)
--   2) a favorite_float key inside the media_schedule matrix for existing rows
--   3) 'favorite_float' to the social_posts.post_type CHECK so inserts succeed

-- 1) Reel config column (time_cst convention, see 00127). DEFAULT applies to
--    the existing single row too, so the scheduler/admin always read a value.
ALTER TABLE social_config
  ADD COLUMN IF NOT EXISTS favorite_float jsonb NOT NULL DEFAULT jsonb_build_object(
    'enabled', false,
    'day_of_week', 6,      -- Saturday: weekend float inspiration
    'time_cst', '12:00',   -- midday CT
    'media', 'video'
  );

-- 2) Seed the media_schedule matrix cell for any existing config row that
--    predates this migration (Saturday on, rest off). getOrCreateConfig also
--    backfills this in-memory, but keep the stored JSON consistent.
UPDATE social_config
SET media_schedule = media_schedule || jsonb_build_object(
  'favorite_float', jsonb_build_object(
    'mon', NULL, 'tue', NULL, 'wed', NULL, 'thu', NULL,
    'fri', NULL, 'sat', 'video', 'sun', NULL
  )
)
WHERE media_schedule IS NOT NULL
  AND NOT (media_schedule ? 'favorite_float');

-- 3) Allow the new post_type. Same allow-list as 00126 plus 'favorite_float'.
ALTER TABLE social_posts DROP CONSTRAINT IF EXISTS social_posts_post_type_check;

ALTER TABLE social_posts
  ADD CONSTRAINT social_posts_post_type_check
  CHECK (post_type IN (
    'daily_digest',
    'river_highlight',
    'manual',
    'condition_change',
    'weekly_forecast',
    'section_guide',
    'favorite_float',
    'weekly_trend',
    'route_draw'
  ));
