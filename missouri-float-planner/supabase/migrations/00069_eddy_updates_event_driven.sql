-- Add event-driven regeneration tracking to eddy_updates table
-- Supports throttling and monitoring of event-driven vs scheduled updates

ALTER TABLE eddy_updates
  ADD COLUMN IF NOT EXISTS trigger_reason TEXT DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS is_event_driven BOOLEAN DEFAULT FALSE;

-- Index for throttle queries (checking recent event-driven updates per river)
CREATE INDEX IF NOT EXISTS idx_eddy_updates_event_driven
  ON eddy_updates (river_slug, is_event_driven, generated_at DESC)
  WHERE is_event_driven = TRUE;

COMMENT ON COLUMN eddy_updates.trigger_reason IS 'What triggered this update: scheduled, condition_change, rapid_change';
COMMENT ON COLUMN eddy_updates.is_event_driven IS 'Whether this update was triggered by a real-time event vs the scheduled cron';
