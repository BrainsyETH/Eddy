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
-- ── Why DELETE … RETURNING and not a plain UPDATE ──────────────────────────
-- The primary key is (dam_id, metric, observed_hour) and this shifts every row
-- onto the key its earlier neighbour currently occupies. A plain UPDATE checks
-- the constraint row by row and would trip on a collision that does not exist
-- once the statement finishes. Draining the table and reinserting in one
-- statement never lets the intermediate state be observed.
--
-- Idempotency: NOT idempotent by construction — running it twice shifts twice.
-- It is guarded on a marker row instead. `applied_at` in the guard table is the
-- record that this ran; re-running is a no-op.

BEGIN;

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

  WITH drained AS (
    DELETE FROM dam_metric_readings RETURNING *
  )
  INSERT INTO dam_metric_readings (dam_id, metric, observed_hour, value_cfs, sample_count, updated_at)
  SELECT dam_id, metric, observed_hour - interval '1 hour', value_cfs, sample_count, updated_at
  FROM drained;

  INSERT INTO dam_history_backfill_marks (mark, note)
  VALUES (
    'period_ending_shift_1h',
    'Shifted every row back 1h: CWMS period-ending stamps had been stored as period-beginning hours.'
  );
END $$;

COMMIT;
