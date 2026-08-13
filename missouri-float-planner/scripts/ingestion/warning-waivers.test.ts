// The waiver list is only useful if expiry actually expires.
//
// Everything here guards one idea: a waiver is a dated decision, not a
// permanent exemption. If `reviewBy` silently stopped being honoured, the list
// would quietly become the "no warnings" rule it replaced — except worse,
// because it would look like oversight was happening.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WARNING_WAIVERS,
  expiredWaivers,
  isWaived,
  type WarningWaiver,
} from './warning-waivers';

const SAMPLE: WarningWaiver[] = [
  {
    riverSlug: 'white-river-bull-shoals',
    checkName: 'missing_weather_point',
    reason: 'weather point pending the access-point pass',
    owner: 'evan',
    reviewBy: '2026-10-01',
  },
];

test('a live waiver suppresses its own warning and nothing else', () => {
  const today = '2026-08-13';
  assert.ok(isWaived('white-river-bull-shoals', 'missing_weather_point', today, SAMPLE));
  assert.equal(isWaived('white-river-bull-shoals', 'missing_alert_terms', today, SAMPLE), null);
  assert.equal(isWaived('buffalo', 'missing_weather_point', today, SAMPLE), null);
});

test('a waiver stops suppressing the day after its review date', () => {
  // The mechanism. On review day it still holds; the day after, the warning is
  // back and someone has to decide again.
  assert.ok(isWaived('white-river-bull-shoals', 'missing_weather_point', '2026-10-01', SAMPLE));
  assert.equal(
    isWaived('white-river-bull-shoals', 'missing_weather_point', '2026-10-02', SAMPLE),
    null,
    'an expired waiver must not suppress its warning',
  );
});

test('expired waivers are reported even when their warning no longer fires', () => {
  assert.deepEqual(expiredWaivers('2026-08-13', SAMPLE), []);
  assert.equal(expiredWaivers('2027-01-01', SAMPLE).length, 1);
});

test('every committed waiver is complete and dated', () => {
  // A waiver missing its reason or owner is a suppression with no author, which
  // is the thing this file exists to make impossible.
  for (const w of WARNING_WAIVERS) {
    const where = `${w.riverSlug}/${w.checkName}`;
    assert.ok(w.reason.trim().length > 10, `${where}: reason is too thin to be a reason`);
    assert.ok(w.owner.trim().length > 0, `${where}: no owner — there is nobody to ask`);
    assert.match(w.reviewBy, /^\d{4}-\d{2}-\d{2}$/, `${where}: reviewBy must be an ISO date`);
  }
});

test('no two waivers cover the same river and check', () => {
  const seen = new Set<string>();
  for (const w of WARNING_WAIVERS) {
    const key = `${w.riverSlug}::${w.checkName}`;
    assert.ok(!seen.has(key), `duplicate waiver for ${key} — the later one would be dead code`);
    seen.add(key);
  }
});
