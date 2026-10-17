-- Plain-language access descriptions for the records corrected in
-- tailwater-access-corrections-2026-10-17.sql (#1541). The applied text read
-- as curation notes ("this pin identifies…"); descriptions are shown to users
-- on web and iOS access screens. Description column only.
-- Target: ilefwfpvphadsbptiaur. Preview ends in ROLLBACK; only an
-- authorized production apply may replace the final ROLLBACK with COMMIT.
-- APPLIED 2026-10-17 18:41:48 UTC with explicit owner approval (COMMIT).
-- Separate read-back confirmed all seven descriptions; rivers remain inactive.
-- Re-running is a no-op. Keep ROLLBACK below as the default for previews.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path TO public, extensions, pg_temp;
DO $review$
DECLARE
  v_changes jsonb := $changes$
[
  {"river": "norfork-tailwater", "slug": "dam-quarry-campground",
   "before": "Shares the Dam-Quarry recreation area with the separately mapped boat ramp. Use the boat ramp record when planning a float.",
   "after": "Campground beside the Dam-Quarry boat ramp. Launch from the ramp."},
  {"river": "taneycomo", "slug": "empire-park-ramp-forsyth",
   "before": "The ramp is on the south edge of the Empire Park parking lot, east of the fishing dock. This is the Taneycomo side of Powersite (Ozark Beach) Dam.",
   "after": "Ramp at the south edge of the parking lot, east of the fishing dock, above Powersite Dam."},
  {"river": "white", "slug": "armstrong-hole-walk-in-access",
   "before": "Armstrong Hole is a separate site from Roundhouse Shoals. This pin identifies the access area on the City of Cotter parks map.",
   "after": "Walk-in fishing only; no boat access. Separate from Roundhouse Shoals."},
  {"river": "white", "slug": "roundhouse-shoals-walk-in-access",
   "before": "The pin identifies the Roundhouse Shoals access and parking area. Armstrong Hole is a separate walk-in fishing access.",
   "after": "Walk-in fishing access and parking. Armstrong Hole is a separate access nearby."},
  {"river": "white", "slug": "sylamore-ferry-access",
   "before": "This pin identifies Sylamore Ferry Boat Ramp #2. Facilities on the opposite bank belong to a separate access.",
   "after": "Ramp on the Highway 5 side. Facilities across the river are a separate access."},
  {"river": "white", "slug": "guion-access",
   "before": "Stone County ramp on the southwest bank. Guion Access (Izard County) is a separate facility across the White River.",
   "after": "Stone County ramp on the southwest bank. The Izard County access is across the river."},
  {"river": "white", "slug": "guion-access-izard-county",
   "before": "The pin identifies Guion Boat Ramp-Izard County #1. Ramp #2 is part of this same facility; the Stone County access is a separate site across the river.",
   "after": "Two ramps on the Izard County bank. The Stone County access is across the river."}
]
$changes$::jsonb;
  v_change jsonb;
  v_current text;
  v_found boolean;
BEGIN
  FOR v_change IN SELECT * FROM jsonb_array_elements(v_changes) LOOP
    SELECT true, a.description INTO v_found, v_current
      FROM access_points a JOIN rivers r ON r.id=a.river_id
      WHERE r.slug=v_change->>'river' AND a.slug=v_change->>'slug'
      FOR UPDATE OF a;
    IF v_found IS NOT TRUE THEN
      RAISE EXCEPTION 'Access not found: % / %', v_change->>'river', v_change->>'slug';
    END IF;
    -- Re-running is a no-op; any other text is a concurrent edit to review.
    IF v_current IS NOT DISTINCT FROM v_change->>'after' THEN
      CONTINUE;
    END IF;
    IF v_current IS DISTINCT FROM v_change->>'before' THEN
      RAISE EXCEPTION 'Unexpected description for %; review before overwriting', v_change->>'slug';
    END IF;
    UPDATE access_points a SET description=v_change->>'after', updated_at=now()
      FROM rivers r
      WHERE r.id=a.river_id AND r.slug=v_change->>'river' AND a.slug=v_change->>'slug';
  END LOOP;
END $review$;

SELECT r.slug AS river, a.slug, a.description
FROM access_points a JOIN rivers r ON r.id=a.river_id
WHERE a.slug IN ('dam-quarry-campground','empire-park-ramp-forsyth',
  'armstrong-hole-walk-in-access','roundhouse-shoals-walk-in-access',
  'sylamore-ferry-access','guion-access','guion-access-izard-county')
ORDER BY r.slug, a.slug;
ROLLBACK;
