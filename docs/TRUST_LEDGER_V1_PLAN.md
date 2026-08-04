# Trust Ledger v1 — implementation plan

> **Status: shipped and running** (2026-08-04). Scopes the first buildable slice
> of `docs/EDDY_AGENT_FRAMEWORK_PLAN.md`, and revises that document where
> verification against the code contradicted it. Supersedes Phases 0-5 of the
> framework roadmap.
>
> All migrations are **applied to production**. First scheduled run 16:01Z
> 2026-08-04. Kept as the record of what was decided and why; it is not a to-do
> list any more.

## What shipped

`missouri-float-planner/src/lib/trust/` — contracts, fingerprinting,
reconciliation, severity, remediation, registry, ledger writer — plus **six
checks**: `validate_river_data`, `river_geometry`, `eddy_knowledge`,
`gauge_wiring`, `schema_invariants`, `ledger_heartbeat`. The `/api/cron/trust-tick` hourly drain,
and `/admin/trust` with snooze / resolve / reopen and per-finding remediation.
`/api/admin/river-health` consumes the extracted geometry check, so the page and
the scheduled check cannot drift.

Applied migrations, under the versions `schema_migrations` recorded:

| Version | What |
| --- | --- |
| `20260804141538` | `trust_runs`, `trust_findings`, RLS |
| `20260804141629` | one primary gauge per river |
| `20260804162015` | `trust_schema_invariants()` |
| `20260804163747` | restored `get_river_geometry_json()` |
| `20260804175222` | grant checks see PUBLIC (grantee 0) |

Also recorded `20260803170000` by repair — it had been applied by hand and never
written to `schema_migrations`.

**Applied to production 2026-08-04**, under the versions `schema_migrations`
recorded:

| Version | What |
| --- | --- |
| `20260804192501` | `trust_findings` lifecycle CHECK constraints |
| `20260804192753` | `validate_river_data()` keys the gauge rule on `gs.id` |
| `20260804193041` | `trust_apply_reconcile()` — one run, one transaction |
| `20260804193216` | take EXECUTE on it away from `anon`/`authenticated` |
| `20260804193348` | restore the function's inline commentary |

All three were developed against a scratch PostgreSQL 16 before going anywhere
near production: the constraints were confirmed to reject each inconsistent
lifecycle combination, the rewritten gauge branch was executed against stub
rows, and the reconcile function was checked to leave the tables and the run row
untouched when a plan fails partway. On production the constraints came back
`convalidated` — Postgres checked all 46 existing rows and none violated them.

The last two entries are the cost of applying a function by hand, and both were
caught by checking rather than by assuming:

- **`20260804193216`.** `revoke all on function ... from public` reads like it
  closes the door and does not. Supabase ships `ALTER DEFAULT PRIVILEGES`
  granting EXECUTE on new `public` functions to `anon` and `authenticated`
  *directly*, and a direct grant is not a PUBLIC grant — so the ACL came out
  carrying both. RLS held (the function is SECURITY INVOKER and the trust tables
  are service_role-only), but that is precisely the state
  `schema_feedback_no_public_mutation_grants` reports at HIGH, and
  `20260804181529` exists because leaving it that way was judged wrong there.

- **`20260804193348`.** The first application transcribed the function without
  its inline commentary. Caught by comparing `md5(prosrc)` against the source
  file — 6101 characters deployed against 7727 — and re-applied until both read
  `e6c03f5b33c18096a84eda028f99543b`. The same check on `20260804192753` matched
  first time (`491da3d0…`, 8797 characters), which is the only reason a
  hand-transcribed 207-line function replacement is trustworthy at all.

## Making the MVP gate measurable

The Trust MVP gate had six criteria and four of them were unanswerable, each
for the same reason: nothing recorded the thing being asked about. A gate that
cannot be computed is decoration, and it would have been "passed" by whoever
was willing to estimate.

**Why a finding closed.** `trust_findings.resolution` records
`fixed | false_positive | accepted | auto_resolved | expired`. "Somebody fixed
the river" and "the check was wrong" are opposite outcomes — the system working
versus the system crying wolf — and `status = 'resolved'` scored them
identically. The two machine values exist because most findings close without
anyone looking; folding those into `fixed` would pack the denominator with rows
nobody read and drive the false-positive rate toward zero exactly as the console
filled with noise. A trigger labels any closure that did not say why, which also
covers the deployed code that predates the column.

The rate reports `null`, never `0`, until there is something to divide by, and
the console says "not yet" below ten reviews. Zero reads as "no false
positives", which is the same sentence a system with no data produces.

**The known safety-critical set.** `src/lib/trust/baseline.ts` enumerates the
six defects open at Phase 0, each with what closed it and what its return would
look like. Four have a ledger signature; two are code-shape defects no check can
see — a float time that disagreed across surfaces, a staleness constant defined
three times — and those name their CI guard instead of being counted clear on
evidence nothing has. A `known_regressions` check files
`known_defect_regressed` at critical when one comes back. That duplicates the
rule that detects the underlying condition, deliberately: "there is a primary
tie on 07014000" and "a repair we made on 2026-08-04 did not hold" are different
facts, and the second is the one the gate treats as disqualifying.

**A bounded queue.** `decay.ts` shelves informational findings nobody has acted
on in thirty days, and closes findings orphaned by a check that no longer exists.
The console shows the worst twenty-five by default with the rest one click away.

> **Deviation from the gate's wording, on purpose.** It says auto-*close*
> informational findings. For a condition that persists that is a treadmill: the
> finding closes, the check re-emits it, reconciliation raises it again with
> `occurrences` incremented, and a month later it closes again — the list is
> bounded for an hour at a time and the ledger fills with a fix-and-regress
> history of something that never changed. Shelving achieves what the gate
> actually asks for (off the open list, visible on request, backlog bounded)
> using machinery reconciliation already respects. Auto-close is kept for
> orphans, where nothing will ever resolve them and it is the only correct
> answer.

`GET /api/admin/trust/review` computes all of it, and the console renders it.
What still has no mechanism: hours saved net of review time, and the 15-minute
detection SLA for critical conditions — `validate_river_data` owns the critical
rules and runs hourly.

### A grant shape worth a separate look

Checking `trust_apply_reconcile`'s ACL turned up the same shape on functions
nobody has revisited: `try_cron_lock`, `release_cron_lock`, `validate_river_data`
and `get_river_geometry_json` are all EXECUTE-able by `anon`, and `cron_runs`
grants `anon` INSERT/UPDATE/DELETE/TRUNCATE.

Nothing is exploitable today — `cron_runs` has RLS enabled with **zero
policies**, which denies everything to a non-bypassing role, so an `anon` call
to `try_cron_lock` inserts nothing and returns false. But the whole argument of
`20260731223406` and `20260804181529` is that one mechanism holding is not a
reason to leave the second one open, and a cron lock is a better target than
most: holding `trust_tick` or the gauge update would stop the safety-relevant
path without breaking anything visibly. Not fixed here — it predates this work
and deserves its own change.

### Keeping the two reconcile implementations honest

`trust_apply_reconcile()` moved the ledger's writes into SQL, which CI cannot
run. `fake-supabase.ts` replays the same plan in memory so `ledger-wiring.test.ts`
— the sabotage suite — keeps asserting on rows rather than on a stub.

That is two implementations, and they can drift. `scripts/trust/differential-reconcile.mts`
runs the same payload sequence through both and diffs the result; its first run
found the fake writing a fresh `reconcile_anomaly` with `occurrences` 0 where
Postgres wrote 1, because a plain INSERT takes the column default and the
`ON CONFLICT DO UPDATE` never runs. Run it after changing either side. It needs
only a local PostgreSQL and never touches a Supabase project.

### Accepted one-time re-fingerprinting

`20260804192753` and the matching change in `gauge_wiring` move two rules off
human-readable entity keys and onto stable ids. A finding's identity is
`sha256(check_id | entity_type | entity_key | rule_key)`, so both rules'
existing open findings change fingerprint: the next run resolves the old rows
and raises equivalent new ones.

That churn is deliberate and was chosen over a backfill. A backfill would have
to derive the old-to-new mapping from live data and would be correct only if it
ran before the next check pass — more moving parts, and a worse failure mode,
than one legible discontinuity in a finding population of a few dozen.

What it costs: `first_seen_at` and `occurrences` reset for the affected
findings, so anything that was "broken since March" reads as new on the first
run after these migrations apply. Nothing else in the ledger is affected, and
the identities are stable from that point on — which is the entire reason for
the change. The old keys forked on an editorial rename, which produced the same
reset silently and repeatedly, with no record that it had happened.

## What the first day actually found

The ledger's first scheduled run raised the same finding 24 times, which is what
made it obviously a broken check rather than broken data:
`get_river_geometry_json()` was absent from production, PostgREST returns an
error object rather than throwing, and `/api/admin/river-health` read only
`data` — so a missing FUNCTION was indistinguishable from a river with no
GEOMETRY. That page had been reporting "No geometry data found" for every river.

An external audit then found the same shape in the check written to prevent it:
`trust_schema_invariants()` joined `pg_roles` on the ACL grantee, and
`aclexplode()` represents PUBLIC as grantee 0, which has no `pg_roles` row. A
`GRANT INSERT ... TO PUBLIC` passed clean. Fixed in `20260804175222` and guarded
by `scripts/security/trust-invariants-public-acl.test.ts`.

Two instances, two mechanisms, one lesson: **a check that cannot see reports a
confident pass.** That is the failure this subsystem exists to catch, and it
caught it in itself twice on day one.

**Two design changes made while building**, both caught by writing the thing:

- A truncated pass emits findings only for the entities it reached, so
  reconciliation would have resolved findings for rivers it never looked at.
  Added `partial` as a fourth suppression reason alongside `check_error`,
  `empty_scope` and `mass_resolve`.
- Sorting by `severity` orders it alphabetically — critical, high, **low**,
  medium — and re-ranking in the route would only fix the page in hand, so a low
  would outrank a medium across a page boundary. `severity_rank` is a generated
  column.

**Part B, closed:** the cross-surface float-time divergence (B2) and the
triplicated `STALE_READING_HOURS` (B4).

**B3 closed.** `trust_schema_invariants()` asserts the four release invariants
from `docs/legacy-schema-security-audit.md` against `pg_class`, `pg_policies`
and `pg_constraint`, closing that document's outstanding instruction. Two of
seven fail on the live database and are recorded as decisions with owners rather
than cleanups: `feedback` still grants INSERT/UPDATE/DELETE to `anon` and
`authenticated` (RLS blocks them, so it is the missing second half), and ten
policies across `community_reports`, `nearby_services` and `service_rivers`
inline the `user_roles` lookup instead of calling `is_admin()`.

**B1 closed, and the finding was wrong.** Confirmed with the owner: Courtois
Creek has no gauge of its own and borrows Huzzah's, so 07014000 is *correctly*
`is_primary` for both. `is_primary` means "the primary gauge FOR THIS RIVER" and
each river still has exactly one, so the first version of `gauge_wiring` would
have reported correct data forever.

The real defect is the reverse lookup: given the gauge, which river is it? Every
consumer used `find(l => l.isPrimary) || links[0]`, which returns whichever row
the query ordered first. Resolved by `shared/primary-river-link.ts` using the
tiebreak already in the data — `distance_from_section_miles`, 0.0 for Huzzah and
5.0 for Courtois, because the gauge sits on the Huzzah. Alphabetical order would
have picked Courtois, so a merely-stable tiebreak would have been stably wrong.
The check now fires only on ties nothing can order, and
`20260804130000_one_primary_gauge_per_river.sql` enforces the invariant that
does hold: one primary per river, not one river per gauge.

**The sabotage step is automated.** `src/lib/trust/ledger-wiring.test.ts` runs
all four refusals end to end against an in-memory PostgREST stand-in, so a
broken check that reports an all-clear fails CI rather than a runbook step
nobody repeats.

**All applied.** See the migration table at the top for the versions
`schema_migrations` actually recorded; every file is named for its recorded
version, and `make check-db` reports zero drift in both directions.


## Context

`docs/EDDY_AGENT_FRAMEWORK_PLAN.md` (draft PR `0b7367f`) proposes a 13-phase,
18-month autonomous operations framework. Its architecture and governance are
sound. Its **premise is wrong**, and verifying that premise against the repo
changed what should be built.

**The premise it assumes:** Eddy needs a system to detect data problems.

**What is actually true:** Eddy already has a substantial detection suite.
`validate_river_data()` (migration `00164`) runs **20 rules** over active
rivers. `/api/admin/river-health` emits 10 more. `src/lib/alerts/gate.ts` is a
pure, unit-tested stale/suspect/flatline detector. There are seven read-only
check scripts. Almost none of it runs on a schedule, and **nothing remembers
what any of it said last time.**

The gap is not detection. It is a **heartbeat and a memory**.

**A correction to the earlier review, from verification:** most of the defects
cited from `FLOAT_DATA_ACCURACY_AUDIT.md` are already fixed. Dangerous water no
longer returns a float time (`src/lib/calculations/floatTime.ts:145-148`, guarded
again at `src/app/api/plan/route.ts:425`). The flat per-vessel speed model is
gone, replaced by a flow-dependent one (`floatTime.ts:89-107`, V ∝ (Q/Q_ref)^0.3).
NWS flood stages were backfilled for 16 stations (migration `00165`). The feedback
write path is fixed (`src/app/api/feedback/route.ts:89`). The audit docs are stale,
not the code. What remains open is a different and more interesting class:
**cross-surface inconsistency**, and **checks that exist but nobody runs**.

**Intended outcome:** the checks that already exist run on a schedule, findings
persist with a stable identity so recurrence and resolution are visible, a small
set of verified-open defects gets closed, and the ledger proves they stay closed.

**Two deliverables:** (A) the v1 ledger and the fixes, built; (B) a revision of
`EDDY_AGENT_FRAMEWORK_PLAN.md` so the long-range roadmap matches reality.

**Out of scope for v1** (all deferred to later phases of the revised doc): approval
workflows, action execution, email briefs, immediate alerts, numeric confidence
scoring, a source registry, open-web crawling, `pgmq`, and any model call.

---

## Step 0 — Live reconnaissance (read-only) — 0.5 day

Six facts cannot be determined from code and **gate what is in Step 6**. Run
read-only against production, record the answers in the PR description:

```sql
select count(*) from float_segments;                    -- audit said 0
select threshold_source, count(*), count(threshold_source_url),
       count(flood_stage_ft) from river_gauges group by 1;
select r.slug, rg.is_primary, rg.distance_from_section_miles
  from river_gauges rg
  join gauge_stations gs on gs.id = rg.gauge_station_id
  join rivers r on r.id = rg.river_id
 where gs.usgs_site_id = '07014000';                    -- dual-primary?
select slug, length_miles, st_length(geom::geography)/1609.34 from rivers
 where geom is not null;
select count(*), max(created_at) from public.feedback;
```
Plus `npm run db:check-migrations` (needs `npx supabase link` once).

Per `CLAUDE.md`, these are reads only — no writes to production.

---

## Part A — the ledger

### A1. Location

All new code lives under **`missouri-float-planner/`**. The framework doc's
top-level `trust/` directory is not buildable: Vercel's Root Directory is
`missouri-float-planner/` and shippable web code must not import outside it
(`CLAUDE.md` hard constraint; ADR `0003` is the precedent for why `shared/`
lives inside the web tree).

```
missouri-float-planner/src/lib/trust/
├── types.ts            # TrustCheck, RawFinding, TrustCheckResult
├── fingerprint.ts      # pure
├── reconcile.ts        # pure — the whole policy
├── severity.ts         # pure — rule → severity map
├── registry.ts         # the check list
└── checks/
    ├── validate-river-data.ts
    ├── river-geometry.ts     # extracted from the admin route
    ├── eddy-knowledge.ts
    └── gauge-wiring.ts       # the one new check
```

### A2. Schema — two tables, no queue

**Two tables**, not the doc's eight. No `finding_evidence` join table (evidence
is a `jsonb` column; a join table only earns its keep when evidence items are
shared across findings, which requires a drift worker that v1 does not have).
No `proposed_actions` (v1 has no actions).

**No job queue table.** Four checks over ~13 active rivers fits in one
invocation. Adopt the *time-budget* pattern without the queue machinery. What
would force a real queue later: a check that calls a rate-limited external API
per entity, a check that cannot finish in 300 s, or checks needing genuinely
independent cadences. Until one of those is true, a queue is ceremony.

New migration, timestamped (`YYYYMMDDHHMMSS_trust_ledger.sql`) — and note the
repo's rule: **the filename must match the version Supabase actually records**
(see the header of `20260731223406_social_tables_service_role_only.sql`). Give it
the long prose header this repo expects (30–60 lines explaining *why*).

```sql
create table if not exists public.trust_runs (
  id uuid primary key default gen_random_uuid(),
  check_id text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null,                    -- 'ok' | 'error'
  suppressed_reason text,                  -- null | 'empty_scope' | 'mass_resolve' | 'check_error'
  scope_count integer not null default 0,
  findings_new integer not null default 0,
  findings_touched integer not null default 0,
  findings_resolved integer not null default 0,
  duration_ms integer,
  error_detail text,
  git_sha text,                            -- VERCEL_GIT_COMMIT_SHA
  constraint trust_runs_status check (status in ('ok','error'))
);

create table if not exists public.trust_findings (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  check_id text not null,
  rule_key text not null,
  entity_type text not null,               -- river | gauge | access_point | repo | global
  entity_key text not null,
  severity text not null,                  -- critical | high | medium | low
  status text not null default 'open',     -- open | snoozed | resolved
  title text not null,
  detail text not null,
  evidence jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  snoozed_until timestamptz,
  occurrences integer not null default 1,
  last_run_id uuid references public.trust_runs(id),
  constraint trust_findings_severity check (severity in ('critical','high','medium','low')),
  constraint trust_findings_status check (status in ('open','snoozed','resolved'))
);

create index if not exists idx_trust_findings_open
  on public.trust_findings (severity, last_seen_at desc) where status = 'open';
create index if not exists idx_trust_findings_check
  on public.trust_findings (check_id, status);
```

RLS: service-role-only, copying `20260731223406_social_tables_service_role_only.sql:48-75`
verbatim in shape — `enable row level security`, a policy named
`"Service role full access on trust_findings"` with **both**
`using (auth.role() = 'service_role')` and `with check (...)`, plus
`revoke all on public.trust_findings from anon, authenticated`. Same for
`trust_runs`. Nothing public ever reads these tables.

### A3. Fingerprinting — the memory

```ts
// src/lib/trust/fingerprint.ts — pure
export function fingerprint(checkId: string, f: RawFinding): string;
// sha256(`${checkId}|${entityType}|${normalizeEntityKey(entityKey)}|${ruleKey}`), hex, first 32 chars
```

**The fingerprint must not include `detail`.** Details carry values that change
every run (`"stale since 2026-08-04 14:30"`). Including them would make every run
emit "new" findings and never resolve anything — the single most likely way to
get this wrong. `detail` and `evidence` are updated in place on an existing row.

Known wart to document: for `validate_river_data`'s `gauge_missing_site_id` rule,
the SQL returns `river_slug = COALESCE(r.slug, gs.name)` — a *gauge name*, not a
slug (`00164_harden_river_validation.sql:180`). That rule maps to
`entityType: 'gauge'` and `normalizeEntityKey()` lowercases and slugifies so a
cosmetic rename doesn't fork the identity.

### A4. Reconciliation — and the guard that matters most

All policy in one pure, I/O-free module, mirroring `src/lib/alerts/drain.ts`
(whose header states the rule explicitly: *"The rule itself lives in
lib/alerts/drain.ts so it can be tested without a database"*).

```ts
// src/lib/trust/reconcile.ts — pure
export interface ReconcileInput {
  checkId: string;
  checkStatus: 'ok' | 'error';
  scopeCount: number;
  openFingerprints: string[];        // currently open for this check
  emitted: Array<{ fingerprint: string; ... }>;
}
export interface ReconcilePlan {
  insert: string[]; touch: string[]; resolve: string[];
  suppressedReason?: 'check_error' | 'empty_scope' | 'mass_resolve';
}
export function planReconcile(input: ReconcileInput): ReconcilePlan;
```

Reconciliation rule: on a successful run, any open finding for that check whose
fingerprint is absent from the run's output is marked `resolved`. That is what
proves a fix stayed fixed.

**Three guards, because a silently-broken check that reports "all clear" is worse
than no check at all.** This is exactly the lesson recorded in
`docs/OBSERVABILITY_AND_UPGRADES.md`: *"a monitoring gap does not announce itself
— it looks exactly like an absence of errors."*

1. **`check_error`** — a check that throws records `status='error'` and resolves
   nothing.
2. **`empty_scope`** — every check reports `scopeCount` (entities examined). If
   it is `0`, the run is recorded as an error and resolves nothing. Catches "the
   rivers query returned zero rows" masquerading as "all rivers are healthy".
3. **`mass_resolve`** — if one run would resolve **>50% of that check's open
   findings AND >5 in absolute terms**, suppress reconciliation, record
   `suppressed_reason='mass_resolve'`, and emit a `critical` meta-finding
   (`rule_key: 'reconcile_anomaly'`) naming the check. A sudden all-clear is a
   claim that has to be earned, not accepted.

Snoozed findings are never auto-resolved and never re-opened by a run; they
return to `open` when `snoozed_until` passes and the fingerprint is still emitted.

### A5. Severity — by consequence, not by category

**Re-map; do not trust the SQL's own `error|warning`.** `validate_river_data`
classifies `stale_gauge` (a primary gauge silent >24 h) as a *warning* and
`missing_timezone` as an *error*. By consequence at the surface those are
backwards: a stale primary gauge drives a wrong condition badge; a missing
timezone is a display concern. The SQL's own value is preserved in
`evidence.sqlSeverity` so nothing is lost.

The principle: **anything that can change a condition badge or a go/no-go is
critical**, whichever table the defect lives in.

| Severity | Rules |
|---|---|
| **critical** | `stale_gauge`, `threshold_order`, `missing_thresholds`, `no_dangerous_anchor`, `no_primary_gauge`, `ungauged_river`, `reconcile_anomaly` |
| **high** | `no_too_low_anchor`, `no_optimal_max_anchor`, `missing_geometry`, `gauge_missing_site_id`, `gauge_dual_primary`, river-health *no gauges within 1km*, river-health *bounding box outside Missouri* |
| **medium** | `access_point_offline`, `access_point_not_snapped`, `mileage_order_mismatch`, `mileage_equals_length`, `missing_river_type`, `missing_characteristics`, `missing_timezone`, `missing_state`, river-health *missing length_miles / low coords-per-mile / no geometry data / failed to read geometry / no gauge stations linked* |
| **low** | `missing_weather_point`, `missing_alert_terms`, `knowledge_missing_section`, river-health *flow direction not verified / headwaters flag not set / very low coordinate density* |

A unit test asserts **exhaustiveness**: every one of the 20 `validate_river_data`
check names and every river-health issue string has a mapping, so a new SQL check
cannot land unclassified.

### A6. Check contract

```ts
// src/lib/trust/types.ts
export interface TrustCheck {
  id: string;                       // stable; matches trust_runs.check_id
  title: string;
  cadence: 'hourly' | 'daily';
  run(ctx: TrustCheckContext): Promise<TrustCheckResult>;
}
export interface TrustCheckContext {
  supabase: SupabaseClient;         // service role, untyped per repo convention
  now: Date;
  deadlineMs: number;
}
export interface RawFinding {
  entityType: 'river' | 'gauge' | 'access_point' | 'repo' | 'global';
  entityKey: string;
  ruleKey: string;
  title: string;
  detail: string;
  evidence?: Record<string, unknown>;
}
export interface TrustCheckResult { scopeCount: number; findings: RawFinding[] }
```

### A7. The four v1 checks

| id | Source | Cost | Notes |
|---|---|---|---|
| `validate_river_data` | `supabase.rpc('validate_river_data')` | 1 round-trip, 20 rules | Already exists; wrapping only |
| `river_geometry` | **extracted** from `src/app/api/admin/river-health/route.ts` | expensive — N+3 round-trips/river | Scope to `active = true` (the route currently scans all rivers) |
| `eddy_knowledge` | `listKnowledgeRiverSlugs()` / `getGeneralKnowledge()` from `src/lib/eddy/knowledge.ts` | cheap | Verify the `.md` read works in the Vercel bundle — it is already used from cron routes, so it should, but confirm on first deploy |
| `gauge_wiring` | one query on `river_gauges` | cheap | **The only new detection logic.** Flags any `gauge_station` that is `is_primary = true` for more than one river |

**`river_geometry` extraction is a strict improvement, not duplication.** The
logic is currently 213 lines inline in a route handler with zero tests. Extract
it to `src/lib/trust/checks/river-geometry.ts`, then have the **existing route
consume the extracted function**, preserving its response shape so
`src/app/admin/data-sync/page.tsx:132` is untouched. One implementation, two
callers.

### A8. One cron entry, not many

`missouri-float-planner/vercel.json` already declares **23** cron entries against
a Pro ceiling around 40. One new path only:

```json
{ "path": "/api/cron/trust-tick", "schedule": "0 * * * *" }
```
plus `"src/app/api/cron/trust-tick/route.ts": { "maxDuration": 300 }` in the
`functions` block — the repo's own comment
(`sync-gauge-latest/route.ts:36-37`) notes `vercel.json` is *what actually
applies on deploy*, so declare it in **both** places. Cadence lives in the check
registry, not in `vercel.json`; adding a check never costs a cron slot.

New file `src/app/api/cron/trust-tick/route.ts`, following the house pattern
exactly:
- `export const dynamic = 'force-dynamic'`, `export const maxDuration = 300`
- `hasValidMachineBearer(authorization, process.env.CRON_SECRET)` from
  `src/lib/security/machine-auth.ts:4-10` — 500 if the secret is unset, 401 if bad
- `tryCronLock(supabase, 'trust_tick', 280)` / `releaseCronLock` in a `finally`,
  from `src/lib/social/cron-lock.ts`
- `TIME_BUDGET_MS = 240_000` and the deadline loop from
  `src/lib/camping/sync.ts:118-189`; checks run in least-recently-run order
  (`trust_runs` is the cursor), so a budget exhaustion defers rather than starves
- private `run(request)` with thin `GET`/`POST` wrappers
- flat JSON summary + `durationMs`, logged via `logger.info` from `src/lib/logger.ts`

### A9. Operator surface — one page, no workflow

- `GET /api/admin/trust/findings` — `requireAdminAuth`, `?status`/`?severity`/`?page`/`?limit`
  (capped ≤200), returns `{items,total,page,limit}` with camelCased rows, per the
  `src/app/api/admin/hazards/route.ts` shape.
- `PATCH /api/admin/trust/findings/[id]` — snooze / resolve / reopen only. Uses
  `isValidUUID` + `invalidIdResponse`, and `logAdminAction` from
  `src/lib/admin-auth.ts:179`.
- `src/app/admin/trust/page.tsx` — `'use client'`, wrapped in `<AdminLayout>`,
  fetching via `adminFetch` (`src/hooks/useAdminAuth.ts:97-122`), plain
  useState/useCallback/useEffect (admin pages use no React Query). Dark chrome
  Tailwind only — `npm run lint` runs `lint:tokens` and **fails the build** on any
  color class outside the resolved theme.
- Register the nav entry in **both** places: `NAV_ITEMS` in
  `src/components/admin/AdminLayout.tsx:37` and `ADMIN_SECTIONS` in
  `src/app/admin/page.tsx:43`. Add `openCriticalFindings` to the `stats` object in
  `src/app/api/admin/stats/route.ts` for the badge.

No approval workflow, no bulk actions, no email. You open the page, you fix
things, you mark them resolved.

---

## Part B — closing verified-open defects

Four items. Each is safety-relevant, small, and provable by a check or a test.

**B1. Make gauge→river primary selection deterministic.**
USGS `07014000` is `is_primary = true` for both huzzah and courtois
(`00164_fix_river_gauge_misassociations.sql:58` and `:87`), with no partial unique
index. Client code does a non-deterministic `find(g => g.isPrimary)` at
`src/components/gauge/GaugeDetailView.tsx:47`,
`src/components/map/GaugeStationMarkers.tsx:47,216`, and
`eddy-ios/app/gauge/[siteId].tsx:260,426`.

*Do not guess the data decision* — a proxy gauge serving two rivers may be
legitimate. Instead: (a) add a partial unique index enforcing **one primary per
river** (`create unique index ... on river_gauges (river_id) where is_primary`),
which is unambiguously correct; (b) make the gauge→river pick deterministic by
sorting primary-first then `distance_from_section_miles` then slug, mirroring what
`src/app/api/gauges/[siteId]/route.ts:343-345` already does within one response;
(c) let the new `gauge_wiring` ledger check surface the dual-primary case so the
owner decides per instance. Confirm against Step 0's query before writing the index.

**B2. One float-time model across all surfaces.**
`/api/plan` uses the flow-dependent model, passing `dischargeCfs` and a `refCfs`
fetched at `src/app/api/plan/route.ts:393-401`. But
`src/lib/chat/tool-handlers.ts:246` and `src/lib/social/post-types.ts:134` call
the same `calculateFloatTime` **without** those arguments, so they silently fall
back to the legacy three-band step. Same trip, different times on different
surfaces — on a safety-adjacent number. Thread discharge and Q_ref through both
call sites (both already load conditions), and add a parity unit test asserting
the three paths agree for identical inputs.

**B3. Catalog-level schema invariants.**
`docs/legacy-schema-security-audit.md` asks for its invariants to become
automated checks. Today they are only asserted as *migration text*
(`scripts/security/segment-cache-policy.test.ts` regexes a `.sql` file) — which
cannot detect production drift. Add a `schema_invariants` ledger check running
the audit's catalog queries against `pg_policies` / `pg_constraint`: feedback RLS
on with no anon INSERT policy, `segment_cache` has no public mutation grant,
admin policies call the canonical `is_admin()`. This runs on Vercel and closes
the audit's explicit undone ask.

**B4. Collapse the duplicated 6-hour staleness constant.**
Five different staleness thresholds exist. Full unification is too large for v1 and
partly wrong — 2 h marker freshness, 3–6 h per-provider alert gating
(`src/lib/alerts/gate.ts:35-39`), and 24 h prose staleness are genuinely
different questions. But `STALE_READING_HOURS = 6` is *literally duplicated three
times*: `src/app/api/plan/route.ts:24`, `src/lib/social/live-conditions.ts:38`,
`eddy-ios/src/lib/offline-cache.ts:242`. Move it into
`missouri-float-planner/shared/` (which **is** `@eddy/conditions`, consumed by both
apps) and add a guard test that no other file redefines it. Document why the other
thresholds stay distinct rather than silently unifying them.

**Explicitly not in v1, and why:**
- *Drainage-area scaling* (`src/lib/usgs/drainage.ts:22-41`, zero callers) — real,
  but it changes condition math for every reach and needs calibration and
  backtesting, not a side quest.
- *`get_segment_float_time`'s flat 1.5× reverse penalty and kayak==canoe*
  (`00014_shuttle_drive_time.sql:82-89,45-59`) — real, needs ground truth.
- *Threshold calibration for Big Piney / Huzzah / Courtois* (`00177:41-43`) — needs
  field data, not code. The ledger will keep surfacing it, which is correct.
- *Wiring `check-migration-drift` into CI* — it shells out to the Supabase CLI and
  needs a linked project; CI must stay hermetic. Add a separate `make check-db`
  target and cite it in `docs/ios-release-runbook.md` instead.

---

## Part C — revise `docs/EDDY_AGENT_FRAMEWORK_PLAN.md`

Same branch, separate commit. Keep the governance spine — deterministic conductor,
evidence separated from canonical facts, "self-sustaining but never
self-authorizing." Change:

1. **Correct the premise** — lead with the detection-suite inventory; the gap is
   scheduling and memory.
2. **Fix the code location** — `trust/` must live under `missouri-float-planner/`.
3. **Collapse Phases 0–5** into the v1 above (~2 weeks, not ~10).
4. **Reframe Phase 8** — Chat is built and disabled, returning 503 at
   `src/app/api/chat/route.ts:25` with 8 tools already defined. It is a re-enable,
   not a two-month build. State why it was disabled and what would re-enable it.
5. **Add a supersede/extend map** for the five overlapping active docs:
   `MULTI_STATE_SCALING_PLAN.md`, `RIVER_SCALING_PLAYBOOK.md`,
   `data-pipeline.md`, `OBSERVABILITY_AND_UPGRADES.md`, and
   `scripts/ingestion/dossier.ts` (which already implements `RiverPackage` as a
   dossier, with `Sourced<T>` provenance and `[auto]/[verify]/[signoff]/[manual]`
   gates).
6. **Drop the 100-point confidence score** — reuse the dossier's existing
   `high|medium|low` plus `corroboratingSources` rather than forking a second
   confidence vocabulary over the same facts.
7. **Fix the severity inversion** — consequence at the surface (§A5).
8. **Resolve the crawling contradiction** — the deferrals rule out broad crawling
   while Phase 3 schedules weekly discovery. Cut open-web from the MVP.
9. **Record the cron-budget constraint** — 23 of ~40 slots used; cadence belongs
   in data, not `vercel.json`.
10. **Make the MVP gate net** — hours saved *minus* review hours, plus a new gate:
    the known-critical set is closed and the ledger proves it.
11. **Un-hardcode the brief timezone** — `MULTI_STATE_SCALING_PLAN.md` names baked-in
    Central Time as a scaling blocker; don't add another.

---

## Sequencing

| Step | Work | Days |
|---|---|---|
| 0 | Live read-only recon (gates Step 6) | 0.5 |
| 1 | Migration + RLS; `fingerprint.ts`, `reconcile.ts`, `severity.ts` + unit tests. Nothing scheduled. | 2 |
| 2 | `types.ts`, `registry.ts`, the checks; extract `river-geometry` and rewire the existing admin route | 1.5 |
| 3 | `trust-tick` cron + `vercel.json` (both blocks) + lock + time budget | 1 |
| 4 | Admin API, `/admin/trust` page, nav in both arrays, stats badge | 1.5 |
| 5 | Part B fixes with guard tests | 2.5 |
| 6 | Part C doc revision | 1 |

**~10 working days.** Steps 1–4 are independently shippable; after Step 3 the
ledger is already accumulating history even with no UI.

---

## Verification

**Unit tests** — pure, `node:test` via `tsx`, colocated, each with a comment naming
the regression it prevents (house style, see `src/lib/alerts/drain.test.ts:19-30`).
**Every new test file must be appended to the explicit `test` script in
`missouri-float-planner/package.json`** — there is no glob, so an unlisted test is
invisible to CI.

- `src/lib/trust/fingerprint.test.ts` — stable when `detail` changes; distinct
  across rule/entity; `normalizeEntityKey` handles the gauge-name case
- `src/lib/trust/reconcile.test.ts` — insert/touch/resolve; **and each suppression
  path**: `check_error`, `empty_scope`, `mass_resolve`; snoozed never auto-resolved
- `src/lib/trust/severity.test.ts` — exhaustive mapping over all 20
  `validate_river_data` check names and all river-health issue strings
- `src/lib/calculations/float-time-parity.test.ts` — plan / chat / social agree (B2)
- a guard test that `STALE_READING_HOURS` is defined exactly once (B4)

No test touches a database or the network — that rule holds; the checks are
I/O glue over pure policy modules.

**Manual, in order:**
1. Apply the migration by hand (Supabase CLI/dashboard), then `npm run db:check-migrations`
   and rename the file if the recorded version differs.
2. `curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/trust-tick` → inspect
   `trust_runs` and `trust_findings`. Expect real findings — `00177:41-43` alone
   guarantees threshold findings on Big Piney/Huzzah/Courtois.
3. Open `/admin/trust`; snooze one finding; re-run the tick; confirm it stays
   snoozed and does not re-open.
4. **Fix one real finding, re-run, confirm it auto-resolves.** This is the whole
   point of the system.
5. `make check-web` and `make check-mobile` green, and `make bundle-mobile`
   succeeds — the last is what proves Metro resolves the new `shared/` subpath
   imports, which typechecking does not.

The old step 5 — deliberately break a check and confirm it resolves nothing — is
now `src/lib/trust/ledger-wiring.test.ts` and runs in CI. It was the step that
mattered most and the one least likely to be repeated by hand.
