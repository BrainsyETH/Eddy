import assert from 'node:assert/strict';
import test from 'node:test';
import { createFakeSupabase } from './fake-supabase';
import { runTrustCheck } from './ledger';
import type { RawFinding, TrustCheck, TrustCheckResult } from './types';

// ── why this file exists ─────────────────────────────────────────
//
// reconcile.test.ts proves planReconcile() returns the right plan. That proves
// nothing about whether runTrustCheck() then OBEYS it, and the failure this
// system most needs to be right about is exactly that wiring: a check that
// throws, or reports an empty scope, and the ledger closing every open finding
// as fixed in response. Deliberately breaking a check was a manual step in the
// plan's verification section; a manual step is one nobody performs twice.

const NOW = new Date('2026-08-04T12:00:00Z');

function finding(overrides: Partial<RawFinding> = {}): RawFinding {
  return {
    entityType: 'river',
    entityKey: 'current',
    ruleKey: 'stale_gauge',
    title: 'current: stale gauge',
    detail: 'Primary gauge last reported 2026-08-01 09:00',
    ...overrides,
  };
}

function check(result: TrustCheckResult | (() => never), id = 'test_check'): TrustCheck {
  return {
    id,
    title: 'Test check',
    cadence: 'hourly',
    async run() {
      if (typeof result === 'function') result();
      return result as TrustCheckResult;
    },
  };
}

async function run(supabase: ReturnType<typeof createFakeSupabase>, c: TrustCheck) {
  return runTrustCheck(supabase, c, { now: NOW, deadlineMs: Date.now() + 60_000 });
}

// ── ordinary operation ───────────────────────────────────────────

test('a new finding is written with its severity resolved', () => {
  const supabase = createFakeSupabase({ trust_runs: [], trust_findings: [] });
  return run(supabase, check({ scopeCount: 13, findings: [finding()] })).then((summary) => {
    assert.equal(summary.raised, 1);
    const rows = supabase.rows('trust_findings');
    assert.equal(rows.length, 1);
    // stale_gauge is critical here even though validate_river_data() grades it a
    // warning — severity is by consequence at the surface.
    assert.equal(rows[0].severity, 'critical');
    assert.equal(rows[0].status, 'open');
  });
});

test('a finding that goes away is resolved', async () => {
  const supabase = createFakeSupabase({ trust_runs: [], trust_findings: [] });
  const c = check({ scopeCount: 13, findings: [finding()] });
  await run(supabase, c);

  const summary = await run(supabase, check({ scopeCount: 13, findings: [] }));
  assert.equal(summary.resolved, 1);
  assert.equal(supabase.rows('trust_findings')[0].status, 'resolved');
  assert.equal(summary.suppressedReason, undefined);
});

test('a finding that comes back keeps its original first_seen_at', async () => {
  // The whole reason the ledger has a memory: "broken since March" and "broke
  // again last night" are different problems.
  const supabase = createFakeSupabase({ trust_runs: [], trust_findings: [] });
  await run(supabase, check({ scopeCount: 13, findings: [finding()] }));
  const firstSeen = supabase.rows('trust_findings')[0].first_seen_at;

  await run(supabase, check({ scopeCount: 13, findings: [] }));
  await run(supabase, check({ scopeCount: 13, findings: [finding()] }));

  const row = supabase.rows('trust_findings')[0];
  assert.equal(row.status, 'open');
  assert.equal(row.first_seen_at, firstSeen);
  assert.equal(row.occurrences, 2);
});

test('a finding still standing is touched, not duplicated', async () => {
  const supabase = createFakeSupabase({ trust_runs: [], trust_findings: [] });
  await run(supabase, check({ scopeCount: 13, findings: [finding()] }));
  const summary = await run(
    supabase,
    check({ scopeCount: 13, findings: [finding({ detail: 'now 3 days stale' })] }),
  );

  assert.equal(summary.touched, 1);
  const rows = supabase.rows('trust_findings');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].detail, 'now 3 days stale');
  // Episodes, not sightings — an hourly check would otherwise reach 24 a day.
  assert.equal(rows[0].occurrences, 1);
});

// ── the sabotage cases ───────────────────────────────────────────

test('a check that throws resolves nothing and records the failure', async () => {
  const supabase = createFakeSupabase({ trust_runs: [], trust_findings: [] });
  await run(supabase, check({ scopeCount: 13, findings: [finding()] }));

  const summary = await run(
    supabase,
    check(() => {
      throw new Error('relation "validate_river_dataa" does not exist');
    }),
  );

  assert.equal(summary.status, 'error');
  assert.equal(summary.resolved, 0);
  assert.equal(summary.suppressedReason, 'check_error');

  const open = supabase.rows('trust_findings').filter((r) => r.rule_key === 'stale_gauge');
  assert.equal(open[0].status, 'open', 'the real finding must survive a broken run');

  const run_ = supabase.rows('trust_runs').at(-1)!;
  assert.equal(run_.status, 'error');
  assert.match(String(run_.error_detail), /does not exist/);
});

test('a scope of zero resolves nothing, even though the check succeeded', async () => {
  // The nastiest case: no exception, no error, an empty findings array. A rivers
  // query returning zero rows is indistinguishable from thirteen healthy rivers
  // unless scopeCount is consulted.
  const supabase = createFakeSupabase({ trust_runs: [], trust_findings: [] });
  await run(supabase, check({ scopeCount: 13, findings: [finding()] }));

  const summary = await run(supabase, check({ scopeCount: 0, findings: [] }));

  assert.equal(summary.resolved, 0);
  assert.equal(summary.suppressedReason, 'empty_scope');
  assert.equal(
    supabase.rows('trust_findings').find((r) => r.rule_key === 'stale_gauge')!.status,
    'open',
  );
});

test('a truncated pass resolves nothing but still records what it found', async () => {
  const supabase = createFakeSupabase({ trust_runs: [], trust_findings: [] });
  await run(supabase, check({ scopeCount: 13, findings: [finding()] }));

  const summary = await run(
    supabase,
    check({ scopeCount: 4, findings: [finding({ entityKey: 'jacks-fork' })], partial: true }),
  );

  assert.equal(summary.suppressedReason, 'partial_scope');
  assert.equal(summary.resolved, 0);
  assert.equal(summary.raised, 1, 'what it positively found is still evidence');
});

test('a sudden all-clear across most of the open set is refused', async () => {
  const supabase = createFakeSupabase({ trust_runs: [], trust_findings: [] });
  const many = Array.from({ length: 10 }, (_, i) => finding({ entityKey: `river-${i}` }));
  await run(supabase, check({ scopeCount: 13, findings: many }));

  const summary = await run(supabase, check({ scopeCount: 13, findings: [many[0]] }));

  assert.equal(summary.suppressedReason, 'mass_resolve');
  assert.equal(summary.resolved, 0);
  const stillOpen = supabase.rows('trust_findings').filter((r) => r.status === 'open');
  assert.equal(stillOpen.length >= 10, true);
});

// ── the ledger complaining about itself ──────────────────────────

test('a refused reconciliation files a critical finding against the check', async () => {
  // A refusal that reached only the logs would be a monitoring gap of exactly
  // the kind this system exists to prevent.
  const supabase = createFakeSupabase({ trust_runs: [], trust_findings: [] });
  await run(supabase, check({ scopeCount: 13, findings: [finding()] }));
  await run(supabase, check({ scopeCount: 0, findings: [] }));

  const anomaly = supabase.rows('trust_findings').find((r) => r.rule_key === 'reconcile_anomaly');
  assert.notEqual(anomaly, undefined);
  assert.equal(anomaly!.severity, 'critical');
  assert.equal(anomaly!.status, 'open');
  assert.match(String(anomaly!.detail), /indistinguishable from "all clear"/);
});

test('the complaint clears itself once the check reconciles cleanly again', async () => {
  const supabase = createFakeSupabase({ trust_runs: [], trust_findings: [] });
  await run(supabase, check({ scopeCount: 13, findings: [finding()] }));
  await run(supabase, check({ scopeCount: 0, findings: [] }));
  await run(supabase, check({ scopeCount: 13, findings: [finding()] }));

  const anomaly = supabase.rows('trust_findings').find((r) => r.rule_key === 'reconcile_anomaly');
  assert.equal(anomaly!.status, 'resolved');
});

test('a truncated pass does NOT file a complaint', async () => {
  // Running out of budget is ordinary operational behaviour; paging on it would
  // train the operator to ignore the one severity that must not be ignored.
  const supabase = createFakeSupabase({ trust_runs: [], trust_findings: [] });
  await run(supabase, check({ scopeCount: 4, findings: [finding()], partial: true }));

  const anomaly = supabase.rows('trust_findings').find((r) => r.rule_key === 'reconcile_anomaly');
  assert.equal(anomaly, undefined);
  assert.equal(supabase.rows('trust_runs').at(-1)!.suppressed_reason, 'partial_scope');
});

// ── operator intent survives the machine ─────────────────────────

test('a snoozed finding is not resolved when it stops being emitted', async () => {
  const supabase = createFakeSupabase({ trust_runs: [], trust_findings: [] });
  await run(supabase, check({ scopeCount: 13, findings: [finding()] }));

  const row = supabase.rows('trust_findings')[0];
  supabase.seed('trust_findings', [
    { ...row, status: 'snoozed', snoozed_until: '2026-09-01T00:00:00Z' },
  ]);

  const summary = await run(supabase, check({ scopeCount: 13, findings: [] }));
  assert.equal(summary.resolved, 0);
  assert.equal(supabase.rows('trust_findings')[0].status, 'snoozed');
});

test('an expired snooze wakes rather than shielding forever', async () => {
  // Nothing sweeps these rows on a timer, so the read path has to do it — or a
  // one-day snooze would silence a finding permanently.
  const supabase = createFakeSupabase({ trust_runs: [], trust_findings: [] });
  await run(supabase, check({ scopeCount: 13, findings: [finding()] }));

  const row = supabase.rows('trust_findings')[0];
  supabase.seed('trust_findings', [
    { ...row, status: 'snoozed', snoozed_until: '2026-08-01T00:00:00Z' },
  ]);

  await run(supabase, check({ scopeCount: 13, findings: [finding()] }));
  assert.equal(supabase.rows('trust_findings')[0].status, 'open');
});

// ── the run row is honest about incompleteness ───────────────────

test('a run row is opened pessimistically so a killed function reads as failed', async () => {
  const supabase = createFakeSupabase({ trust_runs: [], trust_findings: [] });
  const c: TrustCheck = {
    id: 'slow',
    title: 'Slow',
    cadence: 'hourly',
    async run() {
      // Mid-flight, the row must already exist and already say 'error'.
      const inFlight = supabase.rows('trust_runs').at(-1)!;
      assert.equal(inFlight.status, 'error');
      assert.equal(inFlight.error_detail, 'run did not complete');
      return { scopeCount: 1, findings: [] };
    },
  };

  await run(supabase, c);
  assert.equal(supabase.rows('trust_runs').at(-1)!.status, 'ok');
});

// ── a database that says no ──────────────────────────────────────
//
// Every test above sabotages the CHECK. These sabotage the DATABASE, which is
// the failure that actually shipped: PostgREST resolves with `{ data: null,
// error }` instead of throwing, the ledger read only `data`, and so every
// failure arrived wearing the costume of an empty result — no rows, no
// findings, nothing wrong.
//
// The guard in scripts/security/trust-supabase-error-handling.test.ts stops the
// shape coming back. These prove the handling underneath it is right.

test('an unopenable run row aborts rather than running the check into a void', async () => {
  const supabase = createFakeSupabase({ trust_runs: [], trust_findings: [] });
  supabase.failOn({ table: 'trust_runs', mode: 'insert', message: 'permission denied' });

  let checkRan = false;
  const c: TrustCheck = {
    id: 'test_check',
    title: 'Test check',
    cadence: 'hourly',
    async run() {
      checkRan = true;
      return { scopeCount: 13, findings: [finding()] };
    },
  };

  const summary = await run(supabase, c);
  assert.equal(summary.status, 'error');
  assert.equal(summary.runId, null);
  assert.match(summary.errorDetail!, /permission denied/);
  assert.equal(checkRan, false, 'with nowhere to record evidence, the check must not run');
  assert.equal(supabase.rows('trust_findings').length, 0);
});

test('an unreadable open set is a failed run, not an empty one', async () => {
  // The most dangerous instance of the family. Substituting [] here means every
  // emitted fingerprint classifies as NEW, the inserts collide with the unique
  // fingerprint constraint, and the run reports findings it never wrote.
  const supabase = createFakeSupabase({ trust_runs: [], trust_findings: [] });
  await run(supabase, check({ scopeCount: 13, findings: [finding()] }));
  assert.equal(supabase.rows('trust_findings').length, 1);

  supabase.failOn({ table: 'trust_findings', mode: 'select', message: 'relation does not exist' });
  const summary = await run(supabase, check({ scopeCount: 13, findings: [finding()] }));

  assert.equal(summary.status, 'error');
  assert.equal(summary.suppressedReason, 'check_error');
  assert.equal(summary.raised, 0, 'nothing may be reported as raised on an unreadable ledger');
  assert.equal(summary.resolved, 0);
  assert.equal(
    supabase.rows('trust_findings').filter((r) => r.rule_key === 'stale_gauge')[0].status,
    'open',
    'the standing finding must survive a run that could not read it',
  );
});

test('a failed reconciliation writes nothing at all', async () => {
  // The property the transaction buys. Before trust_apply_reconcile() this was
  // six independent round-trips, so a failure partway left the ledger holding
  // some of the run's changes and not others — a state describing a run that
  // never happened, with no way afterwards to tell which half landed.
  const supabase = createFakeSupabase({ trust_runs: [], trust_findings: [] });
  supabase.failOn({ table: 'trust_findings', mode: 'insert', message: 'disk full' });

  const summary = await run(
    supabase,
    check({
      scopeCount: 13,
      findings: [finding(), finding({ entityKey: 'jacks-fork', title: 'jacks-fork: stale gauge' })],
    }),
  );

  assert.equal(summary.status, 'error');
  assert.equal(summary.raised, 0, 'a write that failed is not a finding raised');
  assert.match(summary.errorDetail!, /disk full/);
  assert.equal(supabase.rows('trust_findings').length, 0, 'no finding may survive a failed plan');

  // The run row keeps the pessimistic state it was opened with, which is the
  // correct reading: this run did not complete.
  const row = supabase.rows('trust_runs').at(-1)!;
  assert.equal(row.status, 'error');
  assert.equal(row.error_detail, 'run did not complete');
  assert.equal(row.finished_at, undefined, 'an incomplete run has no finish time');
});

test('a run row that cannot be finalized keeps its pessimistic failure', async () => {
  const supabase = createFakeSupabase({ trust_runs: [], trust_findings: [] });
  supabase.failOn({ table: 'trust_runs', mode: 'update', message: 'connection reset' });

  const summary = await run(supabase, check({ scopeCount: 13, findings: [finding()] }));

  assert.equal(summary.status, 'error');
  assert.match(summary.errorDetail!, /connection reset/);
  // Never overwritten, so it still reads exactly as a run that did not complete.
  const row = supabase.rows('trust_runs').at(-1)!;
  assert.equal(row.status, 'error');
  assert.equal(row.error_detail, 'run did not complete');
});

// ── an empty scope is a failure, not a quiet success ─────────────

test('a scope of zero records the RUN as an error, not merely a suppression', async () => {
  // TRUST_LEDGER_V1_PLAN.md:316 — "the run is recorded as an error and resolves
  // nothing". Reconciliation was already refused, but the run row said 'ok', so
  // a check that examined nothing showed a green timestamp in the console and
  // counted as a healthy recent run everywhere that keys on status.
  const supabase = createFakeSupabase({ trust_runs: [], trust_findings: [] });
  const summary = await run(supabase, check({ scopeCount: 0, findings: [] }));

  assert.equal(summary.suppressedReason, 'empty_scope');
  assert.equal(summary.status, 'error');
  const row = supabase.rows('trust_runs').at(-1)!;
  assert.equal(row.status, 'error');
  assert.equal(row.suppressed_reason, 'empty_scope');
  assert.match(String(row.error_detail), /0 entities/);
});

test('a truncated pass is still an ok run — it is ordinary, not broken', async () => {
  // The counterpart assertion. partial_scope must NOT be promoted to an error,
  // or a check that legitimately ran out of its time budget would page.
  const supabase = createFakeSupabase({ trust_runs: [], trust_findings: [] });
  const summary = await run(
    supabase,
    check({ scopeCount: 6, findings: [finding()], partial: true }),
  );

  assert.equal(summary.suppressedReason, 'partial_scope');
  assert.equal(summary.status, 'ok');
  assert.equal(supabase.rows('trust_runs').at(-1)!.status, 'ok');
});

// ── a pre-triaged finding ────────────────────────────────────────

test('a finding raised with a snooze deadline is written snoozed, not open', async () => {
  // The mechanism behind exceptions.ts: an accepted schema deviation is real
  // and belongs in the record, but it is already triaged, and leaving it open
  // teaches the operator that the open list contains things nobody must act on.
  const supabase = createFakeSupabase({ trust_runs: [], trust_findings: [] });
  const until = '2026-11-04T23:59:59.999Z';

  await run(
    supabase,
    check({
      scopeCount: 7,
      findings: [finding({ ruleKey: 'schema_admin_policies_use_is_admin', snoozeUntil: until })],
    }),
  );

  const row = supabase.rows('trust_findings')[0];
  assert.equal(row.status, 'snoozed');
  assert.equal(row.snoozed_until, until);
});

test('an expired governed finding wakes on the next run without anyone acting', async () => {
  // NOW is 2026-08-04. A deadline in the past must not shield the finding: this
  // is the whole reason the expiry is expressed as an ordinary snooze rather
  // than as a flag something has to remember to re-read.
  const supabase = createFakeSupabase({ trust_runs: [], trust_findings: [] });
  const lapsed = '2026-07-01T00:00:00.000Z';

  await run(
    supabase,
    check({
      scopeCount: 7,
      findings: [finding({ ruleKey: 'schema_admin_policies_use_is_admin', snoozeUntil: lapsed })],
    }),
  );
  assert.equal(supabase.rows('trust_findings')[0].status, 'snoozed');

  // Second pass: the check re-emits it, now with no snooze because the register
  // says the exception has run out.
  await run(
    supabase,
    check({
      scopeCount: 7,
      findings: [finding({ ruleKey: 'schema_admin_policies_use_is_admin' })],
    }),
  );

  const row = supabase.rows('trust_findings')[0];
  assert.equal(row.status, 'open', 'a lapsed deadline must reopen the finding');
  assert.equal(row.snoozed_until, null);
});

test('a governed finding does not resurrect an operator reopen', async () => {
  // snoozeUntil is honoured on RAISE only. An operator who reopens a governed
  // finding has overruled the register for that row, and a scheduled run
  // re-snoozing it every hour would be the ledger arguing with the person it
  // exists to serve.
  const supabase = createFakeSupabase({ trust_runs: [], trust_findings: [] });
  const until = '2026-11-04T23:59:59.999Z';
  const governed = finding({ ruleKey: 'schema_admin_policies_use_is_admin', snoozeUntil: until });

  await run(supabase, check({ scopeCount: 7, findings: [governed] }));
  assert.equal(supabase.rows('trust_findings')[0].status, 'snoozed');

  // The operator reopens it.
  const row = supabase.rows('trust_findings')[0];
  supabase.seed('trust_findings', [{ ...row, status: 'open', snoozed_until: null }]);

  await run(supabase, check({ scopeCount: 7, findings: [governed] }));
  assert.equal(supabase.rows('trust_findings')[0].status, 'open');
});

test('a completed run finishes after it started', async () => {
  // The regression this prevents: trust_apply_reconcile() stamped finished_at
  // with the instant the CALLER passed in. That instant is captured once per
  // tick, before any check runs, so it landed before the run row's own
  // started_at default and identically on every check in the drain. On
  // production all 469 rows written between 2026-08-04 and 2026-08-10 finished
  // one to eight seconds before they began.
  //
  // Nothing read the column, which is why it survived a week. The cost was a
  // systematically false timestamp in the subsystem whose entire product is a
  // record that can be believed. Repaired and constrained by
  // 20260811144743_trust_runs_finished_at_is_an_observation.sql; asserted here
  // because a CHECK constraint on production cannot fail CI.
  const supabase = createFakeSupabase({ trust_runs: [], trust_findings: [] });

  const summary = await run(supabase, check({ scopeCount: 13, findings: [finding()] }));
  assert.equal(summary.status, 'ok');

  const row = supabase.rows('trust_runs').at(-1)!;
  assert.ok(row.finished_at, 'a completed run records when it finished');
  assert.ok(
    new Date(row.finished_at as string).getTime() >= new Date(row.started_at as string).getTime(),
    `finished_at ${row.finished_at} precedes started_at ${row.started_at}`,
  );
});
