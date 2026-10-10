import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChartReadingLike } from './chart-model';
import {
  coldWaterNote,
  forecastCrest,
  forecastCrestSentence,
  forecastDayLabel,
  recentPeak,
  recentPeakSentence,
  recentTrend,
  upcomingForecast,
} from './gauge-recent';
import { historyHasData } from './chart-model';

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

/* ── forecastCrest ────────────────────────────────────────────────────── */

function fc(hoursAhead: number, ft: number | null) {
  return { timestamp: new Date(NOW + hoursAhead * 3_600_000).toISOString(), gaugeHeightFt: ft };
}

test('a rising forecast reports its crest in feet, with the Ozarks day', () => {
  // NOW is Saturday 2026-10-10 13:00 Central.
  const crest = forecastCrest([fc(6, 3.0), fc(30, 4.6), fc(54, 3.4)], 2.5, NOW);
  assert.ok(crest);
  assert.equal(crest.valueFt, 4.6);
  assert.equal(forecastCrestSentence(crest, NOW), 'NWS forecast: crest near 4.60 ft tomorrow');
});

test('a flat, falling or past forecast says nothing', () => {
  assert.equal(forecastCrest([fc(6, 2.6), fc(30, 2.7)], 2.5, NOW), null, 'under half a foot');
  assert.equal(forecastCrest([fc(6, 2.2), fc(30, 1.9)], 2.5, NOW), null, 'falling');
  assert.equal(forecastCrest([fc(-6, 9.0)], 2.5, NOW), null, 'points already past');
  assert.equal(forecastCrest([fc(6, -9999)], 2.5, NOW), null, 'NWPS missing sentinel');
  assert.equal(forecastCrest([fc(6, 9.0)], null, NOW), null, 'no current stage to compare');
  assert.equal(forecastCrest(null, 2.5, NOW), null);
});

test('forecast days are named in Central time', () => {
  assert.equal(forecastDayLabel(new Date(NOW + 3_600_000).toISOString(), NOW), 'today');
  assert.equal(forecastDayLabel(new Date(NOW + 72 * 3_600_000).toISOString(), NOW), 'Tuesday');
  // 04:30Z Sunday is still Saturday 23:30 in Chicago.
  assert.equal(forecastDayLabel('2026-10-11T04:30:00Z', NOW), 'today');
  assert.equal(forecastDayLabel('garbage', NOW), null);
});

/* ── review follow-ups ────────────────────────────────────────────────── */

test('past forecast points are dropped before anything is said about them', () => {
  // A stale station or a cached response can carry points the route kept
  // because they were past the last OBSERVATION, not past now.
  const points = [fc(-3, 9.0), fc(-1, 8.0), fc(2, 3.0), fc(20, 3.4)];
  assert.deepEqual(upcomingForecast(points, NOW).map((p) => p.gaugeHeightFt), [3.0, 3.4]);
  assert.deepEqual(upcomingForecast(null, NOW), []);
  assert.deepEqual(upcomingForecast([{ timestamp: 'nope' }], NOW), []);
});

test('a forecast still climbing at its last point is a rise, not a crest', () => {
  const rising = forecastCrest([fc(6, 3.0), fc(30, 3.8), fc(72, 4.6)], 2.5, NOW);
  assert.ok(rising);
  assert.equal(rising.kind, 'rising');
  assert.equal(forecastCrestSentence(rising, NOW), 'NWS forecast: still rising, 4.60 ft by Tuesday');
  // Held flat to the end is not a decline either.
  assert.equal(forecastCrest([fc(6, 4.6), fc(30, 4.6)], 2.5, NOW)?.kind, 'rising');
  // Coming back down after the high point is what makes it a crest.
  assert.equal(forecastCrest([fc(6, 4.6), fc(30, 4.5)], 2.5, NOW)?.kind, 'crest');
});

test('a forecast-only history response counts as data', () => {
  // The route ships forecast-only stations with readings: [], and the
  // chart draws them; the hook was discarding them as "unavailable".
  assert.equal(historyHasData({ readings: [], forecast: [{}] }), true);
  assert.equal(historyHasData({ readings: [{}], forecast: [] }), true);
  assert.equal(historyHasData({ readings: [] }), false);
  assert.equal(historyHasData({ readings: [], forecast: null }), false);
  assert.equal(historyHasData(null), false);
});
