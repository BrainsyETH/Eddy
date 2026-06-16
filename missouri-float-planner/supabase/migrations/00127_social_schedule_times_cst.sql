-- Rename schedule time fields from *_utc to *_cst. The scheduler already
-- interprets these as Central time (isDueNow uses CST); this aligns the column
-- and JSONB key names with that meaning. social_config is a single-row table.

-- 1) digest_time_utc column -> digest_time_cst (guarded for idempotency)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'social_config' AND column_name = 'digest_time_utc'
  ) THEN
    ALTER TABLE social_config RENAME COLUMN digest_time_utc TO digest_time_cst;
  END IF;
END $$;

-- 2) rename the time_utc key inside each weekly reel JSONB config (existing rows)
UPDATE social_config
SET weekly_forecast = (weekly_forecast - 'time_utc') || jsonb_build_object('time_cst', weekly_forecast->'time_utc')
WHERE weekly_forecast ? 'time_utc';

UPDATE social_config
SET section_guide = (section_guide - 'time_utc') || jsonb_build_object('time_cst', section_guide->'time_utc')
WHERE section_guide ? 'time_utc';

UPDATE social_config
SET weekly_trend = (weekly_trend - 'time_utc') || jsonb_build_object('time_cst', weekly_trend->'time_utc')
WHERE weekly_trend ? 'time_utc';

-- 3) update the JSONB column defaults so any future default insert uses time_cst
ALTER TABLE social_config ALTER COLUMN weekly_forecast SET DEFAULT jsonb_build_object(
  'enabled', false, 'day_of_week', 5, 'time_cst', '22:00', 'media', 'video'
);
ALTER TABLE social_config ALTER COLUMN section_guide SET DEFAULT jsonb_build_object(
  'enabled', false, 'day_of_week', 3, 'time_cst', '17:00', 'media', 'video'
);
ALTER TABLE social_config ALTER COLUMN weekly_trend SET DEFAULT jsonb_build_object(
  'enabled', false, 'day_of_week', 0, 'time_cst', '15:00', 'media', 'video'
);
