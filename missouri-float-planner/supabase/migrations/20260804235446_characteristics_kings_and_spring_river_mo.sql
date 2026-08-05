-- APPLIED to production 2026-08-04 as 20260804235446.
--
-- Give kings-river and spring-river-mo a river_characteristics row. Closes
-- `missing_characteristics` for both.
--
-- Without a row, Eddy's prompts fall back to river_type defaults, so the float
-- speed curve and the condition prose are generated from the archetype rather
-- than from anything recorded about the river.
--
-- ── What these rows deliberately do NOT contain ─────────────────────────
--
-- Only the two fields that follow from facts already in the database:
--
--   is_spring_fed     false, from rivers.river_type = 'rain_flashy' on both
--   primary_hazards   strainer, gravel_bar, flash_flood
--
-- Everything else — low_water_meaning, rising_water_hazards, rain_lag_hours,
-- rain_lag_note, drop_rate_note, river_note, speed_curve — is left NULL,
-- because on the rivers that have them those fields carry per-section prose
-- about what a given flow means and where the strainers are. That is
-- observation, not inference, and inventing it would put sentences in front of
-- someone deciding whether to put a boat on the water with nothing behind them.
-- NULL is the honest value: this question has not been answered yet.
--
-- The hazard list is the conservative rain_flashy set, identical to
-- crooked-creek's and drawn only from what the archetype implies — a flashy
-- Ozark river with gravel bars and wood in the channel. It is a floor, not a
-- survey; adding what is actually there is still a job for someone who has been
-- on these rivers.
--
-- Presence with honest gaps beats absence: with a row, the type defaults stop
-- silently standing in for river-specific knowledge, and the empty fields are
-- visible in /admin/geography as work to do rather than invisible as a missing
-- row nobody is looking for.
--
-- Idempotent: ON CONFLICT DO NOTHING, so replaying cannot overwrite prose
-- somebody adds later.

INSERT INTO river_characteristics (river_id, is_spring_fed, primary_hazards)
SELECT r.id, false, ARRAY['strainer', 'gravel_bar', 'flash_flood']::text[]
  FROM rivers r
 WHERE r.slug IN ('kings-river', 'spring-river-mo')
ON CONFLICT (river_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Assert both rows landed. A silent zero-row insert — a renamed slug, a river
-- deactivated — would leave the finding open while this migration reported
-- success.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_missing text;
BEGIN
    SELECT coalesce(string_agg(r.slug, ', ' ORDER BY r.slug), '')
      INTO v_missing
      FROM rivers r
      LEFT JOIN river_characteristics rc ON rc.river_id = r.id
     WHERE r.slug IN ('kings-river', 'spring-river-mo')
       AND rc.river_id IS NULL;

    IF v_missing <> '' THEN
        RAISE EXCEPTION 'river_characteristics still missing for: %', v_missing;
    END IF;
END $$;

-- Confirmed on production after applying, rather than trusted from this file:
--   select * from public.validate_river_data() where check_name = 'missing_characteristics';
-- returned no rows.
