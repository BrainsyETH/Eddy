import assert from 'node:assert/strict';
import test from 'node:test';
import type { AlertRule } from '@eddy/types';
import { groupAlertRules, rulesInGroup } from '../../../eddy-ios/src/lib/alertGroups';

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
