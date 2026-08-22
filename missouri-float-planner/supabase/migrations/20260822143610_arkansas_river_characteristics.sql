-- 20260822143610_arkansas_river_characteristics.sql
--
-- APPLIED 2026-08-22 to the FloatMe project (ilefwfpvphadsbptiaur) via the
-- management API, which recorded it as version 20260822143610. This file was renamed
-- from 20260821124500_arkansas_river_characteristics.sql
-- so the recorded version matches the filename; scripts/check-migration-drift.ts
-- enforces exact local==remote equality past the legacy baseline, and the
-- original header said to do exactly this once applied.
--
-- Every assertion below ran as part of that apply and passed; had any raised,
-- the whole migration would have rolled back.
--
-- The companion to 20260821123000_arkansas_river_hazards.sql, and the reason
-- that file only has four rows in it.
--
-- ── Why this file exists ──────────────────────────────────────────────────
--
-- The POI audit's Arkansas research turned up two different kinds of fact and
-- proposed both as river_hazards rows:
--
--   locatable   "a large boulder on the outside of a right-hand curve, two
--               miles below Redding"          -> a point. Goes in river_hazards.
--   reach-level "the low-water bridge somewhere between Wolf Pen and Turner
--               Bend", "Crooked Creek can turn into a raging torrent very
--               quickly"                      -> NOT a point.
--
-- A reach is not a coordinate. Rendering "somewhere in these sixteen miles" as
-- a map pin manufactures precision the source never had, and a hazard pin is
-- exactly the kind of record a paddler trusts to be where it says it is. So the
-- reach-level material lands here instead, as prose attached to the river.
--
-- ── Why these columns, and who reads them ─────────────────────────────────
--
-- Not a parking lot. src/lib/rivers/context.ts:110 selects low_water_meaning
-- and rising_water_hazards into the river context, and src/lib/eddy/
-- generate-update.ts reads that context when it writes river updates. Prose
-- here reaches users through Eddy's copy; it is not write-only storage.
--
-- ── What is deliberately NOT written ──────────────────────────────────────
--
-- primary_hazards is left alone on every river. Checked first, and it already
-- carries what the audit "found":
--
--   mulberry       {rapid, flash_flood, strainer}
--   kings-river    {strainer, gravel_bar, flash_flood}
--   crooked-creek  {strainer, gravel_bar, flash_flood}
--   caddo-river    {rapid, strainer, flash_flood}
--
-- The audit's "Crooked Creek is flash-flood prone" and "Caddo is pool-and-drop
-- Class I-II" are already represented as flash_flood and rapid respectively.
-- Re-adding them would be one more duplicate on a pile of them.
--
-- Nothing is written for crooked-creek, caddo-river or war-eagle-creek. Their
-- reach-level claims come from the audit rather than from a source confirmed in
-- this pass, and their primary_hazards already cover the substance. Writing
-- unverified prose into a column that feeds generated user-facing copy is a
-- worse failure than leaving it null: null reads as "we don't know", and wrong
-- prose reads as knowledge.
--
-- kings-river gets rising_water_hazards but NOT low_water_meaning. The audit
-- reports a ~3.2 ft minimum float level at the Berryville gauge attributed to
-- Kings River Outfitters; that number was not confirmed in this pass, and a
-- minimum-level figure is precisely the kind of thing someone plans a drive
-- around. It stays null until somebody checks it.
--
-- ── Source, with retrieval date ───────────────────────────────────────────
--
-- Retrieved 2026-08-21; no publisher archive URL available for either.
--
--   Turner Bend Outfitter, turnerbend.com/MulberryRiver.html — the operating
--     outfitter at Turner Bend. Gauge bands: "1.5-1.7 feet" beginner,
--     "3.0-3.6 feet" prime whitewater, "4.6-5.0 feet: too high to get under the
--     Low Water Bridge".
--   Arkansas Canoe Club forums; AR Own Backyard trip report (2022) — the two
--     Kings River low-water bridges between Marble and Marshall Ford, the
--     blown-out center, the hydraulic at its base, and the river-left portage.
--
-- ── Idempotency ───────────────────────────────────────────────────────────
--
-- UPDATE ... WHERE the column IS NULL. Re-running is a no-op, and an operator
-- or a later migration that writes better prose is never overwritten by this
-- one. That also means this migration cannot be used to CHANGE these values
-- later — a subsequent correction needs its own file, which is the intended
-- shape: prose that reaches users should change deliberately, not as a
-- side effect of re-running an old migration.
--
-- No explicit BEGIN/COMMIT — the CLI and management API already wrap this in a
-- transaction; see 20260816112125's header.
--
-- ── Rollback ──────────────────────────────────────────────────────────────
--
--   update river_characteristics c set rising_water_hazards = null,
--          low_water_meaning = null
--     from rivers r
--    where r.id = c.river_id and r.slug in ('mulberry','kings-river');
--
-- Safe: both columns were null on both rivers before this ran, verified below.

UPDATE river_characteristics c
SET rising_water_hazards =
      'Rain-driven and flashy — the Mulberry comes up and drops out fast. At the Turner Bend gauge 3.0-3.6 ft is prime whitewater, and above roughly 4.5 ft the river is dangerous. At 4.6-5.0 ft the low-water bridge between Wolf Pen and Turner Bend can no longer be passed under, which is the level that strands a party that put in above it. The named drops — Sacroiliac, Hamm Falls, Hell Roaring Falls — all build with flow.',
    low_water_meaning =
      'Below about 1.5 ft at Turner Bend the Mulberry turns scrapy and the run becomes a walk. 1.5-1.7 ft is the beginner band; the whitewater reaches need more.',
    updated_at = now()
FROM rivers r
WHERE r.id = c.river_id
  AND r.slug = 'mulberry'
  AND c.rising_water_hazards IS NULL
  AND c.low_water_meaning IS NULL;

UPDATE river_characteristics c
SET rising_water_hazards =
      'Rain-driven. Two low-water bridges between the Marble access and Marshall Ford have to be portaged at any runnable level. The lower of the two, about ten miles below Marble and just past a swinging bridge, has had its center blasted out; a hydraulic forms at the base that will hold a swimmer under. Portage it river left. Once water is over either slab the crossing is a drowning hazard rather than an obstacle.',
    updated_at = now()
FROM rivers r
WHERE r.id = c.river_id
  AND r.slug = 'kings-river'
  AND c.rising_water_hazards IS NULL;

-- ── Assertions ────────────────────────────────────────────────────────────
DO $$
DECLARE
  bad text;
BEGIN
  -- 1. Both rivers ended up with the prose. If a row was missing from
  --    river_characteristics entirely the UPDATE would have matched nothing
  --    and reported success, which is the silent failure worth catching.
  SELECT string_agg(r.slug, '; ') INTO bad
  FROM rivers r
  LEFT JOIN river_characteristics c ON c.river_id = r.id
  WHERE r.slug IN ('mulberry', 'kings-river')
    AND (c.river_id IS NULL OR c.rising_water_hazards IS NULL);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'rising_water_hazards still null (or no characteristics row) on: %', bad;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM river_characteristics c
    JOIN rivers r ON r.id = c.river_id
    WHERE r.slug = 'mulberry' AND c.low_water_meaning IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'mulberry low_water_meaning is still null';
  END IF;

  -- 2. The rivers this migration deliberately does NOT touch are untouched.
  --    Named explicitly so that widening the WHERE clause later has to be a
  --    decision rather than an accident — the failure mode 20260805190000
  --    guarded against when it fenced war-eagle-creek out of a mileage fix.
  SELECT string_agg(r.slug, '; ') INTO bad
  FROM river_characteristics c
  JOIN rivers r ON r.id = c.river_id
  WHERE r.slug IN ('crooked-creek', 'caddo-river', 'war-eagle-creek')
    AND (c.rising_water_hazards IS NOT NULL OR c.low_water_meaning IS NOT NULL);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION
      'this migration wrote prose to a river it was scoped to leave alone: %', bad;
  END IF;

  -- 3. primary_hazards was not disturbed on any Arkansas river. It already
  --    carried the substance of the audit's reach-level claims; this file is
  --    additive prose, not a re-tagging.
  SELECT string_agg(r.slug, '; ') INTO bad
  FROM river_characteristics c
  JOIN rivers r ON r.id = c.river_id
  WHERE r.state = 'AR'
    AND (c.primary_hazards IS NULL OR cardinality(c.primary_hazards) = 0);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'primary_hazards was emptied on: %', bad;
  END IF;
END $$;
