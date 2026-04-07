-- ClipEngine: add content intelligence columns to social_posts
-- Supports content mix targeting, audience segmentation, and engagement tracking

-- Content decision engine columns
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS content_type TEXT;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS audience_segment TEXT;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS hook_style TEXT;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS source_clip_id UUID;

-- Meta API insights columns
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS impressions INTEGER;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS reach INTEGER;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS saves INTEGER;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS shares INTEGER;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS engagement_rate NUMERIC;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS insights_fetched_at TIMESTAMPTZ;

-- Weekly review storage
CREATE TABLE IF NOT EXISTS social_weekly_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  review_data JSONB NOT NULL,
  content_mix JSONB,
  top_performers JSONB,
  learnings TEXT,
  bias_guidance TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_reviews_week
  ON social_weekly_reviews(week_start);
