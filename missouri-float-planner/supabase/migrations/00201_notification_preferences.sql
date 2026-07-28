-- 00201_notification_preferences.sql
-- Per-user quiet hours.
--
-- ── Quiet hours SUPPRESS; they do not queue ─────────────────────────────────
--
-- The obvious reading of "quiet hours" is "hold it until morning", and that is
-- the wrong behaviour for this product. deliver-push already refuses to send any
-- event older than MAX_EVENT_AGE_HOURS = 3, on the grounds that "your river is
-- floatable" must never fire about water that has since dropped. A quiet window
-- is typically eight hours. Queueing would therefore either deliver a stale
-- promise at 7am or, more likely, deliver nothing at all once the event expired
-- in the outbox — a silent failure dressed up as a feature.
--
-- So a non-safety push that lands inside the window is DROPPED and counted. The
-- feed on the Alerts tab is the durable record; it is free, needs no account,
-- and still shows the change on waking. The app must say this plainly rather
-- than implying a morning digest exists.
--
-- Safety still breaks through by default. Someone who set quiet hours to sleep
-- did not thereby ask not to be told the river turned dangerous, and
-- safety_overrides_quiet is the deliberate escape hatch for the few who mean it.

create table if not exists public.notification_preferences (
    user_id uuid primary key references auth.users(id) on delete cascade,

    quiet_hours_enabled boolean not null default false,

    -- Minutes past local midnight, 0-1439. Two integers rather than `time`
    -- because the only arithmetic ever done on them is a range test, and the
    -- WRAP-AROUND case (22:00 → 07:00, i.e. start > end) is the normal one for
    -- sleep. A `time` column invites BETWEEN, which silently returns nothing
    -- for every overnight window anybody would actually set.
    quiet_start_minute smallint check (quiet_start_minute between 0 and 1439),
    quiet_end_minute smallint check (quiet_end_minute between 0 and 1439),

    -- IANA zone. Stored per user and not derived from the river: someone in
    -- Chicago watching an Idaho gauge wants THEIR night respected, and the
    -- default matches Eddy's home water rather than UTC, which is nobody's
    -- bedtime.
    timezone text not null default 'America/Chicago',

    safety_overrides_quiet boolean not null default true,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    -- An enabled window with no bounds would suppress everything or nothing
    -- depending on which way the evaluator happened to guard.
    constraint quiet_hours_bounds check (
        not quiet_hours_enabled
        or (quiet_start_minute is not null and quiet_end_minute is not null)
    )
);

alter table public.notification_preferences enable row level security;

-- Writable by an anonymous user, unlike the alert tables. There is no push
-- identity at stake here — this row only ever makes the app QUIETER, so the
-- is_permanent_user() requirement would be a gate with nothing behind it.
create policy notification_preferences_select_own on public.notification_preferences
    for select using (user_id = (select auth.uid()));

create policy notification_preferences_insert_own on public.notification_preferences
    for insert with check (user_id = (select auth.uid()));

create policy notification_preferences_update_own on public.notification_preferences
    for update using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

create policy notification_preferences_delete_own on public.notification_preferences
    for delete using (user_id = (select auth.uid()));

create or replace function public.update_notification_preferences_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists notification_preferences_updated_at on public.notification_preferences;
create trigger notification_preferences_updated_at
    before update on public.notification_preferences
    for each row execute function public.update_notification_preferences_updated_at();
