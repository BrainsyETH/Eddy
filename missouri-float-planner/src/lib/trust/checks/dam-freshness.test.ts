import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FROZEN_HOURS,
  STALE_HOURS,
  deriveDamFreshnessFindings,
  type DamHistoryAge,
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
