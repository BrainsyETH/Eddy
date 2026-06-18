-- 00135_river_guide_section_images.sql
-- Photo-parity pass for the River Guides: points the gap heroes and float-card
-- photos at Eddy-hosted images under public/blog/<river>/ (served same-origin
-- from Vercel's edge — no blob token or next.config allowlist entry needed).
--
-- !!! DO NOT APPLY until the referenced image files exist in
-- missouri-float-planner/public/blog/... !!!  A photo field that points at a
-- missing file renders a broken <img>, which is worse than the clean
-- numbered-tile fallback (photo: null). Each river is a separate statement —
-- run a river's block only once its files are committed. See
-- docs/river-guide-image-sourcing.md for what to put at each path and the
-- licensing rules.
--
-- Idempotent: re-running just re-sets the same paths.

-- Jacks Fork — replace the borrowed hero + fill all four float cards.
UPDATE blog_posts bp
SET guide_data = jsonb_set(
  jsonb_set(bp.guide_data, '{hero,photo_url}', '"/blog/jacks-fork/hero.jpg"'),
  '{sections}',
  (
    SELECT jsonb_agg(
      CASE (s->>'id')::int
        WHEN 1 THEN jsonb_set(s, '{photo}', '"/blog/jacks-fork/01-upper-canyon.jpg"')
        WHEN 2 THEN jsonb_set(s, '{photo}', '"/blog/jacks-fork/02-rymers-to-alley.jpg"')
        WHEN 3 THEN jsonb_set(s, '{photo}', '"/blog/jacks-fork/03-alley-spring.jpg"')
        WHEN 4 THEN jsonb_set(s, '{photo}', '"/blog/jacks-fork/04-eminence-two-rivers.jpg"')
        ELSE s
      END
      ORDER BY (s->>'id')::int
    )
    FROM jsonb_array_elements(bp.guide_data->'sections') s
  )
),
    updated_at = now()
WHERE bp.slug = 'jacks-fork-river-float-trips-missouri';

-- Current River — fill the one remaining float card (§6 lower river).
UPDATE blog_posts bp
SET guide_data = jsonb_set(
  bp.guide_data,
  '{sections}',
  (
    SELECT jsonb_agg(
      CASE (s->>'id')::int
        WHEN 6 THEN jsonb_set(s, '{photo}', '"/blog/current/06-lower-river.jpg"')
        ELSE s
      END
      ORDER BY (s->>'id')::int
    )
    FROM jsonb_array_elements(bp.guide_data->'sections') s
  )
),
    updated_at = now()
WHERE bp.slug = 'current-river-float-trips-missouri';

-- Courtois Creek — OPTIONAL. Only run this if you have real Courtois photos at
-- these paths (Commons has none; see the runbook). Otherwise leave the cards on
-- the numbered-tile fallback and skip this statement.
UPDATE blog_posts bp
SET guide_data = jsonb_set(
  jsonb_set(bp.guide_data, '{hero,photo_url}', '"/blog/courtois/hero.jpg"'),
  '{sections}',
  (
    SELECT jsonb_agg(
      CASE (s->>'id')::int
        WHEN 1 THEN jsonb_set(s, '{photo}', '"/blog/courtois/01-brazil-hwy8.jpg"')
        WHEN 2 THEN jsonb_set(s, '{photo}', '"/blog/courtois/02-hwy8-bass-river.jpg"')
        WHEN 3 THEN jsonb_set(s, '{photo}', '"/blog/courtois/03-bass-river-scotia.jpg"')
        ELSE s
      END
      ORDER BY (s->>'id')::int
    )
    FROM jsonb_array_elements(bp.guide_data->'sections') s
  )
),
    updated_at = now()
WHERE bp.slug = 'courtois-creek-float-trips-missouri';
