import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildPrompt, type GaugeContext } from './build-update-prompt';
import { buildGaugePrompt } from './build-gauge-prompt';
import { likelyRainDays, materialOutlookLines } from './material-outlook';
import type { ForecastData, WeatherData } from '../weather/openweather';
import { buildReportFacts } from './report-facts';
import { spanDays } from './trajectory-window';
import type { GaugeTrajectory } from './gauge-trajectory';
import type { UpdateTarget } from '../../data/river-sections';
import { GAUGE_READ_BRIEF, RIVER_READ_BRIEF } from './read-brief';

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

// ── weather belongs in the Weather section ──────────────────────────
// Owner's rule, 2026-11-18. The Read is stored for the day; the app's Watch
// for section is rebuilt on every view. So the prompt carries no weather, and
// the days ahead only when rain is likely.

const NOW = new Date('2026-11-18T15:00:00Z'); // a Wednesday morning, Central
const day = (date: string, dayOfWeek: string, precipitation: number) => ({
  date, dayOfWeek, tempHigh: 58, tempLow: 34, condition: 'Clear', conditionIcon: '01d', precipitation, windSpeed: 6, humidity: 40,
});
const forecast = (chances: [number, number, number]): ForecastData => ({
  city: 'Eminence',
  days: [day('2026-11-18', 'Wed', chances[0]), day('2026-11-19', 'Thu', chances[1]), day('2026-11-20', 'Fri', chances[2])],
});
const weather = { temp: 51, condition: 'Clear', conditionIcon: '01d', windSpeed: 6, windDirection: 180, humidity: 40, city: 'Eminence', rain1hInches: 0, rain3hInches: 0 } as WeatherData;

test('the prompt carries no current weather and no forecast', () => {
  const prompt = buildPrompt(target, gauge, weather, forecast([0, 10, 60]), [], '', trajectory(10));
  assert.doesNotMatch(prompt, /Current weather|3-DAY FORECAST|°F|wind \d|humidity|\[OUTLOOK\]/);
  // Measured rain is river news and stays, with the place it was measured.
  const wet = buildPrompt(target, gauge, weather, null, [], '', null, { rain1h: 0.2, rain3h: 0.5 } as never);
  assert.match(wet, /\[RECENT PRECIPITATION\][\s\S]*Measured at Eminence/);
});

test('rain that is likely is named by day, at the threshold the Watch for section uses', () => {
  assert.deepEqual(likelyRainDays(forecast([10, 69, 20]), NOW), []);
  assert.deepEqual(likelyRainDays(forecast([70, 10, 85]), NOW), ['today', 'Friday']);
  assert.deepEqual(likelyRainDays(forecast([0, 90, 0]), NOW), ['tomorrow']);
  assert.deepEqual(likelyRainDays(null, NOW), []);
  // A day outside the three the Weather section shows is not named.
  const later: ForecastData = { city: 'X', days: [day('2026-11-22', 'Sun', 95)] };
  assert.deepEqual(likelyRainDays(later, NOW), []);

  const lines = materialOutlookLines(forecast([0, 90, 80]), NOW);
  assert.equal(lines[0], '[OUTLOOK]');
  assert.equal(lines[1], 'Rain is likely tomorrow and Friday.');
  assert.match(lines[2], /once, in \[FULL\] only and conditionally/);
  assert.deepEqual(materialOutlookLines(forecast([0, 50, 60]), NOW), []);
});

test('both Read briefs send weather to the Weather section and name no forecast block', () => {
  for (const [kind, brief] of [['river', RIVER_READ_BRIEF], ['gauge', GAUGE_READ_BRIEF]] as const) {
    assert.match(brief, /Do not describe the weather: no sky, temperature, wind or rain chance, today or ahead\./, kind);
    assert.match(brief, /only as an \[OUTLOOK\] block, and only when rain is likely/, kind);
    assert.doesNotMatch(brief, /3-DAY FORECAST|3-DAY WEATHER OUTLOOK|Current weather:/, kind);
  }
  // Each prompt builder gets the days ahead from the one shared helper.
  const read = (p: string) => readFileSync(p, 'utf8');
  assert.match(read('src/lib/eddy/build-update-prompt.ts'), /materialOutlookLines\(forecast, now\)/);
  assert.match(read('src/lib/eddy/build-gauge-prompt.ts'), /materialOutlookLines\(forecast, now\)/);
});

// ── a replay is dated to its recorded morning ───────────────────────
test('the date line and the reading time follow the time the prompt is for', () => {
  const stale = { ...gauge, readingTimestamp: '2026-11-18T03:00:00Z' };
  const then = buildPrompt(target, stale, null, null, [], '', null, null, null, new Date('2026-11-18T05:00:00Z'));
  assert.match(then, /^Date: Tuesday, November 17, 2026$/m);
  // Two hours old: still rated, and said with its time. The old warning, which
  // told the model the data was doubtful, is gone.
  assert.match(then, /^Reading taken at 9:00 PM CT, about 2 hours before this report\. When you give today's level or condition, say it is as of 9:00 PM\.$/m);
  assert.doesNotMatch(then, /WARNING: Reading is/);
  const later = buildPrompt(target, stale, null, null, [], '', null, null, null, new Date('2026-11-19T15:00:00Z'));
  assert.match(later, /^Date: Thursday, November 19, 2026$/m);
  // A reading from another Central day names its day. (A reading this old is
  // never sent to the model by the generator: preflightFallbackReason.)
  assert.match(later, /^Reading taken at 9:00 PM CT Tuesday, about 36 hours before this report\./m);
  const fresh = buildPrompt(target, stale, null, null, [], '', null, null, null, new Date('2026-11-18T03:20:00Z'));
  assert.doesNotMatch(fresh, /Reading taken at/);
});

// ── the gauge Read's message ────────────────────────────────────────
test("a gauge Read's message carries the knowledge it is handed and follows the time it is for", () => {
  const inputs = {
    target: { gaugeName: 'Current River above Akers, MO', riverName: 'Current River' },
    facts: gauge.facts, readingTimestamp: '2026-11-18T03:00:00Z', trajectory: trajectory(10), forecast: forecast([0, 90, 0]),
    riverCtx: null, riverBehaviorApplies: false, riverKnowledge: 'This gauge: Akers (07064533)\n- **Sits**: At Akers Ferry.',
  };
  const then = buildGaugePrompt({ ...inputs, now: NOW });
  assert.match(then, /^Date: Wednesday, November 18, 2026$/m);
  assert.match(then, /^Generate a secondary-gauge update for: Current River above Akers, MO on the Current River\.$/m);
  assert.match(then, /\[RIVER KNOWLEDGE: [^\]]*\]\nThis gauge: Akers \(07064533\)/);
  // No river context and no proven river-wide behaviour: the neutral guidance.
  assert.match(then, /Local hydrology is not established for this station/);
  assert.match(then, /\[THIS GAUGE\]\n\[AUTHORITATIVE GAUGE FACTS/);
  assert.match(then, /\[GAUGE TRAJECTORY\]\n24h change: -0\.2 ft/);
  assert.match(then, /\[OUTLOOK\]\nRain is likely tomorrow\./);
  // Twelve hours after the reading, its time; with no knowledge, no block.
  assert.match(then, /^Reading taken at 9:00 PM CT Tuesday, about 12 hours before this report\./m);
  assert.doesNotMatch(then, /WARNING: Reading is/);
  const bare = buildGaugePrompt({ ...inputs, riverKnowledge: '', now: new Date('2026-11-18T03:30:00Z') });
  assert.doesNotMatch(bare, /RIVER KNOWLEDGE|Reading taken at/);
});
