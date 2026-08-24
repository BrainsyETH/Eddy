-- Which source established each field, rather than one source for the whole row.
--
-- APPLIED to production 2026-08-24 as 20260824114557.
--
-- ── WHY ONE SOURCE PER ROW IS NOT ENOUGH ───────────────────────────────────
--
-- nearby_services.verified_source holds a single string for an entire row, and
-- this directory keeps producing rows whose fields come from different places
-- and disagree independently. From one branch of corridor research:
--
--   Buffalo River Float Service   phone from the operator, coordinate agreed by
--                                 three sources, river from the NPS roster
--   Silver Hill Float Service     phone from the operator (870-504-2038) and a
--                                 DIFFERENT phone from NPS (870-439-2372)
--   Riverview Motel               lodging per the NPS roster, closed per the
--                                 operator — the roster is right about who is
--                                 permitted and wrong about what is trading
--   Hufstedler's                  coordinate correct, town and ZIP wrong
--   the Gasconade four            river attribution wrong, everything else fine
--
-- A row-level source cannot express any of that. It also cannot age field by
-- field: a phone confirmed today and an address from a year ago currently share
-- one last_verified_at, so the staleness classes added alongside this can only
-- ever speak about the row as a whole.
--
-- ── WHAT IS DELIBERATELY NOT DONE ──────────────────────────────────────────
--
-- No backfill. The 197 existing rows carry a row-level source, and spreading it
-- across their fields would assert something nobody knows — that this one
-- source established every column. New writes carry provenance; old rows keep
-- what they have, and the gap is visible rather than papered over.
--
-- `field` is not constrained to a column list on purpose: evidence about a
-- column that has since been renamed is still evidence, and dropping it to
-- satisfy a constraint would lose more than it protects.

create table if not exists public.service_field_sources (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid not null references public.nearby_services(id) on delete cascade,
  field       text not null,
  source      text not null,
  checked_at  date not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint service_field_sources_field_not_blank check (length(btrim(field)) > 0),
  constraint service_field_sources_source_not_blank check (length(btrim(source)) > 0),
  -- The same values the importer refuses. A placeholder here would be worse
  -- than nothing: it would look like provenance.
  constraint service_field_sources_source_is_citable
    check (source not in ('csv_import', 'unknown', 'n/a', 'knowledge_base')),
  unique (service_id, field)
);

comment on table public.service_field_sources is
  'Which source established each field of a service row, and when it was checked. nearby_services.verified_source records one source for the whole row, which cannot answer a question this directory raises constantly: the phone came from the operator, the coordinate from the Census geocoder, the river from an agency roster, and those three disagree independently. A row-level source also cannot age field by field — a phone confirmed today and an address from a year ago share one date.';

comment on column public.service_field_sources.field is
  'The nearby_services column this source established. Not constrained to a column list on purpose: a source for a field that has since been renamed is still evidence, and losing it to a constraint would be worse than carrying it.';

create index if not exists service_field_sources_service_idx
  on public.service_field_sources (service_id);
create index if not exists service_field_sources_checked_idx
  on public.service_field_sources (checked_at);

alter table public.service_field_sources enable row level security;

-- Provenance is public in the same sense the directory is: it says where a
-- published fact came from. Writes stay with the importer.
drop policy if exists service_field_sources_read on public.service_field_sources;
create policy service_field_sources_read
  on public.service_field_sources for select
  using (true);

revoke all on public.service_field_sources from anon, authenticated;
grant select on public.service_field_sources to anon, authenticated;
grant select, insert, update, delete on public.service_field_sources to service_role;
