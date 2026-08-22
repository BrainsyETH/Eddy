-- 20260822120000_gasconade_rain_lag_canonical.sql
--
-- The last value the deleted RAIN_LAG map was still serving.
--
-- src/lib/eddy/rain-lag.ts held rain-lag figures for nine rivers and was read
-- only when river_characteristics had none. Migration 00145 moved eight of
-- those nine into the table; gasconade was left behind, so it is the one
-- active river whose Eddy prompts were still being built from the hardcoded
-- map. Deleting the map without this migration would have removed rain-lag
-- guidance from Gasconade updates and left nothing to notice it but a
-- console warning.
--
-- Values are the map's own, carried across unchanged. They are estimates and
-- read as such — that is what the canonical_rain_lag_missing Trust finding
-- exists to improve on for the other fourteen rivers that have never had one.
--
-- Idempotent and NULL-guarded: re-running cannot overwrite a figure someone
-- has since refined from the gauge record.

UPDATE river_characteristics rc
SET
    rain_lag_hours = COALESCE(rc.rain_lag_hours, 8),
    rain_lag_note = COALESCE(
        rc.rain_lag_note,
        'Large watershed, moderate spring input. Rain response in 6-10 hours. Can spike significantly after heavy storms.'
    ),
    drop_rate_note = COALESCE(
        rc.drop_rate_note,
        '0.5-1.5 ft/day (large watershed, moderate recovery)'
    )
FROM rivers r
WHERE rc.river_id = r.id
  AND r.slug = 'gasconade';
