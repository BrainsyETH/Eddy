// Guards the F09 audit fix: cross-river counts must come from ONE calculation,
// and positive "floatable" language must never absorb high/dangerous water.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FLOATABLE_NOW,
  WEEKEND_FLOATABLE,
  summarizeConditionCounts,
} from './condition-system';

test('FLOATABLE_NOW is strictly positive — no caution or unknown codes', () => {
  assert.deepEqual([...FLOATABLE_NOW].sort(), ['flowing', 'good']);
  for (const caution of ['high', 'dangerous', 'low', 'too_low', 'unknown']) {
    assert.equal(FLOATABLE_NOW.has(caution), false, `${caution} must not count as floatable`);
  }
});

test('FLOATABLE_NOW is a subset of WEEKEND_FLOATABLE (featuring may be broader, never stricter)', () => {
  for (const code of FLOATABLE_NOW) {
    assert.ok(WEEKEND_FLOATABLE.has(code), `${code} should also be feature-worthy`);
  }
});

test('summarizeConditionCounts buckets match the audit taxonomy', () => {
  const counts = summarizeConditionCounts([
    'flowing', 'flowing', 'good',        // positive
    'high', 'dangerous',                 // running high
    'low', 'too_low',                    // running low
    'unknown', null, undefined, 'bogus', // no bucket
  ]);

  assert.equal(counts.total, 11);
  assert.equal(counts.floatableNow, 3, 'floatableNow = flowing + good only');
  assert.equal(counts.runningHigh, 2, 'runningHigh = high + dangerous');
  assert.equal(counts.runningLow, 2, 'runningLow = low + too_low');
  assert.equal(counts.byCode.unknown, 4, 'null/undefined/unrecognized count as unknown');

  // A river can never be in both a positive and a caution bucket.
  assert.equal(
    counts.floatableNow + counts.runningHigh + counts.runningLow + counts.byCode.unknown,
    counts.total,
  );
});

test('summarizeConditionCounts handles an empty list', () => {
  const counts = summarizeConditionCounts([]);
  assert.equal(counts.total, 0);
  assert.equal(counts.floatableNow, 0);
  assert.equal(counts.runningHigh, 0);
  assert.equal(counts.runningLow, 0);
});
