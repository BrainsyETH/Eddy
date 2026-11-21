-- Dam generation pushes get the same fallback record as river and gauge pushes.
--
-- When Expo accepts a batch and the ticket write to alert_push_deliveries fails
-- twice, the river and gauge passes record each accepted recipient here
-- (20261120174228), so a later pass knows they were reached. The dam pass only
-- logged the failure. With this column it records them too; deliver-push reads
-- them back as "already reached" before planning a dam send.
--
-- The dam events have no one-time spend, so restore_failed_alert_spend never
-- reads these rows. They go with their event when it is pruned.
--
-- The code tolerates this column being absent (it reads no dam fallback rows
-- and the fallback write fails, logged), so it can be applied before or after
-- the deploy. Safe to re-run.
alter table public.alert_push_unrecorded_recipients
  add column if not exists dam_event_id uuid
    references public.dam_generation_alert_events(id) on delete cascade;

-- Exactly one event per row, now out of three.
alter table public.alert_push_unrecorded_recipients
  drop constraint if exists alert_push_unrecorded_recipients_check;
alter table public.alert_push_unrecorded_recipients
  drop constraint if exists alert_push_unrecorded_recipients_one_event;
alter table public.alert_push_unrecorded_recipients
  add constraint alert_push_unrecorded_recipients_one_event
    check (num_nonnulls(river_event_id, gauge_event_id, dam_event_id) = 1);

-- The upsert's conflict target, as for the other two event columns.
create unique index if not exists alert_push_unrecorded_recipients_dam_user_idx
  on public.alert_push_unrecorded_recipients (dam_event_id, user_id);
