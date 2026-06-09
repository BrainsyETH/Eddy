-- ClipEngine: clip_library table for YouTube clip extraction pipeline
-- Stores metadata for clips extracted from YouTube videos

CREATE TABLE clip_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  youtube_video_id TEXT NOT NULL,
  youtube_channel TEXT,
  river_slug TEXT,
  clip_url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_secs NUMERIC,
  clip_start_secs NUMERIC,
  clip_end_secs NUMERIC,
  orientation TEXT DEFAULT 'landscape' CHECK (orientation IN ('landscape', 'portrait')),
  heatmap_score NUMERIC,
  brand_check_status TEXT DEFAULT 'pending' CHECK (brand_check_status IN ('pending', 'approved', 'rejected', 'review')),
  brand_check_result JSONB,
  source_creator TEXT,
  source_url TEXT,
  content_tags TEXT[] DEFAULT '{}',
  content_type TEXT,
  tone TEXT,
  used_in_posts UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_clip_library_river ON clip_library(river_slug);
CREATE INDEX idx_clip_library_brand ON clip_library(brand_check_status);
CREATE INDEX idx_clip_library_youtube ON clip_library(youtube_video_id);
CREATE INDEX idx_clip_library_created ON clip_library(created_at DESC);

-- Prevent duplicate clips from the same video at the same timestamp
CREATE UNIQUE INDEX idx_clip_library_dedup
  ON clip_library(youtube_video_id, clip_start_secs)
  WHERE clip_start_secs IS NOT NULL;
