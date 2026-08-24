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

function cfs(hoursAgo: number, value: number): ChartReadingLike {
  const base = Date.parse('2026-08-24T18:00:00Z');
  return {
    timestamp: new Date(base - hoursAgo * 3_600_000).toISOString(),
    gaugeHeightFt: null,
    dischargeCfs: value,
  };
}

test('the 30-day range computes no trend at all', () => {
  // Not "computes one and hides it" — the month view downsamples by keeping
  // each bucket's min and max, so the point nearest six hours back is a local
  // extremum and there is nothing honest to derive.
  assert.match(
    CHART,
    /days === 30 \|\| !history \? null : computeTrend\(/,
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
