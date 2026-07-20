import assert from 'node:assert/strict';
import test from 'node:test';
import { conditionSnapshotMatches } from './condition-snapshot';

test('rejects stale cfs prose even inside the same condition band', () => {
  assert.equal(
    conditionSnapshotMatches(
      { conditionCode: 'good', gaugeHeightFt: 2.1, dischargeCfs: 314 },
      { conditionCode: 'good', gaugeHeightFt: 2.0, dischargeCfs: 291 },
      'cfs',
    ),
    false,
  );
});

test('rejects prose when the exact condition changes', () => {
  assert.equal(
    conditionSnapshotMatches(
      { conditionCode: 'flowing', gaugeHeightFt: 2.1, dischargeCfs: 314 },
      { conditionCode: 'good', gaugeHeightFt: 2.1, dischargeCfs: 314 },
      'cfs',
    ),
    false,
  );
});

test('accepts a snapshot at the precision displayed to users', () => {
  assert.equal(
    conditionSnapshotMatches(
      { conditionCode: 'flowing', gaugeHeightFt: 2.14, dischargeCfs: 314.2 },
      { conditionCode: 'flowing', gaugeHeightFt: 2.13, dischargeCfs: 314.4 },
      'cfs',
    ),
    true,
  );
});

test('fails closed when the primary reading is unavailable', () => {
  assert.equal(
    conditionSnapshotMatches(
      { conditionCode: 'flowing', gaugeHeightFt: null, dischargeCfs: null },
      { conditionCode: 'flowing', gaugeHeightFt: null, dischargeCfs: null },
      'ft',
    ),
    false,
  );
});
