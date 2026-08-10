# Trust model review — 2026-08-10

> **Status: review, not a plan.** Written six days into the Trust MVP gate's
> four-week window. It answers one question — *is what we built the thing we set
> out to build?* — by checking the intended architecture against the code that
> exists, not against `docs/TRUST_LEDGER_V1_PLAN.md`, which describes what was
> intended to ship and says so accurately.
>
> Every claim below was verified against the repository or against production on
> 2026-08-10. Where a claim is a count, the query is reproducible.

## The architecture this is measured against

```
              SOURCES  ──  USGS / NPS / Weather / Eddy DB
                 ↓
          OBSERVER AGENT  ──  detect changes, gaps, errors
                 ↓
        REASONING LAYER  ──  is this valid? what changed? confidence?
                 ↓
    ┌────────────┼────────────┐
Fix Data    Flag Review    Enrich Data
```

## Scorecard

| Layer | State |
| --- | --- |
| Sources | **Built.** Five ingest crons pull real sources into the database |
| Observer | **Built. Was pointed inward; the first source check landed with this review** |
| Reasoning | **Not built.** A rule→severity lookup table and a memory, by deliberate v1 choice |
| Fix Data | **Not built.** Advice is rendered, never executed |
| Flag Review | **Built.** The strongest surface in the subsystem |
| Enrich Data | **Not connected.** The machinery exists; no finding reaches it |

> **What changed on 2026-08-10.** This document was written against nine checks,
> none of which made an outbound call. `usgs_site_drift` is the tenth and the
> first that asks a source what is true. The rest of the review stands as
> written; the *Detect changes* section below records what the gap was and what
> now covers part of it.

Three of six. That is not a failure — it is roughly what
`TRUST_LEDGER_V1_PLAN.md` scoped, which explicitly deferred actions, model
calls, and confidence scoring. The problem this document is written to name is
not that the right half is missing. It is that **nothing currently measures
whether the right half is missing** (§ *The gate measures one layer*).

---

## Sources — built

Five scheduled jobs pull external state into the database: `update-gauges` and
`sync-gauge-latest` (USGS), `sync-nps`, `sync-usfs`, and `sync-availability`
(Recreation.gov, MO State Parks). Weather is fetched in the request path.

## Observer — built, and pointed inward

Nine checks drain hourly through `/api/cron/trust-tick`. As of 2026-08-10 19:00Z:
**469 runs, zero errored, zero suppressed** since the first tick on 2026-08-04.
Three findings open, all medium; two snoozed; 66 resolved.

Against the three things the observer is supposed to do:

**Detect errors — yes.** Internal consistency across twenty `validate_river_data`
rules, catalog-level schema invariants, geometry-versus-`length_miles`,
gauge wiring, service-to-river geography, float summaries against the ladder
they describe.

**Detect gaps — yes.** Missing thresholds, missing geometry, ungauged rivers,
knowledge sections absent, access points unsnapped.

**Detect changes — no.** This is the gap.

> **All nine checks read Eddy's own database or its own repository. Not one
> makes an outbound call to any source.**

Verifiable directly: no `fetch(` and no URL literal appears anywhere in
`src/lib/trust/checks/`. Seven checks call `supabase.rpc` or `supabase.from`,
one reads markdown from the repo, and two (`known_regressions`,
`ledger_heartbeat`) read the ledger itself.

The closest thing to change detection is `stale_gauge` — a primary gauge silent
for more than 24 hours, correctly rated critical. That notices the *absence* of
fresh data, which is an ingest job that died. It cannot notice an ingest job
that ran and wrote something wrong, an access point NPS has since closed, or a
USGS site whose rating was revised.

The consequence is specific and worth stating plainly: **if a source changes and
our copy does not, the database remains perfectly self-consistent and the ledger
reports an all-clear.** That is the exact shape of failure this subsystem was
built to catch — a check that cannot see reports a confident pass — recorded
twice in `TRUST_LEDGER_V1_PLAN.md` about the subsystem's own first day. It was
true of the subsystem as a whole with respect to the outside world.

### What `usgs_site_drift` covers, and what it does not

The first source check compares USGS against `gauge_stations` for the 43
stations wired to active rivers, daily, across five rules: an identifier USGS
has no record of (`usgs_site_unknown`, high), a station whose published record
has ended (`usgs_site_record_ended`, high), a move beyond 100 m
(`usgs_site_moved`, medium), a rename, and a drainage-area revision.

The gap it fills is real and narrow. Nothing on a schedule had ever re-read this
data: `gauge_stations` metadata is written by `scripts/import-usgs-gauges.ts`, a
**manual** script, while the scheduled gauge jobs (`update-gauges`,
`sync-gauge-latest`) write readings only. So a station USGS renamed, relocated,
re-surveyed or decommissioned kept its original row until somebody happened to
re-run an import by hand.

**A station's death is not its absence, and the first version of this check got
that wrong.** It read "no monitoring-location record" as "decommissioned". USGS
*keeps* the location record after telemetry ends — verified against three
stations this repository has already buried (`06928900`, `07014100`, `05497485`,
all deactivated by `00153`), every one of which still returns a full record
today. `00077`'s own header says as much about `07014100`. A check keyed on
absence would have sat silent through exactly the event it was written for.

Period of record lives in `time-series-metadata`, in the `end` of each series.
So there are two rules because there are two facts: `usgs_site_unknown` is a
wrong or retired identifier, and `usgs_site_record_ended` is the death — no
current discharge or gage-height series, or a newest `end` more than 14 days old.

**What that adds over `stale_gauge`, stated honestly:** not earlier warning.
`stale_gauge` fires after 24 hours of silence and will always be first. What it
adds is the difference between *transient* and *permanent* — a silent gauge is a
sensor glitch, a comms outage, or a station that is never coming back, and
`stale_gauge` cannot tell those apart. When both are open on one station, the
answer is not "wait": the river needs a different primary gauge. Both are graded
high rather than critical so they do not double-count the condition
`stale_gauge` owns at critical.

**The second collection needed the first one's guard, and did not have it.**
`fetchSitesByIds` treated a 200-with-zero-features as unusable — a filter USGS
might have silently stopped honouring is indistinguishable from a true empty
answer, and the batch is known to contain live gauges. `fetchSiteRecordEnds`,
written in the same commit, defaulted every station in the batch to `null`
*before* checking anything, and `null` is the authoritative answer "USGS
publishes no flow or stage series". So one degraded response would have filed
`usgs_site_record_ended` at high severity for all 43 wired gauges at once.

The guard ladder is now one pure function both lookups run through
(`classifyBatchResponse`), which refuses an empty response, a saturated one, and
one whose features are about nobody in the batch. It is pure precisely so these
semantics are testable without mocking a network — the assertions that could not
be written while the logic lived inline in two `fetch` calls.

A partial answer is deliberately *not* refused: some stations answering and
others not is the normal shape of a real response, and refusing it would make
the rules unable to fire at all. The residual risk — a filter that half-works —
is covered by a second, independent guard in the check itself, which refuses to
file `usgs_site_record_ended` for more than half the examined scope. That mirrors
`reconcile.ts`'s `mass_resolve` with the sign flipped: a sudden all-clear is a
claim that has to be earned, and so is a sudden mass failure.

On the dry run against the live API all 43 wired stations agreed with USGS and
all had a current record — zero findings. Zero is also what a check that cannot
see reports, so the same comparison was re-run against deliberately perturbed
values and all five rules fired, and again against two of the known-dead
stations, which are now correctly reported — one as "no series at all", one as
"ended 380 days ago" (`scripts/trust/usgs-drift-dryrun.mts --sabotage`).

**What is still not covered.** NPS closures, USFS status, Recreation.gov
availability and weather all flow in through their own crons and nothing
compares any of them against what we serve. Access points are the most valuable
of those and the least mechanical: a closed ramp is a go/no-go fact, and NPS
does not publish it in a form as clean as a monitoring-location record.

## Reasoning — not built

The layer is drawn with three questions. None of them is answered by code.

**"Is this valid?"** A rule fires or it does not. Nothing judges whether firing
was correct. The `trust_findings.resolution` column exists precisely because a
**human** answers this after the fact — `false_positive` is an operator verdict,
and the false-positive rate is computed from operator verdicts only.

**"What changed?"** Partially, and not at the level the diagram means.
Fingerprinting and reconciliation give recurrence, `occurrences`,
`first_seen_at`, and resolution history. That is change over time in *findings*.
The diagram asks for change in *facts*, which requires the source comparison the
observer does not do.

**"Confidence?"** Deliberately removed. Item 4 of the framework revision dropped
the 0–100 score for a real reason — there was no calibration data to fit weights
to, and `scripts/ingestion/dossier.ts` already defines `high | medium | low`
with `corroboratingSources`. What replaced it is not a cheaper confidence
signal but no confidence signal: a finding carries `severity`, which comes from
a fixed rule→severity map assigned by consequence at the surface. Severity is a
property of the rule, identical on every finding the rule ever emits. It says
how much a condition would matter if true. It says nothing about whether it is
true.

**There are zero model calls in `src/lib/trust/`.** That was v1's stated scope
("out of scope for v1: … any model call") and is not a defect. It does mean the
box in the middle of the diagram is currently a lookup table, and any plan that
assumes otherwise is assuming something that is not there.

## Fix Data — not built

`remediation.ts` classifies all 49 rules by what fixing them actually takes:

| Kind | Rules |
| --- | --- |
| `judgment` | 22 |
| `mechanical` | 13 |
| `investigate` | 12 |
| `check_bug` | 2 |

The file's own header is honest that most fixes are judgment and that this is
"not a gap to be closed later" — the worked example took MOHERP ratings, a
105-year USGS percentile record, and a mass-balance check that turned up a
sensor fault. Nothing generates that, and nothing should pretend to.

But that argument covers 22 rules, not 49. The thirteen `mechanical` ones are
defined as *"a command or a script exists and re-running it is safe"*, and:

- `remediationFor()` has exactly **one** caller — `api/admin/trust/findings/route.ts`,
  which attaches it to the response for rendering.
- **`isMechanical()` has zero callers.** It is exported and unused.

So every fix today, including the thirteen that are safe to automate by the
codebase's own classification, is a human reading a sentence and going to do it.
The arm is drawn; the wire is not connected. This is the cheapest real progress
available toward the diagram, and it needs no model.

## Flag Review — built

The strongest part of the subsystem. `/admin/trust` with snooze, resolve,
reopen, bulk re-check, per-finding remediation, exceptions that expire on their
own, decay that shelves stale informational findings, and a review endpoint that
computes the gate rather than estimating it.

The evidence that it works is the operating record, not the feature list: of 66
resolved findings, **35 closed as `fixed` and none as `false_positive`** — 0% off
a denominator of 35, well past the ten-review floor below which the console
refuses to report a rate at all. Seven closed `auto_resolved`; 24 predate the
resolution column and correctly count as neither.

## Enrich Data — not connected

`scripts/ingestion/dossier.ts` already implements what this arm needs:
`Sourced<T>` provenance, `[auto]/[verify]/[signoff]/[manual]` gates, and a
`high | medium | low` confidence vocabulary. The framework plan says to extend
it rather than re-specify it, which remains right.

It is a manual script for onboarding new rivers. **No finding triggers
enrichment.** A `missing_thresholds` or `knowledge_missing_section` finding sits
on the console until a person goes and runs something.

---

## The gate measures one layer

This is the finding that matters most, and it is about the plan rather than the
code.

Every criterion in the Trust MVP gate measures the **observer**:

| Criterion | What it measures |
| --- | --- |
| Four weeks of real operation | observer uptime |
| Fewer than 20% false positives | observer precision |
| Critical conditions detected within 15 minutes | observer latency |
| A bounded queue | observer output volume |
| Every safety-critical field sourced or explicitly unknown | observer coverage |
| No unauthorized mutations | (a constraint, not a capability) |

The one exception is *"every known safety-critical defect that existed at Phase 0
is closed, and the ledger shows it staying closed"* — which the revision **added**,
against a first draft that lacked it, with a note explaining why: every other
criterion measures detection, and a system can detect beautifully while nothing
gets repaired.

That note was right and did not go far enough. The added criterion measures
repair of a **fixed historical list of six defects**, enumerated in
`baseline.ts`. It does not measure whether repair is a *capability*. Six defects
closed by hand in the first week satisfy it permanently.

**So the gate can be passed on 2026-09-01 with the Reasoning, Fix, and Enrich
layers entirely unbuilt, and the result will read as success.** Four of its six
criteria are already on track; two (net hours saved, the 15-minute SLA) have no
measuring mechanism at all, which is separately true and separately worth fixing.

The 15-minute SLA deserves its own note, because it is not merely unmeasured —
it is **structurally unmet**. `validate_river_data` owns the critical rules and
runs hourly, so worst-case detection is roughly 60 minutes. No amount of further
operation will change that number. It needs either a fast-cadence tick for the
critical subset or an amended criterion; deciding which is a real choice, and
waiting is not one of them.

### What to add

One criterion, in the spirit of the one the revision added:

> **At least one finding class is detected by comparing Eddy against an external
> source, and at least one class of finding is repaired without a human doing
> it by hand.**

That is the difference between an observer with a console and the loop in the
diagram.

---

## Recommended order

**1. Source-vs-store checks.** *Started — `usgs_site_drift` shipped with this
review; NPS, USFS and availability are still open.* This is what "detect
changes" means, it is the only layer whose absence can produce a confidently
wrong answer on a float day, and it is a precondition for the reasoning layer
being worth building — confidence is worth computing when there is a
disagreement to be confident about. The pattern to copy is the one that check
established: keep "the source did not answer" and "the source says it is gone"
as different facts all the way through, because a degrading fetch turns the
first silently into the second.

**2. Wire the Fix arm.** `isMechanical()` exists and is unused. A re-run button
on the console for the thirteen mechanical rules, then auto-apply for the safest
subset with the ledger recording what it did and what changed. No model, no new
dependency, and it converts an existing classification into behavior.

**3. Reasoning last.** Once source disagreement is a finding type, "is this
valid" and "confidence" have something to operate on. Applied to today's
internal-consistency findings, a model would be second-guessing rules that are
already correct — which is how a 0% false-positive rate becomes a worse one.

---

## Three defects found while reviewing

**`trust_runs.finished_at` is wrong on every row.** `trust_apply_reconcile()`
sets `finished_at = v_now`, where `v_now` is the single `Date` captured once at
the start of a tick and passed to every check, while `started_at` defaults to
the database clock at insert. So `finished_at` precedes `started_at` on all 469
rows, and is byte-identical across every check within a tick. `duration_ms` is
measured separately and is correct, and no application code reads `finished_at`
— so the impact is a systematically false timestamp column in the subsystem
whose purpose is a trustworthy record. Sharing one `now` across a tick is
deliberate and correct for `last_seen_at` and `resolved_at`, which need to be
comparable within a run; `finished_at` is the one column that must be an
observation rather than an intention.

> **The first fix for this was also wrong, in the way that hides itself.** It
> used `now()`, which is the enclosing *transaction's* start and is fixed for
> its duration — so it recorded the instant reconciliation BEGAN, before the
> raise, touch and resolve loops it is supposed to bracket. The ordering
> constraint added alongside it would still have passed, because transaction
> start is comfortably after the run row's insert in an earlier transaction. A
> check passing for the wrong reason, inside the migration written to repair an
> instance of exactly that. It is `clock_timestamp()` now, and the migration
> carries a `DO` block that runs the function with a measurable delay and
> asserts the finish lands after the transaction began — an assertion that fails
> under `now()` and passes under `clock_timestamp()`.

**The loose grants are still open — but on three objects, not four.**
`TRUST_LEDGER_V1_PLAN.md` flagged them as predating the work and deserving their
own change. Verified on production 2026-08-10: `try_cron_lock`,
`release_cron_lock`, `validate_river_data` and `get_river_geometry_json` are
EXECUTE-able by PUBLIC, `anon` and `authenticated`; `cron_runs` grants both
`anon` and `authenticated` INSERT/UPDATE/DELETE/TRUNCATE. Nothing is
exploitable — `cron_runs` has RLS enabled with zero policies, which denies
everything to a non-bypassing role — but that is one mechanism holding, and the
whole argument of `20260731223406` and `20260804181529` is that this is not a
reason to leave the second one open. A cron lock is a better target than most:
holding `trust_tick` or the gauge update stops the safety-relevant path without
breaking anything visibly.

**`get_river_geometry_json` does not belong on that list, and checking the call
sites is what showed it.** `/api/rivers/[slug]` is the public river detail
endpoint and calls it through `createClient()`, which builds an SSR client on
`NEXT_PUBLIC_SUPABASE_ANON_KEY` — so it executes as `anon`. Revoking that grant
would make PostgREST return an error object, which that route handles by falling
back to `rivers.geom` and logging a warning: every public river page would
quietly lose the function it was written to use, on the same code path whose
earlier silent failure is baseline defect `geometry-rpc-missing`. `anon` EXECUTE
on it is correct by design — a read-only geometry getter, SECURITY INVOKER, with
RLS on `rivers` still governing the result. The plan grouped four objects by the
shape of their ACL; only three of them share a fix.

A second claim worth correcting, because it is the kind that gets repeated: the
service role does **not** bypass grants. `service_role` has `rolbypassrls` true
and `rolsuper` **false**, and BYPASSRLS bypasses row-level security only. What
lets the crons work is an explicit `service_role=EXECUTE` on each function and
explicit table grants on `cron_runs`. Any revoke here must name `public`, `anon`
and `authenticated` specifically; a broader one would stop every cron in the
repo, and RLS-bypass would not save it.

**A test suite that had never run.** `package.json` lists every test file
explicitly — there is no glob — so a file nobody remembers to add does not fail,
it simply never executes, and that is indistinguishable from passing.
`src/lib/trust/checks/service-geo-consistency.test.ts` shipped in `82680ab`, a
commit titled *"Make the service pin check something that runs, not something we
remember"*, and was never added to the script. Its fourteen assertions had never
executed. They pass — which is the unsettling part, because nothing would have
said so if they did not. Registered, along with a guard
(`src/lib/trust/registered-tests.test.ts`) that fails when a test file exists on
disk and is not named in the script, and when the script names a file that no
longer exists. It was the only such file in the repository.

## Open operational items

- Two snoozes expire **2026-08-11 19:41Z** and will reopen unless the underlying
  data is fixed: `jacks-fork` `threshold_order` (critical) and `courtois`
  `no_gauges_near_geometry` (high).
- `service_geo_consistency` has run once since it landed. Nothing is wrong; it is
  simply too new for its cadence to have been observed.
- Cadence is lopsided — `validate_river_data`, `ledger_heartbeat` and
  `known_regressions` run hourly (~145 runs each); the other six are daily
  (7 runs each). That is by design, and it is also why the 15-minute SLA cannot
  be met by the checks that are not `validate_river_data`.
