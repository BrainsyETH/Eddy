-- File: supabase/migrations/00117_snap_pois_and_campgrounds.sql
-- Add `location_snap` to points_of_interest and nps_campgrounds, plus auto-
-- snap triggers that mirror the existing access_points pipeline.
--
-- Why: the /missouri-surface-water map renders POIs (springs, caves, etc.)
-- and campgrounds at their raw lat/lon. POI coordinates are pinned to the
-- feature itself (a spring head, a cave mouth) and NPS campground
-- coordinates are pinned to the camp center — both can sit 50–500 m off
-- the river channel, which after the NHD HR geometry import in 00116
-- shows as a visible offset between markers and the (now correctly
-- meandering) river lines.
--
-- access_points already solved this with location_orig + location_snap
-- (migration 00010). This migration extends the same pattern to POIs and
-- campgrounds, then backfills via "UPDATE x SET y = y" which fires the
-- new triggers.

-- ─── points_of_interest ───────────────────────────────────────────────
ALTER TABLE points_of_interest
  ADD COLUMN IF NOT EXISTS location_snap GEOMETRY(Point, 4326),
  ADD COLUMN IF NOT EXISTS snap_distance_m NUMERIC(8, 2);

CREATE INDEX IF NOT EXISTS idx_poi_location_snap
  ON points_of_interest USING GIST (location_snap);

CREATE OR REPLACE FUNCTION auto_snap_poi()
RETURNS TRIGGER AS $$
DECLARE
  v_orig GEOMETRY(Point, 4326);
  snap_result RECORD;
BEGIN
  -- Need a real point + an assigned river to snap.
  IF NEW.latitude IS NULL OR NEW.longitude IS NULL OR NEW.river_id IS NULL THEN
    NEW.location_snap := NULL;
    NEW.snap_distance_m := NULL;
    RETURN NEW;
  END IF;

  v_orig := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);

  -- snap_to_river is defined in 00010_update_mile_calculations.sql.
  SELECT * INTO snap_result FROM snap_to_river(v_orig, NEW.river_id);

  -- Don't yank a POI 5 km from the river onto the bank — that breaks the
  -- spatial truth of features like distant trailheads. 1500 m is the
  -- same threshold used by the campground snap below; for tighter POI
  -- types (springs, river-channel caves) the actual distance is almost
  -- always under 200 m so this is a generous cap.
  IF snap_result.distance_from_original_meters <= 1500 THEN
    NEW.location_snap := snap_result.snapped_point;
  ELSE
    NEW.location_snap := NULL;
  END IF;
  NEW.snap_distance_m := snap_result.distance_from_original_meters;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_snap_poi_trigger ON points_of_interest;
CREATE TRIGGER auto_snap_poi_trigger
  BEFORE INSERT OR UPDATE OF latitude, longitude, river_id ON points_of_interest
  FOR EACH ROW EXECUTE FUNCTION auto_snap_poi();

-- Backfill every existing POI against current rivers.geom.
UPDATE points_of_interest SET latitude = latitude WHERE latitude IS NOT NULL;

-- ─── nps_campgrounds ──────────────────────────────────────────────────
-- Campgrounds aren't tied to a specific river in the schema, so we snap
-- to the NEAREST active river within 1500 m. Outside that radius we
-- leave location_snap NULL and the dataset RPC falls back to raw lat/lon.
ALTER TABLE nps_campgrounds
  ADD COLUMN IF NOT EXISTS location_snap GEOMETRY(Point, 4326),
  ADD COLUMN IF NOT EXISTS snap_river_id UUID REFERENCES rivers(id),
  ADD COLUMN IF NOT EXISTS snap_distance_m NUMERIC(8, 2);

CREATE INDEX IF NOT EXISTS idx_nps_campgrounds_location_snap
  ON nps_campgrounds USING GIST (location_snap);

CREATE OR REPLACE FUNCTION auto_snap_campground()
RETURNS TRIGGER AS $$
DECLARE
  v_orig GEOMETRY(Point, 4326);
  v_nearest RECORD;
BEGIN
  IF NEW.latitude IS NULL OR NEW.longitude IS NULL THEN
    NEW.location_snap := NULL;
    NEW.snap_river_id := NULL;
    NEW.snap_distance_m := NULL;
    RETURN NEW;
  END IF;

  v_orig := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);

  -- Nearest active river within 1500 m. Geography distance to be honest
  -- about meters at MO latitudes; <-> on geometry is fine for ordering.
  SELECT
    r.id AS river_id,
    ST_ClosestPoint(r.geom, v_orig) AS pt,
    ST_Distance(
      v_orig::geography,
      ST_ClosestPoint(r.geom, v_orig)::geography
    )::NUMERIC(8, 2) AS dist_m
  INTO v_nearest
  FROM rivers r
  WHERE r.active = TRUE
    AND ST_DWithin(r.geom::geography, v_orig::geography, 1500)
  ORDER BY r.geom <-> v_orig
  LIMIT 1;

  IF v_nearest.river_id IS NULL THEN
    NEW.location_snap := NULL;
    NEW.snap_river_id := NULL;
    NEW.snap_distance_m := NULL;
  ELSE
    NEW.location_snap := ST_SetSRID(v_nearest.pt, 4326);
    NEW.snap_river_id := v_nearest.river_id;
    NEW.snap_distance_m := v_nearest.dist_m;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_snap_campground_trigger ON nps_campgrounds;
CREATE TRIGGER auto_snap_campground_trigger
  BEFORE INSERT OR UPDATE OF latitude, longitude ON nps_campgrounds
  FOR EACH ROW EXECUTE FUNCTION auto_snap_campground();

-- Backfill every existing campground against current rivers.geom.
UPDATE nps_campgrounds SET latitude = latitude WHERE latitude IS NOT NULL;

COMMENT ON COLUMN points_of_interest.location_snap IS
  'Point snapped onto the assigned river_id''s geom when within 1500 m of it. NULL when the raw lat/lon is the source of truth.';
COMMENT ON COLUMN nps_campgrounds.location_snap IS
  'Point snapped onto the nearest active river within 1500 m. snap_river_id records which river. NULL when no river is within 1500 m and the raw lat/lon should be used.';
