-- 20260813005710_tailwater_gauge_roles.sql
--
-- ── ADOPTED FROM PRODUCTION — DO NOT EDIT ───────────────────────────────────
--
-- Production ran this on 2026-08-13 (schema_migrations version 20260813005710)
-- but the checkout that applied it never landed its migration file, so for two
-- days the repository could not rebuild the schema production actually has and
-- `npm run db:check-migrations` reported the drift. This file is the adoption:
-- the body below is reproduced VERBATIM from
-- supabase_migrations.schema_migrations.statements for that version, and the
-- filename carries production's version so the histories pair exactly.
--
-- It is applied history. Editing it would change what a rebuilt database is
-- built from without changing production, which is the exact drift this file
-- exists to close.
--
-- What it did, for the reader rather than the tooling:
--   * river_gauges.role — 'release' / 'downstream' / 'tributary' on tailwater
--     gauges, NULL on ordinary rivers.
--   * rivers.controlling_dam_id — which USACE dam drives a dam_tailwater river.
--   * river_gauges.condition_rating_approved_by/_at/_source — provenance a
--     dam_tailwater gauge must carry before it may hold thresholds.
--   * Backfill: USACE-provider gauges become 'release'; Black River's 07063000
--     becomes 'downstream'.

alter table public.river_gauges
    add column if not exists role text;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'river_gauges_role_check'
    ) then
        alter table public.river_gauges
            add constraint river_gauges_role_check
            check (role is null or role in ('release', 'downstream', 'tributary'));
    end if;
end $$;

comment on column public.river_gauges.role is
    'Tailwater gauge role: release (the dam''s outflow), downstream (water below), tributary (inflow indicator). NULL on ordinary rivers, where the distinction does not apply.';

alter table public.rivers
    add column if not exists controlling_dam_id text;

comment on column public.rivers.controlling_dam_id is
    'For a dam_tailwater river: the USACE_DAMS registry id of the dam whose release drives it (e.g. swl-bull-shoals-dam). Matched against the release gauge station''s site_id_external at validation, so a tailwater cannot be wired to a neighbouring project''s outflow.';

alter table public.river_gauges
    add column if not exists condition_rating_approved_by text,
    add column if not exists condition_rating_approved_at timestamptz,
    add column if not exists condition_rating_source text;

comment on column public.river_gauges.condition_rating_source is
    'URL or citation for the location-specific rating that justifies this gauge''s thresholds. Required, with approved_by/approved_at, before a dam_tailwater gauge may carry any threshold at all.';

update public.river_gauges rg
set role = 'release'
from public.gauge_stations gs
where gs.id = rg.gauge_station_id
  and gs.provider = 'usace'
  and rg.role is null;

update public.river_gauges rg
set role = 'downstream'
from public.gauge_stations gs, public.rivers r
where gs.id = rg.gauge_station_id
  and r.id = rg.river_id
  and gs.site_id_external = '07063000'
  and r.slug = 'black'
  and rg.role is null;
