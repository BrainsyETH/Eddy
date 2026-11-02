-- 20261101214925_dam_updates.sql
--
-- APPLIED to production (ilefwfpvphadsbptiaur) 2026-11-01 and RECORDED as
-- 20261101214925. Ledger: supabase/production-migrations.txt.
--
-- Eddy's Read for dams: one row per written Read, for the White River trout
-- tailwaters first (src/lib/eddy/dam-read-facts.ts, DAM_READ_DAM_IDS).
-- Written by /api/cron/generate-dam-updates; served only to Premium callers by
-- /api/dam-update/[damId]. ADR 0017 records the decision.
--
-- ── Why a table of its own and not a column on dam_snapshots ───────────────
-- dam_snapshots is rebuilt hourly and served publicly through a CDN-cached
-- route. A Read is Premium prose written once or twice a day, and carrying it
-- in the public snapshot would hand it to every caller of /api/dams/[damId].
-- It also mirrors gauge_updates, whose shape the usage dashboard already reads.
--
-- ── Server-only ────────────────────────────────────────────────────────────
-- Unlike gauge_updates (public read policy, written in 2025), nothing here is
-- readable by anon or authenticated. The route reads it with the service role
-- AFTER checking entitlement, so a client grant would be a way around the
-- paywall. RLS with no policies denies every client request outright.
--
-- ── `facts` is the evidence ───────────────────────────────────────────────
-- The computed facts the Read was written from, stored as served to the model,
-- so "why did Eddy say 3 PM" is answerable from the row alone. `used_fallback`
-- marks a Read the model's prose failed the checks for and the deterministic
-- text replaced.

create table public.dam_updates (
  id                    uuid        primary key default gen_random_uuid(),
  -- Registry id ('swl-bull-shoals-dam'). No foreign key: dams are read-through
  -- and have no table to point at, as dam_metric_readings and starred_dams say.
  dam_id                text        not null check (length(dam_id) between 1 and 100),
  summary_text          text        not null check (length(summary_text) between 1 and 400),
  eddy_read             text        check (eddy_read is null or length(eddy_read) between 1 and 600),
  quote_text            text        not null check (length(quote_text) between 1 and 2000),
  facts                 jsonb       not null check (jsonb_typeof(facts) = 'object'),
  -- Hash of the posted SWPA schedule the Read was written against. A new
  -- schedule version is what triggers a rewrite between morning runs.
  schedule_hash         text        check (schedule_hash is null or length(schedule_hash) between 8 and 128),
  used_fallback         boolean     not null default false,
  sources_used          jsonb       not null default '[]'::jsonb check (jsonb_typeof(sources_used) = 'array'),
  model_used            text,
  input_tokens          integer,
  output_tokens         integer,
  cache_read_tokens     integer,
  cache_creation_tokens integer,
  generated_at          timestamptz not null default now(),
  expires_at            timestamptz not null,
  check (expires_at > generated_at)
);

create index dam_updates_dam_generated_idx on public.dam_updates (dam_id, generated_at desc);
create index dam_updates_generated_idx on public.dam_updates (generated_at);

comment on table public.dam_updates is
  'Eddy''s Read for dams (Premium). Written by /api/cron/generate-dam-updates from facts computed in src/lib/eddy/dam-read-facts.ts; served only after an entitlement check by /api/dam-update/[damId]. Server-only: no client grant. Pruned after 90 days by the cron. See ADR 0017.';

alter table public.dam_updates enable row level security;
revoke all on public.dam_updates from public, anon, authenticated;
grant all on public.dam_updates to service_role;
