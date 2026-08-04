-- APPLIED to production 2026-08-04 as 20260804192501.
--
-- Make the finding lifecycle self-protecting instead of merely well-behaved.
--
-- ── What the table currently permits ─────────────────────────────────────
--
-- trust_findings has CHECK constraints on severity, status and entity_type, so
-- no row can claim a severity that does not exist. It has none on the
-- RELATIONSHIP between status and the two timestamps that qualify it, so all of
-- these are legal today:
--
--   status='snoozed'  with snoozed_until NULL   -- snoozed until when? forever.
--   status='resolved' with resolved_at  NULL    -- fixed when? unknowable.
--   status='open'     with resolved_at  set     -- open, and also resolved.
--
-- The application never writes those combinations, which is exactly the
-- argument for the constraints rather than against them. "Correct by
-- convention" holds until the first hand-run UPDATE during an incident, the
-- first partially-applied batch, or the first new caller written by someone
-- reading the table instead of the routes.
--
-- The first of those is not hypothetical for this table: it is the operator
-- console's whole purpose to let a human change these rows, and a snooze with
-- no deadline is precisely the shape that the 90-day cap in
-- /api/admin/trust/findings/[id] exists to prevent. That cap lives in one route
-- handler. A row written any other way bypasses it, and an indefinite snooze is
-- a delete with extra steps — the finding is never heard from again even if the
-- problem gets worse.
--
-- ── Why resolved must also clear the snooze ──────────────────────────────
--
-- A snooze whose deadline passed is treated as open by classifyExisting(), so
-- it can legitimately be resolved on a later run. The row would then read
-- 'resolved' while still carrying a stale snoozed_until, and the partial index
-- on snoozed_until is defined WHERE status = 'snoozed' — so the value is
-- unreachable, unqueried and purely misleading. The writers now null it; this
-- makes that a rule rather than a habit.

-- ---------------------------------------------------------------------------
-- Normalize anything already inconsistent, so the constraints can be added
-- VALID rather than deferred to a NOT VALID that nobody ever validates.
--
-- Ordered deliberately: resolved first, because a row that is both resolved and
-- snoozed should end as resolved — the fix outranks the postponement.
-- ---------------------------------------------------------------------------
UPDATE public.trust_findings
SET resolved_at = COALESCE(resolved_at, last_seen_at, now()),
    snoozed_until = NULL
WHERE status = 'resolved'
  AND (resolved_at IS NULL OR snoozed_until IS NOT NULL);

-- A snooze with no deadline cannot be honoured and cannot expire. Reopening is
-- the safe reading: the finding returns to the list and the operator can snooze
-- it again with a real deadline, which is strictly better than a row that is
-- silently invisible forever.
UPDATE public.trust_findings
SET status = 'open',
    snoozed_until = NULL,
    resolved_at = NULL
WHERE status = 'snoozed' AND snoozed_until IS NULL;

UPDATE public.trust_findings
SET resolved_at = NULL,
    snoozed_until = NULL
WHERE status = 'open'
  AND (resolved_at IS NOT NULL OR snoozed_until IS NOT NULL);

-- ---------------------------------------------------------------------------
-- The constraints themselves.
--
-- Written as `status <> 'x' OR (...)` rather than a CASE so each one reads as a
-- single implication and fails with a name that says which rule broke.
-- ---------------------------------------------------------------------------
ALTER TABLE public.trust_findings
    DROP CONSTRAINT IF EXISTS trust_findings_open_is_clean;
ALTER TABLE public.trust_findings
    ADD CONSTRAINT trust_findings_open_is_clean
    CHECK (status <> 'open' OR (resolved_at IS NULL AND snoozed_until IS NULL));

ALTER TABLE public.trust_findings
    DROP CONSTRAINT IF EXISTS trust_findings_snoozed_has_deadline;
ALTER TABLE public.trust_findings
    ADD CONSTRAINT trust_findings_snoozed_has_deadline
    CHECK (status <> 'snoozed' OR snoozed_until IS NOT NULL);

ALTER TABLE public.trust_findings
    DROP CONSTRAINT IF EXISTS trust_findings_resolved_has_timestamp;
ALTER TABLE public.trust_findings
    ADD CONSTRAINT trust_findings_resolved_has_timestamp
    CHECK (status <> 'resolved' OR (resolved_at IS NOT NULL AND snoozed_until IS NULL));

COMMENT ON CONSTRAINT trust_findings_open_is_clean ON public.trust_findings IS
    'An open finding carries neither a resolution nor a snooze deadline. Enforced in the database because the console exists to let a human edit these rows by hand.';
COMMENT ON CONSTRAINT trust_findings_snoozed_has_deadline ON public.trust_findings IS
    'A snooze without a deadline is a delete with extra steps — the finding never returns even if the problem worsens. The 90-day cap lives in one route handler; this is the backstop.';
COMMENT ON CONSTRAINT trust_findings_resolved_has_timestamp ON public.trust_findings IS
    'A resolved finding records WHEN, and drops any stale snooze — the snoozed_until index is partial on status = snoozed, so a leftover value is unreachable and purely misleading.';
