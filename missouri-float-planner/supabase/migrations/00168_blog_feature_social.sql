-- 00168_blog_feature_social.sql
-- Weekly blog spotlight: a Facebook-only link post that promotes a river-guide
-- blog (IG can't do clickable in-feed links, so this is FB-only). Two changes:
--
--   1) post_type allow-list: add 'blog_feature'. While rebuilding the CHECK we
--      also fold back in the condition-alert types from 00163
--      ('condition_easing', 'condition_recovery', 'storm_digest') — that
--      migration was never applied to this database, so those alert inserts have
--      been silently rejected by the constraint. Widening a CHECK only ever
--      accepts more rows, so this can't break existing data.
--
--   2) blog_posts.last_shared_at: drives fair rotation of the weekly spotlight —
--      the poster picks the least-recently-shared published guide (NULL first).

ALTER TABLE social_posts DROP CONSTRAINT IF EXISTS social_posts_post_type_check;

ALTER TABLE social_posts
  ADD CONSTRAINT social_posts_post_type_check
  CHECK (post_type IN (
    -- active
    'daily_digest',
    'river_highlight',
    'manual',
    'condition_change',
    'condition_easing',
    'condition_recovery',
    'storm_digest',
    'weekly_forecast',
    'section_guide',
    'weekly_trend',
    'blog_feature',
    -- legacy (historical rows only)
    'eddy_says',
    'favorite_float',
    'route_draw'
  ));

ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS last_shared_at timestamptz;
