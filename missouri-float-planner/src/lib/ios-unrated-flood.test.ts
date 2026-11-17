// An unrated gauge has two truthful states: 'dangerous' at or above its
// official flood stage, 'unknown' below it. The shared classifier has always
// answered that way. Two iOS graders returned 'unknown' from a hasLadder guard
// before calling it, so the app could not show a flood on an unrated gauge.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { classifyReading } from '@shared/condition-ladder';
import type { MapGauge } from '@eddy/types';
import { gaugeConditionCode } from '../../../eddy-ios/src/lib/gaugeCondition';

const UNRATED = {
  levelTooLow: null, levelLow: null, levelOptimalMin: null,
  levelOptimalMax: null, levelHigh: null, levelDangerous: null,
};

/** White at Calico Rock: no ladder, 19 ft NWS flood stage, rated in cfs. */
function calicoRock(gaugeHeightFt: number | null, extra: Partial<MapGauge> = {}) {
  return {
    id: 'clr', name: 'White River at Calico Rock, AR', usgsSiteId: '07060500',
    gaugeHeightFt, dischargeCfs: 60000,
    thresholds: [{ riverSlug: 'white', riverMile: null, isPrimary: false, thresholdUnit: 'cfs', floodStageFt: 19, ...UNRATED }],
    ...extra,
  } as MapGauge;
}

test('the iOS gauge grader shows a flood on an unrated gauge, and nothing below it', () => {
  assert.equal(gaugeConditionCode(calicoRock(20), 'white'), 'dangerous');
  assert.equal(gaugeConditionCode(calicoRock(19), 'white'), 'dangerous');
  assert.equal(gaugeConditionCode(calicoRock(8), 'white'), 'unknown');
});

test('it still refuses a suspect reading, a gauge with no pairing, and an unrated gauge with no flood stage', () => {
  assert.equal(gaugeConditionCode(calicoRock(20, { readingSuspect: true }), 'white'), 'unknown');
  assert.equal(gaugeConditionCode({ ...calicoRock(20), thresholds: [] } as MapGauge, 'white'), 'unknown');
  const noStage = calicoRock(40);
  noStage.thresholds![0].floodStageFt = null;
  assert.equal(gaugeConditionCode(noStage, 'white'), 'unknown');
});

test('a rated gauge grades as before', () => {
  const rated = {
    id: 'sj', name: 'Buffalo River near St. Joe, AR', gaugeHeightFt: 3, dischargeCfs: 300,
    thresholds: [{ riverSlug: 'buffalo', riverMile: 72.6, isPrimary: true, thresholdUnit: 'cfs', floodStageFt: 27,
      levelTooLow: 100, levelLow: 200, levelOptimalMin: null, levelOptimalMax: 1000, levelHigh: 1000, levelDangerous: 2000 }],
  } as MapGauge;
  assert.equal(gaugeConditionCode(rated, 'buffalo'), 'good');
  assert.equal(gaugeConditionCode({ ...rated, gaugeHeightFt: 28 }, 'buffalo'), 'dangerous');
});

test('the statewide grader hands an unrated gauge to the classifier instead of returning first', () => {
  // statewideNetwork.ts imports the app's theme, so this runner cannot load
  // it. The call it makes is pinned here, and the classifier is run with the
  // thresholds and options that call passes.
  const source = readFileSync('../eddy-ios/src/lib/statewideNetwork.ts', 'utf8');
  const grade = source.slice(source.indexOf('export function gradeGauge('));
  assert.doesNotMatch(grade.replace(/\/\/.*$/gm, ''), /hasLadder\(/);
  assert.match(grade, /floodStageFt: gauge\.flood_stage_ft/);
  assert.match(grade, /return classifyReading\(\s*reading\.gaugeHeightFt,\s*thresholds,\s*reading\.dischargeCfs,\s*\{ strictUnit: true \},\s*\);/);

  const thresholds = { ...UNRATED, thresholdUnit: 'cfs' as const, floodStageFt: 19 };
  assert.equal(classifyReading(20, thresholds, 60000, { strictUnit: true }), 'dangerous');
  assert.equal(classifyReading(20, thresholds, null, { strictUnit: true }), 'dangerous');
  assert.equal(classifyReading(8, thresholds, 9000, { strictUnit: true }), 'unknown');
});
