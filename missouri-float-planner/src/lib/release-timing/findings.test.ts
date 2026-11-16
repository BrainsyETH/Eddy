import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { FINDINGS, hoursOf, hoursText, quantile, sizeHours, sizeIndexFor, spread, type Stats } from './findings';
import { frontMile, GAUGE_MILE, MAP, paceShare, PLACES, riverFrame } from './river';
import { durationText, releaseHour, timeSpan } from './time';
import { elapsedText, playbackHours, progressSlots, researchLog, RESULTS_NEEDED, roughHours, sizePhrase, windowPosition } from './presentation';
import { publicResults, type StoredOutcome, type StoredPrediction } from '../arrival-trial/public-results';

// ── The page's numbers are the study's numbers ───────────────────────────────
//
// The findings page draws src/data/release-timing/bull-shoals-findings.json.
// These tests recompute its counts and medians from the study's own result
// files, with the definitions the page states in "How we measured". If the
// study is rerun, or the JSON is edited by hand, the page cannot quietly
// disagree with what was measured: rerun export_findings.py.

const STUDY = path.join(process.cwd(), 'scripts/research/bull-shoals-lag-2026-11/results_replay');

function csv(file: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;
  const text = readFileSync(path.join(STUDY, file), 'utf8');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  const [header, ...body] = rows;
  return body.filter((r) => r.length === header.length).map((r) => Object.fromEntries(header.map((key, k) => [key, r[k]])));
}

const detected = [...csv('replay_development.csv'), ...csv('replay_test.csv')];
const number = (row: Record<string, string>, key: string) => (row[key] === '' ? null : Number(row[key]));
const increases = detected.filter((row) => !row.all_reasons.includes('increase under 2,000 cfs'));
const scored = increases.filter((row) => row.match === 'matched' && row.delay_h !== '' && row.gauge_gap === 'False');
const normal = (row: Record<string, string>) => {
  const step = number(row, 'pre_step_cfs');
  return number(row, 'baseline')! < 1500 && number(row, 'stage0')! < 7 && (step === null || step < 500);
};
const stats = (values: number[]): Stats => {
  const sorted = [...values].sort((a, b) => a - b);
  const round = (v: number) => Math.round(v * 100) / 100;
  return { n: sorted.length, median: round(quantile(sorted, 0.5)), p10: round(quantile(sorted, 0.1)), p90: round(quantile(sorted, 0.9)), min: sorted[0], max: sorted[sorted.length - 1] };
};
const same = (actual: Stats, expected: Stats, label: string) => {
  assert.equal(actual.n, expected.n, `${label} count`);
  for (const key of ['median', 'p10', 'p90', 'min', 'max'] as const) {
    assert.ok(Math.abs(actual[key] - expected[key]) <= 0.011, `${label} ${key}: page ${actual[key]}, study ${expected[key]}`);
  }
};
const pick = ({ n, median, p10, p90, min, max }: Stats): Stats => ({ n, median, p10, p90, min, max });

test('the counts on the page are the study’s counts', () => {
  assert.equal(detected.length, 1196);
  assert.equal(FINDINGS.increases, increases.length);
  assert.equal(FINDINGS.scored, scored.length);
  assert.equal(FINDINGS.points.length, scored.length);
  assert.equal(FINDINGS.normal, scored.filter(normal).length);
  const years = scored.map((row) => Number(row.year));
  assert.deepEqual(FINDINGS.years, [Math.min(...years), Math.max(...years)]);
});

test('every dot on the page is a scored release from the study', () => {
  const order = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3];
  const study = scored
    .map((row) => [Math.round(number(row, 'qpeak')!), number(row, 'delay_h')!, number(row, 'stage0')!, number(row, 'baseline')!, normal(row) ? 1 : 0])
    .sort(order);
  const page = FINDINGS.points.map((p) => [...p]).sort(order);
  // The page rounds the gauge height to a thousandth of a foot and the release to a tenth of a cfs.
  const tolerance = [0, 0, 0.0006, 0.06, 0];
  page.forEach((point, k) => {
    point.forEach((value, column) => {
      assert.ok(Math.abs(value - study[k][column]) <= tolerance[column], `release ${k}, column ${column}: page ${value}, study ${study[k][column]}`);
    });
  });
});

test('the medians and ranges on the page are recomputed from the study', () => {
  const hours = (keep: (row: Record<string, string>) => boolean) => scored.filter(keep).map((row) => number(row, 'delay_h')!);
  same(pick(FINDINGS.normalAll), stats(hours(normal)), 'normal river');
  for (const band of FINDINGS.size) {
    const generators = (row: Record<string, string>) => number(row, 'qpeak')! / FINDINGS.generatorCfs;
    same(pick(band), stats(hours((row) => normal(row) && generators(row) >= band.lo && generators(row) < band.hi!)), `size ${band.label}`);
  }
  for (const band of FINDINGS.height) {
    same(pick(band), stats(hours((row) => number(row, 'stage0')! >= band.lo && number(row, 'stage0')! < band.hi!)), `gauge ${band.label}`);
  }
  FINDINGS.baseline.forEach((band, i) => {
    same(pick(band), stats(hours((row) => number(row, 'baseline')! >= band.lo && number(row, 'baseline')! < (i === 0 ? 1500 : Infinity))), `baseline ${band.label}`);
  });
});

test('what the charts draw agrees with the numbers printed beside them', () => {
  FINDINGS.size.forEach((band, i) => {
    const drawn = spread(sizeHours(i));
    assert.equal(drawn.sorted.length, band.n, band.label);
    assert.ok(Math.abs(drawn.median - band.median) <= 0.011, band.label);
    assert.equal(drawn.min, band.min);
    assert.equal(drawn.max, band.max);
  });
  FINDINGS.height.forEach((band) => assert.equal(hoursOf(FINDINGS.points, (p) => p[2] >= band.lo && p[2] < band.hi!).length, band.n, band.label));
  // The headline: the fall from the smallest releases to the largest is real in the data.
  assert.ok(FINDINGS.size[0].median > FINDINGS.size[4].median + 2);
});

test('the example release the map replays is a measured one of about four generators', () => {
  const { onsetMs, riseMs, peakCfs } = FINDINGS.example;
  assert.equal(new Date(onsetMs).toISOString(), '2026-10-23T20:30:00.000Z');
  const row = scored.find((r) => r.hour === '2026-10-23 20:00:00+00:00')!;
  assert.equal((riseMs - onsetMs) / 3_600_000, number(row, 'delay_h'));
  assert.equal(peakCfs, Math.round(number(row, 'qpeak')!));
  assert.equal(sizeIndexFor(peakCfs), 3);
  assert.equal(sizeIndexFor(900), 0);
  assert.equal(sizeIndexFor(40_000), 4);
});

// ── The map draws only what was measured as measured ─────────────────────────

test('times are scaled by distance up to the gauge and not reported below it', () => {
  const gauge = PLACES.find((place) => place.kind === 'gauge')!;
  assert.equal(gauge.mile, GAUGE_MILE);
  assert.equal(paceShare(gauge), 1);
  assert.equal(paceShare(PLACES[0]), 0);
  assert.equal(paceShare(PLACES.find((place) => place.name === 'Cotter')!), 16.9 / 41.5);
  for (const place of PLACES.filter((p) => p.mile > GAUGE_MILE)) assert.equal(paceShare(place), null, place.name);
  assert.deepEqual(PLACES.map((p) => p.mile), [...PLACES.map((p) => p.mile)].sort((a, b) => a - b));
});

test('a release front moves at a steady pace and stops at the gauge', () => {
  assert.equal(frontMile(0, 12), 0);
  assert.equal(frontMile(6, 12), GAUGE_MILE / 2);
  assert.equal(frontMile(12, 12), GAUGE_MILE);
  assert.equal(frontMile(20, 12), GAUGE_MILE);
});

test('the river line reaches every place and stays inside the map frame', () => {
  assert.ok(MAP.white.length / 4 >= PLACES[PLACES.length - 1].mile);
  const frame = riverFrame(800);
  for (const place of PLACES) {
    const [x, y] = frame.at(place.mile);
    assert.ok(x >= 0 && x <= frame.width && y >= 0 && y <= frame.height, place.name);
  }
  assert.equal(frame.slice(10, 10), '');
  assert.match(frame.slice(0, GAUGE_MILE), /^M[\d.,L-]+$/);
  assert.equal(riverFrame(390).narrow, true);
});

test('hours and durations read the way people say them', () => {
  assert.deepEqual([0, 0.26, 12.75, 13.24, 13.9].map(hoursText), ['0', '¼', '12¾', '13¼', '14']);
  assert.deepEqual([40, 60, 65, 125, 1].map(durationText), ['40 minutes', '1 hour', '1 hour 5 minutes', '2 hours 5 minutes', '1 minute']);
  const at = (hour: number, minute: number) => Date.UTC(2026, 10, 14, hour, minute);
  assert.equal(timeSpan(at(9, 20), at(10, 30)), '3:20 to 4:30 AM');
  assert.equal(timeSpan(at(17, 40), at(19, 10)), '11:40 AM to 1:10 PM');
});

test('elapsed labels round consistently without a calendar date', () => {
  assert.deepEqual([0, 0.25, 5.16, 5.999, 25.5].map(elapsedText), ['0 min', '15 min', '5 hr 10 min', '6 hr', '25 hr 30 min']);
});

test('both window boundaries count as within, without claiming observed arrival', () => {
  assert.deepEqual([4, 4.5, 5, 5.5, 6].map((hour) => windowPosition(hour, 4.5, 5.5)), ['before', 'within', 'within', 'within', 'past']);
});

test('playback includes late recorded rises beyond the normal day view', () => {
  assert.equal(playbackHours(13.25), 24);
  assert.equal(playbackHours(24), 24);
  assert.equal(playbackHours(24.25), 30);
  assert.equal(playbackHours(32), 36);
});

// ── What the redesigned page says, and what it refuses to say ────────────────

test('an unmeasured place gets a rounded time and never minutes', () => {
  assert.deepEqual([0.1, 0.6, 1.1, 2.18, 5.19, 9.28, 12.74].map(roughHours), [
    'about half an hour', 'about half an hour', 'about 1 hour', 'about 2 hours', 'about 5 hours', 'about 9½ hours', 'about 12½ hours',
  ]);
  // Every access point the rough guide lists is upstream of the gauge, so it has a share to scale by.
  for (const place of PLACES.filter((p) => !p.kind && !p.minor && p.mile < GAUGE_MILE)) assert.ok(paceShare(place)! > 0 && paceShare(place)! < 1, place.name);
});

test('the answer names the release size the way people say it', () => {
  assert.deepEqual([0, 3, 4].map((i) => sizePhrase(i, FINDINGS.size.length)), ['A 1-generator release', 'A 4-generator release', 'A release of 5 or more generators']);
});

test('a release is named by the hour it began in, not a clock time', () => {
  // The log times a release at half past its first hour; 11:30 UTC is the 5 AM hour in Central standard time.
  assert.equal(releaseHour(Date.UTC(2026, 10, 14, 11, 30)), '5 AM hour');
  assert.equal(releaseHour(Date.UTC(2026, 10, 14, 20, 30)), '2 PM hour');
});

const stored = (day: number, minutesFromEstimate: number | null): [StoredPrediction, StoredOutcome[]] => {
  const estimate = Date.UTC(2026, 10, day, 11, 30) + 14 * 3_600_000;
  const prediction: StoredPrediction = {
    id: `d${day}`, onset_hour: new Date(Date.UTC(2026, 10, day, 11)).toISOString(), decision: 'issued', reason: null, peak_cfs: 6600,
    predicted_arrival_at: new Date(estimate).toISOString(), range_early_at: new Date(estimate - 90 * 60_000).toISOString(), range_late_at: new Date(estimate + 75 * 60_000).toISOString(),
  };
  return [prediction, minutesFromEstimate === null ? [] : [{ prediction_id: prediction.id, status: 'matched', matched_rise_at: new Date(estimate + minutesFromEstimate * 60_000).toISOString() }]];
};
const trial = (...rows: Array<[StoredPrediction, StoredOutcome[]]>) => publicResults(rows.map((r) => r[0]), rows.flatMap((r) => r[1]));

test('progress has one slot per result the study needs, filled oldest first', () => {
  assert.deepEqual(progressSlots(null), Array(RESULTS_NEEDED).fill('open'));
  const slots = progressSlots(trial(stored(14, 25), stored(15, -200), stored(16, null)));
  assert.equal(slots.length, RESULTS_NEEDED);
  assert.deepEqual(slots.slice(0, 3), ['inside', 'outside', 'open'], 'a release still travelling fills no slot');
});

test('the research log ends with what comes next and adds the first result when there is one', () => {
  const before = researchLog(FINDINGS, trial(stored(16, null)));
  assert.deepEqual(before.map((e) => e.when), ['Nov 12, 2026', 'Nov 12, 2026', 'Nov 13, 2026', 'Next']);
  assert.match(before[0].text, /Measured 695 releases from 2019 to 2026/);
  const after = researchLog(FINDINGS, trial(stored(15, -200), stored(14, 25)));
  assert.deepEqual(after.map((e) => e.when), ['Nov 12, 2026', 'Nov 12, 2026', 'Nov 13, 2026', 'Nov 14, 2026', 'Next']);
  assert.equal(after[3].text, 'First result: the gauge rose inside the estimated window.', 'the first result is the oldest, not the newest');
  assert.match(researchLog(FINDINGS, trial(stored(14, -200)))[3].text, /First result: the gauge rose 1 hour 50 minutes before the estimated window/);
  assert.equal(researchLog(FINDINGS, null).length, 4);
});
