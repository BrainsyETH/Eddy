-- 00208_feedback_gauge_recalibration.sql
-- A feedback type for "this gauge is wrong".
--
-- ── Why this is not `inaccurate_data` ──────────────────────────────────────
-- It would fit there, and that is the problem: `inaccurate_data` is where a
-- misspelt access point, a stale outfitter phone number and a wrong river mile
-- already go. Those are corrections to a row somebody typed. A gauge complaint
-- is not — it is a claim that the LADDER is wrong, that the water on the ground
-- does not match the verdict Eddy printed against it, and the fix is to move a
-- threshold rather than to edit a field.
--
-- That distinction is the whole reason to spend a type on it. The thresholds in
-- river_gauges are hand-set per stretch (see scripts/ingestion/update-thresholds.ts),
-- they are the thing this product is actually judged on, and the people who can
-- tell us one is off are the people standing in the river. A report that says so
-- should be findable as a class in /admin/feedback, not buried among typo
-- corrections — nobody triaging a queue goes looking for a calibration signal
-- inside a bucket named for something else.
--
-- Nothing else changes. context_type already allows 'gauge', so the surface
-- reporting this needs no schema of its own; the app and the website put the
-- site id, the reading and its timestamp in context_data.

ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_feedback_type_check;
ALTER TABLE feedback ADD CONSTRAINT feedback_feedback_type_check
    CHECK (feedback_type IN (
        'inaccurate_data',
        'missing_access_point',
        'suggestion',
        'bug_report',
        'other',
        'partner',
        'gauge_recalibration'
    ));

COMMENT ON COLUMN feedback.feedback_type IS 'Type of feedback: inaccurate_data, missing_access_point, suggestion, bug_report, other, partner, gauge_recalibration';
