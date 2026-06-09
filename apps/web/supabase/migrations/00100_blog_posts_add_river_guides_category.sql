-- 00100_blog_posts_add_river_guides_category.sql
-- The blog post page extracts FAQ JSON-LD only for posts with category
-- 'River Guides', but the existing CHECK constraint didn't allow that value.
-- Add it so river guide posts can be authored with the correct category.

ALTER TABLE blog_posts DROP CONSTRAINT IF EXISTS blog_posts_category_check;

ALTER TABLE blog_posts ADD CONSTRAINT blog_posts_category_check
  CHECK (category = ANY (ARRAY[
    'Guides'::text,
    'Tips'::text,
    'News'::text,
    'Safety'::text,
    'River Guides'::text,
    'River Profiles'::text,
    'Gear Reviews'::text,
    'Trip Reports'::text
  ]));
