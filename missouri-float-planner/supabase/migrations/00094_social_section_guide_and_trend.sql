-- Two more weekly reel types: Section Guide (rotates through put-in/take-out
-- pairs) and Weekly Trend (7-day gauge sparkline on the most-notable river).
-- Each gets its own JSONB config mirroring weekly_forecast.

ALTER TABLE social_config
  ADD COLUMN IF NOT EXISTS section_guide jsonb NOT NULL DEFAULT jsonb_build_object(
    'enabled', false,
    'day_of_week', 3,      -- Wed: midweek planning reel
    'time_utc', '17:00',   -- noon CT standard / 11am CDT
    'media', 'video'
  ),
  ADD COLUMN IF NOT EXISTS weekly_trend jsonb NOT NULL DEFAULT jsonb_build_object(
    'enabled', false,
    'day_of_week', 0,      -- Sun: retro + week-ahead framing
    'time_utc', '15:00',   -- 10am CT standard / 9am CDT
    'media', 'video'
  );
