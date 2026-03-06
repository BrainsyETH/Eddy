-- 00058_social_media.sql
-- Social media posting tables for Instagram & Facebook integration

-- ============================================================
-- Table: social_posts — tracks every post sent to social platforms
-- ============================================================
CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_type TEXT NOT NULL CHECK (post_type IN ('daily_digest', 'river_highlight')),
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'facebook')),
  river_slug TEXT, -- null for daily_digest posts
  caption TEXT NOT NULL,
  image_url TEXT,
  hashtags TEXT[] DEFAULT '{}',
  platform_post_id TEXT, -- ID returned from Meta API after publishing
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'publishing', 'published', 'failed', 'skipped')),
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  eddy_update_id UUID, -- FK to eddy_updates if based on a specific update
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent duplicate posts: one per type/platform/day/river
CREATE UNIQUE INDEX idx_social_posts_dedup
  ON social_posts (post_type, platform, (created_at::date), COALESCE(river_slug, '__global__'));

-- Query indices
CREATE INDEX idx_social_posts_status ON social_posts (status);
CREATE INDEX idx_social_posts_created ON social_posts (created_at DESC);
CREATE INDEX idx_social_posts_platform ON social_posts (platform, created_at DESC);

-- ============================================================
-- Table: social_config — single-row admin-managed settings
-- ============================================================
CREATE TABLE IF NOT EXISTS social_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  posting_enabled BOOLEAN NOT NULL DEFAULT true,
  posting_frequency_hours INTEGER NOT NULL DEFAULT 6,
  digest_enabled BOOLEAN NOT NULL DEFAULT true,
  digest_time_utc TEXT NOT NULL DEFAULT '12:30',
  highlights_per_run INTEGER NOT NULL DEFAULT 2,
  highlight_cooldown_hours INTEGER NOT NULL DEFAULT 12,
  enabled_rivers TEXT[], -- null means all rivers
  disabled_rivers TEXT[] DEFAULT '{}',
  highlight_conditions TEXT[] NOT NULL DEFAULT '{optimal,dangerous,too_high,too_low}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enforce single-row constraint
CREATE UNIQUE INDEX idx_social_config_singleton ON social_config ((true));

-- Seed with default config row
INSERT INTO social_config (id) VALUES (gen_random_uuid());

-- ============================================================
-- Table: social_custom_content — admin-managed content snippets
-- ============================================================
CREATE TABLE IF NOT EXISTS social_custom_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL CHECK (content_type IN ('promo', 'tip', 'seasonal', 'cta')),
  text TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  start_date DATE, -- nullable, for seasonal content
  end_date DATE,   -- nullable, for seasonal content
  platforms TEXT[] NOT NULL DEFAULT '{instagram,facebook}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_social_custom_content_active ON social_custom_content (active, start_date, end_date);

-- Enable RLS on all tables
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_custom_content ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (cron jobs and admin API use service role)
CREATE POLICY "Service role full access on social_posts"
  ON social_posts FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on social_config"
  ON social_config FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on social_custom_content"
  ON social_custom_content FOR ALL
  USING (true) WITH CHECK (true);
