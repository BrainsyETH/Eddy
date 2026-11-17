-- 20261117041752_eddy_generation_log.sql
--
-- Applied to production 2026-11-17 as 20261117041752. Read back afterwards:
-- 26 columns, RLS enabled with no policies, service_role holds SELECT, INSERT
-- and DELETE, anon and authenticated hold nothing, and the table is empty.
--
-- One row per attempt to write a river Read: what the generator was handed,
-- what the model returned, and what was published.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- eddy_updates is the serving table. It holds published text only and the
-- cron deletes rows after 48 hours. A review on 2026-11-16 found Reads
-- stating things their inputs did not support (a spring placed upstream of a
-- gauge it enters below; a stage figure that appears in no input) and had
-- nothing to check them against: no prompt, no gauge facts, no knowledge
-- text, no raw model output. It also found 110 of 178 stored rows were
-- code-written fallbacks with no record of which of four different causes
-- produced each one.
--
-- This table is that record. It is evidence, not product: nothing reads it at
-- request time, and the generator ignores a failed write
-- (src/lib/eddy/generation-log.ts). Against a database without this table
-- the generator logs one warning per process and keeps no records.
--
-- ── What a row holds ────────────────────────────────────────────────────────
--   outcome   'model'    the model's text was published
--             'fallback' code-written text was published instead
--             'error'    nothing was published
--   reason    fallback:  no_gauge | no_reading | no_rating |
--                        unsupported_section | claims_mismatch | contradiction
--             error:     missing_api_key | empty_response | model_error
--             model:     NULL
--   inputs    the structured values the prompt was built from, with their
--             units and timestamps: gauge facts and thresholds, trajectory,
--             weather, forecast, rain, alerts, rain lag, river character
--   user_prompt / raw_response
--             the exact text sent and returned. NULL when the model was not
--             called (a fallback decided from the facts alone).
--   system_prompt_hash, knowledge_hash, git_sha
--             the system prompt and the knowledge file are in git; these say
--             which version a row was written against without storing either
--             ninety times a day.
--
-- `reason` and `trigger` are deliberately not CHECK-constrained. A new value
-- added in code must not be able to make the evidence disappear, which is
-- what a rejected insert that the generator swallows would do.
--
-- Columns are held in step with the application's insert shape by
-- src/lib/eddy/generation-record.test.ts.
--
-- ── Size and retention ──────────────────────────────────────────────────────
-- About 90 rows a day. Roughly a third call the model and carry a prompt of
-- about 12 KB; the rest are a few KB of inputs. The cron deletes rows older
-- than 180 days on full passes (GENERATION_LOG_RETENTION_DAYS).

create table public.eddy_generation_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  workload text not null,
  trigger text not null,
  river_slug text not null,
  section_slug text,
  usgs_site_id text,
  condition_code text not null,
  outcome text not null check (outcome in ('model', 'fallback', 'error')),
  reason text,
  contradictions text[] not null default '{}',
  model_used text,
  stop_reason text,
  input_tokens integer,
  output_tokens integer,
  cache_read_tokens integer,
  cache_creation_tokens integer,
  git_sha text,
  system_prompt_hash text not null,
  knowledge_hash text,
  knowledge_blocks text[] not null default '{}',
  user_prompt text,
  inputs jsonb not null default '{}'::jsonb,
  raw_response text,
  published jsonb,
  error_message text
);

-- Retention and "what happened lately".
create index eddy_generation_log_created_at_idx
  on public.eddy_generation_log (created_at desc);
-- One river or stretch over time.
create index eddy_generation_log_target_idx
  on public.eddy_generation_log (river_slug, section_slug, created_at desc);

comment on table public.eddy_generation_log is
  'Evidence for river Read generation: one row per attempt with its inputs, prompt, raw model output and published text. Server-only. Not read at request time. Pruned after 180 days.';

-- ── Grants ─────────────────────────────────────────────────────────────────
-- Server-side only. RLS with no policies denies anon and authenticated
-- outright; the service role bypasses RLS, so its limits are the grants
-- below. Insert and read, and delete for retention. No update: a record of
-- what was generated is not something to revise.
alter table public.eddy_generation_log enable row level security;

revoke all on public.eddy_generation_log from public, anon, authenticated, service_role;

grant select, insert, delete on public.eddy_generation_log to service_role;
