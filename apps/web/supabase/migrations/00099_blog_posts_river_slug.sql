-- 00099_blog_posts_river_slug.sql
-- Adds an optional FK from blog_posts to rivers so the river page can show the
-- right "Read the full {river} Float Trip Guide" link only when a published
-- post actually exists. Replaces the previous hardcoded slug guess that 404'd.

ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS river_slug TEXT
    REFERENCES rivers(slug) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS blog_posts_river_slug_idx ON blog_posts (river_slug);

UPDATE blog_posts
   SET river_slug = 'current'
 WHERE slug = 'current-river-float-trips-missouri'
   AND river_slug IS NULL;
