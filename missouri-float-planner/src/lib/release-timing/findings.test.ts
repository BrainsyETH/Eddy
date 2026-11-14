import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { FINDINGS, hoursOf, hoursText, quantile, sizeHours, sizeIndexFor, spread, type Stats } from './findings';
import { frontMile, GAUGE_MILE, MAP, paceShare, PLACES, riverFrame } from './river';
import { durationText, timeSpan } from './time';
import { elapsedText, playbackHours, windowPosition } from './presentation';

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
