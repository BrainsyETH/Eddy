-- 20260803180000_feedback_objectionable_content.sql
-- A feedback type for "this photo should not be here".
--
-- ── Why this exists, and why it is not `other` ─────────────────────────────
--
-- Eddy publishes user-generated content: community river photos, submitted
-- through /api/upload and displayed on the river screen. App Store Review
-- Guideline 1.2 asks for four things wherever that is true — a filter for
-- objectionable material, a way for users to report it, a way to eject abusive
-- submitters, and published contact information.
--
-- Eddy already had the first and the fourth. Photos land in a PRIVATE
-- quarantine bucket with `pending` status and reach the public bucket only when
-- a person verifies them (see src/lib/uploads/visual-moderation.ts), and
-- eddy.guide/support publishes an address. What was missing was the report
-- route: the app's feedback sheet offered six types, none of which was about a
-- photo, so somebody looking at something that should not be published had
-- nowhere in the app to say so.
--
-- ── Why it is a TYPE and not a free-text report ────────────────────────────
--
-- The same argument 00208 makes for gauge_recalibration, and it bites harder
-- here. A report of objectionable content is the one class in this table with a
-- clock on it — the guideline expects it acted on promptly, and the remedy is
-- to unpublish, not to correct a field. Filed as `other` it arrives in
-- /admin/feedback beside typo corrections and suggestions, sorted by nothing,
-- and looks exactly like them. The type is what makes it findable as a class.
--
-- Pre-moderation means this should be rare. Rare is not the same as absent: a
-- photo can be verified in good faith and become a problem later, or depict
-- something the moderator did not catch.
--
-- ── Nothing else changes ───────────────────────────────────────────────────
--
-- context_type already allows 'river', which is where a photo lives, and the
-- app puts the visual id, its image URL and the band it was filed under in
-- context_data. No new column, no new policy: feedback has been API-only since
-- 20260731010000 and this does not reopen it.

ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_feedback_type_check;
ALTER TABLE feedback ADD CONSTRAINT feedback_feedback_type_check
    CHECK (feedback_type IN (
        'inaccurate_data',
        'missing_access_point',
        'suggestion',
        'bug_report',
        'other',
        'partner',
        'gauge_recalibration',
        'objectionable_content'
    ));

COMMENT ON COLUMN feedback.feedback_type IS 'Type of feedback: inaccurate_data, missing_access_point, suggestion, bug_report, other, partner, gauge_recalibration, objectionable_content';
