-- NOT YET APPLIED. Apply by hand, then confirm the recorded version with
-- npm run db:check-migrations and rename this file to match. The drift gate
-- compares local filenames against supabase_migrations.schema_migrations, so a
-- file named for the timestamp it was authored at rather than the one it was
-- recorded under reads as two separate migrations and reports permanent drift.
--
-- Which Anthropic model serves each generated-copy workload, switchable from
-- /admin/ai-models without a deploy.
--
-- ── Why a table and not app_config ─────────────────────────────────────────
--
-- app_config is world-readable by design: 00191_app_config.sql grants it
-- `app_config_select_all ... using (true)` so every app instance, signed out and
-- pre-upgrade included, can poll the kill switches, and the anon grants were
-- never revoked. Nothing about which model writes river copy belongs on that
-- surface. This table is the opposite posture and says so below.
--
-- ── Why NULL rather than a seeded model id ─────────────────────────────────
--
-- NULL means "use the code default". So the rollback for a bad switch is
-- clearing the field, not remembering what was there before, and a column
-- nobody has ever touched behaves exactly as production behaved before this
-- feature existed. It also means the model ids live in ONE place — the registry
-- at src/lib/ai/model-registry.ts — instead of being half here and half there.
--
-- ── Why there is no CHECK constraint on the values ─────────────────────────
--
-- Deliberate. Validation is the registry's job, and it validates more than a
-- string: whether a model is approved FOR THAT WORKLOAD, and what max_tokens and
-- thinking configuration the pairing must carry. A CHECK here would duplicate
-- half of that rule badly, and would make approving a model a migration.

create table if not exists public.llm_config (
  id uuid primary key default gen_random_uuid(),

  -- One nullable column per switchable workload. Names match the Workload union
  -- in src/lib/ai/model-registry.ts exactly, so there is no mapping table to
  -- keep in sync as workloads are added.
  river_update   text,
  gauge_update   text,
  global_summary text,
  social_caption text,

  updated_at timestamptz not null default now()
);

-- Single row, same trick as social_config and app_config. `if not exists`
-- matters: 00058 created the social_config index without it, it silently did not
-- apply on an existing table, duplicates accumulated, and `.single()` masked
-- them until GET and PUT were reading different rows (00060 fixed that).
create unique index if not exists idx_llm_config_singleton
    on public.llm_config ((true));

-- Idempotent seed. All-NULL, i.e. every workload on its code default.
insert into public.llm_config (id)
select gen_random_uuid()
where not exists (select 1 from public.llm_config);

comment on table public.llm_config is
  'Per-workload Anthropic model overrides, edited from /admin/ai-models. NULL means use the code default in src/lib/ai/model-registry.ts. Values are validated against that registry, not by a constraint here.';
comment on column public.llm_config.river_update is 'Model for per-river/section Eddy updates. NULL = registry default.';
comment on column public.llm_config.gauge_update is 'Model for secondary-gauge updates. NULL = registry default.';
comment on column public.llm_config.global_summary is 'Model for the statewide summary. NULL = registry default.';
comment on column public.llm_config.social_caption is 'Model for social captions. NULL = registry default.';

-- ── Access ────────────────────────────────────────────────────────────────
--
-- Server-side only. The single reader is resolveModels() in
-- src/lib/ai/resolve-models.ts, through createAdminClient(), and the single
-- writer is /api/admin/ai-models behind requireAdminAuth(). Nothing needs anon
-- or authenticated access, and 20260810201000 established that a table with no
-- client reader gets no client grant.
--
-- Both halves are applied. RLS with zero policies denies every anon and
-- authenticated request outright; revoking the grants means the table is not one
-- accidental permissive policy away from exposure. 20260731223406 is why that
-- second half is not optional: social_config carried a policy NAMED "Service
-- role full access" written `using (true)`, which admits every role the table is
-- granted to, so anyone holding the publishable key could rewrite the social
-- posting configuration. The name described the intent; the predicate did not
-- implement it.
alter table public.llm_config enable row level security;

revoke all on public.llm_config from anon, authenticated;

-- No policies are defined on purpose. The service role bypasses RLS and is the
-- only thing that touches this table.
