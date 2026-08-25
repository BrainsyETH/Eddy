// shared/gauge-trend.test.ts
//
// The rule that decides whether a river is "Rising fast" or "Holding steady",
// pinned now that both platforms import it. Two things are load-bearing:
//
//   * the five label strings, which are rendered verbatim on the website, on the
//     river screen, on the Today rows and on the gauge chart. A reworded label
//     is a silent copy change across two apps.
//   * `windowHours`, which reports the window the function ACTUALLY found rather
//     than the one it was asked for. Callers gate on it — see the chart header
//     in eddy-ios, which refuses a comparison that drifted far from six hours —
//     so a change that started rounding or clamping it would break a guard
//     nothing else can express.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TREND_FAST_PCT,
  TREND_STEADY_PCT,
  classifyTrend,
  computeTrend,
  trendLabel,
} from './gauge-trend';
import type { ChartReadingLike } from './chart-model';

/** A reading `hoursAgo` before the fixed epoch below, in cfs. */
function cfs(hoursAgo: number, value: number | null): ChartReadingLike {
  const base = Date.parse('2026-08-24T18:00:00Z');
  return {
    timestamp: new Date(base - hoursAgo * 3_600_000).toISOString(),
    gaugeHeightFt: null,
    dischargeCfs: value,
  };
}

function ft(hoursAgo: number, value: number | null): ChartReadingLike {
  const base = Date.parse('2026-08-24T18:00:00Z');
  return {
    timestamp: new Date(base - hoursAgo * 3_600_000).toISOString(),
    gaugeHeightFt: value,
    dischargeCfs: null,
  };
}

test('the steady band is exclusive at its top and the fast band inclusive at its bottom', () => {
  // Percent of the REFERENCE value, which is the latest reading — so these are
  // deltas against 100.
  assert.equal(classifyTrend(TREND_STEADY_PCT * 100 - 0.01, 100).direction, 'steady');
  assert.equal(classifyTrend(TREND_STEADY_PCT * 100, 100).direction, 'rising');
  assert.equal(classifyTrend(TREND_STEADY_PCT * 100, 100).qualifier, 'slowly');
  assert.equal(classifyTrend(TREND_FAST_PCT * 100 - 0.01, 100).qualifier, 'slowly');
  assert.equal(classifyTrend(TREND_FAST_PCT * 100, 100).qualifier, 'fast');
});

test('a fall is classified by magnitude, not by sign of the qualifier', () => {
  assert.deepEqual(classifyTrend(-20, 100), { direction: 'falling', qualifier: 'fast' });
  assert.deepEqual(classifyTrend(-5, 100), { direction: 'falling', qualifier: 'slowly' });
  assert.equal(classifyTrend(-1, 100).direction, 'steady');
});

test('a zero reference cannot divide by zero into a false steady', () => {
  // Math.max(|ref|, 1e-6) is the guard. A river that went 0 -> 5 is rising.
  assert.equal(classifyTrend(5, 0).direction, 'rising');
});

test('the five labels are exactly these strings', () => {
  assert.equal(trendLabel('rising', 'fast'), 'Rising fast');
  assert.equal(trendLabel('rising', 'slowly'), 'Rising slowly');
  assert.equal(trendLabel('falling', 'fast'), 'Falling fast');
  assert.equal(trendLabel('falling', 'slowly'), 'Falling slowly');
  assert.equal(trendLabel('steady', null), 'Holding steady');
});

test('computeTrend reads the series as ascending and compares against ~6h back', () => {
  const trend = computeTrend([cfs(12, 800), cfs(6, 1000), cfs(0, 1300)], 'cfs');
  assert.ok(trend);
  assert.equal(trend.direction, 'rising');
  assert.equal(trend.qualifier, 'fast'); // 300/1300 = 23%
  assert.equal(trend.windowHours, 6);
  assert.equal(trend.label, 'Rising fast');
});

test('it reads the unit it is asked for, not whichever one is populated', () => {
  // A stage-only series asked for discharge has fewer than two valued readings.
  assert.equal(computeTrend([ft(6, 2), ft(0, 3)], 'cfs'), null);
  assert.equal(computeTrend([ft(6, 2), ft(0, 3)], 'ft')?.direction, 'rising');
});

test('fewer than two valued readings is null, never a guessed trend', () => {
  assert.equal(computeTrend([], 'cfs'), null);
  assert.equal(computeTrend([cfs(0, 100)], 'cfs'), null);
  assert.equal(computeTrend([cfs(6, null), cfs(0, 100)], 'cfs'), null);
  assert.equal(computeTrend(null, 'cfs'), null);
  assert.equal(computeTrend(undefined, 'cfs'), null);
});

test('windowHours reports the window FOUND, which is what lets a caller refuse it', () => {
  // A dense series pins the comparison at the target rather than at the first row.
  const dense = computeTrend(
    [cfs(24, 400), cfs(12, 600), cfs(6, 900), cfs(1, 950), cfs(0, 1000)],
    'cfs',
  );
  assert.equal(dense?.windowHours, 6);

  // A gappy one stretches, and says so rather than pretending to six hours.
  const stretched = computeTrend([cfs(11, 500), cfs(0, 1000)], 'cfs');
  assert.equal(stretched?.windowHours, 11);
  assert.equal(stretched?.label, 'Rising fast');
});

test('KNOWN TRAP: past a 12h gap the latest reading becomes its own comparison', () => {
  // ── This is a real defect in the shipped rule, pinned rather than fixed ────
  //
  // The search is "nearest reading to t-6h" with no floor on how near that has
  // to be, and the LATEST reading is itself a candidate. It sits 6h from the
  // target; any other reading more than 12h old sits further. So once the
  // second-newest reading passes 12h, the latest wins, gets compared against
  // itself, and a river that doubled reports "Holding steady" with delta 0.
  //
  // The cliff is exactly 12h:
  assert.equal(computeTrend([cfs(12, 500), cfs(0, 1000)], 'cfs')?.label, 'Rising fast');
  assert.equal(computeTrend([cfs(13, 500), cfs(0, 1000)], 'cfs')?.label, 'Holding steady');
  //
  // It bites hardest on a station that stopped reporting — the moment a reader
  // most needs to be told Eddy cannot say. Not fixed here because all eleven
  // web call sites take this function's output unguarded, and changing the
  // shape of a false steady into a null is a behaviour change across the
  // website that belongs in its own diff.
  //
  // What makes it safe on the gauge chart is that the false steady is ALWAYS
  // reported as a 1h window (the latest against itself is a zero-length
  // window, floored to 1), so the caller-side check in
  // eddy-ios/src/components/GaugeChart.tsx — drop any pill whose window drifted
  // more than three hours from six — rejects every instance of it.
  const falseSteady = computeTrend([cfs(30, 500), cfs(0, 1000)], 'cfs');
  assert.equal(falseSteady?.windowHours, 1);
  assert.ok(Math.abs((falseSteady?.windowHours ?? 0) - 6) > 3, 'the chart guard must reject this');
});

test('windowHours floors at 1 so a sub-hourly pair never reports a zero window', () => {
  const trend = computeTrend([cfs(0.25, 900), cfs(0, 1000)], 'cfs', 0.25);
  assert.equal(trend?.windowHours, 1);
});
