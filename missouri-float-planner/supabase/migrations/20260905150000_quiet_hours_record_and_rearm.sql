-- Quiet hours: record the suppression, and re-arm the rule when the window ends.
--
-- ── WHY ───────────────────────────────────────────────────────────────────
--
-- A gauge alert that tripped during the user's quiet hours was drained from the
-- outbox and never heard about. The rule's crossing state had already advanced
-- at evaluation, so "drops below 3 ft" crossed at 2am stayed silent at 7am and
-- forever after, until the river rose back out of the band and fell in again.
-- The app promised the change would be waiting in an "Alerts feed" that had
-- been replaced by a high-water snapshot — one a falling river never appears in.
--
-- Two columns make the fix possible without a second state machine:
--
--   suppressed_reason   why the drain did not send this event. 'quiet_hours' is
--                       the only value today; the check keeps the vocabulary
--                       small on purpose. Null for every event that was sent,
--                       expired or gated — those are already legible from
--                       push_delivered_at and alert_push_deliveries.
--
--   rearmed_at          when the delivery pass, finding the user's window
--                       closed, put the rule's crossing state back on the far
--                       side of its line so the next evaluation re-reads the
--                       CURRENT number and fires afresh if the water is still
--                       there. Null until then; the partial index below is the
--                       drain's only lookup for the work still owed.
--
-- Nothing is queued and nothing stale is sent: the morning notification, when
-- there is one, is a new event with a new reading. The suppressed row stays as
-- the record, and /api/me/alert-events reads both to show "held back overnight
-- → sent 7:02 AM".

alter table public.gauge_alert_events
    add column if not exists suppressed_reason text
        check (suppressed_reason in ('quiet_hours')),
    add column if not exists rearmed_at timestamptz;

comment on column public.gauge_alert_events.suppressed_reason is
    'Why the drain did not send this event. quiet_hours: the user''s window was in force; the rule is re-armed when it ends (see rearmed_at).';

comment on column public.gauge_alert_events.rearmed_at is
    'When the delivery pass put the rule''s crossing state back so a still-true level fires afresh after quiet hours. Null until the window has ended.';

-- The re-arm step's only lookup: suppressed events whose rule has not yet been
-- put back. Small by construction — rows leave it within one pass of the
-- user's window ending.
create index if not exists idx_gae_awaiting_rearm
    on public.gauge_alert_events (user_id, detected_at)
    where suppressed_reason is not null and rearmed_at is null;
