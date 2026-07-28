-- 00205_river_section_character.sql
-- Let a reach carry its own character, not just its own gauge and type.
--
-- WHY: 00204 gave river_sections a gauge and a river_type, which fixed the
-- numbers and the safety framing for the Black's tailwater. What it could not
-- fix is the curated prose, because river_characteristics is one row per river
-- and on the Black that row is ALREADY dedicated to the upper reach. Its own
-- author said so, in the data:
--
--   low_water_meaning    -> 'upper-lesterville: Low water means boats drag on
--                            most riffles, but the reach stays floatable...'
--   rising_water_hazards -> 'upper-lesterville: Rain-responsive despite the
--                            spring base flow...'
--   river_note           -> 'Per-section hydro types:
--                            upper-lesterville=spring_fed_float.'
--   primary_hazards      -> {strainer, gravel_bar, bluff}
--
-- Someone curating this knew they were describing one reach and prefixed the
-- section slug because the schema gave them nowhere else to put it. This
-- migration gives them somewhere.
--
-- (That prose is also exactly why generate-update.ts guards it behind
-- `useRiverProse`: without the guard it would reach the tailwater and tell
-- someone below a flood-control dam that low water means dragging over gravel.
-- Until now the tailwater's only alternative was the generic dam_tailwater
-- default. Now it can have its own.)
--
-- Every column is nullable and NULL inherits the river's, so all 24 rivers and
-- every section but the Black's lower reach are unaffected.

ALTER TABLE river_sections
    -- Mirrors river_characteristics.low_water_meaning / rising_water_hazards /
    -- primary_hazards. NULL = inherit the river's.
    ADD COLUMN IF NOT EXISTS low_water_meaning TEXT,
    ADD COLUMN IF NOT EXISTS rising_water_hazards TEXT,
    ADD COLUMN IF NOT EXISTS primary_hazards TEXT[];

COMMENT ON COLUMN river_sections.low_water_meaning IS
    'What "low" means on THIS reach. NULL inherits river_characteristics. Injected into the Eddy prompt ahead of the type default -- see buildConditionSemantics().';
COMMENT ON COLUMN river_sections.rising_water_hazards IS
    'What rising water means on THIS reach. NULL inherits river_characteristics.';
COMMENT ON COLUMN river_sections.primary_hazards IS
    'Hazards specific to this reach. NULL inherits river_characteristics.primary_hazards.';

-- ─────────────────────────────────────────────────────────────────────────────
-- The Clearwater tailwater's own character
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Written for the reach, not the river. The distinction that matters to someone
-- standing in it: on the upper Black, low water is a nuisance and rain is the
-- variable. Here, low water is the dam being shut and the variable is the
-- release schedule -- which means the river can come up hard while the sky stays
-- clear, and the gauge 26 miles downstream will show it late.

UPDATE river_sections
SET low_water_meaning =
        'Low flow here means Clearwater Dam is releasing little or nothing, not that the river is drying up. '
        'It can change within an hour when a release starts, with no change in the weather. Read the release '
        'schedule before reading the sky. The Poplar Bluff gauge sits about 26 miles downstream on a larger '
        'drainage, so it lags a release and reads somewhat high for this reach -- treat it as a ceiling for '
        'high water rather than a precise gauge of a good float level.',
    rising_water_hazards =
        'A rise here is usually a scheduled release arriving as a wall of colder, faster water rather than a '
        'weather event. It can arrive under a clear sky. Do not wade or anchor mid-channel when a release is '
        'scheduled or underway, and do not judge it by the forecast. Water out of the bottom of the lake stays '
        'cold well into summer, so a swim carries a cold-shock risk the upper river does not have.',
    primary_hazards = ARRAY['cold_water', 'fluctuating_flow', 'strainer']
WHERE section_slug = 'lower-markham-hammer'
  AND river_id = (SELECT id FROM rivers WHERE slug = 'black');

-- ─────────────────────────────────────────────────────────────────────────────
-- Invariants
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    v_black_id UUID;
    v_low TEXT;
    v_hazards TEXT[];
BEGIN
    SELECT id INTO v_black_id FROM rivers WHERE slug = 'black';
    IF v_black_id IS NULL THEN
        RAISE NOTICE '00205: no black river row; skipping invariants';
        RETURN;
    END IF;

    SELECT low_water_meaning, primary_hazards INTO v_low, v_hazards
    FROM river_sections
    WHERE river_id = v_black_id AND section_slug = 'lower-markham-hammer';

    IF v_low IS NULL THEN
        RAISE EXCEPTION '00205: tailwater reach has no low_water_meaning (did the slug change?)';
    END IF;

    -- The reach prose must not have inherited the upper river's framing. If the
    -- word "riffle" or the upper slug shows up here, something copied the wrong row.
    IF v_low ILIKE '%riffle%' OR v_low ILIKE '%upper-lesterville%' THEN
        RAISE EXCEPTION '00205: tailwater prose reads like the upper reach';
    END IF;

    IF NOT ('cold_water' = ANY(v_hazards)) THEN
        RAISE EXCEPTION '00205: tailwater hazards missing cold_water';
    END IF;

    -- Only the tailwater gets reach character in this migration.
    IF EXISTS (
        SELECT 1 FROM river_sections rs
        WHERE NOT (rs.river_id = v_black_id AND rs.section_slug = 'lower-markham-hammer')
          AND (rs.low_water_meaning IS NOT NULL
               OR rs.rising_water_hazards IS NOT NULL
               OR rs.primary_hazards IS NOT NULL)
    ) THEN
        RAISE EXCEPTION '00205: no other section should carry reach character yet';
    END IF;
END $$;
