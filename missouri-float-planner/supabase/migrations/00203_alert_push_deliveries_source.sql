-- 00203_alert_push_deliveries_source.sql
-- Let the delivery ledger record gauge-alert sends as well as river-condition ones.
--
-- ── What this gives up, and why that is the right trade ─────────────────────
--
-- event_id references river_condition_events(id) on delete cascade. That FK is
-- the single thing preventing gauge_alert_events (00202) from sharing this
-- ledger, and sharing it is worth real money: the receipts cron
-- (/api/cron/push-receipts) resolves DeviceNotRegistered from Expo RECEIPTS
-- rather than tickets, and that is the only reliable way dead tokens get pruned.
-- A parallel ledger would mean a parallel receipts pass, and the second one
-- would rot the first time someone changed the first.
--
-- So the FK goes. Two consequences, both accounted for:
--
--   1. Deleting a river_condition_events row no longer clears its ledger rows.
--      push-receipts already prunes this table at RETENTION_HOURS = 24, which is
--      what now does that job. Note the prune is by AGE, so it collects orphans
--      whether or not anything was deleted upstream.
--   2. event_id no longer proves the referenced event exists. event_source says
--      which table to look in; nothing dereferences it except support queries.
--
-- The primary key (event_id, device_token_id) stays correct without a uniqueness
-- qualifier per source: both sides are gen_random_uuid(), so a collision across
-- the two tables is not a case worth defending against.

alter table public.alert_push_deliveries
    drop constraint if exists alert_push_deliveries_event_id_fkey;

alter table public.alert_push_deliveries
    add column if not exists event_source text not null default 'river_condition'
        check (event_source in ('river_condition', 'gauge_alert'));

comment on column public.alert_push_deliveries.event_source is
    'Which outbox event_id points at: river_condition_events or gauge_alert_events. There is no FK — see migration 00203.';

-- The existing cooldown index is (user_id, river_id, kind, sent_at desc) and
-- stays exactly as it is for the river path. It is deliberately NOT extended to
-- gauge rules: a rule on a national-tier station has no river_id, so every one
-- of them would collapse into the same (user, null, kind) bucket and a person
-- watching four gauges would be cooled down by whichever fired first. Per-rule
-- cooldown lives on gauge_alert_subscriptions.last_triggered_at instead, where
-- it is scoped to the thing the user actually created.
