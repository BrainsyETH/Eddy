-- File: supabase/migrations/00112_mo_surface_water_dataset_rpc.sql
-- Single-shot dataset for the /missouri-surface-water page.
--
-- Returns a JSON document with the floatable rivers (NHD-traced LineStrings),
-- their associated USGS gauges with thresholds, public access points, NPS
-- campgrounds, and points of interest. Live USGS readings are joined client-
-- side from waterservices.usgs.gov.

CREATE OR REPLACE FUNCTION get_mo_surface_water_dataset()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  WITH river_rows AS (
    SELECT
      r.id,
      r.slug,
      r.name,
      r.region,
      r.length_miles::float AS length_miles,
      ST_AsGeoJSON(r.geom)::jsonb AS geometry,
      (
        SELECT jsonb_agg(jsonb_build_object(
          'site_id', gs.usgs_site_id,
          'name', gs.name,
          'lon', ST_X(gs.location::geometry),
          'lat', ST_Y(gs.location::geometry),
          'is_primary', rg.is_primary,
          'threshold_unit', rg.threshold_unit,
          'level_optimal_min', rg.level_optimal_min,
          'level_optimal_max', rg.level_optimal_max,
          'level_high', rg.level_high,
          'level_dangerous', rg.level_dangerous
        ) ORDER BY rg.is_primary DESC, gs.name)
        FROM river_gauges rg
        JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
        WHERE rg.river_id = r.id AND gs.active = true
      ) AS gauges,
      (
        SELECT jsonb_agg(jsonb_build_object(
          'id', ap.id,
          'name', ap.name,
          'slug', ap.slug,
          'type', ap.type,
          'river_mile_downstream', ap.river_mile_downstream,
          'lon', ST_X(COALESCE(ap.location_snap, ap.location_orig)),
          'lat', ST_Y(COALESCE(ap.location_snap, ap.location_orig)),
          'ownership', ap.ownership
        ) ORDER BY ap.river_mile_downstream NULLS LAST)
        FROM access_points ap
        WHERE ap.river_id = r.id AND ap.approved = true
      ) AS access_points,
      (
        SELECT jsonb_agg(jsonb_build_object(
          'id', poi.id,
          'name', poi.name,
          'slug', poi.slug,
          'type', poi.type,
          'lat', poi.latitude,
          'lon', poi.longitude,
          'river_mile', poi.river_mile,
          'nps_url', poi.nps_url,
          'description', poi.description
        ) ORDER BY poi.river_mile NULLS LAST)
        FROM points_of_interest poi
        WHERE poi.river_id = r.id AND poi.active = true AND poi.latitude IS NOT NULL
      ) AS pois
    FROM rivers r
    WHERE r.active = true
    ORDER BY r.length_miles DESC NULLS LAST
  ),
  campground_rows AS (
    SELECT jsonb_agg(jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'lat', c.latitude,
      'lon', c.longitude,
      'total_sites', c.total_sites,
      'sites_reservable', c.sites_reservable,
      'sites_first_come', c.sites_first_come,
      'reservation_url', c.reservation_url,
      'nps_url', c.nps_url
    ) ORDER BY c.total_sites DESC NULLS LAST) AS campgrounds
    FROM nps_campgrounds c
    WHERE c.latitude IS NOT NULL AND c.longitude IS NOT NULL
  )
  SELECT jsonb_build_object(
    'rivers', COALESCE((SELECT jsonb_agg(to_jsonb(rr)) FROM river_rows rr), '[]'::jsonb),
    'campgrounds', COALESCE((SELECT campgrounds FROM campground_rows), '[]'::jsonb),
    'generated_at', NOW()
  );
$$;

GRANT EXECUTE ON FUNCTION get_mo_surface_water_dataset() TO anon, authenticated;
