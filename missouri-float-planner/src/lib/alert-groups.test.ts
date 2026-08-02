import assert from 'node:assert/strict';
import test from 'node:test';
import type { AlertRule } from '@eddy/types';
import {
  alertRuleKey,
  childrenAlreadyPaused,
  groupAlertRules,
  rulesInGroup,
  rulesToPause,
  rulesToResume,
} from '../../../eddy-ios/src/lib/alertGroups';

// The Expo app has no test runner, so its pure logic is covered here — the same
// arrangement as alert-copy.test.ts.
//
// What this protects is a CLAIM MADE TO THE USER. The Alerts tab draws a river
// alert's gauge alerts inside it and cascades the parent's switch and swipe over
// them, so anything this function adopts is something a single tap can pause or
// delete. Adopting a rule that does not belong to that river would mean a swipe
// on the Meramec deleting somebody's Current River alert.

function rule(over: Partial<AlertRule> & Pick<AlertRule, 'id' | 'source' | 'scope'>): AlertRule {
  return {
    mode: 'condition',
    riverId: null,
    riverName: null,
    riverSlug: null,
    gaugeId: null,
    gaugeName: null,
    usgsSiteId: null,
    curated: true,
    conditionKind: 'all',
    metric: null,
    comparator: null,
    thresholdValue: null,
    thresholdValueMax: null,
    enabled: true,
    oneShot: false,
    firedAt: null,
    lastTriggeredAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...over,
  } as AlertRule;
}

const currentRiver = rule({
  id: 'sub-current',
  source: 'river_condition',
  scope: 'river',
  riverId: 'river-current',
  riverName: 'Current River',
});
const currentAkers = rule({
  id: 'gauge-akers',
  source: 'gauge',
  scope: 'gauge',
  riverId: 'river-current',
  riverName: 'Current River',
  gaugeId: 'st-akers',
  gaugeName: 'Current River at Akers',
});
const currentVanBuren = rule({
  id: 'gauge-van-buren',
  source: 'gauge',
  scope: 'gauge',
  riverId: 'river-current',
  riverName: 'Current River',
  gaugeId: 'st-van-buren',
  gaugeName: 'Current River at Van Buren',
});

test('a river alert adopts the gauge alerts set on that river', () => {
  // The case the change exists for: four cards all titled "Current River"
  // become one card with two gauges under it.
  const groups = groupAlertRules([currentRiver, currentAkers, currentVanBuren]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].rule.id, 'sub-current');
  assert.deepEqual(
    groups[0].children.map((child) => child.id),
    ['gauge-akers', 'gauge-van-buren'],
  );
});

test('every rule survives grouping exactly once', () => {
  // The parent's switch and swipe act on rulesInGroup(), so a rule that is both
  // adopted and left top-level would be written twice, and one that is neither
  // would vanish from a screen that is meant to list every alert.
  const input = [currentRiver, currentAkers, currentVanBuren];
  const seen = groupAlertRules(input).flatMap(rulesInGroup).map((r) => `${r.source}:${r.id}`);
  assert.deepEqual(seen.sort(), input.map((r) => `${r.source}:${r.id}`).sort());
});

test('a gauge alert on a river with no subscription stays top-level', () => {
  // Somebody who follows one station and not the river. This IS their alert,
  // not a refinement of anything, and indenting it under a parent it does not
  // have would bury it.
  const groups = groupAlertRules([currentAkers]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].rule.id, 'gauge-akers');
  assert.deepEqual(groups[0].children, []);
});

test('a gauge alert never crosses to another river', () => {
  const meramec = rule({
    id: 'sub-meramec',
    source: 'river_condition',
    scope: 'river',
    riverId: 'river-meramec',
    riverName: 'Meramec River',
  });
  const groups = groupAlertRules([meramec, currentAkers]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].children, []);
  assert.equal(groups[1].rule.id, 'gauge-akers');
});

test('a national-tier threshold rule with no river is its own group', () => {
  // No riverId at all — the uncurated tier. Nothing can adopt it and it must
  // not be dropped.
  const national = rule({
    id: 'gauge-national',
    source: 'gauge',
    scope: 'gauge',
    mode: 'threshold',
    curated: false,
    gaugeId: 'st-national',
    gaugeName: 'Some Creek near Nowhere',
    metric: 'gauge_height_ft',
    comparator: 'above',
    thresholdValue: 3,
  });
  const groups = groupAlertRules([national]);
  assert.deepEqual(
    groups.map((g) => g.rule.id),
    ['gauge-national'],
  );
});

test('order follows the server, parents in place', () => {
  // The list is sorted server-side and the grouping must not reshuffle it —
  // a row that moves when an unrelated alert is added reads as a bug.
  const meramec = rule({
    id: 'sub-meramec',
    source: 'river_condition',
    scope: 'river',
    riverId: 'river-meramec',
    riverName: 'Meramec River',
  });
  const groups = groupAlertRules([currentAkers, meramec, currentRiver, currentVanBuren]);
  assert.deepEqual(
    groups.map((g) => g.rule.id),
    ['sub-meramec', 'sub-current'],
  );
  // Adopted even though it appeared BEFORE its parent in the input.
  assert.deepEqual(
    groups[1].children.map((c) => c.id),
    ['gauge-akers', 'gauge-van-buren'],
  );
});

test('keys are unique across the two id spaces', () => {
  // A gauge rule and a river subscription can carry the same id — they are rows
  // in different tables — and a FlatList keyed on the id alone would collapse
  // them into one row.
  const collide = rule({
    id: 'sub-current',
    source: 'gauge',
    scope: 'gauge',
    riverId: 'river-other',
    gaugeId: 'st-other',
    gaugeName: 'Elsewhere',
  });
  const keys = groupAlertRules([currentRiver, collide]).map((g) => g.key);
  assert.deepEqual(keys, ['river_condition:sub-current', 'gauge:sub-current']);
});

// ── The master-switch contract ──────────────────────────────────────────────
//
// A nested switch is expected to GATE its children, not overwrite them: iOS
// Settings hands every sub-toggle back exactly as it was when the master comes
// back on. Eddy cannot gate — nothing server-side links a gauge rule to the
// river subscription above it, so a "gated" child would go on firing at 4am —
// so the pause is real writes and the state gating would have preserved is
// recorded instead. These are the two halves of putting it back.

const group = {
  key: alertRuleKey(currentRiver),
  rule: currentRiver,
  children: [currentAkers, { ...currentVanBuren, enabled: false }],
};

test('pausing writes only what is actually on', () => {
  // Van Buren is already off. Writing it again is a wasted round trip, and the
  // set that is NOT written is exactly what resuming has to leave alone.
  assert.deepEqual(
    rulesToPause(group).map((r) => r.id),
    ['sub-current', 'gauge-akers'],
  );
});

test('pausing records the children that were already off', () => {
  assert.deepEqual(childrenAlreadyPaused(group), ['gauge:gauge-van-buren']);
  // The parent is never recorded — it is the thing being paused, and it is on.
  assert.ok(!childrenAlreadyPaused(group).includes(alertRuleKey(currentRiver)));
});

test('resuming leaves a deliberately paused gauge paused', () => {
  // THE POINT. Van Buren was switched off by hand before the river was paused,
  // so resuming the river must not sweep it back on.
  const paused = {
    ...group,
    rule: { ...currentRiver, enabled: false },
    children: group.children.map((c) => ({ ...c, enabled: false })),
  };
  assert.deepEqual(
    rulesToResume(paused, new Set(['gauge:gauge-van-buren'])).map((r) => r.id),
    ['sub-current', 'gauge-akers'],
  );
});

test('no record resumes everything, which is the honest degradation', () => {
  // A reinstall, a cleared store, or a group paused before this existed. Better
  // to over-resume — every rule is visible with its own switch — than to leave
  // alerts silently off with nothing saying why.
  const paused = {
    ...group,
    rule: { ...currentRiver, enabled: false },
    children: group.children.map((c) => ({ ...c, enabled: false })),
  };
  assert.deepEqual(
    rulesToResume(paused, new Set()).map((r) => r.id),
    ['sub-current', 'gauge-akers', 'gauge-van-buren'],
  );
});

test('resuming never rewrites a child the user turned back on by hand', () => {
  // Akers was resumed individually while the river stayed paused. It is already
  // on, so the river's switch has nothing to do to it — and must not issue a
  // write that would look like the group claiming credit for it.
  const paused = {
    ...group,
    rule: { ...currentRiver, enabled: false },
    children: [currentAkers, { ...currentVanBuren, enabled: false }],
  };
  assert.deepEqual(
    rulesToResume(paused, new Set()).map((r) => r.id),
    ['sub-current', 'gauge-van-buren'],
  );
});

test('pause and resume round-trip to the original enabled states', () => {
  // The whole contract in one assertion: whatever a group looked like before
  // its switch went off, that is what it looks like after the switch comes back.
  const before = new Map(rulesInGroup(group).map((r) => [alertRuleKey(r), r.enabled]));
  const remembered = new Set(childrenAlreadyPaused(group));
  const pausedKeys = new Set(rulesToPause(group).map(alertRuleKey));

  const paused = {
    ...group,
    rule: { ...group.rule, enabled: false },
    children: group.children.map((c) =>
      pausedKeys.has(alertRuleKey(c)) ? { ...c, enabled: false } : c,
    ),
  };

  const resumedKeys = new Set(rulesToResume(paused, remembered).map(alertRuleKey));
  for (const rule of rulesInGroup(paused)) {
    const key = alertRuleKey(rule);
    assert.equal(resumedKeys.has(key) || rule.enabled, before.get(key), `${key} round-tripped`);
  }
});
