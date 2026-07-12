-- 00163_social_post_type_check_v3.sql
-- Rebuild the social_posts.post_type allow-list.
--
-- Two things drove this rewrite:
--   1) BUG FIX: 'condition_easing', 'condition_recovery', and 'storm_digest'
--      have been inserted by src/lib/social/condition-alerts.ts since those
--      alert kinds shipped, but no migration ever added them to this CHECK —
--      the inserts fail the constraint and the alerts silently never post
--      (the code logs the insert error and continues).
--   2) FORMAT TRIM: 'eddy_says' merged into 'river_highlight' and
--      'favorite_float' merged into 'section_guide' (Float Pick). Nothing
--      inserts those values anymore, but they must remain allowed: adding a
--      CHECK validates EXISTING rows, and historical posts carry them.
--      'route_draw' is likewise legacy-only (00126).

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
    -- legacy (historical rows only)
    'eddy_says',
    'favorite_float',
    'route_draw'
  ));
