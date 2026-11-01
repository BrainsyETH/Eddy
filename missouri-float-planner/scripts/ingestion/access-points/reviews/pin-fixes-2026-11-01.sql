-- Pin fixes, 2026-11-01. Applied to production (ilefwfpvphadsbptiaur) with the
-- owner's authorization ("Fix the Boiling Spring and Hwy 160 pins").
--
-- Both records were flagged by the missing-access finder v2 as pinned off the
-- real (USGS NHD) channel; see ../../finder-2026-11/README.md.
--
-- Run as SQL, not through the JS repair script: the Supabase JS client does not
-- reliably round-trip a PostGIS geometry (00121 header). The update fires the
-- access_points_auto_snap trigger, which recomputes location_snap and
-- snap_distance_m. Each update is compare-and-set on id, slug, the old pin, the
-- old miles and updated_at, and the block aborts unless exactly one row matches.
--
-- boiling-spring (Big Piney, approved): the pin was a rounded placeholder
-- (37.435, -91.97), 458 m from Eddy's line and far from the channel. MDC's
-- own Boat Ramps layer (Area_Feature_Layers/17, OBJECTID 39, Area_ID 6422,
-- "Boiling Spring Access") puts the ramp at 37.461580, -91.987636, 14 m from
-- the channel. That is 2.1 line-miles downstream of the old pin, so the mile
-- moves too: interpolated on the curated scale between Sandy Shoals Ford
-- (34.6, line 33.5) and Mason Bridge Access (50.4, line 48.9) at line 43.3,
-- giving 44.6; upstream = 107.9 - 44.6 = 63.3 (every Big Piney row sums to
-- 107.9). Boiling Spring to Mason Bridge becomes 5.8 mi; published float
-- reports put it at about 6.
--
-- hwy-160-bridge (Eleven Point, unapproved): its description is the Riverton
-- bridge ("Riverton and Hwy. 160 Bridge"), mile 35.7, but it was pinned at
-- 36.7985, -91.3834, 17 km upriver. Moved to where Census US Hwy 160 crosses
-- the NHD Eleven Point channel: 36.648742, -91.200844 (34 m from the approved
-- Riverton pin). Miles unchanged. It stays unapproved: it duplicates Riverton.

DO $$
DECLARE n int;
BEGIN
  UPDATE access_points
     SET location_orig = ST_SetSRID(ST_MakePoint(-91.98763606318313, 37.461580058380655), 4326),
         river_mile_downstream = 44.6,
         river_mile_upstream = 63.3
   WHERE id = 'a91dbfea-0acf-4c0b-9167-2e838272b644' AND slug = 'boiling-spring'
     AND ST_Equals(location_orig, ST_SetSRID(ST_MakePoint(-91.97, 37.435), 4326))
     AND river_mile_downstream = 42.40 AND river_mile_upstream = 65.50
     AND updated_at = '2026-11-01 12:23:58.389333+00';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'boiling-spring: expected 1 row, matched %', n; END IF;

  UPDATE access_points
     SET location_orig = ST_SetSRID(ST_MakePoint(-91.200844, 36.648742), 4326)
   WHERE id = '94ac2517-4746-45ab-91e9-e47b9e0f642a' AND slug = 'hwy-160-bridge'
     AND ST_Equals(location_orig, ST_SetSRID(ST_MakePoint(-91.3833843241748, 36.79850003593019), 4326))
     AND updated_at = '2026-05-10 16:14:46.093078+00';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'hwy-160-bridge: expected 1 row, matched %', n; END IF;

  -- Link the MDC ramp as the evidence row for Boiling Spring.
  UPDATE agency_gis_features SET access_point_id = 'a91dbfea-0acf-4c0b-9167-2e838272b644'
   WHERE provider = 'mdc' AND source_type = 'Boat Ramps' AND name = 'Boiling Spring Access' AND access_point_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'MDC ramp link: expected 1 row, matched %', n; END IF;
END $$;

-- Rollback (the values before this change):
--   UPDATE access_points SET location_orig = ST_SetSRID(ST_MakePoint(-91.97, 37.435), 4326),
--          river_mile_downstream = 42.40, river_mile_upstream = 65.50
--    WHERE id = 'a91dbfea-0acf-4c0b-9167-2e838272b644';
--   UPDATE access_points SET location_orig = ST_SetSRID(ST_MakePoint(-91.3833843241748, 36.79850003593019), 4326)
--    WHERE id = '94ac2517-4746-45ab-91e9-e47b9e0f642a';
--   UPDATE agency_gis_features SET access_point_id = NULL
--    WHERE provider = 'mdc' AND source_type = 'Boat Ramps' AND name = 'Boiling Spring Access';
