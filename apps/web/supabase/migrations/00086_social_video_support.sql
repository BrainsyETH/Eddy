-- Add video support to social_posts table
-- Allows posts to carry a video URL and be rendered asynchronously via GitHub Actions.

ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'image';

-- Validate media_type values
ALTER TABLE social_posts ADD CONSTRAINT social_posts_media_type_check
  CHECK (media_type IN ('image', 'video'));

-- Update existing status CHECK constraint to include 'rendering' state.
-- 'rendering' = video is being rendered by GitHub Actions, not yet published.
-- Drop old constraint if it exists, then add the new one.
DO $$
BEGIN
  -- Check if old constraint exists and drop it
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'social_posts_status_check'
  ) THEN
    ALTER TABLE social_posts DROP CONSTRAINT social_posts_status_check;
  END IF;
END $$;

ALTER TABLE social_posts ADD CONSTRAINT social_posts_status_check
  CHECK (status IN ('pending', 'rendering', 'publishing', 'published', 'failed', 'skipped'));
