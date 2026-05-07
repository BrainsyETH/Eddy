-- File: supabase/migrations/00115_dataset_includes_thresholds.sql
-- Bump get_mo_surface_water_dataset() to include the threshold-provenance
-- columns added in 00114 plus the gauge's nws_lid (so the frontend can
-- request AHPS forecast peaks per primary gauge).
--
-- This is a superset of 00113: same gauge-snap logic, but each gauge row
-- now also carries flood_stage_ft, action_stage_ft, threshold_source,
-- threshold_source_url, and nws_lid.

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
          'site_id', g.usgs_site_id,
          'name', g.gauge_name,
          'nws_lid', g.nws_lid,
          'lon', g.lon_display,
          'lat', g.lat_display,
          'lon_raw', g.lon_raw,
          'lat_raw', g.lat_raw,
          'snap_distance_m', g.snap_distance_m,
          'is_primary', g.is_primary,
          'threshold_unit', g.threshold_unit,
          'level_optimal_min', g.level_optimal_min,
          'level_optimal_max', g.level_optimal_max,
          'level_high', g.level_high,
          'level_dangerous', g.level_dangerous,
          'flood_stage_ft', g.flood_stage_ft,
          'action_stage_ft', g.action_stage_ft,
          'threshold_source', g.threshold_source,
          'threshold_source_url', g.threshold_source_url,
          'threshold_updated_at', g.threshold_updated_at
        ) ORDER BY g.is_primary DESC, g.gauge_name)
        FROM (
          SELECT
            gs.usgs_site_id,
            gs.name AS gauge_name,
            gs.nws_lid,
            ST_X(gs.location::geometry) AS lon_raw,
            ST_Y(gs.location::geometry) AS lat_raw,
            ST_Distance(
              gs.location::geography,
              ST_ClosestPoint(r.geom, gs.location::geometry)::geography
            ) AS snap_distance_m,
            CASE
              WHEN ST_Distance(
                gs.location::geography,
                ST_ClosestPoint(r.geom, gs.location::geometry)::geography
              ) <= 500
              THEN ST_X(ST_ClosestPoint(r.geom, gs.location::geometry))
              ELSE ST_X(gs.location::geometry)
            END AS lon_display,
            CASE
              WHEN ST_Distance(
                gs.location::geography,
                ST_ClosestPoint(r.geom, gs.location::geometry)::geography
              ) <= 500
              THEN ST_Y(ST_ClosestPoint(r.geom, gs.location::geometry))
              ELSE ST_Y(gs.location::geometry)
            END AS lat_display,
            rg.is_primary,
            rg.threshold_unit,
            rg.level_optimal_min,
            rg.level_optimal_max,
            rg.level_high,
            rg.level_dangerous,
            rg.flood_stage_ft,
            rg.action_stage_ft,
            rg.threshold_source,
            rg.threshold_source_url,
            rg.threshold_updated_at
          FROM river_gauges rg
          JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
          WHERE rg.river_id = r.id AND gs.active = true
        ) g
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
