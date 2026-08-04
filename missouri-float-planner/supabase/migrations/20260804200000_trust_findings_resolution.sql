-- Record WHY a finding closed, not just that it did.
--
-- ── The gate this unblocks ──────────────────────────────────────────────
--
-- The Trust MVP gate in docs/EDDY_AGENT_FRAMEWORK_PLAN.md requires "fewer than
-- 20% false positives among reviewed findings". Nothing in the schema could
-- answer it. A closed finding had a status and a timestamp, so the ledger could
-- say a finding ended and could not say whether it ended because somebody
-- repaired the river or because the check had been wrong about it all along.
--
-- Those are opposite outcomes — the system working versus the system crying
-- wolf — and `status = 'resolved'` scores them identically.
--
-- ── Why unreviewed closures get their own values ────────────────────────
--
-- Most findings close without anyone looking: a check stops emitting one and
-- reconciliation resolves it. Folding those into 'fixed' would pack the
-- denominator with rows nobody read and push the false-positive rate toward
-- zero exactly as the console filled with noise — the metric would look best
-- when the system was worst. So 'auto_resolved' and 'expired' say plainly that
-- nobody looked, and the rate is computed over the other three.
--
-- ── Why this column is nullable, and stays nullable ─────────────────────
--
-- No constraint requires a resolved row to carry a resolution, and that is
-- deliberate rather than lazy. The code that writes these rows deploys AFTER
-- this migration, and the currently-running code resolves findings without
-- setting the column. A NOT NULL-shaped constraint would make every auto-resolve
-- fail until the deploy caught up — repeating exactly the ordering hazard that
-- 20260804192501's lifecycle constraints already have to be careful about.
--
-- The 24 rows already resolved keep NULL, which is the honest value: this
-- question was not asked when they closed.

ALTER TABLE public.trust_findings
    ADD COLUMN IF NOT EXISTS resolution text;

ALTER TABLE public.trust_findings
    DROP CONSTRAINT IF EXISTS trust_findings_resolution;
ALTER TABLE public.trust_findings
    ADD CONSTRAINT trust_findings_resolution
    CHECK (resolution IS NULL OR resolution IN (
        'fixed', 'false_positive', 'accepted', 'auto_resolved', 'expired'
    ));

-- An open finding has not been resolved, so it cannot carry a reason for having
-- been. Without this the column drifts into a general-purpose note field and
-- stops meaning what the metric assumes it means.
--
-- In practice the trigger below normalizes this case rather than letting it
-- reach the constraint: an open row's resolution is cleared, not rejected. The
-- constraint stays as the backstop for anything that bypasses the trigger.
ALTER TABLE public.trust_findings
    DROP CONSTRAINT IF EXISTS trust_findings_resolution_only_when_closed;
ALTER TABLE public.trust_findings
    ADD CONSTRAINT trust_findings_resolution_only_when_closed
    CHECK (status = 'resolved' OR resolution IS NULL);

COMMENT ON COLUMN public.trust_findings.resolution IS
    'Why this finding closed. fixed/false_positive/accepted are human judgements and form the denominator of the MVP gate''s false-positive rate; auto_resolved/expired record that nobody looked. NULL means it closed before the column existed.';

-- The review-metrics query reads only closed rows and only this column.
CREATE INDEX IF NOT EXISTS idx_trust_findings_resolution
    ON public.trust_findings (resolution)
    WHERE status = 'resolved';

-- ---------------------------------------------------------------------------
-- The unreviewed default, as a trigger.
--
-- ── Why a trigger and not the reconcile function ────────────────────────
--
-- The obvious place is trust_apply_reconcile()'s resolve clause. Two reasons it
-- is the wrong place:
--
--   1. It would only label closures made by the NEW code. The code that resolves
--      findings on production right now deploys later, and everything it closes
--      between this migration and that deploy would land as NULL — a hole in
--      the middle of the very measurement this column exists to start.
--   2. It cannot cover the other writers. Any future caller that resolves a
--      finding without thinking about this column produces the same hole, and
--      the metric degrades silently, which is the failure mode this subsystem
--      is entirely about.
--
-- A column DEFAULT cannot express it either, because the value depends on
-- another column in the same row.
--
-- So: anything that closes a finding without saying why is recorded as nobody
-- having looked. That is the conservative direction — it shrinks the reviewed
-- denominator rather than inflating it, so the false-positive rate can only be
-- understated by a caller that forgets, never flattered.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trust_findings_default_resolution()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
    IF NEW.status = 'resolved' AND NEW.resolution IS NULL THEN
        NEW.resolution := 'auto_resolved';
    END IF;

    -- Re-opening clears it. A finding that came back has no resolution, and
    -- leaving the old one behind would let a reopened row count as reviewed.
    IF NEW.status <> 'resolved' THEN
        NEW.resolution := NULL;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trust_findings_set_resolution ON public.trust_findings;
CREATE TRIGGER trust_findings_set_resolution
    BEFORE INSERT OR UPDATE OF status, resolution ON public.trust_findings
    FOR EACH ROW EXECUTE FUNCTION public.trust_findings_default_resolution();

COMMENT ON FUNCTION public.trust_findings_default_resolution() IS
    'Labels any closure that did not say why as auto_resolved, and clears the resolution when a finding reopens. Keeps the MVP gate''s false-positive denominator honest across callers that predate the column.';
