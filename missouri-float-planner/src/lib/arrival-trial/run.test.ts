import assert from 'node:assert/strict';
import test from 'node:test';

import { HOUR_MS, MODEL, RULE_VERSION, estimateHours, type Sample } from './rule';
import {
  issueDeadline,
  runTrial,
  type LoggedIncrease,
  type OutcomeRow,
  type PredictionRow,
  type ReleaseHour,
  type TrialDeps,
} from './run';

// A made-up river with a fixed clock. The release rises at T0, the gauge
// answers 13 hours after the onset, and each test decides what Eddy has been
// told by `now`.

const T0 = Date.UTC(2026, 10, 20, 12);
const ONSET = T0 + HOUR_MS / 2;
const ARRIVAL = ONSET + 13 * HOUR_MS;
const QUARTER = 15 * 60_000;

interface World {
  now: number;
  /** Minutes after an hour ends before its release value is stored. */
  lagMinutes?: number;
  stageFt?: number;
  usgsDown?: boolean;
  /** The gauge record stops here. */
  stageUntil?: number;
  logged?: LoggedIncrease[];
  saveFails?: boolean;
}

function deps(world: World) {
  const predictions: PredictionRow[] = [];
  const outcomes: OutcomeRow[] = [];
  const calls = { usgs: 0 };
  const lag = (world.lagMinutes ?? 20) * 60_000;
  const base = world.stageFt ?? 5.2;
  const trial: TrialDeps = {
    now: world.now,
    async readRelease(fromMs, toMs) {
      const rows: ReleaseHour[] = [];
      for (let hour = fromMs; hour <= toMs; hour += HOUR_MS) {
        const receivedAtMs = hour + HOUR_MS + lag;
        if (receivedAtMs > world.now) continue;
        rows.push({ hourMs: hour, cfs: hour >= T0 && hour < T0 + 6 * HOUR_MS ? 9000 : 700, receivedAtMs });
      }
      return rows;
    },
    async readStage(fromMs, toMs) {
      calls.usgs += 1;
      if (world.usgsDown) return null;
      const samples: Sample[] = [];
      const until = Math.min(toMs, world.now, world.stageUntil ?? Infinity);
      for (let t = Math.ceil(fromMs / QUARTER) * QUARTER; t <= until; t += QUARTER) {
        samples.push({ t, v: t > ARRIVAL ? Math.min(base + ((t - ARRIVAL) / QUARTER) * 0.12, base + 3) : base });
      }
      return samples;
    },
    async readTributary(_siteId, fromMs, toMs) {
      calls.usgs += 1;
      if (world.usgsDown) return null;
      const samples: Sample[] = [];
      for (let t = Math.ceil(fromMs / QUARTER) * QUARTER; t <= Math.min(toMs, world.now); t += QUARTER) samples.push({ t, v: 250 });
      return samples;
    },
    async loggedSince() {
      return world.logged ?? [];
    },
    async savePrediction(row) {
      if (world.saveFails) return 'error';
      predictions.push(row);
      return 'saved';
    },
    async saveOutcome(row) {
      if (world.saveFails) return 'error';
      outcomes.push(row);
      return 'saved';
    },
  };
  return { trial, predictions, outcomes, calls };
}

const loggedRow = (over: Partial<LoggedIncrease> = {}): LoggedIncrease => ({
  id: 'p1',
  onsetHourMs: T0,
  decision: 'issued',
  predictedArrivalMs: ONSET + estimateHours(9000, 5.2) * HOUR_MS,
  hasOutcome: false,
  ...over,
});

test('nothing is written until three hours of the increase are in hand', async () => {
  const w = deps({ now: T0 + 2.6 * HOUR_MS });
  const summary = await runTrial(w.trial);
  assert.deepEqual([summary.detected, summary.waiting, summary.issued, summary.withheld], [1, 1, 0, 0]);
  assert.equal(w.predictions.length, 0);
  assert.equal(w.calls.usgs, 0, 'an idle pass makes no USGS requests');
});

test('an estimate is issued once, from the readings in hand, with its range', async () => {
  const now = T0 + 3.5 * HOUR_MS;
  const w = deps({ now });
  const summary = await runTrial(w.trial);
  assert.deepEqual([summary.issued, summary.withheld, summary.errors], [1, 0, 0]);
  const [row] = w.predictions;
  assert.equal(row.decision, 'issued');
  assert.equal(row.reason, null);
  assert.deepEqual(row.all_reasons, []);
  assert.equal(row.rule_version, RULE_VERSION);
  assert.equal(row.onset_hour, new Date(T0).toISOString());
  const arrival = ONSET + estimateHours(9000, 5.2) * HOUR_MS;
  assert.equal(row.predicted_arrival_at, new Date(arrival).toISOString());
  assert.equal(row.range_early_at, new Date(arrival - MODEL.earlyOffsetHours * HOUR_MS).toISOString());
  assert.equal(row.range_late_at, new Date(arrival + MODEL.lateOffsetHours * HOUR_MS).toISOString());
  assert.ok(now < issueDeadline(T0));

  const inputs = row.inputs as Record<string, unknown>;
  assert.equal(inputs.baseline_cfs, 700);
  assert.equal(inputs.peak_cfs, 9000);
  assert.equal(inputs.stage_ft, 5.2);
  assert.equal(inputs.minutes_after_third_hour, 30);
  const release = inputs.release as Array<{ hour: string; cfs: number; received_at: string }>;
  assert.equal(release.length, 23, '20 hours before and the three of the increase');
  assert.equal(release[release.length - 1].hour, new Date(T0 + 2 * HOUR_MS).toISOString());
  assert.equal(inputs.release_complete_at, new Date(T0 + 3 * HOUR_MS + 20 * 60_000).toISOString());
  assert.ok((inputs.stage_samples as unknown[]).length === 4);

  // The next pass sees the row and leaves it alone.
  const again = deps({ now: now + HOUR_MS, logged: [loggedRow()] });
  const second = await runTrial(again.trial);
  assert.deepEqual([second.detected, second.issued, again.predictions.length], [0, 0, 0]);
});

test('a withheld increase still records what the model would have said', async () => {
  const w = deps({ now: T0 + 3.5 * HOUR_MS, stageFt: 7.6 });
  await runTrial(w.trial);
  const [row] = w.predictions;
  assert.deepEqual([row.decision, row.reason], ['withheld', 'river high']);
  assert.equal(row.predicted_arrival_at, null);
  assert.equal(row.range_early_at, null);
  assert.ok(typeof (row.inputs as { would_arrive_at: unknown }).would_arrive_at === 'string');
});

test('release data that arrives after the window opens cannot become an estimate', async () => {
  const w = deps({ now: T0 + 5.6 * HOUR_MS, lagMinutes: 240 });
  const summary = await runTrial(w.trial);
  const [row] = w.predictions;
  assert.equal(summary.withheld, 1);
  assert.equal(row.decision, 'withheld');
  assert.deepEqual(row.all_reasons.slice(0, 2), ['release data arrived too late', 'release data missing']);
  assert.equal(row.predicted_arrival_at, null);
});

test('a pass that runs late says so instead of back-dating', async () => {
  const w = deps({ now: T0 + 9 * HOUR_MS });
  await runTrial(w.trial);
  const [row] = w.predictions;
  assert.deepEqual([row.decision, row.reason], ['withheld', 'decided too late']);
  assert.deepEqual(row.all_reasons, ['decided too late']);
});

test('a USGS outage waits while there is time, then withholds on the missing reading', async () => {
  const early = deps({ now: T0 + 3.5 * HOUR_MS, usgsDown: true });
  const first = await runTrial(early.trial);
  assert.deepEqual([first.waiting, early.predictions.length], [1, 0]);

  const last = deps({ now: T0 + 4.9 * HOUR_MS, usgsDown: true });
  await runTrial(last.trial);
  const [row] = last.predictions;
  assert.equal(row.decision, 'withheld');
  assert.deepEqual(row.all_reasons, ['gauge reading missing', 'tributary reading missing']);
});

test('the outcome is read a day later and never before the gauge record is complete', async () => {
  const tooSoon = deps({ now: ONSET + 25 * HOUR_MS, logged: [loggedRow()] });
  assert.equal((await runTrial(tooSoon.trial)).outcomes, 0);
  assert.equal(tooSoon.calls.usgs, 0);

  const lagging = deps({ now: ONSET + 27 * HOUR_MS, logged: [loggedRow()], stageUntil: ONSET + 20 * HOUR_MS });
  const waited = await runTrial(lagging.trial);
  assert.deepEqual([waited.outcomes, waited.outcomes_waiting, lagging.outcomes.length], [0, 1, 0]);

  const ready = deps({ now: ONSET + 27 * HOUR_MS, logged: [loggedRow()] });
  const summary = await runTrial(ready.trial);
  assert.equal(summary.outcomes, 1);
  const [outcome] = ready.outcomes;
  assert.equal(outcome.prediction_id, 'p1');
  assert.equal(outcome.status, 'matched');
  // The gauge climbs 0.12 ft a reading, so the first one after the rise begins is the mark.
  assert.equal(outcome.matched_rise_at, new Date(ARRIVAL + QUARTER).toISOString());
  assert.equal(outcome.first_rise_at, outcome.matched_rise_at);
  assert.deepEqual([outcome.rise_candidates, outcome.competing_increases], [1, 1]);
  assert.ok(Math.abs((outcome.steepest_rise_ft_per_hour as number) - 0.48) < 1e-9);
  assert.equal(outcome.tributary_watch_tripped_at, null);
  const error = (outcome.details as { error_hours: number }).error_hours;
  assert.ok(Math.abs(error - (estimateHours(9000, 5.2) - 13.25)) < 1e-9, 'predicted minus observed');
});

test('a gauge record that never fills in is closed out as a gap, not left open', async () => {
  const w = deps({ now: T0 + 97 * HOUR_MS, logged: [loggedRow()], stageUntil: ONSET + 20 * HOUR_MS });
  const summary = await runTrial(w.trial);
  assert.equal(summary.outcomes, 1);
  assert.equal(w.outcomes[0].status, 'gauge gap');
  assert.equal(w.outcomes[0].matched_rise_at, null);

  const dark = deps({ now: T0 + 97 * HOUR_MS, logged: [loggedRow()], usgsDown: true });
  await runTrial(dark.trial);
  assert.equal(dark.outcomes[0].status, 'gauge data unavailable');
});

test('a withheld row gets an outcome too, and a finished one is not read again', async () => {
  const w = deps({
    now: ONSET + 27 * HOUR_MS,
    logged: [loggedRow({ decision: 'withheld', predictedArrivalMs: null })],
  });
  await runTrial(w.trial);
  assert.equal(w.outcomes[0].status, 'matched');
  assert.equal((w.outcomes[0].details as { error_hours: unknown }).error_hours, null);

  const done = deps({ now: ONSET + 27 * HOUR_MS, logged: [loggedRow({ hasOutcome: true })] });
  assert.equal((await runTrial(done.trial)).outcomes, 0);
  assert.equal(done.calls.usgs, 0);
});

test('a failed write is counted so the job reports it', async () => {
  const w = deps({ now: T0 + 3.5 * HOUR_MS, saveFails: true });
  const summary = await runTrial(w.trial);
  assert.deepEqual([summary.errors, summary.issued], [1, 0]);
});

test('a row found days later is closed out the same way', async () => {
  const w = deps({ now: T0 + 9 * 24 * HOUR_MS, logged: [loggedRow()] });
  const summary = await runTrial(w.trial);
  assert.equal(summary.outcomes, 1);
  const [outcome] = w.outcomes;
  assert.deepEqual([outcome.status, outcome.rise_candidates, outcome.competing_increases], ['matched', 1, 1]);
  assert.equal(outcome.matched_rise_at, new Date(ARRIVAL + QUARTER).toISOString());
});
