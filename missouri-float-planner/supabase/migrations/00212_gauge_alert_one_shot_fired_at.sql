-- 00212_gauge_alert_one_shot_fired_at.sql
-- Separate "this one-shot has been delivered" from "this rule last evaluated true".
--
-- See docs/decisions/0005-gauge-alert-one-shot-spend.md.
--
-- ── The bug ───────────────────────────────────────────────────────────────
--
-- last_triggered_at was doing three jobs: one-shot state, per-rule cooldown, and
-- the wire-format firedAt the app shows on a rule row. It is stamped at
-- EVALUATION time, when the event is written to the outbox — two crons before
-- anything is delivered. So a one-shot rule whose event then failed every
-- delivery attempt, or landed entirely inside quiet hours, was spent anyway. A
-- user's single shot at "tell me when the Current comes down" was burned by a
-- push they never saw, with no way to tell it had happened.
--
-- ── Why a second column, given 00200 argued against one ────────────────────
--
-- rule-serialize.ts said "carrying two columns that must agree is how they stop
-- agreeing", and that is a good rule for two columns recording the SAME fact.
-- These record different ones:
--
--   last_triggered_at   the rule last evaluated true. Owns the cooldown, and
--                       must keep being stamped at evaluation — moving it to
--                       delivery would delay the cooldown by two crons, so a
--                       gauge sitting on a threshold could re-fire before its
--                       first push landed. A missed notification would become a
--                       duplicate storm, which is the worse way to fail.
--   one_shot_fired_at   at least one push for this rule actually reached a
--                       device. The ONLY thing that spends a one-shot.
--
-- The alternative — clearing last_triggered_at on send failure — also resets the
-- cooldown and corrupts edge-trigger state, which is the same duplicate-storm
-- outcome by a shorter route.

ALTER TABLE gauge_alert_subscriptions
    ADD COLUMN IF NOT EXISTS one_shot_fired_at TIMESTAMPTZ;

COMMENT ON COLUMN gauge_alert_subscriptions.one_shot_fired_at IS
    'Set when a push for this one-shot rule was actually delivered. Spends the rule. Distinct from last_triggered_at, which is stamped at evaluation and owns the cooldown.';

-- ── Backfill, and why it is not optional ──────────────────────────────────
--
-- Without this, every already-spent one-shot rule re-arms the moment this
-- deploys, because the new column starts null and the new spend check reads it
-- alone. The next evaluation that finds the condition true would fire all of
-- them at once — a notification storm caused by a bug fix, sent to exactly the
-- people who asked to be told only once.
--
-- Treating the old stamp as a delivery is the conservative reading: it may spend
-- a rule whose push never landed, which is the behaviour these users already
-- have, rather than re-notifying everyone.
UPDATE gauge_alert_subscriptions
SET one_shot_fired_at = last_triggered_at
WHERE one_shot = true
  AND last_triggered_at IS NOT NULL
  AND one_shot_fired_at IS NULL;

-- Partial index: the delivery pass updates only rows that are one-shot and not
-- yet spent, which on any real dataset is a small slice of the table.
CREATE INDEX IF NOT EXISTS gauge_alert_subscriptions_unspent_one_shot_idx
    ON gauge_alert_subscriptions (id)
    WHERE one_shot = true AND one_shot_fired_at IS NULL;
