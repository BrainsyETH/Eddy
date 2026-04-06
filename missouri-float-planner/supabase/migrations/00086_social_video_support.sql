-- Add video support to social_posts table
-- Allows posts to carry a video URL instead of (or in addition to) an image URL.

ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'image';

-- Validate media_type values
ALTER TABLE social_posts ADD CONSTRAINT social_posts_media_type_check
  CHECK (media_type IN ('image', 'video'));
