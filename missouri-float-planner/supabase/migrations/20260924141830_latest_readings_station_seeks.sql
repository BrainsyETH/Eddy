-- Applied to production 2026-09-24, recorded as 20260924141830. Same RPC
-- contract as 00161, with one index seek per station
-- instead of scanning each station's history before DISTINCT ON discards it.
CREATE OR REPLACE FUNCTION public.latest_readings_for_stations(p_station_ids UUID[])
RETURNS TABLE (
  gauge_station_id UUID,
  gauge_height_ft NUMERIC,
  discharge_cfs NUMERIC,
  reading_timestamp TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT s.id, r.gauge_height_ft, r.discharge_cfs, r.reading_timestamp
  FROM (
    -- ANY(array) in the original function never duplicated stations. Also
    -- preserve its behavior for NULL IDs, NULL arrays and empty arrays.
    SELECT DISTINCT id FROM unnest(p_station_ids) AS requested(id)
    WHERE id IS NOT NULL
  ) s
  CROSS JOIN LATERAL (
    SELECT gr.gauge_height_ft, gr.discharge_cfs, gr.reading_timestamp
    FROM public.gauge_readings gr
    WHERE gr.gauge_station_id = s.id
    ORDER BY gr.reading_timestamp DESC
    LIMIT 1
  ) r
  ORDER BY s.id;
$$;

COMMENT ON FUNCTION public.latest_readings_for_stations(UUID[]) IS
  'Returns one newest reading per distinct requested station using idx_gauge_readings_latest. Stations without readings are omitted; work does not scan their history.';

-- CREATE OR REPLACE preserves the existing invoker security and grants.
