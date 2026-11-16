import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyThresholdPatch, ladderProblem, parseThresholdValue, type ThresholdState } from './threshold-validation';

const EMPTY_ALT = {
  altLevelTooLow: null, altLevelLow: null, altLevelOptimalMin: null,
  altLevelOptimalMax: null, altLevelHigh: null, altLevelDangerous: null,
};
const FT: ThresholdState = {
  thresholdUnit: 'ft',
  levelTooLow: 1, levelLow: 1.5, levelOptimalMin: 2, levelOptimalMax: 3.5, levelHigh: 4, levelDangerous: 5,
  ...EMPTY_ALT,
};
const CFS_LADDER = {
  levelTooLow: 100, levelLow: 150, levelOptimalMin: 250, levelOptimalMax: 900, levelHigh: 1200, levelDangerous: 2000,
};

describe('ladder ordering', () => {
  it('accepts an increasing ladder and one with gaps', () => {
    assert.equal(ladderProblem(FT, 'ft'), null);
    assert.equal(ladderProblem({ ...FT, levelLow: null, levelHigh: null }, 'ft'), null);
  });

  it('names the inverted or equal pair', () => {
    assert.match(ladderProblem({ ...FT, levelLow: 2.5 }, 'ft') ?? '', /Low \(2\.5 ft\) must be below Optimal Min \(2 ft\)/);
    assert.match(ladderProblem({ ...FT, levelHigh: 5 }, 'ft') ?? '', /High .* must be below Dangerous/);
    assert.match(ladderProblem({ ...FT, levelOptimalMax: 6 }, 'ft') ?? '', /Optimal Max .* Dangerous/);
  });

  it('allows negative stage but not negative flow', () => {
    assert.equal(ladderProblem({ ...FT, levelTooLow: -0.5 }, 'ft'), null);
    assert.match(ladderProblem({ ...CFS_LADDER, levelTooLow: -1 }, 'cfs') ?? '', /cannot be negative/);
  });
});

describe('submitted values', () => {
  it('distinguishes absent, cleared and numeric', () => {
    assert.deepEqual(parseThresholdValue(undefined), { ok: true, value: undefined });
    assert.deepEqual(parseThresholdValue(''), { ok: true, value: null });
    assert.deepEqual(parseThresholdValue('3.5'), { ok: true, value: 3.5 });
  });

  it('refuses text instead of storing null', () => {
    for (const raw of ['abc', '3ft', 'NaN', Infinity, {}, '1e9x']) {
      assert.equal(parseThresholdValue(raw).ok, false, String(raw));
    }
  });
});

describe('saving a threshold edit', () => {
  it('rejects an edit that inverts the stored ladder', () => {
    const result = applyThresholdPatch(FT, { levelLow: '9' });
    assert.equal(result.ok, false);
  });

  it('does not block an untouched ladder that is already out of order', () => {
    const broken = { ...FT, levelLow: 9 };
    const result = applyThresholdPatch(broken, {});
    assert.deepEqual(result, { ok: true, next: broken, changed: false });
  });

  it('never relabels feet as cfs', () => {
    const result = applyThresholdPatch(FT, { thresholdUnit: 'cfs' });
    assert.equal(result.ok, false);
    assert.match(result.ok ? '' : result.error, /Enter the cfs thresholds/);
  });

  it('moves the old ladder to the alternate slot when the new unit is filled in', () => {
    const result = applyThresholdPatch(FT, { thresholdUnit: 'cfs', ...CFS_LADDER });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.next.thresholdUnit, 'cfs');
    assert.equal(result.next.levelOptimalMin, 250);
    assert.equal(result.next.altLevelOptimalMin, 2);
    assert.equal(result.next.altLevelDangerous, 5);
  });

  it('swaps stored ladders when both units already have thresholds', () => {
    const both: ThresholdState = {
      ...FT,
      altLevelTooLow: 100, altLevelLow: 150, altLevelOptimalMin: 250,
      altLevelOptimalMax: 900, altLevelHigh: 1200, altLevelDangerous: 2000,
    };
    const result = applyThresholdPatch(both, { thresholdUnit: 'cfs' });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.next.levelDangerous, 2000);
    assert.equal(result.next.altLevelDangerous, 5);
  });

  it('rejects an unknown unit and unparseable numbers', () => {
    assert.equal(applyThresholdPatch(FT, { thresholdUnit: 'm' }).ok, false);
    assert.equal(applyThresholdPatch(FT, { levelHigh: 'four' }).ok, false);
  });
});
