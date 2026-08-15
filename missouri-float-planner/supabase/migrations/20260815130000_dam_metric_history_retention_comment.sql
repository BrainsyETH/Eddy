-- 20260815130000_dam_metric_history_retention_comment.sql
--
-- Correct the persisted retention claim on dam_metric_readings.
--
-- 20260813120000_dam_metric_history.sql created the table saying "retained 35
-- days ... short enough that this never becomes a table anybody has to think
-- about", and the code moved on without it: HISTORY_RETENTION_DAYS in
-- src/lib/data/dam-history.ts is now 730, because this table turned out to be
-- the ONLY durable record of what these powerhouses actually did — CWMS serves
-- a rolling week or so and cannot backfill past it, so a pruned observation is
-- gone for good.
--
-- That drift is operational, not cosmetic. An operator reading the old comment
-- in the dashboard would reasonably treat anything past 35 days as disposable
-- cache awaiting the prune, and truncate or rebuild accordingly — destroying a
-- multi-season record that cannot be re-fetched from anywhere. The applied
-- migration stays untouched, as applied migrations must; this one replaces
-- only the stored comment.

comment on table public.dam_metric_readings is
  'Hourly observed turbine discharge and total release per USACE dam. Seeded from CWMS by /api/cron/sync-dam-history and retained 730 days (HISTORY_RETENTION_DAYS in src/lib/data/dam-history.ts) — the only durable record of these observations, since CWMS serves only a rolling recent window. Do NOT treat old rows as disposable cache. NULL is expressed by a MISSING ROW, never a zero — a gap is an outage, not an idle powerhouse.';
