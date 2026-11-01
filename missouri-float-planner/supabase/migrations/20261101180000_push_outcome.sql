-- push_outcome: WHY an outbox event drained.
--
-- push_delivered_at was stamped for four different endings — at least one
-- recipient reached, nothing to send (no subscriber, quiet hours, cooldown,
-- paused rule), too old to send, and retries exhausted — so "delivered" on the
-- dashboard counted all of them as one thing. deliver-push now records which.
--
--   sent      every planned recipient was reached (possibly across passes)
--   skipped   nothing to send and nobody was ever reached
--   expired   older than MAX_EVENT_AGE_HOURS; drained without sending
--   given_up  MAX_ATTEMPTS used with at least one recipient never reached
--
-- NULL means still pending, or drained before this column existed. Additive
-- and nullable: the cron writes it in a separate best-effort update after
-- push_delivered_at, so deploying code before this migration is harmless (it
-- logs one warning per instance and keeps draining).

ALTER TABLE public.river_condition_events
  ADD COLUMN IF NOT EXISTS push_outcome text;
ALTER TABLE public.gauge_alert_events
  ADD COLUMN IF NOT EXISTS push_outcome text;

ALTER TABLE public.river_condition_events
  DROP CONSTRAINT IF EXISTS river_condition_events_push_outcome_check;
ALTER TABLE public.river_condition_events
  ADD CONSTRAINT river_condition_events_push_outcome_check
  CHECK (push_outcome IS NULL OR (
    push_outcome IN ('sent', 'skipped', 'expired', 'given_up') AND push_delivered_at IS NOT NULL
  ));

ALTER TABLE public.gauge_alert_events
  DROP CONSTRAINT IF EXISTS gauge_alert_events_push_outcome_check;
ALTER TABLE public.gauge_alert_events
  ADD CONSTRAINT gauge_alert_events_push_outcome_check
  CHECK (push_outcome IS NULL OR (
    push_outcome IN ('sent', 'skipped', 'expired', 'given_up') AND push_delivered_at IS NOT NULL
  ));

COMMENT ON COLUMN public.river_condition_events.push_outcome IS
  'Why the event drained: sent | skipped | expired | given_up. NULL = pending or pre-20261101.';
COMMENT ON COLUMN public.gauge_alert_events.push_outcome IS
  'Why the event drained: sent | skipped | expired | given_up. NULL = pending or pre-20261101.';
