-- File: supabase/migrations/00114_river_gauges_threshold_provenance.sql
-- Track provenance of stage thresholds and pull authoritative flood/action
-- stages from USGS site service + NWS AHPS forecast peaks.
--
-- The existing level_optimal_min/max/high/dangerous columns hold curated
-- paddler/outfitter judgement and aren't redundant with hydrologic flood
-- stages. We keep them, layer in the official stages alongside, and stamp
-- where each row's editorial values came from so the UI can credit the
-- source — and so we never silently overwrite outfitter knowledge with
-- generic flood numbers.
--
-- Also adds nws_lid to gauge_stations: NWS AHPS uses 5-letter location IDs
-- (e.g., "VBNM7" for Current River at Van Buren) that don't match USGS
-- site numbers. The nws_lid is required to pull AHPS forecast XML.

ALTER TABLE river_gauges
  ADD COLUMN IF NOT EXISTS flood_stage_ft NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS action_stage_ft NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS threshold_source TEXT
    CHECK (
      threshold_source IS NULL
      OR threshold_source IN ('usgs', 'nws_ahps', 'outfitter', 'editorial')
    ),
  ADD COLUMN IF NOT EXISTS threshold_source_url TEXT,
  ADD COLUMN IF NOT EXISTS threshold_updated_at TIMESTAMPTZ;

ALTER TABLE gauge_stations
  ADD COLUMN IF NOT EXISTS nws_lid TEXT;

CREATE INDEX IF NOT EXISTS idx_gauge_stations_nws_lid ON gauge_stations (nws_lid);

-- Mark every existing row with curated thresholds as 'editorial' so we
-- never confuse outfitter-curated bands with USGS-derived flood stages
-- once the sync script starts running.
UPDATE river_gauges
SET threshold_source = 'editorial',
    threshold_updated_at = NOW()
WHERE threshold_source IS NULL
  AND (
    level_optimal_min IS NOT NULL
    OR level_optimal_max IS NOT NULL
    OR level_high IS NOT NULL
    OR level_dangerous IS NOT NULL
  );
