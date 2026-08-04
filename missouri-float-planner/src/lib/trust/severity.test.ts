import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALL_TRUST_RULES,
  VALIDATE_RIVER_DATA_RULES,
  compareSeverity,
  isRuleClassified,
  severityForRule,
} from './severity';

// ── the gate that keeps this map honest ──────────────────────────

test('every rule any check can emit has a severity', () => {
  // The regression this prevents: a new rule lands in validate_river_data() and
  // nobody classifies it, so it silently inherits the unmapped default forever.
  // Adding a rule to the SQL means adding it here, and this is what says so.
  const unclassified = ALL_TRUST_RULES.filter((rule) => !isRuleClassified(rule));
  assert.deepEqual(unclassified, []);
});

test('validate_river_data contributes all twenty of its rules', () => {
  // 00164_harden_river_validation.sql emits nine 'error' rows and eleven
  // 'warning' rows. If that file grows a UNION ALL branch, this count is the
  // thing that notices.
  assert.equal(VALIDATE_RIVER_DATA_RULES.length, 20);
  assert.equal(new Set(VALIDATE_RIVER_DATA_RULES).size, 20);
});

test('rule keys are unique across every check', () => {
  assert.equal(new Set(ALL_TRUST_RULES).size, ALL_TRUST_RULES.length);
});

// ── the re-map, and why it is not the SQL's own grade ────────────

test('a silent primary gauge outranks a missing timezone', () => {
  // This pair is the entire reason severity is re-mapped rather than taken from
  // validate_river_data(). The SQL grades by category of defect, so it files
  // stale_gauge as a 'warning' and missing_timezone as an 'error'. Graded by
  // what a paddler sees, that is backwards: a stale primary gauge leaves the
  // condition badge quoting yesterday's water as though it were current, and a
  // missing timezone is a display concern on a Missouri-only product.
  assert.equal(severityForRule('stale_gauge'), 'critical');
  assert.equal(severityForRule('missing_timezone'), 'medium');
  assert.equal(compareSeverity('critical', 'medium') < 0, true);
});

test('anything that can move a condition badge is critical', () => {
  for (const rule of [
    'stale_gauge',
    'threshold_order',
    'no_dangerous_anchor',
    'missing_thresholds',
    'no_primary_gauge',
    'ungauged_river',
  ]) {
    assert.equal(severityForRule(rule), 'critical', `${rule} should be critical`);
  }
});

test('a ledger that cannot believe itself is critical', () => {
  // When reconciliation is suppressed, every other severity on that check is
  // unverified — so the meta-finding has to outrank the findings it covers.
  assert.equal(severityForRule('reconcile_anomaly'), 'critical');
});

test('badge-range collapse is high, not critical', () => {
  // These misreport in the safe direction: the range narrows, so the badge
  // understates how floatable the river is rather than overstating it.
  assert.equal(severityForRule('no_too_low_anchor'), 'high');
  assert.equal(severityForRule('no_optimal_max_anchor'), 'high');
});

test('mileage defects are medium because the float time cannot become a go/no-go', () => {
  // Bad mileage means a bad float time, but /api/plan returns a range and
  // floatTime.ts:145-148 refuses to estimate at all for dangerous water, so the
  // error cannot compound into a safety answer.
  for (const rule of ['mileage_order_mismatch', 'mileage_equals_length', 'access_point_offline']) {
    assert.equal(severityForRule(rule), 'medium', `${rule} should be medium`);
  }
});

// ── the unmapped default ─────────────────────────────────────────

test('an unmapped rule defaults to high, not low', () => {
  // The two ways to be wrong about an unclassified rule are not symmetric.
  // Filing it low buries it in a list the operator skims; filing it high puts
  // it in front of them once and gets it classified.
  assert.equal(severityForRule('some_rule_nobody_has_triaged'), 'high');
  assert.equal(isRuleClassified('some_rule_nobody_has_triaged'), false);
});

// ── ordering ─────────────────────────────────────────────────────

test('compareSeverity sorts worst first', () => {
  const sorted = ['low', 'critical', 'medium', 'high'].sort((a, b) =>
    compareSeverity(a as never, b as never),
  );
  assert.deepEqual(sorted, ['critical', 'high', 'medium', 'low']);
});
