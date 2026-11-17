import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPrompt, type GaugeContext } from './build-update-prompt';
import { buildReportFacts } from './report-facts';
import { spanDays } from './trajectory-window';
import type { GaugeTrajectory } from './gauge-trajectory';
import type { UpdateTarget } from '../../data/river-sections';

const target: UpdateTarget = {
  riverSlug: 'jacks-fork', riverName: 'Jacks Fork', sectionSlug: null,
  sectionName: null, sectionDescription: null, sectionRiverType: null,
  sectionLowWaterMeaning: null, sectionRisingWaterHazards: null,
};
const gauge: GaugeContext = {
  facts: buildReportFacts({
    gaugeName: 'Jacks Fork at Alley Spring', gaugeHeightFt: 2.41, dischargeCfs: 410,
    thresholds: { levelTooLow: null, levelLow: null, levelOptimalMin: null,
      levelOptimalMax: null, levelHigh: null, levelDangerous: null },
  }),
  readingTimestamp: null, notes: null,
};
const trajectory = (windowDays: number): GaugeTrajectory => ({
  change24h: -0.2, change6h: -0.1, rateFtPerHour: -0.02, acceleration: 'steady',
  windowDays,
  windowPeak: { heightFt: 4.6, timestamp: '2026-11-10T06:00:00Z' },
  windowLow: { heightFt: 2.3, timestamp: '2026-11-15T06:00:00Z' },
  currentHeightFt: 2.41, narrative: 'Gauge fell from 2.6 to 2.4 ft over the past 24 hours.',
  percentileContext: null, percentile: null, stats: null,
});

// The block was headed "[10-DAY GAUGE TRAJECTORY]", labelled its peak "5-day",
// and took both from fields named for 48 hours, under a system prompt saying
// the trend covered "roughly the past day". Four windows for one number.
test('the peak and low are labelled with the window they were taken over', () => {
  const prompt = buildPrompt(target, gauge, null, null, [], '', trajectory(10));
  assert.match(prompt, /\[GAUGE TRAJECTORY\]/);
  assert.match(prompt, /^10-day peak: 4\.6 ft$/m);
  assert.match(prompt, /^10-day low: 2\.3 ft$/m);
  assert.doesNotMatch(prompt, /5-day|10-DAY|48h/);
});

test('a shorter history is labelled as shorter, not as the requested window', () => {
  const prompt = buildPrompt(target, gauge, null, null, [], '', trajectory(3));
  assert.match(prompt, /^3-day peak: 4\.6 ft$/m);
  assert.doesNotMatch(prompt, /10-day/);
});

test('spanDays measures what came back', () => {
  const at = (iso: string) => ({ timestamp: iso });
  assert.equal(spanDays([at('2026-11-06T12:00:00Z'), at('2026-11-11T00:00:00Z'), at('2026-11-16T12:00:00Z')]), 10);
  assert.equal(spanDays([at('2026-11-13T12:00:00Z'), at('2026-11-16T11:00:00Z')]), 3);
  // Never zero: a "0-day peak" is not a label, and one reading has no span.
  assert.equal(spanDays([at('2026-11-16T10:00:00Z'), at('2026-11-16T12:00:00Z')]), 1);
  assert.equal(spanDays([at('2026-11-16T12:00:00Z')]), 1);
  assert.equal(spanDays([]), 1);
  // An unparseable timestamp is ignored rather than turning the span to NaN.
  assert.equal(spanDays([at('not a date'), at('2026-11-14T12:00:00Z'), at('2026-11-16T12:00:00Z')]), 2);
});
