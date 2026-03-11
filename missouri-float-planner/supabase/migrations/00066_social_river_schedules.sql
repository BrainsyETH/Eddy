-- 00066_social_river_schedules.sql
-- Switch from cooldown-based posting to per-river fixed daily schedule.
-- Each river gets a CST posting time. Cron runs every 30 min and posts
-- any river whose scheduled time falls within the current window,
-- provided it hasn't already posted today.

ALTER TABLE social_config
  ADD COLUMN IF NOT EXISTS river_schedules JSONB NOT NULL DEFAULT '{
    "meramec": "07:00",
    "current": "07:30",
    "eleven-point": "08:00",
    "jacks-fork": "08:30",
    "niangua": "09:00",
    "big-piney": "09:30",
    "huzzah": "10:00",
    "courtois": "10:30"
  }'::jsonb;

-- Old columns (highlights_per_run, highlight_cooldown_hours, weekend_boost_enabled,
-- posting_frequency_hours) are kept for safe rollback. A future migration will drop them.
