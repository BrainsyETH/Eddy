-- APPLIED to production as version 20260810202000 (the filename matches the recording;
-- ledger: supabase/production-migrations.txt). Originally: apply by hand, then confirm with
-- `npm run db:check-migrations` and rename this file to match.
--
-- One row per station-river link for the USGS stations Eddy actually depends
-- on, with the coordinate unpacked from PostGIS. Read by the usgs_site_drift
-- trust check, which compares each row against what USGS publishes today.
--
-- ── Why a function rather than a PostgREST select ────────────────────────
--
-- gauge_stations.location is a geography column, and the check needs it as two
-- numbers. PostgREST returns the raw EWKB hex, so the alternative is decoding
-- geometry in TypeScript — a second, worse implementation of something PostGIS
-- already does. Same reasoning as trust_service_geo() and trust_schema_invariants():
-- the query is the check's scope definition, and it belongs where the data is.
--
-- ── Why the scope is the WIRED set, not every USGS station ───────────────
--
-- gauge_stations holds 14,291 USGS rows. All but ~46 were imported by
-- 00196_national_gauges for the statewide map and carry no Eddy judgement — no
-- curated ladder, no alerts, no floatability verdict. Checking all of them
-- would spend 286 outbound requests a day to raise findings about stations no
-- float plan reads, and would bury the two dozen that matter.
--
-- The wired set is the right scope for the same reason 00196 defines `curated`
-- that way: a station wired to a river is one Eddy makes claims about.
-- Restricted further to ACTIVE rivers, because an inactive river is not
-- somewhere Eddy sends anyone.
--
-- ── One row per LINK, folded by the caller ───────────────────────────────
--
-- The opposite of the choice trust_service_geo() made, and for the opposite
-- reason. There, the distance to judge was a MIN across links, so emitting a row
-- per link would have let a caller fire on the far one. Here every field being
-- compared — name, coordinate, drainage area — is a property of the STATION,
-- identical on every link, and what varies is only which rivers it serves.
--
-- Folding in SQL would mean array_agg over two columns and a caller that
-- unpacks them; folding in TypeScript is foldStationRows(), which is pure and
-- unit-tested. The thing that must not go wrong is scopeCount counting a
-- two-river station twice, and that is precisely what a tested fold prevents
-- and an untested array_agg would not.
--
-- ── active AND usgs_site_id IS NOT NULL ──────────────────────────────────
--
-- An inactive station is one Eddy has already stopped reading. A null site id
-- has nothing to look up, and validate_river_data already owns that defect as
-- gauge_missing_site_id — emitting it here too would raise two findings about
-- one problem under two fingerprints, which is what 20260804192753 was written
-- to stop doing to gauge rules.
--
-- provider = 'usgs' because this collection only knows about USGS sites. The
-- one NWS-provider station carries a usgs_site_id and would otherwise be looked
-- up against a service that has never heard of it.

CREATE OR REPLACE FUNCTION public.trust_usgs_site_scope()
RETURNS TABLE (
  usgs_site_id       text,
  name               text,
  drainage_area_sqmi numeric,
  lng                double precision,
  lat                double precision,
  river_slug         text,
  is_primary         boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
-- `extensions` is not optional: PostGIS lives there on Supabase, so ST_X and
-- ST_Y are unresolvable under a search_path of public alone. Same declaration
-- as trust_service_geo() and the gauge search functions in 00196/00207.
SET search_path = public, extensions
AS $$
  SELECT gs.usgs_site_id,
         gs.name,
         gs.drainage_area_sqmi,
         ST_X(gs.location::geometry) AS lng,
         ST_Y(gs.location::geometry) AS lat,
         r.slug,
         rg.is_primary
    FROM gauge_stations gs
    JOIN river_gauges rg ON rg.gauge_station_id = gs.id
    JOIN rivers r        ON r.id = rg.river_id AND r.active
   WHERE gs.active
     AND gs.provider = 'usgs'
     AND gs.usgs_site_id IS NOT NULL
   ORDER BY gs.usgs_site_id, r.slug;
$$;

COMMENT ON FUNCTION public.trust_usgs_site_scope() IS
  'One row per station-river link for active USGS gauge stations wired to active rivers, with location unpacked to lng/lat. Read by the usgs_site_drift trust check, which compares each station against the USGS monitoring-locations collection. Folded to one row per station by foldStationRows().';

-- Supabase ships ALTER DEFAULT PRIVILEGES granting EXECUTE on every new public
-- function to anon and authenticated DIRECTLY, so `revoke from public` alone
-- does not close it — see 20260804193216.
REVOKE ALL ON FUNCTION public.trust_usgs_site_scope() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trust_usgs_site_scope() TO service_role;
