-- 20260821123000_arkansas_river_hazards.sql
--
-- NOT YET APPLIED. Apply by hand, then confirm the recorded version with
-- `npm run db:check-migrations` and rename this file to match.
--
-- The first river_hazards rows for any Arkansas river. Before this, all 19
-- hazards in the catalog are Missouri and all 7 AR rivers have zero — the one
-- real gap the POI audit surfaced, underneath ~26 duplicate access points it
-- also proposed. See docs/AR_POI_AUDIT_RECONCILIATION_2026-08-21.md.
--
-- Four rows. Only four, on purpose — see "What is deliberately NOT here".
--
-- ── Sources, with retrieval date ──────────────────────────────────────────
--
-- Retrieved 2026-08-21. No archive URL is recorded because neither publisher
-- offers one; both are the operating outfitter for the reach they describe,
-- which is the strongest routinely-available source for these features.
--
--   Turner Bend Outfitter (Cass, AR), turnerbend.com/MulberryRiver.html
--     — publisher operates the Turner Bend store/access on the Mulberry.
--     Names Sacroiliac Rapid, Hamm Falls, Hell Roaring Falls and locates each
--     relative to a named access; also the level bands quoted below.
--   Arkansas Canoe Club forums + AR Own Backyard (2022 trip report),
--     forums.arkansascanoeclub.com, arownbackyard.com
--     — the Kings River Marble→Marshall Ford low-water bridges, the blown-out
--     center, the hydraulic, and the river-left portage.
--
-- The audit called the Mulberry rapid "The SAC". It is Sacroiliac Rapid, per
-- the audit's own cited source. The abbreviation is what a shuttle driver says
-- out loud; it is not the name of the feature.
--
-- ── How each coordinate was derived, and why not the 00173 way ────────────
--
-- None of these four features has a published coordinate. Every source locates
-- them the way a paddler does: "2 miles below Redding", "half a mile before
-- Campbell Cemetery", "the 10 mile mark". So each position is DERIVED, and the
-- derivation has to be stated rather than implied by a decimal.
--
-- 00173's footer solves this by interpolating along a straight line between the
-- two bracketing access points:
--
--   ST_LineInterpolatePoint(ST_MakeLine(a_pt, b_pt), (m - a_m)/(b_m - a_m))
--
-- That is right in principle — calibrate on access points, whose coordinates
-- are known good, rather than trusting the global mile↔line assumption
-- get_point_at_mile() makes — and it is wrong in practice on these two rivers.
-- A chord between two accesses cuts across the bends. Measured before writing
-- this, that method puts these four hazards 176 m, 489 m, 627 m and 1,040 m off
-- the water. A hazard pin a kilometre into the woods is worse than no pin: it
-- reads as precision and points at a hillside.
--
-- What is used instead keeps 00173's calibration and puts the point on the
-- river. Locate the two bracketing accesses ON the merged line, interpolate the
-- fraction between them, then interpolate along the line:
--
--   frac  = a_f + ((m - a_m)/(b_m - a_m)) * (b_f - a_f)
--   point = ST_LineInterpolatePoint(ST_LineMerge(r.geom), frac)
--
-- Still local, so a river whose mileage is not linear in its line — which is
-- every river in this catalog — is handled correctly between each pair of
-- accesses. Measured the same way, all four land at 0.0 m off the river.
-- Both geometries are a clean LINESTRING after ST_LineMerge, checked, so
-- ST_LineLocatePoint is well defined.
--
-- The coordinates this produced on 2026-08-21 are asserted below as a tripwire.
-- The migration recomputes from live geometry at apply time rather than
-- hard-coding, so it stays correct if the line is improved; but if the line has
-- moved far enough that a hazard would land >150 m from the reviewed position,
-- it aborts instead of quietly repositioning a safety marker.
--
-- ── Why not DELETE + INSERT, the way 00173 does it ────────────────────────
--
-- Because these rows are referenced and editable, and 00173's rows were neither
-- at the time it ran:
--
--   community_reports.hazard_id -> river_hazards(id) ON DELETE SET NULL
--
-- A DELETE+INSERT re-run does not error and does not cascade. It silently
-- detaches every user-submitted community report from the hazard it was filed
-- against, leaving the report in place with a null link and no way to tell
-- afterwards that it ever had one. /api/admin/hazards/[id] also exposes a PUT
-- over name, type, severity, description, portage and river mile, so an
-- operator's correction would be reverted by the same re-run.
--
-- So: guarded UPDATE on the natural key, then INSERT ... WHERE NOT EXISTS.
-- Re-running is a no-op that preserves ids, reports, and timestamps. The
-- natural key is (river_id, name); renaming a hazard through the admin PUT
-- makes the next run insert a second row rather than detach reports from the
-- first, which is the direction that fails safely.
--
-- No explicit BEGIN/COMMIT: the Supabase CLI and the management API each wrap a
-- migration in one transaction already. Same call 20260816112125 made, and for
-- the same reason — nesting our own risks committing theirs early.
--
-- ── What is deliberately NOT here ─────────────────────────────────────────
--
-- Every other feature the research turned up is located only by reach, and a
-- reach is not a point:
--
--   Mulberry  Low Water Bridge   "Wolf Pen to Turner Bend" — a 16-mile reach
--   Mulberry  Troll Shoal        "just above Low Water Bridge"
--   Mulberry  Whoop and Holler   "after High Bank Access"
--   Mulberry  Big Al's Twist, Chainsaw Jungle   "2 mi below Little Mulberry"
--   Mulberry  Rocking Horse / Picture Book      "midway Turner Bend→Campbell"
--   Crooked   fast chutes        "Turkey to Kelley's Slab"
--   Caddo     pool-and-drop Class I–II character
--
-- Placing those would mean inventing the precision, which is exactly the defect
-- this whole change exists to correct. The Mulberry Low Water Bridge matters
-- most of them — it is impassable at 4.6–5.0 ft — and it is the one whose reach
-- is widest, so it goes to river_characteristics as prose in the companion
-- migration rather than becoming a pin somewhere in sixteen miles.
--
-- Nothing is added for War Eagle Creek. No hazard there has a published
-- coordinate, and its stored line is under an open trust finding
-- (length_miles 33.17 against a 68.10-mile line; 20260805190000 investigated
-- and deliberately left it), so a mile-derived position on that river would be
-- derived from a line already known to be wrong.
--
-- Level bands stay out of min_safe_level / max_safe_level. Those columns are
-- bare numerics with no gauge key, and the Mulberry's numbers are Turner Bend
-- gauge feet; writing them here would attach them to whichever gauge a later
-- reader assumed. They go in river_characteristics with the gauge named.
--
-- ── Rollback ──────────────────────────────────────────────────────────────
--
-- These four rows did not exist before this migration, so deleting exactly them
-- restores the prior state:
--
--   delete from river_hazards h using rivers r
--    where h.river_id = r.id and (r.slug, h.name) in (
--      ('kings-river','Low-water bridge above Marshall Ford'),
--      ('mulberry','Sacroiliac Rapid'),
--      ('mulberry','Hamm Falls'),
--      ('mulberry','Hell Roaring Falls'));
--
-- NOT recoverable by that delete: any community_reports filed against these
-- hazards after they ship, which the ON DELETE SET NULL above would silently
-- detach. Check `select count(*) from community_reports where hazard_id in (...)`
-- before rolling back, and if it is non-zero, set active=false instead of
-- deleting.

-- ── Derive the positions ──────────────────────────────────────────────────
CREATE TEMP TABLE ar_hazard_staging ON COMMIT DROP AS
WITH proposed(slug, name, type, severity, m, portage_required, portage_side,
              description, seasonal_notes, expect_lat, expect_lon) AS (
  VALUES
  ('kings-river', 'Low-water bridge above Marshall Ford', 'low_water_dam', 'danger',
   34.39::numeric, TRUE, 'left',
   'The second and more dangerous of the two low-water bridges between Marble and Marshall Ford, about ten miles below Marble and just past a swinging bridge. The center has been blasted out and a hydraulic forms at the base that will hold a swimmer under. Portage river left; unloading the boat is usually necessary. The first low-water bridge upstream is an easier portage but should not be run either.',
   'The hydraulic at the blown-out center is worst at moderate-to-high flow, and the whole structure is a drowning hazard once water is over the slab. Portage at every level.',
   36.17946::numeric, -93.65503::numeric),

  ('mulberry', 'Sacroiliac Rapid', 'rapid', 'warning',
   34.21, FALSE, NULL,
   'About two miles below Redding Recreation Area and above Turner Bend. A large boulder sits on the outside of a right-hand curve; the usual line is to stay right. Known locally as "the SAC".',
   'Builds with flow. Turner Bend gauge: 1.5-1.7 ft suits beginners, 3.0-3.6 ft is prime whitewater, and the river gets dangerous above about 4.5 ft.',
   35.68521, -93.81097),

  ('mulberry', 'Hamm Falls', 'rapid', 'warning',
   45.94, FALSE, NULL,
   'About half a mile above the Campbell Cemetery access, and one of the biggest drops on the river. Scout it if you have not run this reach before.',
   'Builds with flow. Turner Bend gauge: 1.5-1.7 ft suits beginners, 3.0-3.6 ft is prime whitewater, and the river gets dangerous above about 4.5 ft.',
   35.61993, -93.90651),

  ('mulberry', 'Hell Roaring Falls', 'rapid', 'warning',
   49.44, FALSE, NULL,
   'About three miles below the Campbell Cemetery access. A clean drop at moderate flow that throws a large wave when the river is up.',
   'Builds with flow. Turner Bend gauge: 1.5-1.7 ft suits beginners, 3.0-3.6 ft is prime whitewater, and the river gets dangerous above about 4.5 ft.',
   35.61228, -93.92189)
),
riv AS (
  SELECT r.id, r.slug, ST_LineMerge(r.geom::geometry) AS line
  FROM rivers r
  WHERE r.slug IN ('kings-river', 'mulberry')
),
bracketed AS (
  SELECT p.*, riv.id AS river_id, riv.line,
    (SELECT ap.river_mile_downstream FROM access_points ap
      WHERE ap.river_id = riv.id AND ap.location_snap IS NOT NULL
        AND ap.river_mile_downstream <= p.m
      ORDER BY ap.river_mile_downstream DESC LIMIT 1) AS a_m,
    (SELECT ST_LineLocatePoint(riv.line, ap.location_snap::geometry) FROM access_points ap
      WHERE ap.river_id = riv.id AND ap.location_snap IS NOT NULL
        AND ap.river_mile_downstream <= p.m
      ORDER BY ap.river_mile_downstream DESC LIMIT 1) AS a_f,
    (SELECT ap.river_mile_downstream FROM access_points ap
      WHERE ap.river_id = riv.id AND ap.location_snap IS NOT NULL
        AND ap.river_mile_downstream >= p.m
      ORDER BY ap.river_mile_downstream ASC LIMIT 1) AS b_m,
    (SELECT ST_LineLocatePoint(riv.line, ap.location_snap::geometry) FROM access_points ap
      WHERE ap.river_id = riv.id AND ap.location_snap IS NOT NULL
        AND ap.river_mile_downstream >= p.m
      ORDER BY ap.river_mile_downstream ASC LIMIT 1) AS b_f
  FROM proposed p
  JOIN riv ON riv.slug = p.slug
)
SELECT
  river_id, slug, name, type, severity, m AS river_mile_downstream,
  portage_required, portage_side, description, seasonal_notes,
  expect_lat, expect_lon, a_f, b_f,
  (a_f + ((m - a_m) / (b_m - a_m)) * (b_f - a_f))::float8 AS frac,
  ST_SetSRID(
    ST_LineInterpolatePoint(line, (a_f + ((m - a_m) / (b_m - a_m)) * (b_f - a_f))::float8),
    4326
  ) AS location
FROM bracketed;

-- ── Update rows that already carry these names, insert the rest ───────────
-- Never DELETE: community_reports.hazard_id would be silently set null.
UPDATE river_hazards h
SET type                  = s.type,
    severity              = s.severity,
    river_mile_downstream = s.river_mile_downstream,
    portage_required      = s.portage_required,
    portage_side          = s.portage_side,
    description           = s.description,
    seasonal_notes        = s.seasonal_notes,
    location              = s.location,
    active                = TRUE,
    updated_at            = now()
FROM ar_hazard_staging s
WHERE h.river_id = s.river_id AND h.name = s.name;

INSERT INTO river_hazards (
  river_id, name, type, severity, river_mile_downstream,
  portage_required, portage_side, description, seasonal_notes, active, location
)
SELECT
  s.river_id, s.name, s.type, s.severity, s.river_mile_downstream,
  s.portage_required, s.portage_side, s.description, s.seasonal_notes, TRUE, s.location
FROM ar_hazard_staging s
WHERE NOT EXISTS (
  SELECT 1 FROM river_hazards h
  WHERE h.river_id = s.river_id AND h.name = s.name
);

-- ── Assertions ────────────────────────────────────────────────────────────
DO $$
DECLARE
  n     integer;
  bad   text;
BEGIN
  -- 1. Exactly the four rows, present and active.
  SELECT count(*) INTO n
  FROM river_hazards h JOIN ar_hazard_staging s
    ON s.river_id = h.river_id AND s.name = h.name
  WHERE h.active;
  IF n <> 4 THEN
    RAISE EXCEPTION 'expected 4 Arkansas hazards, found %', n;
  END IF;

  -- 2. No duplicate natural keys. The UPDATE-then-INSERT shape cannot create
  --    one, but a pre-existing duplicate would make the UPDATE ambiguous and
  --    is worth catching here rather than in the app.
  SELECT string_agg(format('%s x%s', name, c), '; ') INTO bad
  FROM (
    SELECT h.name, count(*) c
    FROM river_hazards h JOIN ar_hazard_staging s
      ON s.river_id = h.river_id AND s.name = h.name
    GROUP BY h.name HAVING count(*) > 1
  ) d;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'duplicate (river_id, name) among the new hazards: %', bad;
  END IF;

  -- 3. Every hazard has a location, and it is not (0,0).
  --    shapes.ts toHazard() maps a missing location to {lng:0, lat:0}, which
  --    renders in the Gulf of Guinea rather than failing.
  SELECT string_agg(h.name, '; ') INTO bad
  FROM river_hazards h JOIN ar_hazard_staging s
    ON s.river_id = h.river_id AND s.name = h.name
  WHERE h.location IS NULL
     OR (abs(ST_X(h.location::geometry)) < 0.0001
         AND abs(ST_Y(h.location::geometry)) < 0.0001);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'hazard with null or null-island location: %', bad;
  END IF;

  -- 4. Every hazard is ON its river, not beside it. This is the assertion the
  --    00173 chord method would have failed by up to 1,040 m.
  SELECT string_agg(format('%s %sm', h.name,
           round(ST_Distance(h.location::geography, ST_LineMerge(r.geom::geometry)::geography)::numeric, 0)), '; ')
    INTO bad
  FROM river_hazards h
  JOIN ar_hazard_staging s ON s.river_id = h.river_id AND s.name = h.name
  JOIN rivers r ON r.id = h.river_id
  WHERE ST_Distance(h.location::geography, ST_LineMerge(r.geom::geometry)::geography) > 50;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'hazard is not on its river: %', bad;
  END IF;

  -- 5. Each derived point lies BETWEEN its two bracketing access points along
  --    the line, not merely at a plausible river mile. A fraction outside the
  --    bracket means the mileage and the geometry disagree about ordering, and
  --    the position is not trustworthy even though it is on the water.
  SELECT string_agg(format('%s frac %s outside [%s, %s]',
           name, round(frac::numeric, 6), round(a_f::numeric, 6), round(b_f::numeric, 6)), '; ')
    INTO bad
  FROM ar_hazard_staging
  WHERE frac < least(a_f, b_f) OR frac > greatest(a_f, b_f);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'derived position falls outside its bracketing accesses: %', bad;
  END IF;

  -- 6. Tripwire on the reviewed coordinates. These positions were computed and
  --    eyeballed on 2026-08-21 against the geometry as it stood then. The
  --    migration recomputes rather than hard-coding, so an improved line yields
  --    an improved position — but a line that moved this far has changed
  --    something a person should look at before safety pins move with it.
  SELECT string_agg(format('%s moved %sm from the reviewed position', h.name,
           round(ST_Distance(h.location::geography,
                 ST_SetSRID(ST_MakePoint(s.expect_lon, s.expect_lat), 4326)::geography)::numeric, 0)), '; ')
    INTO bad
  FROM river_hazards h JOIN ar_hazard_staging s
    ON s.river_id = h.river_id AND s.name = h.name
  WHERE ST_Distance(h.location::geography,
        ST_SetSRID(ST_MakePoint(s.expect_lon, s.expect_lat), 4326)::geography) > 150;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'river geometry has changed since review: %', bad;
  END IF;

  -- 7. Arkansas is no longer a hazard desert. The point of the change, stated
  --    as an invariant so a partial apply cannot look like success.
  SELECT count(*) INTO n
  FROM river_hazards h JOIN rivers r ON r.id = h.river_id
  WHERE r.state = 'AR' AND h.active;
  IF n < 4 THEN
    RAISE EXCEPTION 'expected at least 4 active Arkansas hazards, found %', n;
  END IF;
END $$;
