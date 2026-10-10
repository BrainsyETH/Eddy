import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChartReadingLike } from './chart-model';
import {
  coldWaterNote,
  recentPeak,
  recentPeakSentence,
  recentTrend,
} from './gauge-recent';

const NOW = Date.parse('2026-10-10T18:00:00Z');

function at(hoursAgo: number, cfs: number | null, ft: number | null = null): ChartReadingLike {
  return {
    timestamp: new Date(NOW - hoursAgo * 3_600_000).toISOString(),
    dischargeCfs: cfs,
    gaugeHeightFt: ft,
  };
}

/** Hourly readings over `hours`, oldest first, from a function of hours-ago. */
function hourly(hours: number, cfs: (hoursAgo: number) => number): ChartReadingLike[] {
  const out: ChartReadingLike[] = [];
  for (let h = hours; h >= 0; h--) out.push(at(h, cfs(h)));
  return out;
}

/* ── recentTrend ──────────────────────────────────────────────────────── */

test('a recent hourly series yields the six-hour trend', () => {
  const trend = recentTrend(hourly(48, (h) => 300 + (48 - h) * 10), 'cfs', NOW);
  assert.ok(trend);
  assert.equal(trend.direction, 'rising');
  assert.equal(trend.windowHours, 6);
});

test('no trend when the newest reading is hours old', () => {
  // The station's current reading can be live while the series request lags.
  const stale = hourly(48, () => 300).map((r) => ({
    ...r,
    timestamp: new Date(Date.parse(r.timestamp) - 5 * 3_600_000).toISOString(),
  }));
  assert.equal(recentTrend(stale, 'cfs', NOW), null);
});

test('no trend across a gap that leaves nothing near six hours back', () => {
  // computeTrend would compare the latest reading with itself and say
  // "Holding steady" over a 1h window; the window guard refuses it.
  const gapped = [at(30, 200), at(29, 210), at(1, 900), at(0, 950)];
  assert.equal(recentTrend(gapped, 'cfs', NOW), null);
});

test('no trend in a unit the series does not carry', () => {
  assert.equal(recentTrend(hourly(48, () => 300), 'ft', NOW), null);
  assert.equal(recentTrend([], 'cfs', NOW), null);
  assert.equal(recentTrend(null, 'cfs', NOW), null);
});

/* ── recentPeak ───────────────────────────────────────────────────────── */

test('a rise and fall reports the crest and how long ago it was', () => {
  // Base 250, crest of 1,100 three days ago, back to ~260 now.
  const series = hourly(168, (h) => (h === 72 ? 1100 : h > 72 ? 250 : 260));
  const peak = recentPeak(series, 'cfs', NOW);
  assert.ok(peak);
  assert.equal(peak.value, 1100);
  assert.equal(Math.round(peak.hoursAgo), 72);
  assert.equal(recentPeakSentence(peak), 'Peaked 3 days ago at 1,100 cfs');
});

test('a river falling all week has no crest to report', () => {
  // Its highest reading is the first one — the window opened on the way down.
  assert.equal(recentPeak(hourly(168, (h) => 200 + h * 5), 'cfs', NOW), null);
});

test('a river at its highest right now has no crest yet', () => {
  assert.equal(recentPeak(hourly(168, (h) => 1000 - h * 4), 'cfs', NOW), null);
});

test('a crest still within six hours is the trend, not a peak', () => {
  const series = hourly(48, (h) => (h === 3 ? 900 : 300));
  assert.equal(recentPeak(series, 'cfs', NOW), null);
});

test('small wiggles are not crests', () => {
  // 15% up and back: under the 25% discharge line.
  assert.equal(recentPeak(hourly(168, (h) => (h === 80 ? 345 : 300)), 'cfs', NOW), null);
});

test('stage crests are measured in feet, not percent', () => {
  // 2.5 ft → 2.9 ft is +16% but only 0.4 ft: not a crest.
  const small = [at(100, null, 2.5), at(80, null, 2.9), at(0, null, 2.5)];
  assert.equal(recentPeak(small, 'ft', NOW), null);
  // 2.5 ft → 3.2 ft is a crest, and prints at stage precision.
  const real = [at(100, null, 2.5), at(50, null, 3.2), at(0, null, 2.55)];
  const peak = recentPeak(real, 'ft', NOW);
  assert.ok(peak);
  assert.equal(recentPeakSentence(peak), 'Peaked 2 days ago at 3.20 ft');
});

test('peak phrasing uses elapsed time', () => {
  const peak = (hoursAgo: number) => ({ value: 500, unit: 'cfs' as const, at: '', hoursAgo });
  assert.equal(recentPeakSentence(peak(9.4)), 'Peaked 9 hours ago at 500 cfs');
  assert.equal(recentPeakSentence(peak(30)), 'Peaked about a day ago at 500 cfs');
  assert.equal(recentPeakSentence(peak(100)), 'Peaked 4 days ago at 500 cfs');
  assert.equal(recentPeakSentence(null), null);
});

/* ── coldWaterNote ────────────────────────────────────────────────────── */

test('cold water below 60°F gets a note, warm water does not', () => {
  const observedAt = new Date(NOW - 2 * 3_600_000).toISOString();
  assert.match(coldWaterNote({ valueF: 54.4, observedAt }, NOW) ?? '', /^Cold water: 54°F\./);
  assert.equal(coldWaterNote({ valueF: 60, observedAt }, NOW), null);
  assert.equal(coldWaterNote({ valueF: 71, observedAt }, NOW), null);
});

test('a stale or missing temperature says nothing', () => {
  const lastWeek = new Date(NOW - 30 * 3_600_000).toISOString();
  assert.equal(coldWaterNote({ valueF: 45, observedAt: lastWeek }, NOW), null);
  assert.equal(coldWaterNote({ valueF: 45, observedAt: 'not a date' }, NOW), null);
  assert.equal(coldWaterNote({ valueF: Number.NaN, observedAt: new Date(NOW).toISOString() }, NOW), null);
  assert.equal(coldWaterNote(null, NOW), null);
});
