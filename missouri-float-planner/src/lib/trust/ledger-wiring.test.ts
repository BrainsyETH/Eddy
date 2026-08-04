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
