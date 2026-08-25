import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FROZEN_HOURS,
  STALE_HOURS,
  damFreshnessCheck,
  deriveDamFreshnessFindings,
  stalestPerDam,
  type DamHistoryAge,
  type DamMetricAge,
} from './dam-freshness';

const NOW = new Date('2026-08-24T21:00:00Z');

function agedHours(damId: string, hours: number): DamHistoryAge {
  return { damId, latest: new Date(NOW.getTime() - hours * 3_600_000) };
}

test('a dam recording normally raises nothing', () => {
  // The measured band on 2026-08-24: fifteen dams between 2.1 and 4.1 hours.
  // The floor is structural — the cron runs at :25 and drops the hour still
  // filling — so a check that fired here would fire on every healthy dam.
  const findings = deriveDamFreshnessFindings(
    [agedHours('swl-table-rock-dam', 2.1), agedHours('swt-tenkiller-dam', 4.1)],
    NOW,
  );
  assert.deepEqual(findings, []);
});

test('the fleet floor of 4.1 hours stays clear of the threshold', () => {
  // Pinned as a number rather than left implicit: someone tightening
  // STALE_HOURS to 4 would turn the whole recording fleet red, which is the
  // failure mode this check is written to avoid rather than cause.
  assert.ok(STALE_HOURS > 4.1, `STALE_HOURS ${STALE_HOURS} would fire on a healthy fleet`);
});

test('silence past the stale threshold is reported as stale', () => {
  const findings = deriveDamFreshnessFindings([agedHours('swl-beaver-dam', STALE_HOURS + 1)], NOW);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'dam_history_stale');
  assert.equal(findings[0].entityType, 'dam');
  assert.equal(findings[0].entityKey, 'swl-beaver-dam');
});

test('silence past a day is reported as frozen, under its own rule key', () => {
  // Two keys, not one rule with a moving severity. The fingerprint hashes the
  // rule key, so escalating in place would rewrite the finding and lose the
  // date it froze — the one fact that distinguishes a wedged recorder from a
  // skipped run.
  const findings = deriveDamFreshnessFindings([agedHours('lrn-wolf-creek-dam', 53)], NOW);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'dam_history_frozen');
  assert.equal(findings[0].evidence?.hoursStale, 53);
});

test('the stale/frozen boundary is closed at the top', () => {
  // Exactly FROZEN_HOURS is frozen, not stale. Asserted because an off-by-one
  // here means a dam sits at 'medium' for an extra hour on the one transition
  // where somebody should be looking.
  const at = deriveDamFreshnessFindings([agedHours('d', FROZEN_HOURS)], NOW);
  assert.equal(at[0].ruleKey, 'dam_history_frozen');

  const below = deriveDamFreshnessFindings([agedHours('d', FROZEN_HOURS - 0.5)], NOW);
  assert.equal(below[0].ruleKey, 'dam_history_stale');
});

test('the quiet/stale boundary is closed at the top too', () => {
  const below = deriveDamFreshnessFindings([agedHours('d', STALE_HOURS - 0.5)], NOW);
  assert.deepEqual(below, []);

  const at = deriveDamFreshnessFindings([agedHours('d', STALE_HOURS)], NOW);
  assert.equal(at.length, 1);
  assert.equal(at[0].ruleKey, 'dam_history_stale');
});

test('the 2026-08-22 regression is what this check reports', () => {
  // The three Nashville dams frozen at 08-22 16:00, read 53 hours later, while
  // every other dam was current. Reproduced as data so the check's whole
  // purpose is pinned to the incident that motivated it.
  const ages: DamHistoryAge[] = [
    agedHours('lrn-wolf-creek-dam', 53),
    agedHours('lrn-center-hill-dam', 53),
    agedHours('lrn-dale-hollow-dam', 53),
    agedHours('swl-table-rock-dam', 2.1),
    agedHours('swl-bull-shoals-dam', 3.1),
    agedHours('swt-keystone-dam', 3.1),
  ];
  const findings = deriveDamFreshnessFindings(ages, NOW);
  assert.deepEqual(
    findings.map((f) => f.entityKey),
    ['lrn-center-hill-dam', 'lrn-dale-hollow-dam', 'lrn-wolf-creek-dam'],
  );
  assert.ok(findings.every((f) => f.ruleKey === 'dam_history_frozen'));
});

test('a dam that has never recorded is absent from the input and so never reported', () => {
  // The scoping decision, asserted. Mark Twain passes sync-dam-history's filter
  // and has never written a row — daily-mean release, no turbine series — so a
  // registry-scoped check would open a finding against it that could never be
  // closed. Scope comes from the readings table, so it simply is not here.
  const findings = deriveDamFreshnessFindings([agedHours('swl-table-rock-dam', 2.0)], NOW);
  assert.deepEqual(findings, []);
});

test('findings are ordered deterministically', () => {
  const findings = deriveDamFreshnessFindings(
    [agedHours('swt-eufaula-dam', 30), agedHours('lrn-dale-hollow-dam', 30)],
    NOW,
  );
  assert.deepEqual(
    findings.map((f) => f.entityKey),
    ['lrn-dale-hollow-dam', 'swt-eufaula-dam'],
  );
});

test('evidence carries the thresholds it was judged against', () => {
  // So a finding read months later says what "stale" meant at the time, rather
  // than being reinterpreted against whatever the constants have become.
  const [finding] = deriveDamFreshnessFindings([agedHours('swl-norfork-dam', 40)], NOW);
  assert.equal(finding.evidence?.staleThresholdHours, STALE_HOURS);
  assert.equal(finding.evidence?.frozenThresholdHours, FROZEN_HOURS);
  assert.equal(finding.evidence?.latestObservedHour, new Date(NOW.getTime() - 40 * 3_600_000).toISOString());
});

// ── the fetch path ───────────────────────────────────────────────────────
//
// Added after review found the original one blind. The first version asked
// PostgREST for the newest 5,000 rows of dam_metric_readings and derived a
// per-dam max in TypeScript. PostgREST caps at 1,000 rows here, and a frozen
// dam stops adding rows while the healthy fleet writes over it — so at 18 dams
// x 2 metrics the frozen one fell out of the response after ~28 hours, was read
// as never-enrolled, and reconcile.ts closed the live outage as fixed.
//
// Every test above passed throughout, because they all exercise the pure
// derivation and the bug was in the query. These cover run().

/** Minimal stand-in: the only call run() makes is one rpc(). */
function stubClient(rows: unknown[], error: { message: string } | null = null) {
  const calls: string[] = [];
  return {
    calls,
    supabase: {
      rpc: async (name: string) => {
        calls.push(name);
        return { data: rows, error };
      },
      from() {
        throw new Error(
          'dam_freshness must not read dam_metric_readings through PostgREST: a capped page drops frozen dams',
        );
      },
    },
  };
}

const ctx = (supabase: unknown, now: Date) =>
  ({ supabase, now, deadlineMs: now.getTime() + 30_000 }) as never;

test('run() reads the grouped RPC, never a capped table page', async () => {
  const stub = stubClient([
    { dam_id: 'swl-table-rock-dam', metric: 'release', latest_observed_hour: '2026-08-24T19:00:00Z' },
  ]);
  await damFreshnessCheck.run(ctx(stub.supabase, NOW));
  assert.deepEqual(stub.calls, ['trust_dam_history_freshness']);
});

test('a dam frozen far past the PostgREST horizon is still reported', async () => {
  // The regression, expressed as the thing that used to make it vanish. Under
  // the old query this dam's newest row had long since been written past by the
  // healthy fleet, so it was absent from the response and raised nothing while
  // seventeen other dams kept scopeCount nonzero.
  const frozenAt = new Date(NOW.getTime() - 53 * 3_600_000).toISOString();
  const stub = stubClient([
    { dam_id: 'lrn-wolf-creek-dam', metric: 'release', latest_observed_hour: frozenAt },
    { dam_id: 'lrn-wolf-creek-dam', metric: 'generationFlow', latest_observed_hour: frozenAt },
    { dam_id: 'swl-table-rock-dam', metric: 'release', latest_observed_hour: new Date(NOW.getTime() - 2 * 3_600_000).toISOString() },
  ]);

  const result = await damFreshnessCheck.run(ctx(stub.supabase, NOW));

  assert.equal(result.scopeCount, 2, 'both dams are enrolled');
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].entityKey, 'lrn-wolf-creek-dam');
  assert.equal(result.findings[0].ruleKey, 'dam_history_frozen');
  assert.equal(result.findings[0].evidence?.hoursStale, 53);
});

test('scopeCount counts dams, not rows, so two metrics are one dam', async () => {
  // reconcile.ts refuses to resolve on an empty scope, so this number is a
  // safety input rather than a statistic. Counting RPC rows would double it.
  const fresh = new Date(NOW.getTime() - 2 * 3_600_000).toISOString();
  const stub = stubClient([
    { dam_id: 'a', metric: 'release', latest_observed_hour: fresh },
    { dam_id: 'a', metric: 'generationFlow', latest_observed_hour: fresh },
    { dam_id: 'b', metric: 'release', latest_observed_hour: fresh },
    { dam_id: 'b', metric: 'generationFlow', latest_observed_hour: fresh },
  ]);
  const result = await damFreshnessCheck.run(ctx(stub.supabase, NOW));
  assert.equal(result.scopeCount, 2);
  assert.deepEqual(result.findings, []);
});

test('an empty table yields an empty scope rather than a clean sweep', async () => {
  const stub = stubClient([]);
  const result = await damFreshnessCheck.run(ctx(stub.supabase, NOW));
  assert.equal(result.scopeCount, 0);
  assert.deepEqual(result.findings, []);
});

test('an RPC error throws rather than reporting an empty scope', async () => {
  const stub = stubClient([], { message: 'permission denied' });
  await assert.rejects(
    () => damFreshnessCheck.run(ctx(stub.supabase, NOW)),
    /trust_dam_history_freshness\(\) failed: permission denied/,
  );
});

// ── one frozen series under a healthy one ────────────────────────────────

test('a dam is judged by its STALEST series, not its newest', () => {
  // A renamed turbine series freezes generationFlow while release keeps
  // arriving. max() across the dam's metrics would report it healthy.
  const rows: DamMetricAge[] = [
    { damId: 'swl-norfork-dam', metric: 'release', latest: new Date(NOW.getTime() - 2 * 3_600_000) },
    { damId: 'swl-norfork-dam', metric: 'generationFlow', latest: new Date(NOW.getTime() - 40 * 3_600_000) },
  ];
  const ages = stalestPerDam(rows);
  assert.equal(ages.length, 1);
  assert.equal(ages[0].metric, 'generationFlow');

  const findings = deriveDamFreshnessFindings(ages, NOW);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'dam_history_frozen');
  assert.equal(findings[0].evidence?.stalestMetric, 'generationFlow');
});

test('stalestPerDam keeps a dam whose metrics are all healthy quiet', () => {
  const fresh = new Date(NOW.getTime() - 3 * 3_600_000);
  const ages = stalestPerDam([
    { damId: 'x', metric: 'release', latest: fresh },
    { damId: 'x', metric: 'generationFlow', latest: fresh },
  ]);
  assert.deepEqual(deriveDamFreshnessFindings(ages, NOW), []);
});
