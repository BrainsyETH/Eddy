-- Both the editor and the "replace existing" flow change one river alert.
-- Serialize those saves and commit the parent and its followers together.
create or replace function public.save_river_alert(
  p_river_id uuid, p_kind text, p_one_shot boolean, p_enabled boolean,
  p_rearm boolean, p_create boolean
) returns setof public.alert_subscriptions
language plpgsql security invoker set search_path = '' as $$
declare
  parent public.alert_subscriptions%rowtype;
  child public.gauge_alert_subscriptions%rowtype;
  next_kind text;
  next_once boolean;
  revive boolean;
  violated_constraint text;
begin
  if p_create then
    insert into public.alert_subscriptions (user_id, river_id, kind, one_shot, enabled)
      values (auth.uid(), p_river_id, coalesce(p_kind, 'all'), coalesce(p_one_shot, false), true)
      on conflict (user_id, river_id) do nothing returning * into parent;
    if found then return next parent; return; end if;
  end if;
  select * into parent from public.alert_subscriptions
    where user_id = auth.uid() and river_id = p_river_id for update;
  if not found then return; end if;
  next_kind := coalesce(p_kind, parent.kind);
  next_once := coalesce(p_one_shot, parent.one_shot);

  if next_kind <> parent.kind or next_once <> parent.one_shot or p_rearm then
    for child in select * from public.gauge_alert_subscriptions
      where parent_subscription_id = parent.id and user_id = parent.user_id
        and mode = 'condition' and coalesce(condition_kind, 'all') = parent.kind
        and one_shot = parent.one_shot
      order by id for update
    loop
      revive := child.one_shot and child.one_shot_fired_at is not null and (p_rearm or not next_once);
      if next_kind <> parent.kind or next_once <> parent.one_shot or revive then
        begin
          update public.gauge_alert_subscriptions set
            condition_kind = next_kind, one_shot = next_once,
            enabled = case when revive then true else enabled end,
            one_shot_fired_at = case when revive then null else one_shot_fired_at end,
            last_triggered_at = case when revive then null else last_triggered_at end
          where id = child.id;
        exception when unique_violation then
          get stacked diagnostics violated_constraint = constraint_name;
          if violated_constraint <> 'idx_gas_dedupe' then raise; end if;
          -- A standalone rule at this station already uses the new trigger.
          -- Keep the child as an independently editable exception.
        end;
      end if;
    end loop;
  end if;

  return query update public.alert_subscriptions set
    kind = next_kind, one_shot = next_once,
    enabled = coalesce(p_enabled, case when p_rearm then true else enabled end),
    fired_at = case when p_rearm then null else fired_at end
    where id = parent.id returning *;
end;
$$;

revoke all on function public.save_river_alert(uuid,text,boolean,boolean,boolean,boolean) from public, anon;
grant execute on function public.save_river_alert(uuid,text,boolean,boolean,boolean,boolean) to authenticated;

-- Expo can accept a ticket and later report an APNs failure. Match the exact
-- spend to every accepted ticket for that rule (including its other devices).
alter table public.alert_push_deliveries add column one_shot_rule_id uuid;
create index alert_push_one_shot_attempt_idx
  on public.alert_push_deliveries (event_source, one_shot_rule_id, sent_at)
  where one_shot_rule_id is not null;

create or replace function public.restore_failed_alert_spend()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  -- Lock the rule first. Simultaneous failing receipts for two devices must
  -- see each other's committed ledger state before deciding to restore it.
  if new.event_source = 'river_condition' then
    perform 1 from public.alert_subscriptions where id = new.one_shot_rule_id
      and user_id = new.user_id and one_shot and fired_at = new.sent_at for update;
  elsif new.event_source = 'gauge_alert' then
    perform 1 from public.gauge_alert_subscriptions where id = new.one_shot_rule_id
      and user_id = new.user_id and one_shot and one_shot_fired_at = new.sent_at for update;
  else
    return new;
  end if;
  if not found then return new; end if;
  if exists (select 1 from public.alert_push_deliveries where
      event_source = new.event_source and one_shot_rule_id = new.one_shot_rule_id
      and sent_at = new.sent_at and status = 'sent') then
    return new;
  end if;
  if new.event_source = 'river_condition' then
    update public.alert_subscriptions set enabled = true, fired_at = null,
      last_triggered_at = case when last_triggered_at = new.sent_at then null else last_triggered_at end
      where id = new.one_shot_rule_id;
  else
    update public.gauge_alert_subscriptions set enabled = true, one_shot_fired_at = null,
      last_triggered_at = null where id = new.one_shot_rule_id;
  end if;
  return new;
end;
$$;
revoke all on function public.restore_failed_alert_spend() from public, anon, authenticated;
create trigger restore_failed_alert_spend after update of receipt_checked_at on public.alert_push_deliveries
  for each row when (new.one_shot_rule_id is not null and old.status = 'sent' and new.status = 'error')
  execute function public.restore_failed_alert_spend();
