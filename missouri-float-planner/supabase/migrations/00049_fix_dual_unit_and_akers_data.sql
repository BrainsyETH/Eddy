-- supabase/migrations/00049_fix_dual_unit_and_akers_data.sql
-- Ensure alt_level_* columns exist and restore correct Akers gauge data.
--
-- Background:
--   Migration 00048_dual_unit_thresholds may have failed to apply.
--   The Akers gauge (07064533) threshold_unit was changed to 'ft' via admin
--   but the level_* values still held CFS numbers, causing a display mismatch.
--
-- This migration:
--   1. Adds alt_level_* columns idempotently (IF NOT EXISTS)
--   2. Restores Akers gauge to CFS primary with ft alternate values

-- ============================================
-- 1. Ensure alt_level_* columns exist
-- ============================================
ALTER TABLE river_gauges
  ADD COLUMN IF NOT EXISTS alt_level_too_low    NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS alt_level_low        NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS alt_level_optimal_min NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS alt_level_optimal_max NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS alt_level_high       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS alt_level_dangerous  NUMERIC(10,2);

-- ============================================
-- 2. Restore Akers gauge (07064533) → Current River
-- ============================================
-- Primary unit: CFS (from migration 00041)
--   150 cfs  = Too Low
--   200 cfs  = Low
--   300 cfs  = Optimal min
--   400 cfs  = Optimal max
--   550 cfs  = High
--   1000 cfs = Dangerous
--
-- Alternate unit: ft (from migration 00030 local knowledge)
--   1.0 ft = Too Low
--   1.5 ft = Low
--   2.0 ft = Optimal min
--   3.0 ft = Optimal max
--   3.5 ft = High
--   4.0 ft = Dangerous (NPS closure)

UPDATE river_gauges rg
SET
    threshold_unit       = 'cfs',
    level_too_low        = 150,
    level_low            = 200,
    level_optimal_min    = 300,
    level_optimal_max    = 400,
    level_high           = 550,
    level_dangerous      = 1000,
    alt_level_too_low    = 1.0,
    alt_level_low        = 1.5,
    alt_level_optimal_min = 2.0,
    alt_level_optimal_max = 3.0,
    alt_level_high       = 3.5,
    alt_level_dangerous  = 4.0
FROM rivers r, gauge_stations gs
WHERE rg.river_id = r.id
  AND rg.gauge_station_id = gs.id
  AND r.slug = 'current'
  AND gs.usgs_site_id = '07064533';
