-- supabase/migrations/00048_dual_unit_thresholds.sql
-- Add alternate-unit threshold columns to river_gauges
--
-- Each gauge already has thresholds in one unit (threshold_unit = 'ft' or 'cfs').
-- These new columns store thresholds in the OTHER unit so the UI can toggle
-- between gauge height (ft) and discharge (cfs) views.
--
-- Convention:
--   threshold_unit = 'ft'  → level_* are in ft,  alt_level_* are in cfs
--   threshold_unit = 'cfs' → level_* are in cfs, alt_level_* are in ft

ALTER TABLE river_gauges
  ADD COLUMN IF NOT EXISTS alt_level_too_low    NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS alt_level_low        NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS alt_level_optimal_min NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS alt_level_optimal_max NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS alt_level_high       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS alt_level_dangerous  NUMERIC(10,2);

COMMENT ON COLUMN river_gauges.alt_level_too_low IS 'Too-low threshold in the alternate unit (opposite of threshold_unit)';
COMMENT ON COLUMN river_gauges.alt_level_low IS 'Low threshold in the alternate unit';
COMMENT ON COLUMN river_gauges.alt_level_optimal_min IS 'Optimal-min threshold in the alternate unit';
COMMENT ON COLUMN river_gauges.alt_level_optimal_max IS 'Optimal-max threshold in the alternate unit';
COMMENT ON COLUMN river_gauges.alt_level_high IS 'High threshold in the alternate unit';
COMMENT ON COLUMN river_gauges.alt_level_dangerous IS 'Dangerous threshold in the alternate unit';
