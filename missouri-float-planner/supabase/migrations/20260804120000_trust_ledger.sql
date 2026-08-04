-- NOT YET APPLIED. Before applying, read this paragraph.
--
-- The filename must carry the version supabase_migrations.schema_migrations
-- actually records, not the one this file was authored under. Apply it, then
-- run `npm run db:check-migrations`; if the recorded version differs, rename
-- the file to match before committing. A file named for its authoring time
-- reads as two separate migrations to the drift gate and reports permanent
-- drift — see the header of 20260731223406_social_tables_service_role_only.sql,
-- which paid for that lesson.
--
-- ── What this is ──────────────────────────────────────────────────────────
--
-- Two tables that give Eddy's EXISTING data-quality checks a heartbeat and a
-- memory. They add no detection of their own.
--
-- The checks already exist and are good. validate_river_data() (00164) runs 19
-- of them. /api/admin/river-health emits ten more. src/lib/alerts/gate.ts is a
-- unit-tested stale/suspect/flatline detector. What none of them have is a
-- schedule and a place to remember what they said last time, so every run
-- starts from zero: nothing knows whether a problem is new, whether it has been
-- there for six weeks, or whether last week's fix actually held.
--
-- trust_findings is that memory. trust_runs is the evidence that the memory is
-- being kept honestly.
--
-- ── Why two tables and not eight ──────────────────────────────────────────
--
-- The roadmap this implements (docs/TRUST_LEDGER_V1_PLAN.md) proposed evidence,
-- provenance, findings, actions, events and notifications as separate tables.
-- At four checks over ~13 active rivers the whole finding population is tens of
-- rows. A finding_evidence join table earns its keep when evidence items are
-- SHARED between findings, which requires a drift worker reading outside
-- sources; there is no such worker here, so evidence is a jsonb column on the
-- finding. proposed_actions has nothing to hold: v1 executes no actions.
--
-- Both are easy to add later and impossible to remove once written against.
--
-- ── Why the fingerprint is what it is ─────────────────────────────────────
--
-- fingerprint is sha256(check_id | entity_type | entity_key | rule_key) and
-- deliberately does NOT include detail. Details carry values that change every
-- run ("stale since 2026-08-04 14:30"); folding them in would make every run
-- emit new findings and resolve nothing, which is the single most likely way to
-- get this table wrong. detail and evidence are updated in place on the
-- existing row, and the row's identity survives.
--
-- The unique constraint is what makes recurrence and resolution observable at
-- all: first_seen_at survives a fix-and-regress cycle, so a finding that keeps
-- coming back is visibly different from one that is merely old.
--
-- ── Why trust_runs records suppression ────────────────────────────────────
--
-- A check that completes without emitting a finding it emitted yesterday means
-- the problem is fixed, and the ledger resolves it. That is the whole point —
-- it is what proves a fix stayed fixed.
--
-- It is also the dangerous direction. A check that silently breaks — bad RPC
-- name, an empty rivers query, a credential change — also emits nothing, and
-- looks exactly like a clean bill of health. docs/OBSERVABILITY_AND_UPGRADES.md
-- already recorded this failure shape once: "a monitoring gap does not announce
-- itself — it looks exactly like an absence of errors."
--
-- So reconciliation is refused in three cases, and the reason is stored rather
-- than merely logged, because "why did nothing resolve last Tuesday" is a
-- question worth being able to answer from the table:
--
--   check_error  — the check threw. A failed run changes nothing.
--   empty_scope  — the check examined zero entities. Not the same as finding
--                  zero problems, and indistinguishable from it in the output.
--   partial_scope— the check ran out of its time budget partway through. It
--                  emitted nothing for the entities it never opened, and that
--                  silence is not evidence they are healthy. The only ordinary
--                  one of the four; it resolves itself on the next full pass.
--   mass_resolve — one run would have resolved most of what was open. A sudden
--                  all-clear is a claim to be earned, not accepted; the run
--                  raises a critical finding against itself instead.
--
-- ── Access ────────────────────────────────────────────────────────────────
--
-- Service role only, both halves (RLS predicate AND grant revoke), matching
-- 20260731223406. Nothing public ever reads these: findings name weak spots in
-- the data, which is precisely what an attacker would like a list of.

create table if not exists public.trust_runs (
    id uuid primary key default gen_random_uuid(),
    check_id text not null,
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    status text not null,
    -- Null when reconciliation ran normally. Set means the run declined to
    -- resolve anything, and says why.
    suppressed_reason text,
    -- Entities the check examined. Zero is treated as a failure, not a pass.
    scope_count integer not null default 0,
    findings_raised integer not null default 0,
    findings_touched integer not null default 0,
    findings_resolved integer not null default 0,
    duration_ms integer,
    error_detail text,
    -- VERCEL_GIT_COMMIT_SHA, so a behaviour change can be pinned to a deploy.
    git_sha text,
    constraint trust_runs_status check (status in ('ok', 'error')),
    constraint trust_runs_suppressed_reason check (
        suppressed_reason is null
        or suppressed_reason in ('check_error', 'empty_scope', 'partial_scope', 'mass_resolve')
    )
);

comment on table public.trust_runs is
    'One row per execution of a trust check. Records whether reconciliation was allowed to run, and why not when it was refused.';

create index if not exists idx_trust_runs_check_started
    on public.trust_runs (check_id, started_at desc);

create table if not exists public.trust_findings (
    id uuid primary key default gen_random_uuid(),
    -- sha256(check_id|entity_type|entity_key|rule_key), first 32 hex chars.
    -- Stable across changes to detail; see the header.
    fingerprint text not null unique,
    check_id text not null,
    rule_key text not null,
    entity_type text not null,
    entity_key text not null,
    severity text not null,
    status text not null default 'open',
    title text not null,
    detail text not null,
    evidence jsonb not null default '{}'::jsonb,
    -- Survives a fix-and-regress cycle. A finding that keeps returning is a
    -- different problem from one that is merely old, and only these two columns
    -- together can tell them apart.
    first_seen_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    resolved_at timestamptz,
    snoozed_until timestamptz,
    occurrences integer not null default 1,
    last_run_id uuid references public.trust_runs(id) on delete set null,
    constraint trust_findings_severity check (severity in ('critical', 'high', 'medium', 'low')),
    constraint trust_findings_status check (status in ('open', 'snoozed', 'resolved')),
    constraint trust_findings_entity_type check (
        entity_type in ('river', 'gauge', 'access_point', 'repo', 'global')
    )
);

comment on table public.trust_findings is
    'One row per distinct problem, identified by fingerprint. Recurrence updates the row rather than inserting a duplicate; disappearance resolves it.';

comment on column public.trust_findings.fingerprint is
    'sha256(check_id|entity_type|entity_key|rule_key). Excludes detail on purpose — see the migration header.';

-- The admin console's default view: open findings, worst first.
create index if not exists idx_trust_findings_open
    on public.trust_findings (severity, last_seen_at desc)
    where status = 'open';

-- Reconciliation loads one check's open set on every run.
create index if not exists idx_trust_findings_check_status
    on public.trust_findings (check_id, status);

-- Waking snoozed findings whose deadline has passed.
create index if not exists idx_trust_findings_snoozed
    on public.trust_findings (snoozed_until)
    where status = 'snoozed';

alter table public.trust_runs enable row level security;
alter table public.trust_findings enable row level security;

drop policy if exists "Service role full access on trust_runs" on public.trust_runs;
drop policy if exists "Service role full access on trust_findings" on public.trust_findings;

create policy "Service role full access on trust_runs"
    on public.trust_runs for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

create policy "Service role full access on trust_findings"
    on public.trust_findings for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

-- Defence in depth. The service role bypasses both grants and policies, so the
-- cron and admin routes are unaffected.
revoke all on public.trust_runs from anon, authenticated;
revoke all on public.trust_findings from anon, authenticated;
