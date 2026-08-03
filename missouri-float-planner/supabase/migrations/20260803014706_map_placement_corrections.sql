-- 20260803014706_map_placement_corrections.sql
-- Places that draw in the wrong spot on the map.
--
-- Two unrelated defects with one symptom: a pin miles from the water it belongs
-- to. Reported from the app as "some of the campgrounds and hazards are in the
-- wrong location, examples: Red Bluff and Dillard Mill".
--
-- APPLIED to production on 2026-08-03, recorded as migration 20260803014706.
-- Every UPDATE below is idempotent and addressed by slug or by distance from the
-- river line, so re-running it is a no-op.
--
--
-- ── 1. Two campgrounds that are the same place twice ────────────────────────
--
-- Red Bluff and Dillard Mill each exist in BOTH tables: as an access point on
-- the Huzzah, and as a `nearby_services` row of type campground. The access
-- points are right — 0.04 and 0.10 miles from the Huzzah Creek line, and both
-- within 60 m of the OSM features for the same places (node 12537584637,
-- "Red Bluff", operator=Forest Service, tourism=camp_site; node 358084313,
-- "Dillard Mill State Historic Site"). The service rows are not:
--
--   red-bluff-campground-usfs   37.8862, -91.3390   8.71 mi off the creek
--   dillard-mill-campground     37.8300, -91.3826  10.58 mi off the creek
--
-- Both came in with migration 00073 and have never been checked against the
-- geometry. They are the ONLY campground services in the whole table more than
-- a mile from their river; the three other off-river services are outfitters and
-- lodges, where a business address away from the bank is ordinary and correct.
--
-- The map's Campgrounds layer draws service rows directly, so switching the
-- layer on put a tent eight to ten miles west of the campground it named, while
-- the correct access-point pin sat on the creek under a different mark. Two
-- pins, one place, and the wrong one is the one labelled "Campground".
--
-- Corrected to the access point's coordinate, written out as LITERALS rather
-- than selected from access_points: supabase/seed/access_points.sql carried the
-- same two wrong points until today, so on a rebuild-from-seed a copy would have
-- copied the error from one table into the other. (The seed is fixed too, and
-- the two files now agree to the sixth decimal — but a data correction that
-- depends on another data correction having run first is not a correction.)
--
-- scripts/seed-nearby-services.ts, which is where these two service rows are
-- generated from and is re-runnable against production, carried the same wrong
-- pair and is corrected in the same change. Without that, the next seed run
-- would have put both campgrounds back in the wrong county.
--
-- The app now also DROPS a service campground that sits on top of a drawn access
-- point (drawnAsAccessPoint in eddy-ios/src/map/layers.ts), so after this these
-- two stop drawing a second pin at all — which is the point. The rows stay
-- because they carry the phone number, the Recreation.gov link and the fee notes
-- the access point does not, and the river screen's Campgrounds section reads
-- them.

UPDATE nearby_services
SET latitude = 37.815520, longitude = -91.169350, updated_at = NOW()
WHERE slug = 'red-bluff-campground-usfs';

UPDATE nearby_services
SET latitude = 37.720300, longitude = -91.204800, updated_at = NOW()
WHERE slug = 'dillard-mill-campground';

-- The same two places as access points. A no-op against production, which was
-- corrected out of band some time ago and holds these exact values; it exists so
-- a database built from the seeds lands in the same state as the live one rather
-- than eight miles from it.

UPDATE access_points a
SET location_orig = ST_SetSRID(ST_MakePoint(-91.169350, 37.815520), 4326), updated_at = NOW()
FROM rivers r
WHERE r.id = a.river_id
  AND r.slug = 'huzzah'
  AND a.slug IN ('red-bluff', 'red-bluff-recreation-area')
  AND ST_Distance(a.location_orig::geography, r.geom::geography) > 1609.344;

UPDATE access_points a
SET location_orig = ST_SetSRID(ST_MakePoint(-91.204800, 37.720300), 4326), updated_at = NOW()
FROM rivers r
WHERE r.id = a.river_id
  AND r.slug = 'huzzah'
  AND a.slug = 'dillard-mill'
  AND ST_Distance(a.location_orig::geography, r.geom::geography) > 1609.344;


-- ── 2. Six hazards imported without a usable position ───────────────────────
--
-- All six were created on 2026-01-23 by the FloatMissouri guide import and share
-- its signature: doubled spaces and a sentence fragment for a name ("Power  house
-- on right", "Concrete dam backs up  water for about a mile"). Their coordinates
-- were interpolated against the wrong geometry — the three Niangua rows land in
-- Texas and Dent counties, ninety miles from the Niangua — and they are the only
-- six hazards in the table more than two miles off their river.
--
--   niangua     Power  house on right                            56.37 mi off
--   niangua     Tunnel Dam                                       52.26 mi off
--   niangua     Herrick Ford Access                              44.54 mi off
--   big-piney   Concrete dam backs up  water for about a mile    24.80 mi off
--   big-piney   Low rock dam at water plant intake               22.61 mi off
--   meramec     Low dam                                           6.46 mi off
--
-- Three of them are `danger` or `warning` low-water dams, which is the single
-- most lethal hazard class in Ozark paddling — so a pin for one drawn 25 miles
-- away, on the map, in the canonical red, is worse than no pin: it is a promise
-- that THAT stretch is the dangerous one.
--
-- ── Cleared, not deleted, and not guessed at ────────────────────────────────
--
-- The hazards themselves are real. The descriptions are specific enough to be
-- verifiable ("no water running between the dam and power house, a distance of
-- about 6 miles"), and Tunnel Dam is a real hydroelectric project on the
-- Niangua. What is wrong is one column, and the honest repair for a position we
-- cannot source is to stop claiming one — not to interpolate a new guess along a
-- mile figure from the same import that produced the bad coordinate.
--
-- Nothing that MATTERS is lost by clearing it, which is why this is safe:
--
--   * the river screen lists hazards from /api/rivers/[slug]/hazards, which
--     filters on `active` and not on position, so all six keep their card, their
--     severity dot, their river mile and their portage note;
--   * the float plan selects hazards by `river_mile_downstream` between the
--     put-in and the take-out (see src/app/api/plan/route.ts), so all six still
--     appear under "On this stretch" for a float that covers them;
--   * only the MAP drops them, because toHazard maps a null location to (0, 0)
--     and every consumer filters null island via hasCoordinates.
--
-- So the warning survives everywhere it can be read against a river mile, and
-- disappears only from the one surface that would have to state a place.
--
-- Re-sourcing these six is follow-up work: each needs a coordinate off USGS
-- topo, the MDC access list or OSM, checked against the river line before it
-- goes back in.

UPDATE river_hazards h
SET location = NULL,
    updated_at = NOW()
FROM rivers r
WHERE r.id = h.river_id
  AND h.location IS NOT NULL
  AND r.geom IS NOT NULL
  -- Two miles. Well outside any plausible geocoding slop for a feature ON the
  -- river — the next-worst hazard in the table is 0.96 mi off, at a low-water
  -- bridge, which is an ordinary bend-of-the-line difference — and well inside
  -- the 6.46 mi of the closest row this is meant to catch.
  AND ST_Distance(h.location::geography, r.geom::geography) > 3218.69;
