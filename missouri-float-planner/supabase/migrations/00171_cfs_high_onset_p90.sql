-- supabase/migrations/00171_cfs_high_onset_p90.sql
--
-- Recalibrate the CFS-primary "high water" onset from p75 to p90.
--
-- 00167 flipped the MVP rivers to CFS discharge with optimal_max = p75 and
-- high = p90. But the condition classifier (src/lib/conditions.ts computeCondition,
-- and the update-gauges cron that stamps last_condition_code) treats
-- OPTIMAL_MAX as the "high" onset -- so a "HIGH WATER, experienced paddlers only"
-- alert fired above the 75th percentile of flow (~25% of the time), often at
-- barely-elevated water. Live example (2026-07-19): Niangua @ Windyville went
-- "High" at 191 cfs, only ~1.6x its 117 cfs median. The p90 value (541 cfs for
-- the Niangua) was clearly meant to be the "high" line but sat UNUSED in
-- level_high.
--
-- Fix: copy level_high (p90) into level_optimal_max so "high" now fires only in
-- the top ~10% of flow. Genuinely elevated water still flags (e.g. Huzzah at ~3x
-- its p90); normal-elevated summer flow now reads "flowing" instead of "high".
-- The floatable "flowing" band widens to p50-p90, the honest all-clear range.
--
-- Scope: percentile-derived USGS cfs ladders only (threshold_source = 'usgs'),
-- leaving curated moherp ladders (e.g. Doniphan) untouched. level_dangerous keeps
-- its conservative cfs backstop; the AUTHORITATIVE "Dangerous" line stays the
-- official NWS flood STAGE (ft), applied by the 00166 unit-independent override.
--
-- last_condition_code re-baseline: after the raise, rivers currently stamped
-- 'high' will reclassify to 'flowing'. Without intervention the next gauge-cron
-- pass would read that high->flowing move as a "recovery" and post a spurious
-- all-clear reel for each. NULL the stamp on those rows so the cron treats the
-- next reading as a fresh baseline (no warning, no recovery) and then resumes
-- normal classification. Safe for display: the map and river pages compute
-- condition live from thresholds + the latest reading -- nothing renders
-- last_condition_code (it is read only by the cron and the alert pipeline).
--
-- Idempotent: after this runs level_high = level_optimal_max, so the
-- `level_high > level_optimal_max` guard makes a re-run a no-op.
--
-- See docs/CFS_MIGRATION_THRESHOLDS.md for the derivation + the recalibration note.

UPDATE river_gauges
SET
  level_optimal_max   = level_high,
  last_condition_code = CASE WHEN last_condition_code = 'high' THEN NULL ELSE last_condition_code END,
  threshold_updated_at = now()
WHERE threshold_unit    = 'cfs'
  AND threshold_source  = 'usgs'
  AND level_high        IS NOT NULL
  AND level_optimal_min IS NOT NULL
  AND level_high > level_optimal_max;
