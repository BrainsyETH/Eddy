-- 00191_app_config.sql
-- Remote configuration + kill switches for the mobile app.
--
-- WHY THIS MUST EXIST BEFORE THE FIRST BUILD SHIPS: App Store review latency
-- means a broken client can be live for days, and old app versions persist in
-- the wild for YEARS. Without a server-side version gate there is no way to
-- tell an outdated build to stop calling an endpoint, and no way to disable a
-- misbehaving feature without shipping a new binary through review.
--
-- Deliberately a single row, matching the social_config pattern (00058), so an
-- operator can flip a switch in the dashboard with no deploy. Env vars would
-- require a redeploy, which is exactly the wrong property for a kill switch.
--
-- The route that reads this falls back to permissive defaults if the row or the
-- database is unavailable: a config outage must never brick the app.

create table if not exists public.app_config (
    id uuid primary key default gen_random_uuid(),

    -- Builds below this refuse to run and show an upgrade prompt. Keep at the
    -- lowest version that still works; raising it locks people out.
    min_supported_version text not null default '0.0.0',
    -- Latest published build, for a soft "update available" nudge.
    latest_version text not null default '0.1.0',
    -- Optional copy shown with a forced upgrade.
    upgrade_message text,

    -- Kill switches. Each defaults to ON; flipping one off degrades that
    -- feature without taking the app down.
    push_enabled boolean not null default true,
    offline_downloads_enabled boolean not null default true,
    planner_enabled boolean not null default true,
    chat_enabled boolean not null default false,

    -- Lets the client back off if we are shedding load, without a new build.
    min_refresh_seconds integer not null default 60,

    -- Free-form banner for outages ("USGS is down; readings may be stale").
    notice text,

    updated_at timestamptz not null default now()
);

-- Single-row constraint, same trick as social_config.
create unique index if not exists idx_app_config_singleton on public.app_config ((true));

insert into public.app_config (min_supported_version, latest_version)
select '0.0.0', '0.1.0'
where not exists (select 1 from public.app_config);

alter table public.app_config enable row level security;

-- World-readable: every app instance polls this, including signed-out and
-- pre-upgrade builds. Writes are admin/service-role only.
create policy app_config_select_all on public.app_config
    for select using (true);
