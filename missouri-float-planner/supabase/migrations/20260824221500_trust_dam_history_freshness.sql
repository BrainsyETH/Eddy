-- One row per dam per metric: when that series last recorded, and how much of
-- it there is.
--
-- ── Why this is an RPC and not a PostgREST select ─────────────────────────
--
-- Because the check that reads it must not go blind exactly when it matters.
--
-- The first cut of dam-freshness.ts asked PostgREST for the newest 5,000 rows
-- of dam_metric_readings and kept the first sighting of each dam, deriving a
-- per-dam max in TypeScript. Two things make that wrong, and the second one is
-- the dangerous one:
--
--   1. PostgREST caps a response at `db-max-rows` (1,000 on this project),
--      so `.limit(5000)` silently returns 1,000.
--
--   2. A FROZEN dam stops contributing rows while every healthy dam keeps
--      adding them. So the frozen dam's newest row sinks through the window
--      as the fleet writes over it. Eighteen dams x 2 metrics = 36 rows an
--      hour, so 1,000 rows is about 28 hours of fleet history — after which
--      the frozen dam is simply ABSENT from the response.
--
-- Absent does not read as broken. It reads as "not enrolled", the finding stops
-- being raised, and because the seventeen healthy dams keep scopeCount nonzero,
-- reconciliation resolves the open finding as FIXED while the outage continues.
-- The 53-hour Nashville freeze this whole subsystem was written for would have
-- been closed as fixed somewhere around hour 28.
--
-- The property that matters here is not "a bigger limit". It is that the
-- result size depends on the NUMBER OF DAMS and not on how long one has been
-- broken. Grouping in SQL gives that unconditionally: 36 rows today, 40 when
-- two dams are added, never more. A raised limit only moves the cliff.
--
-- Same house pattern as validate_river_data(), trust_schema_invariants() and
-- trust_service_geo(), and for the same reason each of those gives: PostgREST
-- cannot aggregate, so anything set-based belongs here.
--
-- ── Why per METRIC and not per dam ────────────────────────────────────────
--
-- A dam records `release` and `generationFlow` independently, and they can
-- fail independently — a renamed turbine series would freeze generationFlow
-- while release kept arriving. A per-dam max() hides that behind the healthy
-- half. Returning both lets the caller judge a dam by its STALEST series and
-- still name which one stopped.

CREATE OR REPLACE FUNCTION public.trust_dam_history_freshness()
RETURNS TABLE (
  dam_id               text,
  metric               text,
  latest_observed_hour timestamptz,
  rows_recorded        bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT r.dam_id,
         r.metric,
         max(r.observed_hour) AS latest_observed_hour,
         count(*)             AS rows_recorded
    FROM public.dam_metric_readings r
   GROUP BY r.dam_id, r.metric
   ORDER BY r.dam_id, r.metric;
$$;

COMMENT ON FUNCTION public.trust_dam_history_freshness() IS
  'One row per (dam_id, metric) in dam_metric_readings with the newest observed_hour and the row count. Read by the dam_freshness trust check. Grouped in SQL on purpose: a per-dam max derived from a capped PostgREST page drops a frozen dam out of the response entirely once the healthy fleet has written past it, which reads as "not enrolled" and lets reconciliation resolve a live outage as fixed.';

-- Supabase ships ALTER DEFAULT PRIVILEGES granting EXECUTE on every new public
-- function to anon and authenticated DIRECTLY, so `revoke from public` alone
-- does not close it — see 20260804193216. dam_metric_readings is already
-- revoked from anon and authenticated (20260813120000), and this function
-- would hand back an aggregate over it, so it is service_role only.
REVOKE ALL ON FUNCTION public.trust_dam_history_freshness() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trust_dam_history_freshness() TO service_role;
