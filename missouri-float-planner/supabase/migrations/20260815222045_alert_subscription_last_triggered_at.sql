-- When a river alert last actually reached somebody.
--
-- gauge_alert_subscriptions has carried last_triggered_at since 00200, and the
-- app's manage list reads it through AlertRule.lastTriggeredAt to draw "Last
-- sent 2d ago" under every rule. alert_subscriptions had no equivalent, so
-- toRiverRule mapped that field to `fired_at` — the only timestamp on the row.
--
-- fired_at is not that fact. It is the one-shot SPEND marker, written by
-- /api/cron/deliver-push only when a `one_shot` subscription is consumed, and
-- never written at all for an ordinary repeating river alert. So every
-- repeating alert reported `lastTriggeredAt: null` forever, and lastSentNote()
-- in the app rendered "Never sent · watching since June" under a rule that had
-- fired the previous night — inverting the one line written to make a rule's
-- silence legible as the rule working.
--
-- NULL means "has not fired since this column existed", which is the honest
-- answer for every pre-existing repeating alert: the send happened, but nothing
-- recorded when, and inventing a timestamp would be worse than the "never sent"
-- line this migration is here to stop being wrong. Spent one-shots are the
-- exception — fired_at IS a real delivery time for those, so it carries over.

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
