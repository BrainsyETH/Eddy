import assert from 'node:assert/strict';
import test from 'node:test';
import type { AlertRule } from '@eddy/types';
import {
  alertRuleKey,
  groupAlertRules,
  isGatedByParent,
  rulesInGroup,
} from '../../../eddy-ios/src/lib/alertGroups';

// The Expo app has no test runner, so its pure logic is covered here — the same
// arrangement as alert-copy.test.ts.
//
// What this protects is a CLAIM MADE TO THE USER, and the claim got stronger
// when the parent link became a real column: a rule this function adopts is
// drawn inside another rule's card, gated by that rule's switch server-side, and
// deleted with it by cascade. Adopting something that is not a child means
// silencing an alert somebody set deliberately.

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
    parentId: null,
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
  parentId: 'sub-current',
});
const currentVanBuren = rule({
  id: 'gauge-van-buren',
  source: 'gauge',
  scope: 'gauge',
  riverId: 'river-current',
  riverName: 'Current River',
  gaugeId: 'st-van-buren',
  gaugeName: 'Current River at Van Buren',
  parentId: 'sub-current',
});

test('a river alert adopts the gauge alerts created from it', () => {
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
  // A rule that is both adopted and left top-level would render twice; one that
  // is neither would vanish from a screen meant to list every alert — and an
  // alert you cannot see is one you cannot pause, edit or delete.
  const input = [currentRiver, currentAkers, currentVanBuren];
  const seen = groupAlertRules(input).flatMap(rulesInGroup).map(alertRuleKey);
  assert.deepEqual(seen.sort(), input.map(alertRuleKey).sort());
});

test('SAME RIVER IS NOT ENOUGH — only a declared parent adopts', () => {
  // THE POINT of the column. A custom level set from the gauge screen on a
  // river you also follow is the whole of what that person asked for. Adopting
  // it would put it under a switch they never pointed at it, and the switch
  // genuinely gates now, so it would silence a real alert.
  const standalone = rule({
    id: 'gauge-standalone',
    source: 'gauge',
    scope: 'gauge',
    mode: 'threshold',
    riverId: 'river-current',
    riverName: 'Current River',
    gaugeId: 'st-akers',
    gaugeName: 'Current River at Akers',
    metric: 'gauge_height_ft',
    comparator: 'above',
    thresholdValue: 3,
    conditionKind: null,
    parentId: null,
  });
  const groups = groupAlertRules([currentRiver, standalone]);
  assert.deepEqual(
    groups.map((g) => g.rule.id),
    ['sub-current', 'gauge-standalone'],
  );
  assert.deepEqual(groups[0].children, []);
});

test('a gauge alert whose parent is not in the list stays top-level', () => {
  // A partial response, or a row deleted between two reads. Better a row in the
  // wrong place than a row nowhere: the user can still reach it.
  const orphan = { ...currentAkers, parentId: 'sub-gone' };
  const groups = groupAlertRules([orphan]);
  assert.deepEqual(
    groups.map((g) => g.rule.id),
    ['gauge-akers'],
  );
});

test('a parent id can never point at another river alert’s children', () => {
  const meramec = rule({
    id: 'sub-meramec',
    source: 'river_condition',
    scope: 'river',
    riverId: 'river-meramec',
    riverName: 'Meramec River',
  });
  const groups = groupAlertRules([meramec, currentRiver, currentAkers]);
  assert.deepEqual(groups.find((g) => g.rule.id === 'sub-meramec')?.children, []);
  assert.deepEqual(
    groups.find((g) => g.rule.id === 'sub-current')?.children.map((c) => c.id),
    ['gauge-akers'],
  );
});

test('a national-tier threshold rule with no river is its own group', () => {
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
    conditionKind: null,
  });
  assert.deepEqual(
    groupAlertRules([national]).map((g) => g.rule.id),
    ['gauge-national'],
  );
});

test('order follows the server, parents in place', () => {
  // The list is sorted server-side and grouping must not reshuffle it — a row
  // that moves when an unrelated alert is added reads as a bug.
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
  assert.deepEqual(groupAlertRules([currentRiver, collide]).map((g) => g.key), [
    'river_condition:sub-current',
    'gauge:sub-current',
  ]);
});

// ── The gate, from the row's point of view ──────────────────────────────────
//
// A gated child's own `enabled` is still true and nothing has written to it —
// that is what lets resuming the parent hand every child back untouched. So the
// row is the only thing that can explain a switch reading on beside an alert
// that will not fire, and it needs a straight answer to ask.

test('children are gated exactly when the parent is paused', () => {
  const live = groupAlertRules([currentRiver, currentAkers])[0];
  assert.equal(isGatedByParent(live), false);

  const paused = groupAlertRules([{ ...currentRiver, enabled: false }, currentAkers])[0];
  assert.equal(isGatedByParent(paused), true);
  // The child is untouched. Nothing wrote to it, which is the whole mechanism.
  assert.equal(paused.children[0].enabled, true);
});

test('a child paused by hand stays paused when the parent is resumed', () => {
  // No memory anywhere, on the client or the server: the child's own column
  // never moved, so there is nothing to restore.
  const off = { ...currentVanBuren, enabled: false };
  const group = groupAlertRules([currentRiver, currentAkers, off])[0];
  assert.deepEqual(
    group.children.map((c) => [c.id, c.enabled]),
    [
      ['gauge-akers', true],
      ['gauge-van-buren', false],
    ],
  );
});
