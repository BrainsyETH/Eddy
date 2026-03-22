-- Add video reel support to social_posts table

-- Video URL for rendered reel MP4s (stored in Vercel Blob)
ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Media type discriminator: 'image' for current OG images, 'video' for Remotion reels
ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'image';

-- Validate media_type values
ALTER TABLE social_posts
  ADD CONSTRAINT social_posts_media_type_check
  CHECK (media_type IN ('image', 'video'));

-- Index for finding video posts (useful for admin UI, cleanup)
CREATE INDEX IF NOT EXISTS idx_social_posts_media_type
  ON social_posts (media_type)
  WHERE media_type = 'video';

COMMENT ON COLUMN social_posts.video_url IS 'Vercel Blob URL for rendered Remotion reel MP4';
COMMENT ON COLUMN social_posts.media_type IS 'Whether this post uses a static image or video reel';
