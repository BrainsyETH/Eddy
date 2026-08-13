-- Give a river's gauges explicit roles, and name the dam a tailwater belongs to.
--
-- ── The hole this closes ───────────────────────────────────────────────────
-- The registry already separates a dam's release from the gauges that measure
-- the water below it — `releaseStationId` and `downstreamGaugeSiteIds` are
-- distinct fields, because on the White River they are 45 miles and one whole
-- other dam apart. The database was then left to infer the same distinction
-- from `gauge_stations.provider = 'usace'`, which is not identity. It proves a
-- row came from the Corps. It does not prove it came from THIS dam.
--
-- That gap is not hypothetical here. Norfork Dam is also SWL, also `usace`,
-- also releases into this same river, 45 river miles down. A tailwater wired
-- to the wrong project would satisfy every check written against `provider`
-- and describe its reach with a different dam's water.
--
-- So: the roles become explicit, and the release role names its dam.
--
--   role = 'release'     the dam's own outflow, measured at the dam
--   role = 'downstream'  a gauge on the water below
--   role = 'tributary'   an inflow indicator, never the reach itself
--
-- NULL is allowed and is the right value for an ordinary river. This taxonomy
-- was invented for dam-controlled reaches; the Meramec's primary gauge is not
-- "downstream" of anything, and forcing 200-odd existing rows into a vocabulary
-- built for a different problem would make the column mean less, not more.
--
-- ── Why the dam id lives on the river ──────────────────────────────────────
-- `rivers.controlling_dam_id` duplicates, in the database, what
-- `UsaceDam.tailwater.riverSlug` says in code. That duplication is the point:
-- the registry is TypeScript and validate_river_data() is SQL, so without a
-- copy the database cannot check the one thing that matters — that the release
-- attached to this river is the release of the dam this river is below. The
-- two are asserted equal at activation; a mismatch is an error, not a drift.

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

-- ── Condition-rating approval, with provenance ─────────────────────────────
-- A tailwater ships with no threshold ladder because no sourced local rating
-- exists. If one ever does, the thresholds it justifies must arrive WITH it:
-- who approved, when, and against what. A bare boolean would be flipped in a
-- hurry by someone clearing a validation error at the end of a long day, and
-- this is the single flag in the system where that matters most — it is what
-- turns a release number into a condition badge a wading angler reads.
alter table public.river_gauges
    add column if not exists condition_rating_approved_by text,
    add column if not exists condition_rating_approved_at timestamptz,
    add column if not exists condition_rating_source text;

comment on column public.river_gauges.condition_rating_source is
    'URL or citation for the location-specific rating that justifies this gauge''s thresholds. Required, with approved_by/approved_at, before a dam_tailwater gauge may carry any threshold at all.';

-- Backfill the one tailwater that already exists. Clearwater's release was
-- wired by 00198 before roles existed; it is a release row by construction
-- (provider 'usace', attached to the Black), and 07063000 is the gauge below.
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
