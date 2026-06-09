-- 00063_condition_change_tracking.sql
-- Add last_condition_code to river_gauges for condition change detection

ALTER TABLE river_gauges
  ADD COLUMN IF NOT EXISTS last_condition_code text DEFAULT NULL;

COMMENT ON COLUMN river_gauges.last_condition_code IS 'Last computed condition code, used for change detection in gauge cron';
