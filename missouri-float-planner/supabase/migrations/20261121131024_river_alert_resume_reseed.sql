-- Resuming or re-arming a river alert reseeds the gauges it held.
--
-- While a river alert is switched off (paused, or a spent one-time alert),
-- evaluate-gauge-alerts drops its gauges from the pass, and their crossing
-- state freezes at the last reading before the pause. save_river_alert
-- (20261120174228) switched the river alert back on, and revived spent gauges,
-- without touching that state. The first pass afterwards compared the frozen
-- verdict with the current one and could push a change that happened while the
-- alert was off, while the river alert itself, which only fans out new events,
-- stayed silent about it.
--
-- Now, in the same transaction as the save, those gauges go back to
-- "seed from the next reading": last_state and last_condition_code null, which
-- is how the evaluator treats a newly created rule that could not be seeded
-- (rule-seed.ts). Its first pass records which side the water is on without
-- announcing it. last_reading_at is cleared too, so that pass is not skipped as
-- "no new reading".
--
-- When: the river alert goes from off to on (resume, or re-arm of a spent
-- one-time alert), for every gauge that follows it and is itself on; and any
-- gauge revived from spent, whatever the river alert was doing. Not on an
-- ordinary re-save of a live alert: its gauges were evaluated all along, and
-- reseeding them would only delay their next alert.
--
-- last_triggered_at is left alone on a resume. The cooldown reads what the user
-- was actually told from the outbox and ledger (gauge-last-told.ts), which is
-- still accurate after a pause; a revived gauge already clears it.
--
-- Same signature and grants as 20261120174228; safe to re-run.
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
  next_enabled boolean;
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
  next_enabled := coalesce(p_enabled, case when p_rearm then true else parent.enabled end);

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
            last_triggered_at = case when revive then null else last_triggered_at end,
            -- A spent gauge was switched off, so its state froze at the push.
            last_state = case when revive then null else last_state end,
            last_condition_code = case when revive then null else last_condition_code end,
            last_value = case when revive then null else last_value end,
            last_reading_at = case when revive then null else last_reading_at end
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

  -- Off to on: every gauge the river alert held was frozen with it.
  if not parent.enabled and next_enabled then
    update public.gauge_alert_subscriptions set
      last_state = null, last_condition_code = null, last_value = null, last_reading_at = null
      where parent_subscription_id = parent.id and user_id = parent.user_id and enabled;
  end if;

  return query update public.alert_subscriptions set
    kind = next_kind, one_shot = next_once,
    enabled = next_enabled,
    fired_at = case when p_rearm then null else fired_at end
    where id = parent.id returning *;
end;
$$;

revoke all on function public.save_river_alert(uuid,text,boolean,boolean,boolean,boolean) from public, anon;
grant execute on function public.save_river_alert(uuid,text,boolean,boolean,boolean,boolean) to authenticated;
