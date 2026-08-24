// src/lib/gauge/chart-trend-guard.test.ts
//
// The gauge chart's trend pill, and the two things that must stop it appearing.
// Source-reading, because the guard lives in a React component eddy-ios has no
// runner for — the same instrument chart-parity.test.ts uses one folder over,
// and for the same reason.
//
// Both rules exist because computeTrend answers from whatever it can find. It
// is not wrong to do that — the website wants an answer — but a chart header
// that states a six-hour trend has to actually have six hours behind it.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { computeTrend } from '@shared/gauge-trend';
import type { ChartReadingLike } from '@shared/chart-model';

const CHART = readFileSync(join(process.cwd(), '../eddy-ios/src/components/GaugeChart.tsx'), 'utf8');
const HOOK = readFileSync(join(process.cwd(), '../eddy-ios/src/hooks/useGaugeHistory.ts'), 'utf8');

function cfs(hoursAgo: number, value: number): ChartReadingLike {
  const base = Date.parse('2026-08-24T18:00:00Z');
  return {
    timestamp: new Date(base - hoursAgo * 3_600_000).toISOString(),
    gaugeHeightFt: null,
    dischargeCfs: value,
  };
}

/* ── The series in hand is not always the series that was asked for ─────── */

test('BEHAVIOUR: a 30-day-shaped series slips through the window check', () => {
  // ── THE ASSERTION THAT WOULD HAVE CAUGHT THE BUG ────────────────────────
  // The first version of this guard was `days === 30` alone, on the assumption
  // that if a month of data ever reached computeTrend the |windowHours - 6| <= 3
  // check would reject it. It does not, and this is why.
  //
  // A 30-day response is capped at 360 points and split per unit, so ~2-4h
  // between retained points. The reading nearest six hours back therefore lands
  // ON six hours, and the window check waves it through — computed against a
  // bucket extremum rather than a representative reading.
  const monthly: ChartReadingLike[] = [];
  for (let h = 720; h >= 0; h -= 3) monthly.push(cfs(h, 500 + (h % 6 === 0 ? 300 : 0)));

  const trend = computeTrend(monthly, 'cfs');
  assert.ok(trend, 'a month of 3-hourly points still produces a trend');
  assert.ok(
    Math.abs(trend.windowHours - 6) <= 3,
    'the window check does NOT reject a 30-day series — only the range gate can',
  );
});

test('the hook aborts before the cache-hit path can return', () => {
  // The bug: the hit returned while an older request was still live, and the
  // orphan overwrote state when it landed. Resting result was a range naming
  // one window while holding another, with loading false and failed false.
  const load = HOOK.slice(HOOK.indexOf('const load = useCallback'));
  const abortAt = load.indexOf('inFlight.current?.abort()');
  const cacheHitAt = load.indexOf('if (cache.current.has(key))');
  assert.ok(abortAt !== -1 && cacheHitAt !== -1, 'the load callback lost a landmark');
  assert.ok(
    abortAt < cacheHitAt,
    'useGaugeHistory aborts the in-flight request AFTER the cache-hit return again',
  );
});

test('a response for a superseded pairing never reaches the screen', () => {
  assert.match(
    HOOK,
    /currentKey\.current !== key\) return;/,
    'useGaugeHistory no longer discards a late response for a stale pairing',
  );
  assert.match(HOOK, /currentKey\.current = key;/, 'useGaugeHistory no longer records the request');
});

test('the hook says which station and window it is actually holding', () => {
  for (const field of ['historySiteId', 'historyDays', 'matchesRequest']) {
    assert.ok(HOOK.includes(field), `useGaugeHistory no longer exposes ${field}`);
  }
  // matchesRequest must test BOTH axes: a stale series from another station at
  // the same range would otherwise pass, and draw station A's water under
  // station B's name.
  assert.match(HOOK, /state\.historySiteId === siteId/, 'matchesRequest stopped checking station');
  assert.match(HOOK, /state\.historyDays === days/, 'matchesRequest stopped checking range');
});

test('the trend requires the series it was handed to be the one asked for', () => {
  assert.match(
    CHART,
    /!matchesRequest \|\| !history \|\| days === 30/,
    'the trend is testing the requested range again instead of the delivered one',
  );
});

test('everything that DESCRIBES the series reads the drawn range, not the request', () => {
  assert.match(CHART, /const drawnDays = historyDays \?\? days;/, 'drawnDays is gone');

  // The subtitle, the axis tick format and the spoken summary. Each printed a
  // claim about a window it was not drawing.
  assert.match(CHART, /drawnDays === 1 \? '24 hours'/, 'the subtitle reads the request again');
  assert.match(CHART, /axisTime\(tick\.value, drawnDays\)/, 'the axis reads the request again');
  assert.match(CHART, /drawnDays === 1 \? 'last 24 hours'/, 'VoiceOver reads the request again');

  // And none of them may go back to bare `days`.
  assert.ok(!/\{days === 1 \? '24 hours'/.test(CHART), 'the subtitle is back on days');
  assert.ok(!/axisTime\(tick\.value, days\)/.test(CHART), 'the axis is back on days');
});

test('the range strip still follows the reader, not the data', () => {
  // The one thing that must NOT track the delivered range. It shows what you
  // chose; a control that re-selects itself from arriving data is a control
  // nobody can trust.
  assert.match(CHART, /const active = r\.days === days;/, 'the range strip started following data');
});

/* ── The 30-day exclusion and the window check ───────────────────────────── */

test('the 30-day range computes no trend at all', () => {
  // Not "computes one and hides it" — the month view downsamples by keeping
  // each bucket's min and max, so the point nearest six hours back is a local
  // extremum and there is nothing honest to derive.
  assert.match(
    CHART,
    /days === 30\s*\n?\s*\? null\s*\n?\s*: computeTrend\(/,
    'the gauge chart no longer excludes the 30-day range from the trend',
  );
});

test('a window more than three hours off six is dropped', () => {
  assert.match(
    CHART,
    /Math\.abs\(trend\.windowHours - 6\) <= 3 \? trend : null/,
    'the gauge chart no longer checks the window computeTrend actually found',
  );
});

test('the guard rejects the false steady a stalled station produces', () => {
  // Past a 12h gap computeTrend compares the latest reading against itself and
  // calls a doubled river "Holding steady". It always reports that as a 1h
  // window, which is what makes it catchable from the outside.
  const stalled = computeTrend([cfs(30, 500), cfs(0, 1000)], 'cfs');
  assert.equal(stalled?.label, 'Holding steady');
  assert.equal(stalled?.windowHours, 1);
  assert.ok(Math.abs((stalled?.windowHours ?? 0) - 6) > 3, 'the chart guard must drop this');
});

test('the guard keeps an ordinary reading, and a mildly stretched one', () => {
  const dense = computeTrend([cfs(24, 400), cfs(12, 600), cfs(6, 900), cfs(0, 1000)], 'cfs');
  assert.equal(dense?.windowHours, 6);
  assert.ok(Math.abs((dense?.windowHours ?? 0) - 6) <= 3);

  // 9h is the far edge of the tolerance and is still shown: a station on an
  // hourly cadence with one missed poll must not lose its trend.
  const stretched = computeTrend([cfs(9, 500), cfs(0, 1000)], 'cfs');
  assert.equal(stretched?.windowHours, 9);
  assert.ok(Math.abs((stretched?.windowHours ?? 0) - 6) <= 3);
});

test('the pill is on the title row, which the scrub readout does not replace', () => {
  // The subtitle is swapped for the scrub readout while a finger is on the
  // plot. A trend rendered there would disappear at exactly the moment the
  // reader is interrogating the line.
  assert.match(CHART, /styles\.titleRow/, 'the trend pill left the title row');
  const titleRow = CHART.slice(CHART.indexOf('styles.titleRow'));
  assert.ok(
    titleRow.indexOf('TrendPill') < titleRow.indexOf('styles.subtitle'),
    'the trend pill is no longer rendered inside the title row',
  );
});

test('the six-hour window is fixed, never scaled to the selected range', () => {
  // computeTrend's third argument is the target window. Passing `days` into it
  // would make the badge mean something different at each zoom level.
  assert.ok(
    !/computeTrend\([^)]*,\s*(days|days\s*\*)/.test(CHART),
    'the gauge chart is scaling its trend window to the selected range',
  );
});
