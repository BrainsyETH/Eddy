-- File: supabase/migrations/00161_latest_readings_rpc.sql
-- Deterministic "latest reading per station" lookup for the live-conditions
-- overlay (src/lib/social/live-conditions.ts).
--
-- The overlay previously fetched readings with:
--     .in('gauge_station_id', stationIds).order('reading_timestamp', desc)
-- with no LIMIT, then took the first row seen per station. PostgREST caps
-- result sets (default 1000 rows), so as gauge_readings grew (24k+ rows for
-- the primary stations alone) and high-frequency storm polling multiplied
-- rows, that 1000-row window could stop covering every station — a station
-- whose latest reading fell outside the window got NO row, was treated as
-- having a stale/absent reading, and its Eddy "Says" prose was blanked to the
-- static fallback. This returns exactly one row (the newest) per station via a
-- DISTINCT ON that rides the existing idx_gauge_readings_latest
-- (gauge_station_id, reading_timestamp DESC) index, so coverage can't degrade
-- with table size.

CREATE OR REPLACE FUNCTION latest_readings_for_stations(p_station_ids UUID[])
RETURNS TABLE (
  gauge_station_id UUID,
  gauge_height_ft NUMERIC,
  discharge_cfs NUMERIC,
  reading_timestamp TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT ON (gr.gauge_station_id)
    gr.gauge_station_id,
    gr.gauge_height_ft,
    gr.discharge_cfs,
    gr.reading_timestamp
  FROM gauge_readings gr
  WHERE gr.gauge_station_id = ANY(p_station_ids)
  ORDER BY gr.gauge_station_id, gr.reading_timestamp DESC;
$$;

COMMENT ON FUNCTION latest_readings_for_stations IS
  'Returns the single most-recent gauge_readings row per station id. Used by the live-conditions overlay so per-station coverage is immune to PostgREST row caps.';

GRANT EXECUTE ON FUNCTION latest_readings_for_stations(UUID[]) TO anon, authenticated, service_role;
