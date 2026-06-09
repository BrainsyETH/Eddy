-- The original social_posts CHECK constraint only allows 'daily_digest' and
-- 'river_highlight'. Subsequent features introduced new post_type values
-- ('manual', 'condition_change', 'weekly_forecast', 'section_guide',
-- 'weekly_trend') without touching the constraint, so inserts for those
-- types fail with
--   new row for relation "social_posts" violates check constraint
--   "social_posts_post_type_check"
-- Rewrite the constraint to cover every post type the app actually emits.

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
    'weekly_trend'
  ));
