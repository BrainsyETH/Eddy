-- 20260825011543_the_white_carries_its_own_downstream_gauges.sql
--
-- Applied 2026-08-25 through the Supabase API, which stamped this version;
-- filename renamed to match, same as 20260824232949.
--
-- Follow-up to 20260824232949. That migration wired the White River's two
-- downstream USGS gauges like this:
--
--   INSERT INTO river_gauges … FROM rivers r CROSS JOIN gauge_stations gs
--    WHERE r.slug = 'white' AND gs.site_id_external IN ('07057370','07060500')
--
-- and asserted nothing about the result.
--
-- ── The bug ─────────────────────────────────────────────────────────────────
-- A CROSS JOIN over a table with no matching rows produces no rows, silently.
-- Those two station ids exist in exactly one file under supabase/ — that
-- migration itself. They reach production through `import-usgs-gauges.ts`, a
-- SCRIPT, run out of band. So on any database rebuilt from migrations alone,
-- both stations are absent, both links are skipped without complaint, and the
-- White River comes up with a release gauge and no downstream readings at all.
--
-- It looked correct when it was written because it WAS correct against the one
-- database it was checked on — production, where the national import had
-- already run. Verifying the rows you just created is not the same as
-- verifying the migration creates them.
--
-- ── Why this inserts the stations rather than only asserting them ───────────
-- A migration that merely failed would leave a rebuild permanently broken with
-- no in-repo way forward, since the fix lives in a script that needs network
-- access to USGS. So: create them if absent, with the values USGS itself
-- publishes (probed 2026-08-24, decimal degrees NAD83, drainage in sq mi), and
-- then assert. Both, not either.
--
-- The insert is deliberately NARROW — id, name, location, drainage area, and
-- for Calico Rock its NWS LID. `import-usgs-gauges.ts` remains the owner of
-- everything else about a USGS station; this fills in enough for the river to
-- work and does not compete with the importer for the rest.

INSERT INTO public.gauge_stations (
    usgs_site_id, site_id_external, provider, name, location, active, curated,
    drainage_area_sqmi, nws_lid
)
SELECT * FROM (VALUES
    (
        '07057370', '07057370', 'usgs', 'White River near Norfork, AR',
        ST_SetSRID(ST_MakePoint(-92.3, 36.2236111), 4326),
        true, true, 8040.0::numeric, NULL::text
    ),
    (
        '07060500', '07060500', 'usgs', 'White River at Calico Rock, AR',
        ST_SetSRID(ST_MakePoint(-92.1430556, 36.11666667), 4326),
        true, true, 9980.0::numeric, 'CLRA4'
    )
) AS v(usgs_site_id, site_id_external, provider, name, location, active, curated, drainage_area_sqmi, nws_lid)
WHERE NOT EXISTS (
    SELECT 1 FROM public.gauge_stations gs
    WHERE gs.provider = 'usgs' AND gs.site_id_external = v.site_id_external
);

-- Curated regardless of who created the row: since 00196 the update-gauges
-- cron polls only curated stations, so an uncurated one wired to a river is a
-- silent dead end. 20260824232949 set this too; re-asserted because a fresh
-- database reaches this line having just inserted the rows above.
UPDATE public.gauge_stations
SET curated = true
WHERE provider = 'usgs'
  AND site_id_external IN ('07057370', '07060500')
  AND curated IS NOT TRUE;

-- The links themselves, idempotent. Same shape as the original, but now the
-- stations are guaranteed to be there for it to find.
INSERT INTO public.river_gauges (river_id, gauge_station_id, is_primary, threshold_unit, role)
SELECT r.id, gs.id, false, 'cfs', 'downstream'
FROM public.rivers r
CROSS JOIN public.gauge_stations gs
WHERE r.slug = 'white'
  AND gs.provider = 'usgs'
  AND gs.site_id_external IN ('07057370', '07060500')
  AND NOT EXISTS (
      SELECT 1 FROM public.river_gauges rg
      WHERE rg.river_id = r.id AND rg.gauge_station_id = gs.id
  );

-- ── The assertion the original migration was missing ────────────────────────
DO $$
DECLARE
    n integer;
    missing text;
BEGIN
    -- Only meaningful once the White exists. On a database rebuilt in order it
    -- always does by now (20260824232949 ran first); guarding anyway so this
    -- file is safe to run against a partial history.
    IF NOT EXISTS (SELECT 1 FROM public.rivers WHERE slug = 'white') THEN
        RAISE NOTICE 'white river absent; skipping downstream-gauge assertion';
        RETURN;
    END IF;

    SELECT count(*) INTO n
    FROM public.river_gauges rg
    JOIN public.rivers r ON r.id = rg.river_id
    JOIN public.gauge_stations gs ON gs.id = rg.gauge_station_id
    WHERE r.slug = 'white'
      AND rg.role = 'downstream'
      AND gs.provider = 'usgs'
      AND gs.site_id_external IN ('07057370', '07060500');

    IF n <> 2 THEN
        SELECT string_agg(want, ', ') INTO missing
        FROM (VALUES ('07057370'), ('07060500')) AS w(want)
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.river_gauges rg
            JOIN public.rivers r ON r.id = rg.river_id
            JOIN public.gauge_stations gs ON gs.id = rg.gauge_station_id
            WHERE r.slug = 'white' AND gs.site_id_external = w.want
        );
        RAISE EXCEPTION
            'the White River must carry both downstream USGS gauges (% of 2 present; missing: %). '
            'There is no USGS discharge or stage gauge in the Bull Shoals tailwater itself, so '
            'these two are the only measurement of this river below the dam.',
            n, COALESCE(missing, 'none — check role/provider on the existing links');
    END IF;
END $$;
