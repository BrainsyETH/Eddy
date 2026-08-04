import assert from 'node:assert/strict';
import test from 'node:test';
import { hasRemediation, isMechanical, remediationFor } from './remediation';
import { ALL_TRUST_RULES, severityForRule } from './severity';

// ── the gate ─────────────────────────────────────────────────────

test('every rule the ledger can emit has remediation', () => {
  // The regression this prevents: a check ships, starts filing findings, and
  // the console shows a problem with no instruction attached — which is the
  // state this whole file exists to end.
  const missing = ALL_TRUST_RULES.filter((rule) => !hasRemediation(rule));
  assert.deepEqual(missing, []);
});

test('an unmapped rule falls back to investigate, not to a guess', () => {
  // A fabricated `where` sends someone to edit the wrong thing, which is worse
  // than saying nothing. The fallback carries no location on purpose.
  const r = remediationFor('some_rule_nobody_has_written_up');
  assert.equal(r.kind, 'investigate');
  assert.equal(r.where, undefined);
});

// ── the safety line ──────────────────────────────────────────────

test('nothing that moves a condition badge is marked mechanical', () => {
  // The rule for autonomy is not how confident the check is, it is what breaks
  // if the fix is wrong. Anything reaching a badge or a go/no-go needs a human,
  // so no threshold rule may ever be labelled as a re-runnable command — that
  // label is what a future auto-apply would key on.
  const badgeRules = [
    'threshold_order',
    'no_dangerous_anchor',
    'no_too_low_anchor',
    'no_optimal_max_anchor',
    'missing_thresholds',
    'stale_gauge',
  ];
  for (const rule of badgeRules) {
    assert.equal(isMechanical(rule), false, `${rule} must not be mechanical`);
  }
});

test('no critical finding is mechanical', () => {
  // Same rule stated structurally rather than by list, so a new critical rule
  // cannot be quietly given a one-command fix.
  for (const rule of ALL_TRUST_RULES) {
    if (severityForRule(rule) !== 'critical') continue;
    assert.equal(isMechanical(rule), false, `${rule} is critical and must not be mechanical`);
  }
});

// ── the mechanical set is small and real ─────────────────────────

test('mechanical rules name a command or an admin page', () => {
  // "Mechanical" is a promise that somewhere concrete exists to go and do it.
  for (const rule of ALL_TRUST_RULES) {
    if (!isMechanical(rule)) continue;
    const r = remediationFor(rule);
    assert.ok(r.where && r.where.length > 0, `${rule} is mechanical but names no location`);
  }
});

test('the snapping fix points at the script that already exists', () => {
  const r = remediationFor('access_point_not_snapped');
  assert.equal(r.kind, 'mechanical');
  assert.match(r.where ?? '', /db:snap-access-points/);
});

// ── judgment rules carry a method, not just a verb ───────────────

test('threshold guidance explains which line is actually wrong', () => {
  // "Make it increasing" is not actionable without knowing that level_high is
  // unread while optimal_max is set — which is the difference between a latent
  // trap and a live misgrade, and determines whether it is urgent.
  const r = remediationFor('threshold_order');
  assert.equal(r.kind, 'judgment');
  assert.match(r.method ?? '', /optimal_max/);
});

test('the too-low anchor cites the derivation that has been used before', () => {
  const r = remediationFor('no_too_low_anchor');
  assert.match(r.method ?? '', /percentile/i);
});

test('a stale gauge is an investigation, never a threshold edit', () => {
  // The dangerous mistake here is treating a dead sensor as a calibration
  // problem and moving the ladder to make the badge look right.
  const r = remediationFor('stale_gauge');
  assert.equal(r.kind, 'investigate');
  assert.match(r.action, /[Dd]o not touch thresholds/);
});

// ── findings that are about the checker, not the data ────────────

test('rules that usually mean a broken check say so', () => {
  assert.equal(remediationFor('knowledge_file_missing').kind, 'check_bug');
  assert.equal(remediationFor('geometry_unreadable').kind, 'check_bug');
});

test('the geometry_missing guidance warns about the failure that actually happened', () => {
  // It fired on 24 of 24 rivers because get_river_geometry_json was absent and
  // PostgREST returns an error object rather than throwing. Anyone seeing it
  // broadly should suspect the RPC before the data.
  const r = remediationFor('geometry_missing');
  assert.equal(r.kind, 'investigate');
  assert.match(r.method ?? '', /get_river_geometry_json/);
});
