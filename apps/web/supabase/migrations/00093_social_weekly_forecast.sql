-- Weekly forecast reel — top 3 rivers for the upcoming weekend, typically
-- posted Friday afternoon. Shape mirrors daily_digest but fires once per
-- week on a specific weekday.

ALTER TABLE social_config
  ADD COLUMN IF NOT EXISTS weekly_forecast jsonb NOT NULL DEFAULT jsonb_build_object(
    'enabled', false,
    'day_of_week', 5,         -- 0=Sun..6=Sat; 5=Fri
    'time_utc', '22:00',      -- 5pm CT / 22:00 UTC in CST (21:00 in CDT)
    'media', 'video'          -- 'video' | 'image'
  );
