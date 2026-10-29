// missouri-float-planner/src/lib/hazard-report-position.test.ts
//
// Covers eddy-ios/src/lib/hazardReportPosition.ts: a hazard report is filed
// from the newest position Eddy has, whichever source measured it, and its
// age reads honestly as the sheet stays open.

import assert from 'node:assert/strict';
import test from 'node:test';
import { newestPosition, positionAgeLabel, recorderPosition } from '../../../eddy-ios/src/lib/hazardReportPosition';

const NOW = Date.parse('2026-07-04T14:00:00Z');
const phone = (at: number) => ({ latitude: 37, longitude: -91, accuracyMeters: 30, at });

test('the recorder fix wins when it is newer than the phone location', () => {
  const recorder = recorderPosition({ lngLat: [-91.1, 37.1], at: NOW - 5_000, accuracyMeters: 8 });
  const chosen = newestPosition([phone(NOW - 600_000), recorder], NOW);
  assert.deepEqual(chosen, { latitude: 37.1, longitude: -91.1, accuracyMeters: 8, at: NOW - 5_000 });
});

test('the phone location wins when it is newer than the recorder fix', () => {
  const chosen = newestPosition([phone(NOW - 2_000), recorderPosition({ lngLat: [-91.1, 37.1], at: NOW - 120_000 })], NOW);
  assert.equal(chosen?.at, NOW - 2_000);
  assert.equal(chosen?.longitude, -91);
});

test('missing, invalid, and future candidates are skipped', () => {
  assert.equal(newestPosition([null, undefined], NOW), null);
  assert.equal(newestPosition([{ ...phone(NOW), latitude: Number.NaN }], NOW), null);
  assert.equal(newestPosition([{ ...phone(NOW), longitude: 200 }], NOW), null);
  // A fix stamped an hour ahead must not beat a real one forever.
  assert.equal(newestPosition([phone(NOW + 3_600_000), phone(NOW - 60_000)], NOW)?.at, NOW - 60_000);
  // A tie keeps the first-listed source.
  const first = phone(NOW);
  assert.equal(newestPosition([first, { ...phone(NOW), longitude: -92 }], NOW), first);
  assert.equal(recorderPosition(null), null);
});

test('"just now" lasts under a minute, then the age counts up', () => {
  assert.equal(positionAgeLabel(NOW, NOW), 'just now');
  assert.equal(positionAgeLabel(NOW, NOW + 59_000), 'just now');
  assert.equal(positionAgeLabel(NOW, NOW + 60_000), 'position from 1 min ago');
  assert.equal(positionAgeLabel(NOW, NOW + 119_000), 'position from 1 min ago');
  assert.equal(positionAgeLabel(NOW, NOW + 5 * 60_000), 'position from 5 min ago');
  assert.equal(positionAgeLabel(NOW, NOW + 75 * 60_000), 'position from 1 h 15 min ago');
  // A slightly-ahead clock is not a negative age.
  assert.equal(positionAgeLabel(NOW + 5_000, NOW), 'just now');
});
