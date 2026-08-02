-- 20260802143000_gauge_alert_parent_subscription.sql
-- A gauge alert can belong to the river alert it was created from.
--
-- ── The thing that was missing, and what it cost ────────────────────────────
--
-- RiverGaugeAlerts lives INSIDE a river alert's edit screen. Switching on one of
-- the river's other stations there creates a gauge_alert_subscriptions row, and
-- nothing recorded that it came from the alert above it. The relationship was
-- real in the product and absent from the schema, so every consumer had to
-- reinvent it from the only fact available: same user, same river.
--
-- That approximation is wrong in both directions. It adopts a rule somebody
-- created independently from the gauge screen on a river they happen to follow,
-- and it cannot express a rule that was created from the river alert and should
-- travel with it. The app shipped a client-side workaround — a stored list of
-- "which children were already paused" — so that a river alert's switch could
-- behave like the master switch its nesting promised. Every line of that
-- existed because this column did not.
--
-- ── What the column buys ────────────────────────────────────────────────────
--
--   * A GENUINE GATE. The evaluator skips a child whose parent is paused, so
--     pausing a river alert stops its gauge alerts without writing to them —
--     which means resuming restores each one to whatever it was, for free, with
--     nothing remembered anywhere. That is how a master switch is supposed to
--     work and it is not expressible without this.
--   * DELETE THAT MEANS DELETE. `on delete cascade` removes the children with
--     the river alert. Before this, deleting a river alert left orphan rules
--     firing about a river the user believed they had stopped following.
--   * An honest list. The app can nest what actually belongs together instead
--     of everything that shares a river.
--
-- ── Nullable, and most rows will stay null ──────────────────────────────────
--
-- A rule on a national-tier station has no river, let alone a river alert. A
-- custom level set from the gauge screen is the whole of what that person
-- asked for and must stay top-level and ungated. Null is the ordinary case;
-- a parent is the exception that the river-details flow creates.

alter table public.gauge_alert_subscriptions
    add column if not exists parent_subscription_id uuid
        references public.alert_subscriptions(id) on delete cascade;

-- ── The integrity rule a CHECK cannot express ───────────────────────────────
--
-- A parent must belong to the same user AND the same river. Neither fact lives
-- on this row, so the constraint needs a lookup, which rules out CHECK.
--
-- It is enforced here rather than left to the route for the reason 00200 gives
-- about its own mode-shape constraint: "so a bad backfill or a psql session
-- cannot create a row the evaluator would have to guess about". A child pointing
-- at another user's subscription would be gated by a switch its owner cannot
-- see, which is the worst failure this table can produce — an alert that is
-- silently off for a reason nothing on screen can explain.
create or replace function public.gauge_alert_parent_is_same_river()
returns trigger
language plpgsql
-- Pinned search_path, matching the hardening 00186 applied to the other alert
-- trigger functions.
set search_path = public, pg_temp
as $$
begin
    if new.parent_subscription_id is null then
        return new;
    end if;

    if not exists (
        select 1
        from public.alert_subscriptions s
        where s.id = new.parent_subscription_id
          and s.user_id = new.user_id
          and s.river_id = new.river_id
    ) then
        raise exception
            'parent_subscription_id must be an alert_subscriptions row for the same user and river'
            using errcode = 'check_violation';
    end if;

    return new;
end;
$$;

drop trigger if exists gauge_alert_parent_is_same_river on public.gauge_alert_subscriptions;
create trigger gauge_alert_parent_is_same_river
    before insert or update of parent_subscription_id, user_id, river_id
    on public.gauge_alert_subscriptions
    for each row execute function public.gauge_alert_parent_is_same_river();

-- Not optional. Postgres has to find the children on every parent delete, and
-- without an index that is a sequential scan of this table each time somebody
-- unfollows a river. Partial, because the null rows are the majority and are
-- never looked up this way.
create index if not exists idx_gas_parent
    on public.gauge_alert_subscriptions (parent_subscription_id)
    where parent_subscription_id is not null;

-- ── Backfill ────────────────────────────────────────────────────────────────
--
-- Adopts the rules the app has ALREADY been treating as children — a gauge
-- alert graded on Eddy's ladder, on a river the same user subscribes to. That
-- is exactly the shape RiverGaugeAlerts creates, and the shape the Alerts tab
-- has been drawing nested since the grouping shipped. Leaving them unparented
-- would un-nest every existing group and restore the four-identical-cards
-- problem for precisely the users who already have it.
--
-- Deliberately NARROW:
--   * mode = 'condition' — a threshold rule is somebody's own number, set
--     somewhere else, and is not part of any river alert.
--   * scope = 'gauge' — a river-scoped custom level is presented as a river
--     alert in its own right; nesting it under another river alert would be
--     filing a thing under itself.
--
-- alert_subscriptions is unique on (user_id, river_id), so the correlated
-- select can match at most one row and no ordering is needed.
--
-- The imprecision that remains is real and unavoidable: a condition rule
-- created from the gauge screen on a followed river is indistinguishable from
-- one created in the river alert, because nothing ever recorded the difference.
-- It is adopted. From here on the distinction exists, and anything created
-- outside the river-details flow stays independent.
update public.gauge_alert_subscriptions g
set parent_subscription_id = s.id
from public.alert_subscriptions s
where g.parent_subscription_id is null
  and g.mode = 'condition'
  and g.scope = 'gauge'
  and g.river_id is not null
  and s.user_id = g.user_id
  and s.river_id = g.river_id;

comment on column public.gauge_alert_subscriptions.parent_subscription_id is
    'The river alert this rule was created from. When set, the parent''s enabled '
    'flag gates this rule and deleting the parent deletes it. Null for a rule '
    'that stands on its own.';
