import assert from 'node:assert/strict';
import test from 'node:test';
import { isSteady, seasonPhrase, seasonPromptLines, trendPromptLines } from './trend-lines';
import type { GaugeTrajectory } from './gauge-trajectory';

const trajectory = (over: Partial<GaugeTrajectory> = {}): GaugeTrajectory => ({
  change24h: 0, change6h: 0, rateFtPerHour: 0, acceleration: 'steady',
  windowDays: 10,
  windowPeak: { heightFt: 2.7, timestamp: '2026-11-10T06:00:00Z' },
  windowLow: { heightFt: 2.6, timestamp: '2026-11-15T06:00:00Z' },
  currentHeightFt: 2.6,
  narrative: 'Gauge has held steady near 2.6 ft over the past 24 hours, now holding steady.',
  percentileContext: 'Current discharge of 756 cfs is at the 18th percentile for this date. Median: 1,150 cfs (104 years of record).',
  percentile: 18, stats: null,
  ...over,
});

// On 2026-11-19, 41 of 46 Reads told the reader the gauge had held steady for
// 24 hours. Each had been handed five lines about a gauge that had not moved.
test('a gauge that has not moved is one line, with no numbers to narrate', () => {
  assert.equal(isSteady(trajectory()), true);
  assert.deepEqual(trendPromptLines(trajectory()), ['[GAUGE TRAJECTORY]', 'Steady: no meaningful change over the past 24 hours.']);
  assert.deepEqual(trendPromptLines(null), []);
});

test('a steady gauge still reports a crest it has come down from', () => {
  const lines = trendPromptLines(trajectory({ windowPeak: { heightFt: 4.6, timestamp: '2026-11-12T06:00:00Z' } }));
  assert.deepEqual(lines, ['[GAUGE TRAJECTORY]', 'Steady: no meaningful change over the past 24 hours.', '10-day peak: 4.6 ft']);
});

test('a gauge that moved gets the measured changes, the window and the summary', () => {
  const falling = trajectory({
    change24h: -0.4, change6h: -0.1, rateFtPerHour: -0.06, acceleration: 'falling but slowing', currentHeightFt: 2.6,
    narrative: 'Gauge fell from 3.0 to 2.6 ft over the past 24 hours.',
  });
  assert.equal(isSteady(falling), false);
  assert.deepEqual(trendPromptLines(falling), [
    '[GAUGE TRAJECTORY]',
    '24h change: -0.4 ft (was 3.0 ft yesterday)',
    '6h change: -0.1 ft',
    'Rate: falling but slowing at 0.06 ft/hr',
    '10-day peak: 2.7 ft',
    '10-day low: 2.6 ft',
    'Summary: Gauge fell from 3.0 to 2.6 ft over the past 24 hours.',
  ]);
  // A fast six hours is movement even when the day nets out flat.
  assert.equal(isSteady(trajectory({ change24h: 0.05, change6h: 0.3 })), false);
  assert.equal(isSteady(trajectory({ change24h: null })), false);
});

test('the season is a plain line with no number, and only when it is worth one', () => {
  // Far outside the usual: any rating.
  assert.equal(seasonPhrase(trajectory({ percentile: 4 }), 'good'), 'far lower than usual for this time of year');
  assert.equal(seasonPhrase(trajectory({ percentile: 96 }), 'flowing'), 'far higher than usual for this time of year');
  // Ordinary low flow on a river that floats: not news.
  assert.equal(seasonPhrase(trajectory({ percentile: 18 }), 'good'), null);
  assert.equal(seasonPhrase(trajectory({ percentile: 50 }), 'flowing'), null);
  // A river that is too low and usually is, this time of year: worth knowing.
  assert.match(seasonPhrase(trajectory({ percentile: 50 }), 'too_low') ?? '', /about normal for this time of year/);
  assert.equal(seasonPhrase(trajectory({ percentile: 18 }), 'too_low'), null);
  assert.equal(seasonPhrase(trajectory({ percentile: null }), 'too_low'), null);
  assert.equal(seasonPhrase(null, 'too_low'), null);

  assert.deepEqual(seasonPromptLines(trajectory({ percentile: 4 }), 'low'), ['[SEASON]', 'The flow at this gauge is far lower than usual for this time of year.']);
  assert.deepEqual(seasonPromptLines(trajectory({ percentile: 40 }), 'good'), []);
  // The percentile, the median and the years of record never reach the prompt.
  for (const line of [...trendPromptLines(trajectory({ percentile: 4 })), ...seasonPromptLines(trajectory({ percentile: 4 }), 'low')]) {
    assert.doesNotMatch(line, /percentile|Median|years of record|cfs/);
  }
});
