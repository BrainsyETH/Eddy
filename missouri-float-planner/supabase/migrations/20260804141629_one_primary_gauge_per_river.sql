-- APPLIED to production 2026-08-04 as 20260804141629, renamed from its
-- authoring timestamp to match what schema_migrations recorded. See the header
-- of 20260804141538_trust_ledger.sql.
--
-- It built cleanly, which is itself the useful result: no river had two primary
-- gauges at apply time, so the invariant below was already true and this locks
-- it in rather than repairing anything.
--
-- ── What this enforces, and what it deliberately allows ──────────────────
--
-- One primary gauge PER RIVER. Not one river per gauge.
--
-- The distinction is the whole point. `river_gauges.is_primary` means "this is
-- the primary gauge FOR THIS RIVER", so a gauge being primary for two rivers is
-- a legitimate arrangement, not a defect: Courtois Creek has no gauge of its
-- own and borrows Huzzah's, which is why 07014000 is primary for both
-- (00164_fix_river_gauge_misassociations.sql:58 and :87). An index in the other
-- direction — unique on gauge_station_id — would reject correct data and there
-- is no way to express Courtois without it.
--
-- What must never happen is a river with TWO primary gauges. Every read path
-- that asks "what is this river's condition" picks one ladder, and with two
-- candidates the answer depends on row order: the same river could be graded
-- against different thresholds by the map, the planner and the alert engine.
-- docs/gauge-alerting-misalignment-audit.md is a record of what that costs.
--
-- ── If this ever fails to build (it did not) ────────────────────────────
--
-- A unique-violation means some river has two primaries, which is a real defect
-- this index prevents recurring. Find them before retrying:
--
--   select river_id, count(*) from public.river_gauges
--    where is_primary group by river_id having count(*) > 1;
--
-- Decide which gauge is genuinely primary for each and demote the other. Do NOT
-- resolve it by dropping the index.
--
-- ── The other half ──────────────────────────────────────────────────────
--
-- Ambiguity in the gauge → river direction is resolved in code rather than by
-- constraint, because both rows are valid: shared/primary-river-link.ts orders
-- by distance_from_section_miles, which is 0.0 for Huzzah and 5.0 for Courtois
-- because the gauge physically sits on the Huzzah. The `gauge_wiring` trust
-- check reports the cases that tiebreak cannot order.

create unique index if not exists river_gauges_one_primary_per_river
    on public.river_gauges (river_id)
    where is_primary;

comment on index public.river_gauges_one_primary_per_river is
    'One primary gauge per river. A gauge may be primary for several rivers (Courtois borrows Huzzah''s); a river may not have several primaries.';
