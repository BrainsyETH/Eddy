-- 20261102051731_national_map_frames.sql
--
-- APPLIED to production (ilefwfpvphadsbptiaur) 2026-11-02 and RECORDED as
-- 20261102051731. Ledger: supabase/production-migrations.txt.
--
-- National River Map frames: one row per capture of national conditions —
-- every in-scope USGS gauge's latest observation plus every NWS forecast
-- point's official flood status, recorded together. Written by
-- /api/cron/record-river-map-frame; read by /api/river-map/frame.
-- Format and retention: src/lib/national-map/frame.ts.
--
-- ── Why this exists ─────────────────────────────────────────────────────────
-- gauge_latest is overwritten in place and gauge_readings deliberately holds
-- only curated stations (00196 sized full national history at ~40 GB a year),
-- so nothing could say what a national gauge read yesterday. A frame is
-- ~1 MB of JSON; kept every 15 minutes for 26 hours and hourly for 8 days it
-- is ~264 rows. That is the history a 24-hour Change view and 24h / 7-day
-- replay need, without a per-reading table.
--
-- ── `body` is json, not jsonb ───────────────────────────────────────────────
-- Nothing ever queries inside a frame; it is stored and served whole. `json`
-- keeps the exact text the recorder wrote (no re-encoding on the way out) and
-- TOAST-compresses it as text.
--
-- ── `hourly` ────────────────────────────────────────────────────────────────
-- True for the first capture recorded in each UTC hour. Pruning keeps every
-- frame younger than 26 hours and only hourly frames after that, so a missed
-- :12 run still leaves that hour a keeper (the next capture takes the flag).
--
-- ── Server-only ────────────────────────────────────────────────────────────
-- The route reads with the service role and serves through the CDN. No client
-- grant: RLS with no policies denies every anon/authenticated request.

create table public.national_map_frames (
  captured_at   timestamptz primary key,
  version       smallint    not null check (version between 1 and 100),
  hourly        boolean     not null default false,
  gauge_count   integer     not null check (gauge_count >= 0),
  nws_count     integer     not null check (nws_count >= 0),
  noaa_ok       boolean     not null,
  body          json        not null,
  created_at    timestamptz not null default now()
);

create index national_map_frames_hourly_idx
  on public.national_map_frames (captured_at)
  where hourly;

comment on table public.national_map_frames is
  'National River Map frames (USGS latest + NWS flood status per capture). Written by /api/cron/record-river-map-frame, served by /api/river-map/frame. Kept every capture for 26h, hourly for 8 days. Format: src/lib/national-map/frame.ts. Server-only: no client grant.';

alter table public.national_map_frames enable row level security;
revoke all on public.national_map_frames from public, anon, authenticated;
grant all on public.national_map_frames to service_role;
