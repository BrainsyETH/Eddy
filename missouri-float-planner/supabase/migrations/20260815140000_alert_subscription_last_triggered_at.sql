-- 20260815140000_alert_subscription_last_triggered_at.sql
-- When a river alert last actually reached somebody.
--
-- ── The fact this table could not state ─────────────────────────────────────
--
-- gauge_alert_subscriptions has carried last_triggered_at since 00200, and the
-- app's manage list reads it through AlertRule.lastTriggeredAt to draw "Last
-- sent 2d ago" under every rule. alert_subscriptions had no equivalent, so
-- toRiverRule mapped that field to `fired_at` — the only timestamp on the row.
--
-- fired_at is not that fact. It is the one-shot SPEND marker, written by
-- /api/cron/deliver-push only when a `one_shot` subscription is consumed, and
-- never written at all for an ordinary repeating river alert. So every
-- repeating alert reported `lastTriggeredAt: null` forever, and
-- lastSentNote() in the app rendered "Never sent · watching since June" under
-- a rule that had fired the previous night.
--
-- That note exists for a specific reason, spelled out in the app's
-- src/lib/alertCopy.ts: a notification channel you have never heard from is
-- indistinguishable from a broken one, so a rule that has correctly never
-- fired says so out loud. Pointing it at the wrong column inverted it — a
-- rule that HAS fired, repeatedly, claiming it never has. The one state the
-- line was written to make legible is the one it was lying about.
--
-- ── Why a column rather than a query against the ledger ─────────────────────
--
-- alert_push_deliveries records every send and could be aggregated for this,
-- but that makes an ordinary list read a ledger that grows without bound, per
-- rule, on a screen opened every time the Alerts tab comes forward. The gauge
-- table answers the same question with a column for the same reason, and the
-- two must stay symmetric: the manage list renders both kinds of rule through
-- one component, so a field that means different things depending on which
-- table a row came from is a field that component cannot use.
--
-- ── Nullable, and backfilled only where we genuinely know ───────────────────
--
-- NULL means "has not fired since this column existed", which is the honest
-- answer for every pre-existing repeating alert: the send happened, but
-- nothing recorded when, and inventing a timestamp would be worse than the
-- "never sent" line this migration is here to stop being wrong. Spent
-- one-shots are the exception — fired_at IS a real delivery time for those, so
-- it carries over.

alter table public.alert_subscriptions
    add column if not exists last_triggered_at timestamptz;

comment on column public.alert_subscriptions.last_triggered_at is
  'When a push for this subscription last reached at least one device. Written by /api/cron/deliver-push on successful delivery, for repeating and one-shot alike. NOT the one-shot spend marker — that is fired_at, which is written only when a one_shot subscription is consumed and stays null forever on a repeating alert.';

-- The one case where the old column already holds this fact: a spent one-shot
-- was stamped at delivery, so fired_at is a true last-sent time for it.
update public.alert_subscriptions
   set last_triggered_at = fired_at
 where fired_at is not null
   and last_triggered_at is null;
