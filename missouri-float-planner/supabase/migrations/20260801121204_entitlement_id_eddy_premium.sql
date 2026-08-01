-- Re-lands 00192, which was written in 2026-07 and never applied.
--
-- ── Why this file exists alongside 00192 ───────────────────────────────────
--
-- 00192 set the entitlements.entitlement_id default to 'eddy_premium'. It sat
-- unapplied for weeks: production still defaulted to 'eddy_plus', the
-- placeholder the runbook originally proposed, while every read in the codebase
-- looks for 'eddy_premium'. That is exactly the trap 00192's own header
-- described — "a column default that disagrees with the application constant is
-- a trap for whoever writes the next query" — and it caught the next query
-- written against this table, a hand-authored grant that had to name the column
-- explicitly to avoid producing a row nothing reads.
--
-- 00192 is left in place as the historical record. This file carries the
-- timestamp production actually recorded (20260801121204) so the drift gate
-- sees one migration on both sides rather than a local-only and a remote-only
-- pair. Re-running it is harmless: the default is idempotent and the UPDATE
-- matches nothing once it has run.
--
-- ── Not a live bug for the webhook, and that is the point ──────────────────
--
-- /api/webhooks/revenuecat names entitlement_id explicitly on every upsert, so
-- no purchase was ever mis-keyed. The default only bites hand-written inserts —
-- the ones nobody tests, written under time pressure, whose failure mode is a
-- paying customer with no access and nothing visible from the outside.

alter table public.entitlements
    alter column entitlement_id set default 'eddy_premium';

update public.entitlements
set entitlement_id = 'eddy_premium'
where entitlement_id = 'eddy_plus';
