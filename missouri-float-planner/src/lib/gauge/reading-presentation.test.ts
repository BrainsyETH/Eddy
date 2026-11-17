import test from 'node:test';
import assert from 'node:assert/strict';
import { readingPresentation } from './reading-presentation';

const current = { value: 1880, ageHours: 0.5, suspect: false, hasRating: false, condition: 'unknown' as const };
test('current observations without recreation thresholds are unrated, including zero', () => {
  assert.equal(readingPresentation(current), 'unrated');
  assert.equal(readingPresentation({ ...current, value: 0 }), 'unrated');
  assert.equal(readingPresentation({ ...current, hasRating: true, condition: 'good' }), 'rated');
});
test('missing, stale and source-flagged observations never become Not rated', () => {
  assert.equal(readingPresentation({ ...current, value: null }), 'missing');
  assert.equal(readingPresentation({ ...current, value: NaN }), 'missing');
  assert.equal(readingPresentation({ ...current, ageHours: 7 }), 'stale');
  assert.equal(readingPresentation({ ...current, ageHours: null }), 'stale');
  assert.equal(readingPresentation({ ...current, suspect: true }), 'flagged');
  assert.equal(readingPresentation({ ...current, suspect: true, ageHours: 8 }), 'flagged');
});
test('official escalation is retained even when there is no recreation ladder', () => {
  assert.equal(readingPresentation({ ...current, condition: 'dangerous' }), 'rated');
  assert.equal(readingPresentation({ ...current, condition: 'dangerous', ageHours: 8 }), 'stale');
});
