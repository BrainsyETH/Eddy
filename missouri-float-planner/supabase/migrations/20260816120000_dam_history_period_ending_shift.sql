-- Move every stored dam observation back one hour, to the hour it actually covers.
--
-- ── What was wrong ─────────────────────────────────────────────────────────
-- `dam_metric_readings.observed_hour` is the hour a bar BEGINS. The rows in it
-- were written straight from the CWMS stamp, and every series feeding this
-- table is a PERIOD-ENDING hourly mean: the point stamped 13:00Z is the average
-- over [12:00Z, 13:00Z). Storing that stamp as the beginning drew the whole
-- pattern strip an hour late — units reading as starting at 13:00 when they
-- started at 12:00, which is the direction that puts somebody in the water.
--
-- The write side is fixed in src/lib/data/dam-history.ts (`bucketHourly` now
-- shifts by the series' own duration). This repairs what is already stored, so
-- the table does not end up half in each convention.
--
-- ── Why a blanket one hour is right for every row here ─────────────────────
-- Verified 2026-08-16 against the 18 dams that have rows — 7 SWL, 8 SWT, 3 LRN:
--
--   * SWL and LRN declare their series by hand, and every declared history
--     series is `.Ave.1Hour.1Hour.` — period-ending, duration one hour.
--   * SWT resolves at request time and its catalog offers BOTH
--     `Flow-Power.Ave.1Hour.1Hour.Rev-Regi-Flowgroup` and
--     `Flow-Power.Inst.1Hour.0.Rev-Regi-Flowgroup`. They score identically, so
--     rankSeries breaks the tie on the name and `Ave` sorts before `Inst`. The
--     stored values confirm it rather than the reasoning alone: Tenkiller's
--     rows for 2026-08-14 12:00–23:00Z match the `Ave` series exactly
--     (0, 258, 1808, 3644, 3555, 3733, …), and the `Inst` series read 258 AT
--     12:00Z — the same value the `Ave` series stamps 13:00Z, which is what
--     period-ending means.
--
-- No row in this table came from an instantaneous or sub-hourly series, so
-- there is no subset to exclude. A future dam that resolves to one is handled
-- on the write side by its own duration and needs no migration.
--
-- ── Why a staging table, and not one clever statement ──────────────────────
-- The primary key is (dam_id, metric, observed_hour) and this shifts every row
-- onto the key its earlier neighbour currently occupies, so the intermediate
-- state collides even though the final state does not. (Every row moves by the
-- same amount, so a set that was unique before is unique after.)
--
-- A plain UPDATE trips on that: the PK is checked per row, immediately.
--
-- `WITH drained AS (DELETE … RETURNING *) INSERT … FROM drained` LOOKS like it
-- avoids the problem and does not — it was tried here first and failed on
-- swl-table-rock-dam. Data-modifying CTEs all run against the SAME SNAPSHOT and
-- cannot see each other's effects, so the INSERT is checked against the table
-- as it stood BEFORE the DELETE. The single statement makes the collision
-- certain rather than avoiding it.
--
-- So: stage every shifted row, empty the table, insert them back. Three
-- statements, each seeing the previous one's effects, inside the one
-- transaction the migration already runs in.
--
-- ── Deploy ordering: this must land AFTER the code fix, not before ─────────
-- Learned the hard way on 2026-08-16. This was applied while the OLD bucketing
-- was still deployed, and the hourly sync ran four minutes later. It re-fetches
-- a rolling SYNC_LOOKBACK_HOURS = 48 window and upserts, so it wrote that whole
-- window straight back into the off-by-one convention and left the table split
-- at the seam: older rows corrected, the last 48 hours — the part the pattern
-- strip actually draws — still an hour late.
--
-- It self-heals: once the corrected bucketing is deployed, the same rolling
-- re-sync rewrites those 48 hours at the right stamps within an hour or two.
-- Nothing is lost either way, because rows outside the window are already
-- correct and rows inside it are re-fetched from CWMS regardless. But the
-- window is only right once the deploy is out, so treat "deployed" as this
-- migration's real precondition rather than something to tidy up afterwards.
--
-- Idempotency: NOT idempotent by construction — running it twice shifts twice.
-- It is guarded on a marker row instead. `applied_at` in the guard table is the
-- record that this ran; re-running is a no-op.
--
-- No explicit BEGIN/COMMIT: both the Supabase CLI and the management API wrap a
-- migration in one transaction already, which is what makes the three-statement
-- shift below atomic. Nesting our own would only risk committing theirs early.

CREATE TABLE IF NOT EXISTS dam_history_backfill_marks (
  mark text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now(),
  note text
);

COMMENT ON TABLE dam_history_backfill_marks IS
  'One row per one-shot repair applied to dam_metric_readings. Exists so a '
  'non-idempotent data correction can be re-run safely as a no-op.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM dam_history_backfill_marks WHERE mark = 'period_ending_shift_1h'
  ) THEN
    RAISE NOTICE 'period_ending_shift_1h already applied; skipping.';
    RETURN;
  END IF;

  CREATE TEMP TABLE dam_history_shift_staging ON COMMIT DROP AS
  SELECT
    dam_id,
    metric,
    observed_hour - interval '1 hour' AS observed_hour,
    value_cfs,
    sample_count,
    updated_at
  FROM dam_metric_readings;

  DELETE FROM dam_metric_readings;

  INSERT INTO dam_metric_readings (dam_id, metric, observed_hour, value_cfs, sample_count, updated_at)
  SELECT dam_id, metric, observed_hour, value_cfs, sample_count, updated_at
  FROM dam_history_shift_staging;

  INSERT INTO dam_history_backfill_marks (mark, note)
  VALUES (
    'period_ending_shift_1h',
    'Shifted every row back 1h: CWMS period-ending stamps had been stored as period-beginning hours.'
  );
END $$;
