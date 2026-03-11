-- 00067_social_weekly_schedules.sql
-- Expand river_schedules from flat {"river": "HH:MM"} to per-day-of-week
-- {"river": {"mon": "HH:MM", "tue": "HH:MM", ..., "sun": "HH:MM"}}
-- A null value for a day means the river won't post that day.

DO $$
DECLARE
  current_schedules JSONB;
  new_schedules JSONB := '{}'::jsonb;
  river_key TEXT;
  time_val TEXT;
BEGIN
  SELECT river_schedules INTO current_schedules FROM social_config LIMIT 1;

  IF current_schedules IS NOT NULL THEN
    FOR river_key IN SELECT jsonb_object_keys(current_schedules)
    LOOP
      time_val := current_schedules ->> river_key;
      -- If already nested (has a 'mon' key), skip migration
      IF (current_schedules -> river_key) ? 'mon' THEN
        new_schedules := new_schedules || jsonb_build_object(river_key, current_schedules -> river_key);
      ELSE
        -- Expand flat time to all 7 days
        new_schedules := new_schedules || jsonb_build_object(
          river_key, jsonb_build_object(
            'mon', time_val,
            'tue', time_val,
            'wed', time_val,
            'thu', time_val,
            'fri', time_val,
            'sat', time_val,
            'sun', time_val
          )
        );
      END IF;
    END LOOP;

    UPDATE social_config SET river_schedules = new_schedules;
  END IF;
END $$;

-- Update the column default for new rows
ALTER TABLE social_config
  ALTER COLUMN river_schedules SET DEFAULT '{
    "meramec": {"mon":"07:00","tue":"07:00","wed":"07:00","thu":"07:00","fri":"07:00","sat":"09:00","sun":"09:00"},
    "current": {"mon":"07:30","tue":"07:30","wed":"07:30","thu":"07:30","fri":"07:30","sat":"09:30","sun":"09:30"},
    "eleven-point": {"mon":"08:00","tue":"08:00","wed":"08:00","thu":"08:00","fri":"08:00","sat":"10:00","sun":"10:00"},
    "jacks-fork": {"mon":"08:30","tue":"08:30","wed":"08:30","thu":"08:30","fri":"08:30","sat":"10:30","sun":"10:30"},
    "niangua": {"mon":"09:00","tue":"09:00","wed":"09:00","thu":"09:00","fri":"09:00","sat":"11:00","sun":"11:00"},
    "big-piney": {"mon":"09:30","tue":"09:30","wed":"09:30","thu":"09:30","fri":"09:30","sat":"11:30","sun":"11:30"},
    "huzzah": {"mon":"10:00","tue":"10:00","wed":"10:00","thu":"10:00","fri":"10:00","sat":"12:00","sun":"12:00"},
    "courtois": {"mon":"10:30","tue":"10:30","wed":"10:30","thu":"10:30","fri":"10:30","sat":"12:30","sun":"12:30"}
  }'::jsonb;
