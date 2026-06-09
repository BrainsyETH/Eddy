-- Stores AI-generated Eddy condition updates per river/section.
-- Populated by a cron job every 6 hours using Claude Haiku.

CREATE TABLE IF NOT EXISTS eddy_updates (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  river_slug    TEXT NOT NULL,
  section_slug  TEXT,                   -- null = whole river
  condition_code TEXT NOT NULL,
  gauge_height_ft NUMERIC,
  discharge_cfs  NUMERIC,
  quote_text    TEXT NOT NULL,
  sources_used  JSONB DEFAULT '[]',     -- list of data sources used
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL
);

-- Fast lookup: latest update per river+section
CREATE INDEX idx_eddy_updates_lookup
  ON eddy_updates (river_slug, section_slug, generated_at DESC);

-- Cleanup: find expired updates
CREATE INDEX idx_eddy_updates_expires
  ON eddy_updates (expires_at);

-- RLS: public read, service-role write
ALTER TABLE eddy_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read eddy updates"
  ON eddy_updates FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage eddy updates"
  ON eddy_updates FOR ALL
  USING (auth.role() = 'service_role');
