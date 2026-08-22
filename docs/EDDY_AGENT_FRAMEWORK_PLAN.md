# Eddy Autonomous Operations and Intelligence Framework

> **Status:** Proposed roadmap — **revised 2026-08-04** against the codebase.
> **Date:** 2026-08-03 (revised 2026-08-04)
> **Owner:** Eddy
> **Operating model:** Founder + Codex, bounded autonomy
> **North star:** Trust first, followed by river intelligence, repeatable expansion, distribution, and sustainable revenue

> **Current capability boundary (2026-08-22):** The Fix arm in this roadmap is
> intentionally deferred and is **not an active capability**. The shipped Trust
> routes can list findings and let an authenticated human snooze, resolve, or
> reopen them; they do not execute remediation or mutate canonical product
> data. A `mechanical` remediation label is operator guidance only, not an
> authorization policy. The action executor and approval flow shown below are
> future architecture and must not be inferred from the diagram or Phase 5.

## What the revision changed, and why

The first draft assumed Eddy needs a system to **detect** data problems. Checked
against the code, that premise is wrong, and it was load-bearing for the whole
sequence.

Eddy already has a substantial detection suite. `validate_river_data()`
(migration `00164`) runs **twenty** rules over active rivers.
`/api/admin/river-health` emits ten more. `src/lib/alerts/gate.ts` is a pure,
unit-tested stale / suspect-qualifier / flatline detector. There are seven
read-only check scripts. Almost none of it runs on a schedule, and **nothing
remembers what any of it said last time** — `npm run db:validate` prints to a
terminal, so the output lives exactly as long as the scrollback.

The gap is a **heartbeat and a memory**, not a detector.

Second correction: most of the defects this roadmap would have rediscovered are
already fixed. Dangerous water no longer returns a float time
(`src/lib/calculations/floatTime.ts:145-148`); the flat per-vessel speed model
is gone, replaced by a flow-dependent one; NWS flood stages were backfilled for
16 stations (migration `00165`); the feedback write path works. The audit
documents are stale, not the code. What remains open is a different class —
**cross-surface inconsistency**, and **checks nobody runs**.

The eleven substantive changes:

1. Phases 0–5 collapse into a ~2-week first slice, specified in
   `docs/TRUST_LEDGER_V1_PLAN.md` and now built.
2. `trust/` cannot live at the repository root — Vercel's Root Directory is
   `missouri-float-planner/` and shippable web code must not import outside it
   (`CLAUDE.md`; ADR `0003` is the precedent). It lives at
   `missouri-float-planner/src/lib/trust/`.
3. Cadence lives in a check registry, not in `vercel.json`. That file already
   declares 23 cron entries against a ceiling near 40, so a slot-per-check
   design runs out before the interesting checks are written. One cron path
   drains the registry.
4. The 0–100 confidence score is dropped. There is no calibration data to fit
   six weights to, and `scripts/ingestion/dossier.ts` already defines
   `Confidence = 'high' | 'medium' | 'low'` with `corroboratingSources` — a
   numeric score would fork the vocabulary over the same facts.
5. Severity is assigned by **consequence at the surface**, not by category of
   defect. See below.
6. Phase 8 is a re-enable, not a build. Chat exists, streams, has eight tools,
   and returns 503 at `src/app/api/chat/route.ts:25`.
7. Open-web discovery leaves the MVP. The deferrals list rules out broad
   crawling while Phase 3 schedules weekly discovery; that contradiction is
   resolved toward the deferral.
8. The MVP gate becomes **net** of review time, and gains a second condition:
   the known-critical set is closed and the ledger proves it stayed closed.
9. Four documents this roadmap silently overlapped are now named, with a
   supersede/extend relationship for each.
10. The daily brief's timezone becomes configuration.
    `MULTI_STATE_SCALING_PLAN.md` names baked-in Central Time as a scaling
    blocker; this must not add another.
11. `pgmq` is deferred in favour of a plain table. Migrations here are applied
    by hand and have drifted before; a queue inside an extension schema adds a
    failure mode that cannot be seen from the admin console.

## Where this sits among the existing documents

This roadmap is not the first plan in this repository, and the first draft did
not say how it related to the others. Six documents already own territory it
described:

| Document | Status | Relationship |
| --- | --- | --- |
| `docs/TRUST_LEDGER_V1_PLAN.md` | active | **Supersedes** Phases 0–5 of this document. |
| `missouri-float-planner/docs/MULTI_STATE_SCALING_PLAN.md` | active | **Authoritative** for out-of-state expansion. Phase 9 defers to it. |
| `missouri-float-planner/docs/RIVER_SCALING_PLAYBOOK.md` | active | **Authoritative** for in-Missouri river onboarding. |
| `missouri-float-planner/scripts/ingestion/dossier.ts` | shipped code | **Already implements** Phase 9's `RiverPackage`, as a dossier with `Sourced<T>` provenance and `[auto]/[verify]/[signoff]/[manual]` gates. Extend it; do not re-specify it. |
| `docs/data-pipeline.md` | active | **Already is** the source catalogue and guard-level model Phase 3 describes. |
| `missouri-float-planner/docs/OBSERVABILITY_AND_UPGRADES.md` | active, §1–2 done | Sentry is wired across four runtimes. Phase 4 extends it. |

## Executive summary

Eddy should evolve from a river-planning application with individual automations into a founder-supervised operating system that continuously:

- verifies the accuracy and freshness of river information;
- detects changes, outages, regressions, and opportunities;
- explains why a finding matters and preserves its evidence;
- stages safe, reviewable fixes;
- produces grounded river and trip recommendations;
- expands into new rivers through a repeatable evidence-driven process;
- improves distribution, partnerships, and revenue using observed outcomes; and
- feeds the same accepted knowledge into the website, iOS app, embeds, API, MCP, alerts, and public Chat.

The system can become operationally self-sustaining, but it must not become self-authorizing. Humans continue to control safety policy, canonical facts, publishing, deployments, external communication, spending, and strategic objectives.

The architecture uses Eddy's existing providers:

- **Vercel:** product, APIs, conductor, scheduler, short workers, and approved action execution.
- **Supabase/Postgres/PostGIS:** canonical data, durable queues, evidence, provenance, findings, approvals, and audit history.
- **GitHub Actions:** long-running browser QA, controlled crawling, large audits, and approved code-remediation workflows.
- **Anthropic:** bounded extraction, reconciliation, explanation, and drafting through the existing SDK.
- **Resend:** immediate alerts and daily briefs.
- **Supabase Storage:** larger evidence snapshots, screenshots, traces, and QA artifacts.

No additional hosting provider, graph database, Redis service, or general-purpose agent platform is required for the initial system.

## Product objective and governance

### Objective hierarchy

The conductor optimizes objectives in this order:

1. Paddler safety and factual trust.
2. Usefulness of trip recommendations.
3. Product reliability.
4. Coverage and distribution.
5. User growth and retention.
6. Sustainable revenue.

Lower objectives cannot override higher ones. A revenue opportunity, SEO opportunity, or engagement experiment can never weaken safety guidance or suppress uncertainty.

### Meaning of self-sustaining

The mature framework may autonomously:

- run approved checks and source monitors;
- gather and normalize evidence;
- detect and deduplicate findings;
- prioritize work using approved policies;
- draft explanations, content, patches, and experiments;
- execute explicitly allowlisted reversible actions;
- validate outcomes and retry recoverable failures;
- produce daily and weekly operating reports; and
- recommend how approved budgets should be allocated.

It may not autonomously:

- redefine Eddy's goals;
- modify its own safety or authorization policies;
- treat model output as evidence;
- publish unsupported safety facts;
- change canonical safety data without approval;
- merge or deploy code;
- send partner communications;
- commit spending outside approved limits; or
- create unrestricted workers or tools.

### Locked initial decisions

- Primary operator: solo founder.
- Implementation capacity: founder + Codex.
- Initial north star: trust.
- Autonomy posture: bounded autonomy.
- First product surface: Trust Console.
- Remediation posture: automated fixes are deferred; humans apply fixes outside
  the Trust console and record the outcome there. A future implementation must
  stage fixes for explicit approval before execution.
- Open-web posture: evidence may create findings but cannot update live facts.
- Notification posture: immediate critical alerts plus one daily email.
- Cost posture: deterministic checks first; models only where reasoning adds value.
- First Chat target: public paddler trip-planning Chat.
- First post-trust investment: River Intelligence.

## System architecture

```mermaid
flowchart TD
    subgraph Sources["Evidence Sources"]
        OFF["Official APIs and government sources"]
        WEB["Curated and open-web sources"]
        APP["Eddy application telemetry"]
        COM["Reviewed community reports"]
    end

    subgraph Control["Vercel Control Plane"]
        CRON["Scheduler and enqueue routes"]
        CON["Conductor and policy engine"]
        ADMIN["Trust Console"]
        ACTION["Approved action executor"]
        API["Accepted Knowledge and Decision APIs"]
    end

    subgraph Data["Supabase Data Plane"]
        QUEUE["Durable job queues"]
        LEDGER["Evidence and findings ledger"]
        PROV["Fact provenance"]
        CANON["Canonical Eddy data"]
        AUDIT["Append-only audit history"]
        STORE["Evidence artifact storage"]
    end

    subgraph Compute["Execution Plane"]
        SHORT["Vercel short workers"]
        LONG["GitHub Actions long workers"]
        MODEL["Bounded model reasoning"]
    end

    OFF --> QUEUE
    WEB --> QUEUE
    APP --> QUEUE
    COM --> QUEUE
    CRON --> QUEUE
    QUEUE --> SHORT
    QUEUE --> LONG
    SHORT --> MODEL
    LONG --> MODEL
    SHORT --> LEDGER
    LONG --> LEDGER
    LEDGER --> PROV
    LEDGER --> CON
    CON --> ADMIN
    CON --> CRON
    ADMIN --> ACTION
    ACTION --> CANON
    ACTION --> AUDIT
    CANON --> API
    PROV --> API
    API --> SURFACES["Web, iOS, Chat, embeds, API, MCP, and alerts"]
```

### Control plane

The control plane lives in the existing Next.js application on Vercel. It provides schedules, job creation, worker registration, policy configuration, finding prioritization, admin authentication, Trust Console APIs, approvals, notifications, and public accepted-knowledge services.

The conductor is primarily deterministic TypeScript policy code. A model may summarize its output, but cannot decide permissions, silently lower severity, approve mutations, or change canonical facts.

### Data plane

Supabase remains Eddy's durable shared memory. Existing normalized tables remain canonical for rivers, gauges, access points, hazards, services, routes, conditions, and related product data. The framework adds evidence and provenance around those records rather than replacing them with a second source of truth.

PostGIS continues to provide geographic relationships and spatial validation. The logical knowledge graph consists of existing entities and relationships plus claim-level evidence and provenance edges.

### Execution plane

Use Vercel Functions for time-sensitive and bounded jobs. Use GitHub Actions for browser-based, large, or slower jobs.

Normal Vercel jobs should target two to three minutes even if the account permits longer execution. Every job must checkpoint and resume rather than depending on maximum function duration.

**Cron slots are a hard budget.** `missouri-float-planner/vercel.json` already
declares 23 cron entries against a ceiling around 40. Phase 3's per-source
cadences alone would have consumed the remainder, before Phase 4's continuous
checks and Phase 5's brief dispatcher. So cadence lives in the check registry
and one cron path per frequency class drains it; adding a check must never cost
a Vercel slot. This also delivers the checkpoint-and-resume requirement above,
which per-source crons would have quietly violated.

GitHub Actions handles:

- Playwright journeys and mobile screenshots;
- full page and dataset audits;
- controlled multi-page crawling;
- large regional research batches; and
- approved code-patch generation.

Critical condition freshness, closures, and production health remain on Vercel because scheduled GitHub workflows may be delayed.

## Portable framework design

### Code organization

The tree lives at `missouri-float-planner/src/lib/trust/`, **not** at the
repository root. Vercel's Root Directory is `missouri-float-planner/` and
shippable web code must not import from outside it — that constraint is why
`shared/` lives inside the web tree (ADR `0003`), and the conductor, action
executor and Trust Console are all Next.js routes on Vercel. A root-level
`trust/` would not build.

```text
missouri-float-planner/src/lib/trust/
├── contracts/
│   ├── job.ts
│   ├── worker.ts
│   ├── observation.ts
│   ├── evidence.ts
│   ├── finding.ts
│   ├── action.ts
│   └── policy.ts
├── runtime/
│   ├── registry.ts
│   ├── queue.ts
│   ├── runner.ts
│   ├── checkpoint.ts
│   ├── retry.ts
│   ├── idempotency.ts
│   └── budget.ts
├── policy/
│   ├── confidence.ts
│   ├── severity.ts
│   ├── permissions.ts
│   ├── prioritization.ts
│   └── conductor.ts
├── sources/
│   ├── registry.ts
│   ├── official/
│   ├── web/
│   ├── application/
│   └── community/
├── workers/
│   ├── integrity/
│   ├── drift/
│   ├── qa/
│   ├── intelligence/
│   ├── expansion/
│   ├── growth/
│   └── revenue/
├── actions/
│   ├── database-patch.ts
│   ├── content-diff.ts
│   ├── code-patch.ts
│   ├── notification.ts
│   └── experiment.ts
└── adapters/
    ├── queue.ts
    ├── storage.ts
    ├── model.ts
    ├── scheduler.ts
    ├── notification.ts
    └── long-runner.ts
```

### Worker contract

```ts
interface TrustWorker {
  id: string;
  version: string;
  description: string;
  cadence: WorkerCadence;
  permissions: Permission[];
  budget: WorkerBudget;

  collect(context: WorkerContext): Promise<Observation[]>;
  evaluate(
    observations: Observation[],
    context: WorkerContext,
  ): Promise<TrustFinding[]>;
  propose?(
    finding: TrustFinding,
    context: WorkerContext,
  ): Promise<ProposedAction | null>;
}
```

Workers do not chat with one another. They exchange versioned jobs, observations, evidence, findings, actions, decisions, execution results, and product signals through Supabase.

### Migration boundaries

Platform dependencies stay behind adapters:

- Supabase Queues can later be replaced by SQS, Redis, RabbitMQ, or another queue.
- Supabase Storage can later be replaced by S3 or GCS.
- Vercel Cron can later be replaced by another scheduler.
- GitHub Actions can later be replaced by a container worker.
- Anthropic can be replaced per capability through a model adapter.
- Resend can be replaced through a notification adapter.

The runner should support both a CLI entrypoint for GitHub Actions and a Docker entrypoint for future Cloud Run, Render, Fly, Kubernetes, or self-hosted execution. The initial system need not host the container; preserving the contract makes a future move an infrastructure migration rather than a framework rewrite.

## Queue and job runtime

Use a plain `trust_jobs` table with `FOR UPDATE SKIP LOCKED`, visibility leases,
attempt counters, idempotency keys, scheduled retries, and dead-letter state.
`pgmq` is deferred until queue depth justifies it.

This inverts the first draft. Migrations here are applied **by hand** and have
drifted from production before, so a queue living inside an extension schema
adds a failure mode invisible from the admin console — while the plain table
ships in the same migration stream, is inspectable, and is what the adapter
boundary below wants anyway.

**v1 has no queue at all.** Four checks over ~13 active rivers fit in one
invocation with a wall-clock budget and a least-recently-run cursor. What would
force a real queue: a check calling a rate-limited external API per entity, a
check that cannot finish in 300 s, or checks needing genuinely independent
cadences.

Every job includes:

- unique ID, worker ID, and worker version;
- versioned payload schema;
- idempotency and correlation keys;
- priority and scheduled timestamp;
- attempt and maximum-attempt counts;
- visibility deadline;
- parent run ID;
- budget allocation; and
- permission scope.

### Job lifecycle

```mermaid
stateDiagram-v2
    [*] --> Queued
    Queued --> Claimed
    Claimed --> Running
    Running --> Completed
    Running --> RetryableFailure
    RetryableFailure --> Queued
    Running --> PermanentFailure
    PermanentFailure --> DeadLetter
    Running --> Cancelled
    Completed --> Archived
```

### Retry policy

- Network timeout: exponential backoff.
- Rate limit: retry using provider reset information.
- Invalid source response: retry once, then create a source-health finding.
- Model schema failure: retry once with structured repair instructions.
- Deterministic validation failure: do not retry until inputs change.
- Permission failure: do not retry; escalate.
- Canonical mutation conflict: stop and require renewed approval.
- Default maximum attempts: five.

Large jobs decompose into small units: one river per integrity job, one source page per drift job, one critical journey per QA job, and one entity or field group per proposed action.

## Evidence and operational data model

### `source_registry`

Stores source identity, authority tier, domains, supported claims, geographic coverage, retrieval method, cadence, rate limits, terms/robots notes, parser version, health, expected freshness, and failure policy.

### `trust_runs`

Records worker/version, trigger, timing, status, job and finding counts, model usage, estimated costs, cache usage, errors, retries, Git SHA, deployment version, and input snapshot.

### `evidence_items`

Stores source, URL, retrieval/effective timestamps, content hash, extracted claim, short excerpt, normalized value, entity match, geographic match, authority tier, extraction method/version, artifact reference, and next-review time.

Prefer hashes, short excerpts, structured facts, and URLs over storing complete copyrighted pages.

### `fact_provenance`

Connects evidence to a canonical entity field and records whether it supports, contradicts, supersedes, or historically explains the value. It also records acceptance state, reviewer, verification time, freshness deadline, and confidence contribution.

### `trust_findings`

Stores a stable fingerprint, category, entity/field, title, explanation, observed and expected values, severity, confidence breakdown, affected surfaces, safety relevance, first/last observed times, recurrence, status, owner, snooze deadline, resolution, and relationships.

Finding states:

- open;
- investigating;
- awaiting evidence;
- awaiting review;
- approved for action;
- resolved;
- rejected; and
- snoozed.

### `finding_evidence`

Provides the normalized many-to-many relationship between findings and evidence.

### `proposed_actions`

Stores finding, action type, target, before-state hash/snapshot, proposed after-state, structured patch, explanation, risk, permission, preconditions, post-validation, rollback, approval, execution, and result.

Action states:

- draft;
- staged;
- awaiting approval;
- approved;
- executing;
- applied;
- validation failed;
- rolled back;
- rejected; and
- superseded.

### `trust_events` and `notification_deliveries`

Maintain append-only state changes, decisions, policy/configuration changes, executions, rollbacks, delivery attempts, deduplication keys, cooldowns, acknowledgments, and resolutions.

## Confidence, severity, and prioritization

### Confidence

Use the ordinal vocabulary that already exists: `high | medium | low`, plus
`corroboratingSources`, exactly as `scripts/ingestion/dossier.ts` defines it.

The first draft specified a 0–100 score with six weighted components
(30/20/15/15/10/10). It is dropped for two reasons. There is no adjudicated
finding corpus to fit six weights against, so the weights would be intuition
wearing a number — and every downstream consumer, including Chat and the
decision service, would treat that number as meaningful. And the dossier already
carries a confidence vocabulary over the same facts; a second, numeric one would
mean two incompatible answers to "how sure are we" about a single threshold.

Assign the bucket by rule, not by arithmetic: authoritative-and-corroborated,
authoritative-single-source, secondary, unconfirmed. Introduce a numeric score
only once enough findings have been adjudicated to fit one.

Penalize contradictory authoritative evidence, copied sources, stale evidence, weak matching, inferred claims, parser uncertainty, and evidence originating only from user-generated content.

A single authoritative source can establish an urgent official closure. Community corroboration can increase urgency but cannot automatically change canonical safety facts.

### Severity

**Assign by consequence at the surface, not by category of defect.** Anything
that can change a condition badge or a go/no-go answer is critical, whichever
table the defect lives in.

The first draft graded by category, which produced an inversion worth naming:
it filed "dangerous or stale condition data" as critical and "gauge miswiring"
as high — but gauge miswiring is *how* dangerous condition data gets produced.
That is the subject of `docs/gauge-alerting-misalignment-audit.md`.
`validate_river_data()` makes the same mistake in its own grades, filing
`stale_gauge` as a warning and `missing_timezone` as an error; the ledger
re-maps rather than trusting it, and preserves the SQL's grade in
`evidence.sqlSeverity` so the disagreement stays visible.

**Critical:** anything reaching a badge or a go/no-go — a silent primary gauge, a
non-monotonic threshold ladder, a missing dangerous anchor, an ungauged active
river, missing authoritative closures, incorrect immediate safety guidance, core
outages, exposed sensitive data, or total failure of critical monitoring.
Gauge miswiring belongs here when it feeds a live badge.

**High:** misreporting in the safe direction — a collapsed badge range —
plus incorrect access legality, materially wrong route calculations, broken
planning workflows, major embed outages, or contradictory authoritative
evidence.

**Medium:** stale business information, missing provenance, non-critical broken pages, incomplete amenities, or meaningful content/SEO drift.

**Low:** cosmetic inconsistencies, optional metadata, weak internal links, or minor copy improvements.

### Prioritization

Rank by severity, safety impact, confidence, affected users/surfaces, age, recurrence, remediation reversibility, and dependencies. An unresolved critical finding caps overall health and cannot be averaged away by healthy low-risk records.

## Autonomy and security

### Automatic

Workers may read canonical data, fetch configured sources, run checks, store evidence, create/deduplicate findings, generate proposals, send approved operational notifications, and archive operational records.

Note that the architecture diagram above shows `ADMIN --> ACTION` as the only
path into the executor, while the progressive-activation list ends at
"explicitly allowlisted low-risk autonomy" and Phase 13 assumes it. Those
disagree. The diagram is correct **for every phase up to and including 12**:
until an allowlist is actually earned, there is no unattended path to the
executor, and any such path must be added to the diagram in the same change
that creates it.

### Approval required

Require founder approval for canonical changes, safety guidance, access legality, hazards, gauge thresholds, public content, code changes, PR creation, deployment, partner communication, paid placement, spending changes, worker permissions, and source-authority changes.

### Execution controls

- Public clients cannot access internal evidence, queues, or actions.
- Admin mutations use existing admin authentication.
- Vercel retains canonical database credentials.
- GitHub Actions receives an opaque job ID and narrowly scoped HMAC credential, not the Supabase service-role key.
- GitHub retrieves work and posts structured results through internal Vercel endpoints.
- Approved canonical actions execute only through typed Vercel handlers.
- Changed before-state invalidates approval.
- Mutations are transactional where possible and require post-validation.
- Failed validation triggers rollback or a critical remediation finding.

### Crawler safety

Treat every page as adversarial input. Strip active content, ignore embedded instructions, prevent crawled text from selecting tools, parse into bounded schemas, validate redirects and response sizes, detect prompt injection, preserve source/timestamp, and keep discovery separate from acceptance.

## Operator experience

### Trust Console

Add one Trust section to Eddy Admin with:

- overall health and critical status;
- findings by severity and state;
- freshness and provenance coverage;
- source, worker, and queue health;
- pending approvals and recent resolutions;
- model and crawler usage;
- filters by river, entity, source, confidence, safety relevance, and age;
- evidence timelines and confidence explanations;
- before/after patches, preconditions, validation, and rollback; and
- approve, edit, reject, snooze, investigate, and resolve actions.

### Daily brief

Send once daily at a **configured** local time, defaulting to 7:00 AM
America/Chicago. Run the dispatcher hourly and use a local-time/idempotency
guard so daylight saving time does not duplicate or skip delivery.

The timezone is configuration from day one, not a constant.
`MULTI_STATE_SCALING_PLAN.md` names baked-in Central Time as one of the five
concrete reasons the platform cannot take a non-Missouri river today; a
framework meant to enable expansion must not add a sixth.

Include overall health, new critical/high findings, approvals, resolutions, failed workers/sources, repeated issues, recommended work, estimated review time, and direct admin links.

### Immediate alerts

Alert immediately for dangerous or stale condition data, authoritative closures, critical contradictions, core outages, or total failure of a critical monitor. Deduplicate by fingerprint, enforce cooldown, escalate unresolved problems, and send resolution notifications.

### Review cadence

- Daily: critical/high findings and approvals.
- Weekly: false positives, recurring failures, and worker value.
- Monthly: source authority, costs, and coverage gaps.
- Quarterly: objective portfolio, budgets, and autonomy changes.

# Multi-phase delivery roadmap

> **Phases 0–5 are superseded by `docs/TRUST_LEDGER_V1_PLAN.md`,** which
> collapses them from roughly ten weeks into two by wrapping the checks that
> already exist instead of writing new ones. They are kept below because the
> gates are still the right gates; read them as the acceptance criteria the v1
> slice has to meet, not as a work plan.
>
> What v1 actually built: two tables (not eight), no job queue, one cron entry,
> four checks of which one is new detection logic, and an admin page with no
> approval workflow. The reconciliation guards are the part that matters —
> auto-resolve is what proves a fix held, and it is also the direction in which
> a broken check looks healthy, so a check that errors, examines nothing, runs
> out of time partway, or would close most of what was open at once is refused
> and says so.

## Phase 0: Architecture and baseline — weeks 1–2

### Work

- **Close the migration drift.** `scripts/check-migration-drift.ts` exists and
  runs nowhere — not in CI, not in `make check`. An integrity system cannot be
  built on a schema nobody can prove production has, so this is a Phase 0 gate,
  not a Phase 1 task.
- Run the read-only reconnaissance queries in `docs/TRUST_LEDGER_V1_PLAN.md`
  §Step 0. Several remediation decisions depend on live row counts and cannot be
  made from migration files.
- Inventory validators, syncs, admin endpoints, cron jobs, telemetry, and reusable scripts.
- Classify existing code as checks, source adapters, actions, or legacy utilities.
- Define all versioned contracts and the worker registry.
- Establish source authority tiers and feature flags.
- Baseline gauge freshness, API reliability, data coverage, maintenance time, and known gaps.
- Document canonical versus derived fields.

### Gate

A no-op worker can enqueue, claim, checkpoint, complete, and archive without duplicate results or production mutations.

## Phase 1: Trust ledger and runtime — weeks 2–4

### Work

- Add trust schema and RLS.
- Implement queues, runs, evidence, findings, provenance, actions, events, and notifications.
- Implement leases, retries, dead letters, idempotency, checkpoints, and budgets.
- Implement confidence, severity, deduplication, and conductor v1.
- Add read-only admin APIs and usage accounting.

### Gate

Retries cannot duplicate findings; every artifact is versioned and attributable; public access is blocked; and model usage is assigned to a worker and run.

## Phase 2: Data Integrity worker — weeks 4–7

### Initial checks

- Missing, stale, future, or implausible gauge readings.
- Wrong provider, gauge, river, or section association.
- Missing/contradictory units, thresholds, danger levels, or provenance.
- Missing, sparse, reversed, disconnected, or implausible river geometry.
- Missing active-river knowledge or unsupported hydrology.
- Off-river, duplicate, misordered, or legally contradictory access points.
- Impossible segment distance, duration, or gauge boundary.
- Hazards without usable locations or with expired temporary status.
- Duplicate services, broken official URLs, and unsupported high-impact claims.

### Gate

Ten to fifteen high-value checks run reliably, findings deduplicate, explanations are evidence-backed, and the worker has no canonical write permission.

## Phase 3: Data Drift worker — weeks 5–8

### Coverage

Official sources include USGS, NWS, NPS, USFS, government GIS, and existing government recreation/closure feeds.

**Open-web discovery is deferred out of the MVP**, resolving a contradiction in
the first draft: the explicit-deferrals list ruled out continuous broad-web
crawling while this phase scheduled weekly discovery across outfitters,
campgrounds and tourism organizations. For thirteen active rivers the official
feeds plus Eddy's own telemetry produce far more true findings per dollar, and
open-web is where all the terms-of-service, prompt-injection and model-cost
exposure lives. Configured outfitter and service pages — a known, small,
enumerated list — may still be polled; it is untargeted discovery that waits.

The source catalogue and its guard levels already exist in
`docs/data-pipeline.md`. Extend that table rather than starting a second one.

### Cadence

- Critical official feeds: every 15–60 minutes.
- Closures and alerts: hourly.
- Stable government pages: daily.
- Outfitter/service pages: weekly.
- Broad discovery: **not in the MVP.**

### Gate

Changes produce deduplicated findings; copied sources are not independent; web evidence cannot update canonical values; parser failures do not imply changes; critical official changes meet their SLA.

## Phase 4: QA and Embed Health worker — weeks 6–9

### Vercel checks

Continuously test health, rivers, conditions, planning, weather, search, Eddy updates, embeds, critical assets, OG routes, response schemas, latency, and freshness.

### GitHub Actions checks

On deployments and daily, run homepage, river selection, river detail, access selection, plan creation, sharing, mobile rendering, embeds, OG images, links, accessibility assertions, and eventually public Chat. Save screenshots and traces on failure.

### Gate

Critical journeys are covered, artifacts accompany failures, flaky checks are separated from outages, and time-sensitive monitoring does not depend on GitHub schedules.

## Phase 5: Console, alerts, and staged fixes — weeks 7–10

### Work

- Complete the Trust Console and evidence detail.
- Add approval workflows and proposed-action previews.
- Implement daily and immediate notifications.
- Implement typed database patches and content diffs.
- Generate code-patch artifacts, requiring separate approval before opening a draft PR.
- Enforce preconditions, transactions, post-validation, rollback, and event logging.

### Gate

The founder can understand findings without logs, every patch exposes before/after state, stale approvals invalidate, failed validation rolls back or escalates, and no worker can merge, deploy, or publish.

## Phase 6: Shadow operation and calibration — weeks 10–12

Run all trust loops without automated canonical execution. Review all critical/high findings and sample lower severities. Tune confidence, authority, severity, cadence, and notification policies. Simulate stale dangerous-water data and backlog recovery.

### Trust MVP gate

- Four weeks of real operation.
- Fewer than 20% false positives among reviewed findings.
- **At least two hours of manual work saved weekly, NET of review time.** The
  first draft measured hours saved and said nothing about hours spent. Fifteen
  approval categories plus daily, weekly, monthly and quarterly review cadences
  is a real cost for one person, and a framework that saves two hours and costs
  three is a loss that this gate would have scored as a pass.
- **Every known safety-critical defect that existed at Phase 0 is closed, and
  the ledger shows it staying closed.** This is the gate the first draft
  lacked, and the one that separates a repair from a better-formatted backlog:
  every other criterion here measures detection.
- Critical condition failures detected within 15 minutes.
- A bounded queue. Cap what surfaces — top N per day by priority, the rest
  visible on request rather than pushed — and auto-close informational findings
  left unactioned for N days. Without a cap and a decay rule the backlog only
  grows, and the console becomes the thing the operator stops opening, which is
  the exact failure this framework exists to prevent.
- Every safety-critical field sourced or explicitly unknown.
- No unauthorized mutations.
- Reliable queue recovery and notification delivery.

If these conditions fail, improve trust rather than expanding the agent portfolio.

## Phase 7: River Intelligence — months 3–5

Build one `RiverDecisionService` that answers whether a person should float a river, section, and time.

### Inputs

River candidates, section, date/time, conditions and trend, weather, alerts, hydrology, hazards, closures, access, experience, vessel, group type, desired duration, crowd preference, and trusted distance context.

### Outputs

Go/no-go, ranked choices, confidence, freshness, supporting and contradicting evidence, audience fit, recommended window, limitations, alternatives, reason codes, and Eddy narrative.

Deterministic logic controls staleness, thresholds, closures, dangerous-water rules, alerts, hydrology support, completeness, and hard audience restrictions. Models explain and compare the resulting safe choices.

Launch “Best float today” first, followed by river pages, planning, alerts, embeds, API, MCP, and Chat.

### Gate

No unsafe scenario passes evaluation; at least 80% of sampled ordinary recommendations need no material correction; every result exposes freshness and uncertainty; all surfaces agree; users demonstrate meaningful engagement.

## Phase 8: Public Chat integration — months 4–6

> **This is a re-enable, not a build.** `src/app/api/chat/route.ts` already
> exists: streaming SSE, eight tools (`get_river_conditions`, `get_float_route`,
> `get_river_hazards`, `web_search` and others), rate limiting, x402 wrapping.
> It returns 503 at line 25 — "Chat is temporarily unavailable while we optimize
> the experience" — with the whole implementation as unreachable code below the
> early return. `/api/mcp` exists too.
>
> So the real question this phase must answer is not how to build a chat. It is
> **why the chat was turned off, and whether `RiverDecisionService` addresses
> that reason.** Answer that before writing anything.

Chat consumes accepted canonical data, accepted provenance, current conditions, and `RiverDecisionService`. It cannot read unresolved findings, rejected evidence, internal artifacts, proposed actions, or admin notes.

Tool results add timestamps, freshness, confidence, sources, contradiction state, safety state, and support status. Stale or contradictory safety data produces conservative uncertainty. User questions may create anonymized product signals but never canonical facts.

Roll out through conversation replay, founder preview, limited public exposure, monitoring, and gradual expansion.

## Phase 9: Repeatable expansion — months 5–8

**This already exists and is called a dossier.**
`missouri-float-planner/scripts/ingestion/dossier.ts` defines the versioned
package covering identity, region, geometry, sections, hydrology archetype,
providers, gauges, thresholds, access, hazards, sources and confidence — with a
`Sourced<T>` provenance envelope and per-field verification gates
(`[auto]`, `[verify]`, `[signoff]`, `[manual]`), plus the rule that a threshold
anchor is only ingestable when its `referenceGauge` is the gauge actually polled
for the reach. `scripts/ingestion/README.md` is the runbook and
`MULTI_STATE_SCALING_PLAN.md` is the operative expansion plan.

Extend those. Do not re-specify a `RiverPackage` under a new name; a second
provenance model over the same facts is how two answers to "where did this
threshold come from" get created.

Support spring-fed, rain-responsive, mixed, tailwater/regulated, large-mainstem, and explicitly unsupported archetypes. New archetypes require reviewed semantics and evaluations.

The Expansion worker may identify candidates, scaffold dossiers, find sources/gauges/access candidates, validate geometry, estimate gaps, stage packages, and generate readiness reports. It may not activate rivers.

### Gate

Normal onboarding uses configuration rather than product-code changes, takes fewer than two engineering days, shows declining research effort, passes identical trust gates, and isolates source failures to the affected adapter/package.

## Phase 10: Distribution, SEO, Content, and Community — months 8–10

### Growth

Analyze search-to-river selection, planner conversion, abandonment, saves, subscriptions, recommendations, embeds, referrals, and retention. Stage experiments with a hypothesis, primary metric, guardrails, duration, sample needs, implementation, and rollback.

### SEO and Content

Detect schema, title, duplication, orphaning, FAQ, linking, staleness, demand, and missing-page opportunities. Draft river reports, guides, notices, FAQs, itineraries, facts, partner spotlights, and social content from accepted knowledge. Require review before publication.

### Community

Use Eddy feedback, reviewed reports, repeated Chat questions, search queries, and permitted public sources to identify questions, hazards, missing guides, confusing language, and data gaps. Community signals remain evidence candidates until corroborated or moderated.

### Gate

Public drafts use accepted knowledge, experiments declare metrics and guardrails, growth cannot alter safety ranking, community input follows moderation, and work demonstrates measurable value.

## Phase 11: Mapping and Forecast moats — months 9–14

Mapping continuously validates river lines, access roads, parking, ramps, bridges, private boundaries, miles, connectivity, hazards, and provider drift. Imagery-derived conclusions remain proposals until reviewed.

Forecast predicts 24–72 hour conditions using trends, rainfall, drainage area, archetype, historical response, percentiles, temperature, dam schedules, and uncertainty. Output includes expected range, confidence interval, horizon, freshness, support status, and primary drivers.

Forecast launch requires historical backtesting, river-specific errors, dangerous-underprediction testing, conservative uncertainty, and a clear separation between observed and predicted values.

## Phase 12: Revenue and Partnerships — months 10–18+

Analyze premium demand, alerts, forecast engagement, referrals, partner gaps, high-demand regions, embeds, seasonality, and API usage. Test one offer at a time: premium alerts, extended forecasts, saved-trip monitoring, referrals, featured services, tourism integration, partner analytics, paid API access, or sponsorship.

The Partnership worker may identify candidates and stage evidence, value propositions, outreach, and expected impact. It may not send outreach.

Paid placement must be labeled, organic recommendations remain safety/relevance based, partners cannot purchase safer labels, and revenue cannot suppress negative safety information.

## Phase 13: Bounded self-sustaining operations — month 12+

Each quarter, the founder approves objectives, budgets, permissions, and deferred work across trust, product, expansion, distribution, and commercial domains.

The mature conductor maintains the backlog, resolves dependencies, estimates cost/value, allocates approved budgets, schedules recurring work, tracks outcomes, deprioritizes repeatedly rejected work, escalates safety issues, and suggests capabilities only when repeated needs justify them.

A weekly operating proposal includes trust state, completed work, findings, approvals, product recommendations, expansion candidates, experiments, partnerships, costs, founder review time, and blockers.

## Long-term worker domains

The original agent list consolidates into four domains plus the conductor:

- **Trust:** Data Integrity, Data Drift, QA, mapping validation, and Embed Health.
- **River Intelligence:** conditions, recommendations, forecasts, safety interpretation, and planning assistance.
- **Experience and Distribution:** Growth, SEO, Content, Community, and experiments.
- **Business:** Revenue, Partnerships, regional opportunities, and partner health.
- **Conductor:** prioritization, dependencies, policy, scheduling, budgets, briefs, and outcomes.

Create a separate worker only when a capability has distinct sources, tools, cadence, permissions, evaluation, and sufficient recurring workload.

## Testing strategy

### Unit

Test confidence, source independence, severity, fingerprints, deduplication, recurrence, notification cooldowns, queue leases, idempotency, permissions, preconditions, local-time dispatch, and model-output validation.

### Integration

Use fixtures for stale gauges, misassociation, off-river access, duplicates, impossible mileage, legal contradictions, closures, conflicting sources, parser failures, restored sources, broken APIs, failed embeds, and outage recovery.

### Adversarial

Test prompt injection, malicious metadata, redirects, oversized responses, copied corroboration, false closures, hallucinated evidence, poisoned entity names, unsafe stale-data recommendations, and permission escalation.

### End to end

Verify schedule, queue, worker, finding, evidence, notification, review, approval, preconditions, transactional action, validation, audit, and rollback as one workflow.

### Reliability

Test duplicate delivery, mid-job termination, expired leases, backlogs, rate limits, GitHub delays, model outages, Supabase failures, notification failures, and rollback failures.

## Metrics and phase gates

### Trust

Provenance and freshness coverage, detection latency, false positives, review/resolution time, recurrence, source/worker success, queue age, and manual hours saved.

### Intelligence

Safety pass rate, operator acceptance, recommendation engagement, planning lift, feedback, cross-surface consistency, honest unsupported responses, and cost per decision.

### Expansion

Engineering/research time per river, validation failures, source coverage, post-launch issues, maintenance cost, and percentage requiring custom code.

### Distribution and business

Organic traffic, plan conversion, embed uptime, partner usage, experiment win rate, retention, premium/referral conversion, revenue per region, API usage, and revenue relative to maintenance cost.

### Operations

Worker spend, tokens/cache, founder review time, action approval and rollback rates, dead-letter rate, and competing recurring workloads.

No phase advances merely because its code is finished. It advances only when operating metrics justify the next investment.

## Rollout and failure controls

Every worker, source, action type, and notification category receives an independent feature flag.

Progressive activation:

1. Development fixtures.
2. Non-production environment.
3. Production shadow mode.
4. Founder-only findings.
5. Notifications.
6. Staged fixes.
7. Approved execution.
8. Explicitly allowlisted low-risk autonomy, if earned.

Emergency controls let the founder pause queues, disable workers/sources/models/notifications/actions, revoke GitHub ingestion, roll back approved actions, and place the system in read-only incident mode.

## Explicit deferrals

Do not build in the initial Trust MVP:

- a separate graph database;
- Redis, `pgmq`, or another queue provider;
- a new worker-hosting vendor;
- a general-purpose agent mesh;
- free-form agent-to-agent conversations;
- continuous broad-web crawling, **and untargeted open-web discovery of any cadence** (Phase 3 is amended to match this);
- autonomous PR creation or publication;
- automatic safety-data changes;
- sophisticated forecast models;
- portfolio budget allocation;
- self-modifying prompts or policies;
- a founder operations chatbot; or
- full multi-state expansion.

Each deferred capability has a later phase and must be earned through measured need.

## Final target state

At maturity, Trust workers maintain reliable facts; Drift workers detect real-world changes; QA workers protect every surface; Intelligence workers produce useful trip decisions; Expansion workers package new rivers; Growth and Content distribute knowledge responsibly; Community identifies real needs; Mapping and Forecast create differentiated capabilities; Revenue and Partnerships identify sustainable opportunities; and the Conductor coordinates all work within human-approved policy and budgets.

The website, iOS app, embeds, API, MCP, alerts, and Chat consume the same accepted knowledge and decision services.

The long-term moat is not the number of agents. It is Eddy's accumulated, time-aware, evidence-backed river knowledge and the outcome data showing which recommendations genuinely helped paddlers make better decisions.
