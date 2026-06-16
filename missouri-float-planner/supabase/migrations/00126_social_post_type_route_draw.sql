-- Allow the route_draw post type (self-drawing route reel). Same allow-list as
-- 00097 plus 'route_draw'. Inserts for route_draw were failing with
--   new row for relation "social_posts" violates check constraint
--   "social_posts_post_type_check"

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
    'weekly_trend',
    'route_draw'
  ));
