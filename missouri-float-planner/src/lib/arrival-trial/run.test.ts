import assert from 'node:assert/strict';
import test from 'node:test';

import { jobOutcome } from '@/lib/admin/dashboard/jobs-model';
import { HOUR_MS, MODEL, RULE_VERSION, estimateHours, type Sample } from './rule';
import {
  issueDeadline,
  lateReason,
  recordPause,
  runTrial,
  type LoggedIncrease,
  type OutcomeRow,
  type PassRecord,
  type PassRow,
  type PredictionRow,
  type ReleaseHour,
  type TrialDeps,
  type WatchEventRow,
} from './run';

// A made-up river with a fixed clock. The release rises at T0, the gauge
// answers 13 hours after the onset, and each test decides what Eddy has been
// told by `now` and which passes ran before it.

const T0 = Date.UTC(2026, 10, 20, 12);
const ONSET = T0 + HOUR_MS / 2;
const ARRIVAL = ONSET + 13 * HOUR_MS;
const QUARTER = 15 * 60_000;
const MINUTE = 60_000;

interface World {
  now: number;
  /** Minutes after an hour ends before its release value is stored. */
  lagMinutes?: number;
  stageFt?: number;
  usgsDown?: boolean;
  /** The gauge record stops here. */
  stageUntil?: number;
  /** Tributaries step up by 800 cfs at this moment. */
  tributariesRiseAt?: number;
  logged?: LoggedIncrease[];
  saveFails?: boolean;
  /** Passes before `now`. Default: one every hour at :32 for the past week. */
  passes?: PassRecord[];
  /** Null means the trial has never run. Default: it started a month ago. */
  firstActiveMs?: number | null;
}

/** An hourly pass at :32 from `from` up to, not including, `to`. */
function hourly(from: number, to: number, state: 'active' | 'paused' = 'active'): PassRecord[] {
  const passes: PassRecord[] = [];
  for (let t = Math.ceil((from - 32 * MINUTE) / HOUR_MS) * HOUR_MS + 32 * MINUTE; t < to; t += HOUR_MS) {
    passes.push({ atMs: t, state });
  }
  return passes;
}

function deps(world: World) {
  const predictions: PredictionRow[] = [];
  const outcomes: OutcomeRow[] = [];
  const watchEvents: WatchEventRow[] = [];
  const passes: PassRow[] = [];
  const calls = { usgs: 0, releaseFrom: Infinity };
  const lag = (world.lagMinutes ?? 20) * MINUTE;
  const base = world.stageFt ?? 5.2;
  const trial: TrialDeps = {
    now: world.now,
    async readRelease(fromMs, toMs) {
      calls.releaseFrom = Math.min(calls.releaseFrom, fromMs);
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
      for (let t = Math.ceil(fromMs / QUARTER) * QUARTER; t <= Math.min(toMs, world.now); t += QUARTER) {
        samples.push({ t, v: world.tributariesRiseAt !== undefined && t >= world.tributariesRiseAt ? 650 : 250 });
      }
      return samples;
    },
    async loggedSince() {
      return world.logged ?? [];
    },
    async coverage(sinceMs) {
      const all = world.passes ?? hourly(world.now - 7 * 24 * HOUR_MS, world.now);
      return {
        firstActiveMs: world.firstActiveMs === undefined ? T0 - 30 * 24 * HOUR_MS : world.firstActiveMs,
        recent: all.filter((p) => p.atMs >= sinceMs),
      };
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
    async saveWatchEvent(row) {
      if (world.saveFails) return 'error';
      watchEvents.push(row);
      return 'saved';
    },
    async savePass(row) {
      passes.push(row);
      return 'saved';
    },
  };
  return { trial, predictions, outcomes, watchEvents, passes, calls };
}

const loggedRow = (over: Partial<LoggedIncrease> = {}): LoggedIncrease => ({
  id: 'p1',
  onsetHourMs: T0,
  decision: 'issued',
  predictedArrivalMs: ONSET + estimateHours(9000, 5.2) * HOUR_MS,
  hasOutcome: false,
  hasWatchEvent: false,
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
  assert.equal(summary.monitoring_status, 'ok');
  const [row] = w.predictions;
  assert.equal(row.decision, 'issued');
  assert.equal(row.reason, null);
  assert.deepEqual(row.all_reasons, []);
  assert.deepEqual(row.flags, []);
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
  assert.deepEqual([inputs.tributary_range_cfs, inputs.tributary_range_at_issue_cfs], [0, 0]);
  assert.equal(inputs.minutes_after_third_hour, 30);
  const release = inputs.release as Array<{ hour: string; cfs: number; received_at: string }>;
  assert.equal(release.length, 23, '20 hours before and the three of the increase');
  assert.equal(release[release.length - 1].hour, new Date(T0 + 2 * HOUR_MS).toISOString());
  assert.equal(inputs.release_complete_at, new Date(T0 + 3 * HOUR_MS + 20 * MINUTE).toISOString());
  assert.ok((inputs.stage_samples as unknown[]).length === 4);

  // The pass leaves its mark last, with what it did.
  assert.equal(w.passes.length, 1);
  assert.deepEqual([w.passes[0].state, w.passes[0].rule_version], ['active', RULE_VERSION]);
  assert.equal(w.passes[0].release_through, new Date(T0 + 2 * HOUR_MS).toISOString());
  assert.equal((w.passes[0].summary as { issued: number }).issued, 1);
  assert.ok(!('monitoring_status' in w.passes[0].summary));

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

test('tributaries that rise after the third hour but before the decision stop the estimate', async () => {
  // Release data is 85 minutes late, so the decision is made at hour 4.5. The
  // tributaries were quiet through hour 3, which is all the rule itself reads.
  const w = deps({ now: T0 + 4.55 * HOUR_MS, lagMinutes: 85, tributariesRiseAt: T0 + 3.25 * HOUR_MS });
  await runTrial(w.trial);
  const [row] = w.predictions;
  assert.equal(row.decision, 'withheld');
  assert.deepEqual(row.all_reasons, ['tributaries moved before issue']);
  const inputs = row.inputs as { tributary_range_cfs: number; tributary_range_at_issue_cfs: number };
  assert.equal(inputs.tributary_range_cfs, 0);
  assert.equal(inputs.tributary_range_at_issue_cfs, 800, 'two tributaries, 400 cfs each');
  assert.equal(row.predicted_arrival_at, null);

  // Quiet through the decision: the same late pass issues.
  const quiet = deps({ now: T0 + 4.55 * HOUR_MS, lagMinutes: 85 });
  await runTrial(quiet.trial);
  assert.equal(quiet.predictions[0].decision, 'issued');
});

test('release data that has not arrived when the window opens cannot become an estimate', async () => {
  const w = deps({ now: T0 + 5.6 * HOUR_MS, lagMinutes: 240 });
  const summary = await runTrial(w.trial);
  const [row] = w.predictions;
  assert.deepEqual([summary.withheld, summary.reconciled], [1, 1]);
  assert.equal(row.decision, 'withheld');
  assert.deepEqual(row.all_reasons.slice(0, 2), ['release data arrived too late', 'release data missing']);
  assert.equal(row.predicted_arrival_at, null);
  assert.ok(row.flags.includes('written after the fact'));
});

test('lateness is filed under whose delay it was, by when the data arrived', async () => {
  // In hand by the time this pass runs, but it arrived after the deadline:
  // the release data was late, not Eddy.
  const upstream = deps({ now: T0 + 6.6 * HOUR_MS, lagMinutes: 150 });
  await runTrial(upstream.trial);
  assert.equal(upstream.predictions[0].reason, 'release data arrived too late');
  assert.deepEqual(upstream.predictions[0].all_reasons, ['release data arrived too late']);

  // Data on time and passes running, yet nothing was decided: that one is Eddy's.
  const ours = deps({ now: T0 + 9 * HOUR_MS });
  await runTrial(ours.trial);
  assert.deepEqual(ours.predictions[0].all_reasons, ['decided too late']);
});

test('an increase missed during an outage is still accounted for, however old', async () => {
  const now = T0 + 31 * HOUR_MS + 32 * MINUTE;
  const w = deps({ now, passes: hourly(T0 - 5 * 24 * HOUR_MS, T0 - 2 * HOUR_MS) });
  const summary = await runTrial(w.trial);
  assert.deepEqual([summary.detected, summary.withheld, summary.reconciled], [1, 1, 1]);
  const [row] = w.predictions;
  assert.equal(row.onset_hour, new Date(T0).toISOString());
  assert.deepEqual(row.all_reasons, ['collection was down']);
  assert.ok(row.flags.includes('written after the fact'));
  assert.equal(row.predicted_arrival_at, null);
  // What the rule would have said is still recorded, from readings up to the deadline.
  assert.ok((row.inputs as { would_arrive_at: string | null }).would_arrive_at);

  // A ten-day outage reads far enough back to find it.
  const long = deps({ now: T0 + 10 * 24 * HOUR_MS, passes: hourly(T0 - 5 * 24 * HOUR_MS, T0 - 2 * HOUR_MS) });
  await runTrial(long.trial);
  assert.equal(long.predictions[0].reason, 'collection was down');
  assert.ok(long.calls.releaseFrom <= T0 - 30 * HOUR_MS);
});

test('a deliberate pause is filed as a pause, and nothing before the trial began is logged', async () => {
  const now = T0 + 31 * HOUR_MS + 32 * MINUTE;
  const paused = deps({
    now,
    passes: [...hourly(T0 - 3 * 24 * HOUR_MS, T0 - 2 * HOUR_MS), ...hourly(T0 - 2 * HOUR_MS, now, 'paused')],
  });
  await runTrial(paused.trial);
  assert.deepEqual(paused.predictions[0].all_reasons, ['collection paused']);

  const first = deps({ now: T0 + 9 * HOUR_MS, firstActiveMs: null, passes: [] });
  const summary = await runTrial(first.trial);
  assert.deepEqual([summary.detected, first.predictions.length], [0, 0]);
  assert.equal(first.passes.length, 1, 'the first pass is what starts the trial');

  const result = await recordPause(first.trial);
  assert.deepEqual(result, { monitoring_status: 'skipped', skipped: true, paused: true });
  assert.equal(first.passes[1].state, 'paused');
});

test('lateReason separates the four causes', () => {
  const deadline = issueDeadline(T0);
  const onTime = T0 + 3 * HOUR_MS + 25 * MINUTE;
  const running = hourly(T0 - 24 * HOUR_MS, T0 + 24 * HOUR_MS);
  assert.equal(lateReason(T0, deadline + MINUTE, running, T0 + 9 * HOUR_MS), 'release data arrived too late');
  assert.equal(lateReason(T0, Infinity, running, T0 + 9 * HOUR_MS), 'release data arrived too late');
  assert.equal(lateReason(T0, onTime, running, T0 + 9 * HOUR_MS), 'decided too late');
  assert.equal(lateReason(T0, null, running, T0 + 9 * HOUR_MS), 'decided too late');
  assert.equal(lateReason(T0, onTime, hourly(T0 - 24 * HOUR_MS, T0), T0 + 40 * HOUR_MS), 'collection was down');
  assert.equal(
    lateReason(T0, onTime, hourly(T0 - 24 * HOUR_MS, T0 + 24 * HOUR_MS, 'paused'), T0 + 40 * HOUR_MS),
    'collection paused'
  );
  // Data landed between two hourly passes with the deadline in the gap: no
  // pass could have used it, and none was missing.
  const between = [{ atMs: deadline - 50 * MINUTE, state: 'active' as const }];
  assert.equal(lateReason(T0, deadline - 20 * MINUTE, between, deadline + 10 * MINUTE), 'release data arrived too late');
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

test('a live estimate is watched, and the first sign of trouble is written when it is seen', async () => {
  const rising = { tributariesRiseAt: T0 + 6 * HOUR_MS, logged: [loggedRow()] };
  const before = deps({ now: T0 + 5.55 * HOUR_MS, ...rising });
  assert.equal((await runTrial(before.trial)).watch_events, 0);

  const now = T0 + 6.55 * HOUR_MS;
  const w = deps({ now, ...rising });
  const summary = await runTrial(w.trial);
  assert.equal(summary.watch_events, 1);
  const [event] = w.watchEvents;
  assert.deepEqual([event.prediction_id, event.kind], ['p1', 'tributaries moving']);
  const details = event.details as { range_cfs: number; hours_after_onset: number };
  assert.equal(details.range_cfs, 800);
  assert.ok(Math.abs(details.hours_after_onset - 6.05) < 1e-9);

  // Recorded once; not for a withheld row; not after the window has closed.
  for (const row of [
    loggedRow({ hasWatchEvent: true }),
    loggedRow({ decision: 'withheld', predictedArrivalMs: null }),
    loggedRow({ hasOutcome: true }),
  ]) {
    const again = deps({ now, tributariesRiseAt: T0 + 6 * HOUR_MS, logged: [row] });
    await runTrial(again.trial);
    assert.equal(again.watchEvents.length, 0);
  }
  const closed = deps({ now: ONSET + 24.2 * HOUR_MS, tributariesRiseAt: T0 + 6 * HOUR_MS, logged: [loggedRow()] });
  await runTrial(closed.trial);
  assert.equal(closed.watchEvents.length, 0);
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

test('a row found days later is closed out the same way', async () => {
  const w = deps({ now: T0 + 9 * 24 * HOUR_MS, logged: [loggedRow()] });
  const summary = await runTrial(w.trial);
  assert.equal(summary.outcomes, 1);
  const [outcome] = w.outcomes;
  assert.deepEqual([outcome.status, outcome.rise_candidates, outcome.competing_increases], ['matched', 1, 1]);
  assert.equal(outcome.matched_rise_at, new Date(ARRIVAL + QUARTER).toISOString());
});

test('a failed write reaches the admin monitor as a problem, not as healthy', async () => {
  const w = deps({ now: T0 + 3.5 * HOUR_MS, saveFails: true });
  const summary = await runTrial(w.trial);
  assert.deepEqual([summary.errors, summary.issued, summary.monitoring_status], [1, 0, 'partial']);
  // Through the dashboard's own classifier, which reads the explicit status first.
  assert.equal(jobOutcome(summary, 200).status, 'partial');

  const healthy = await runTrial(deps({ now: T0 + 3.5 * HOUR_MS }).trial);
  assert.equal(jobOutcome(healthy, 200).status, 'ok');

  const pauseFailed = await recordPause({ savePass: async () => 'error' });
  assert.equal(jobOutcome(pauseFailed, 503).status, 'error');
});
