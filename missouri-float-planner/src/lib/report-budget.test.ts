import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FINGERPRINT_COOLDOWN_MS,
  GLOBAL_CAP_PER_MINUTE,
  createReportBudget,
  fingerprintOf,
  shouldReport,
} from '../../../eddy-ios/src/lib/report-budget';

const T0 = 1_000_000;

test('the first occurrence of anything is always reported', () => {
  // The one event worth having above all others. A budget that could suppress a
  // first sighting would defeat its own purpose.
  const b = createReportBudget();
  assert.equal(shouldReport(b, 'map:Mapbox failed to load', T0), true);
});

test('the same failure is suppressed for the cooldown and allowed after it', () => {
  // THE bug this exists to prevent. A build shipped without
  // EXPO_PUBLIC_MAPBOX_TOKEN logs on every map open; unthrottled, a handful of
  // testers exhaust a 5,000/month quota in a day and every real crash after
  // that is dropped by the server.
  const b = createReportBudget();
  const fp = 'map:Mapbox failed to load';

  assert.equal(shouldReport(b, fp, T0), true);
  assert.equal(shouldReport(b, fp, T0 + 1), false);
  assert.equal(shouldReport(b, fp, T0 + FINGERPRINT_COOLDOWN_MS - 1), false);
  assert.equal(shouldReport(b, fp, T0 + FINGERPRINT_COOLDOWN_MS), true);
});

test('a different failure is not suppressed by an unrelated one', () => {
  // Per-fingerprint, not global-only. A looping map error must not hide the
  // first sighting of a push failure.
  const b = createReportBudget();
  assert.equal(shouldReport(b, 'map:Mapbox failed to load', T0), true);
  assert.equal(shouldReport(b, 'push:could not obtain a token', T0), true);
});

test('the global cap holds even when every failure is distinct', () => {
  // The per-fingerprint cooldown alone is no defence against a storm of unique
  // messages — an error whose text carries a slug would be a new fingerprint
  // every time. The cap is the backstop.
  const b = createReportBudget();
  for (let i = 0; i < GLOBAL_CAP_PER_MINUTE; i++) {
    assert.equal(shouldReport(b, `map:distinct ${i}`, T0), true);
  }
  assert.equal(shouldReport(b, 'map:distinct overflow', T0), false);
});

test('the global cap resets on the next minute', () => {
  // A cap that never reopened would silence the app permanently after one busy
  // minute — worse than no reporting, because it looks like it is working.
  const b = createReportBudget();
  for (let i = 0; i < GLOBAL_CAP_PER_MINUTE; i++) shouldReport(b, `map:distinct ${i}`, T0);

  assert.equal(shouldReport(b, 'map:after', T0 + 59_999), false);
  assert.equal(shouldReport(b, 'map:after', T0 + 60_000), true);
});

test('the fingerprint map does not grow without bound', () => {
  // A message carrying a river slug or a pack name mints a fingerprint per
  // occurrence. On a long-lived process that map is a leak.
  const b = createReportBudget();
  for (let i = 0; i < 700; i++) {
    // Step a full minute each time so the global cap never intervenes.
    shouldReport(b, `map:unique ${i}`, T0 + i * 60_000);
  }
  assert.ok(
    b.lastSentByFingerprint.size <= 500,
    `dedup map grew to ${b.lastSentByFingerprint.size}`,
  );
});

test('a fingerprint is the tag and message only, never the detail', () => {
  // If the varying part were included, every occurrence would be its own
  // fingerprint and the cooldown would never fire — the budget would look
  // present and do nothing.
  assert.equal(fingerprintOf('map', 'could not read offline packs'), 'map:could not read offline packs');

  const b = createReportBudget();
  const fp = fingerprintOf('map', 'could not read offline packs');
  assert.equal(shouldReport(b, fp, T0), true);
  assert.equal(shouldReport(b, fp, T0 + 1), false);
});
