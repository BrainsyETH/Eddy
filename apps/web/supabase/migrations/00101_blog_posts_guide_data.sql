-- 00101_blog_posts_guide_data.sql
-- Adds a structured guide_data JSONB column to blog_posts so River Guide posts
-- can drive a dedicated React layout (Field Notebook design) instead of being
-- limited to free-form HTML in `content`. Legacy posts keep working unchanged
-- because the renderer only switches when guide_data is non-null AND the post
-- is in the 'River Guides' category.
--
-- The column is intentionally schemaless on the DB side — shape is enforced in
-- TypeScript at src/types/blog.ts. JSONB lets us add fields without migrations
-- as the design evolves.

ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS guide_data JSONB;

COMMENT ON COLUMN blog_posts.guide_data IS
  'Structured payload for River Guide posts (hero, sections, springs, seasons, callouts, faq). When non-null and category = ''River Guides'', the blog page renders RiverGuideLayout instead of the legacy prose HTML.';
