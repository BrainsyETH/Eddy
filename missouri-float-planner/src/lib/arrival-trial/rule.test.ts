import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  HOUR_MS,
  MODEL,
  RULE,
  decide,
  detectStarts,
  estimateHours,
  gaugeGap,
  gaugeRises,
  hourlyMeans,
  matchOnsets,
  steepestRise,
  tributaryWatchHours,
  type Sample,
} from './rule';

// ── Parity with the frozen research rule ─────────────────────────────────────
//
// The fixture is 46 days of real Bull Shoals releases and Norfork gauge
// readings, with the decisions and outcomes the Python replay produced for
// them (scripts/research/bull-shoals-lag-2026-11/export_parity_fixture.py).
// The forward log is only evidence for that rule if this port IS that rule,
// so every row has to come out the same.

interface Expected {
  hourMs: number;
  baseline: number;
  peak: number | null;
  priorStep: number | null;
  stage0: number | null;
  tributaryRange: number | null;
  decision: 'issued' | 'withheld';
  allReasons: string[];
  predictedHours: number | null;
  withdrawnAfterHours: number | null;
  gaugeGap: boolean;
  match: string;
  delayHours: number | null;
  firstRiseAnyHours: number | null;
  steepestRiseHours: number | null;
  steepestRiseFtPerHour: number | null;
}

const fixture = JSON.parse(
  readFileSync(path.join(process.cwd(), 'src/lib/arrival-trial/__fixtures__/replay-parity.json'), 'utf8')
) as {
  model: Record<string, number>;
  startHourMs: number;
  release: Array<number | null>;
  buffalo: Array<number | null>;
  crooked: Array<number | null>;
  stage: Array<[number, number]>;
  riseMs: number[];
  expected: Expected[];
};
const stage: Sample[] = fixture.stage.map(([t, v]) => ({ t, v }));
const tributaries = [fixture.buffalo, fixture.crooked];
const close = (actual: number | null, expected: number | null, label: string) => {
  if (expected === null) return assert.equal(actual, null, label);
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-5, `${label}: ${actual} vs ${expected}`);
};

test('the frozen model constants are the ones the replay scored', () => {
  assert.deepEqual(
    [MODEL.intercept, MODEL.lnPeak, MODEL.stageFt, MODEL.earlyOffsetHours, MODEL.lateOffsetHours],
    [fixture.model.intercept, fixture.model.lnPeak, fixture.model.stageFt, fixture.model.earlyOffsetHours, fixture.model.lateOffsetHours]
  );
});

test('detects the same release increases as the replay', () => {
  const starts = detectStarts(fixture.release).map((i) => fixture.startHourMs + i * HOUR_MS);
  assert.deepEqual(starts, fixture.expected.map((e) => e.hourMs));
  assert.ok(starts.length >= 40);
});

test('makes the same decision, for the same reasons, from the same inputs', () => {
  const kinds = new Set<string>();
  for (const expected of fixture.expected) {
    const index = (expected.hourMs - fixture.startHourMs) / HOUR_MS;
    const got = decide({ release: fixture.release, index, hourMs: expected.hourMs, stage, tributaries });
    const label = new Date(expected.hourMs).toISOString();
    assert.equal(got.decision, expected.decision, label);
    assert.deepEqual(got.reasons, expected.allReasons, label);
    close(got.baselineCfs, expected.baseline, `${label} baseline`);
    close(got.peakCfs, expected.peak, `${label} peak`);
    close(got.priorStepCfs, expected.priorStep, `${label} prior step`);
    close(got.stageFt, expected.stage0, `${label} stage`);
    close(got.tributaryRangeCfs, expected.tributaryRange, `${label} tributaries`);
    close(got.decision === 'issued' ? got.estimateHours : null, expected.predictedHours, `${label} estimate`);
    close(
      got.decision === 'issued' ? tributaryWatchHours(tributaries, index) : null,
      expected.withdrawnAfterHours,
      `${label} watch`
    );
    kinds.add(expected.allReasons[0] ?? 'issued');
  }
  // The slice has to exercise more than the happy path to mean anything.
  for (const kind of ['issued', 'increase under 2,000 cfs', 'release already raised', 'river high', 'smaller increase went first']) {
    assert.ok(kinds.has(kind), `fixture has no "${kind}" row`);
  }
});

test('reads the same outcomes from the gauge', () => {
  assert.deepEqual(gaugeRises(stage), fixture.riseMs);
  const onsets = fixture.expected.map((e) => e.hourMs + HOUR_MS / 2);
  const matches = matchOnsets(onsets, fixture.riseMs);
  const statuses = new Set<string>();
  fixture.expected.forEach((expected, k) => {
    const label = new Date(expected.hourMs).toISOString();
    const hours = (ms: number | null) => (ms === null ? null : (ms - onsets[k]) / HOUR_MS);
    assert.equal(matches[k].status, expected.match, label);
    close(hours(matches[k].riseMs), expected.delayHours, `${label} delay`);
    close(hours(matches[k].firstRiseMs), expected.firstRiseAnyHours, `${label} first rise`);
    assert.equal(gaugeGap(stage, onsets[k]), expected.gaugeGap, `${label} gap`);
    const steepest = steepestRise(stage, onsets[k]);
    close(hours(steepest?.atMs ?? null), expected.steepestRiseHours, `${label} steepest at`);
    close(steepest?.ftPerHour ?? null, expected.steepestRiseFtPerHour, `${label} steepest size`);
    statuses.add(expected.match);
  });
  assert.ok(statuses.has('matched') && statuses.has('ambiguous'));
});

// ── The rule on rivers built by hand ─────────────────────────────────────────

const START = Date.UTC(2026, 10, 1);
const flat = (hours: number, value: number): Array<number | null> => new Array(hours).fill(value);
/** A quiet river, then a release to `peak` at hour 30. */
function river(options: { base?: number; peak?: number; hours?: number } = {}) {
  const { base = 700, peak = 9000, hours = 72 } = options;
  const release = flat(hours, base);
  for (let h = 30; h < 36; h++) release[h] = peak;
  const quiet: Sample[] = [];
  for (let t = START; t < START + hours * HOUR_MS; t += 15 * 60_000) quiet.push({ t, v: 5.2 });
  return { release, stage: quiet, tributaries: [flat(hours, 300), flat(hours, 60)] };
}
const at = (r: ReturnType<typeof river>, forward = true) =>
  decide({ release: r.release, index: 30, hourMs: START + 30 * HOUR_MS, stage: r.stage, tributaries: r.tributaries, forward });

test('a clean release from a low river is issued with the frozen estimate', () => {
  const r = river();
  assert.deepEqual(detectStarts(r.release), [30]);
  const got = at(r);
  assert.equal(got.decision, 'issued');
  assert.equal(got.reason, null);
  assert.equal(got.onsetMs, START + 30.5 * HOUR_MS);
  assert.ok(Math.abs(got.estimateHours! - estimateHours(9000, 5.2)) < 1e-12);
  assert.ok(got.estimateHours! > 12.5 && got.estimateHours! < 14);
  assert.equal(got.earlierReleaseInTransit, false);
});

test('each gate withholds on its own, and a would-be estimate is still recorded', () => {
  const high = river();
  high.stage = high.stage.map((s) => ({ ...s, v: 7.4 }));
  assert.deepEqual(at(high).reasons, ['river high']);
  assert.ok(at(high).estimateHours !== null);

  assert.deepEqual(at(river({ base: 2200, peak: 12000 })).reasons, ['release already raised']);
  assert.deepEqual(at(river({ peak: 2400 })).reasons, ['increase under 2,000 cfs']);

  const moving = river();
  for (let h = 24; h < 33; h++) moving.tributaries[0][h] = 300 + (h - 23) * 90;
  assert.deepEqual(at(moving).reasons, ['tributaries moving']);

  const blind = river();
  blind.tributaries[1] = flat(72, 60).map((v, h) => (h >= 22 ? null : v));
  assert.deepEqual(at(blind).reasons, ['tributary reading missing']);

  const noGauge = river();
  noGauge.stage = noGauge.stage.filter((s) => s.t < START + 28 * HOUR_MS || s.t >= START + 31 * HOUR_MS);
  assert.deepEqual(at(noGauge).reasons, ['gauge reading missing']);
  assert.equal(at(noGauge).estimateHours, null);

  const stepped = river({ base: 1300 });
  for (let h = 12; h < 20; h++) stepped.release[h] = 700;
  assert.deepEqual(at(stepped).reasons, ['smaller increase went first']);

  const early = river();
  early.release[32] = null;
  assert.deepEqual(at(early).reasons, ['release data missing']);
});

test('an implausible baseline is withheld going forward but not in the replay', () => {
  const zero = river({ base: 0, peak: 4700 });
  assert.deepEqual(at(zero).reasons, ['release reading implausible']);
  assert.equal(at(zero, false).decision, 'issued');
});

test('an earlier release that already ended is flagged, not withheld', () => {
  const r = river();
  for (let h = 18; h < 22; h++) r.release[h] = 2500;
  const got = at(r);
  assert.equal(got.decision, 'issued');
  assert.equal(got.earlierReleaseInTransit, true);
});

test('an increase is not detected off an unsteady baseline or a missing hour', () => {
  const jumpy = river();
  jumpy.release[27] = 1500;
  assert.deepEqual(detectStarts(jumpy.release), []);
  const hole = river();
  hole.release[26] = null;
  assert.deepEqual(detectStarts(hole.release), []);
});

test('the watch reports the hour tributaries start moving after the decision', () => {
  const r = river();
  assert.equal(tributaryWatchHours(r.tributaries, 30), null);
  for (let h = 36; h < 72; h++) r.tributaries[1][h] = 60 + (h - 35) * 200;
  // Hour 38 is the first with a range over 500 cfs; it is known at hour 39.
  assert.equal(tributaryWatchHours(r.tributaries, 30), 39 - 30 - 0.5);
});

test('a rise is the first reading a tenth of a foot off the recent low', () => {
  const samples: Sample[] = [];
  for (let k = 0; k < 96; k++) {
    const t = START + k * 15 * 60_000;
    samples.push({ t, v: k < 60 ? 5 : Math.min(5 + (k - 59) * 0.06, 7) });
  }
  // 5.06 at k=60, 5.12 at k=61: the second is the first 0.10 ft above the low.
  assert.deepEqual(gaugeRises(samples), [START + 61 * 15 * 60_000]);
  const steepest = steepestRise(samples, START + 4 * HOUR_MS);
  assert.ok(steepest && Math.abs(steepest.ftPerHour - 0.24) < 1e-9);
  assert.equal(gaugeGap(samples, START + 4 * HOUR_MS), true, 'the record ends before the window does');
});

test('matching refuses to guess when rises or releases crowd each other', () => {
  const h = HOUR_MS;
  const [alone, shared1, shared2, none] = matchOnsets([0, 100 * h, 103 * h, 300 * h], [12 * h, 114 * h]);
  assert.deepEqual([alone.status, alone.riseMs], ['matched', 12 * h]);
  assert.deepEqual([shared1.status, shared2.status], ['ambiguous', 'ambiguous']);
  assert.equal(shared1.firstRiseMs, 114 * h);
  assert.deepEqual([none.status, none.candidates], ['none', 0]);
  const [twice] = matchOnsets([0], [8 * h, 15 * h]);
  assert.deepEqual([twice.status, twice.candidates, twice.riseMs], ['ambiguous', 2, null]);
  assert.deepEqual(RULE.windowHours, [5, 24]);
});

test('hourly means cover the hour each value belongs to', () => {
  const samples: Sample[] = [
    { t: START, v: 100 },
    { t: START + 15 * 60_000, v: 200 },
    { t: START + 2 * HOUR_MS, v: 50 },
    { t: START - 1, v: 999 },
  ];
  assert.deepEqual(hourlyMeans(samples, START, 3), [150, null, 50]);
});
