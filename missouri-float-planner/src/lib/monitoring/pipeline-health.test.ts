import assert from 'node:assert/strict';
import test from 'node:test';
import { FakeOutboxDb } from '../alerts/fake-outbox-db';
import { checkPipelineHealth } from './pipeline-health';
import { jobOutcome } from '../admin/dashboard/jobs-model';

const NOW = new Date('2026-07-25T12:00:00.000Z');
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60000).toISOString();
const STATIONS = Array.from({ length: 10 }, (_, i) => `st-${i}`);

function healthy() {
  const db = new FakeOutboxDb(NOW.toISOString())
    .seed('admin_job_runs', [
      { job: 'update-gauges', status: 'ok', started_at: ago(30), finished_at: ago(29) },
      { job: 'update-gauges:high-frequency', status: 'ok', started_at: ago(10), finished_at: ago(9) },
      { job: 'evaluate-gauge-alerts', status: 'ok', started_at: ago(12), finished_at: ago(11) },
      { job: 'deliver-push', status: 'partial', started_at: ago(4), finished_at: ago(3) },
    ])
    .seed('gauge_stations', STATIONS.map((id) => ({ id, curated: true, active: true })));
  readings(db, STATIONS.map(() => 40));
  return db;
}

/** One reading per station, at the given ages in minutes (null = no reading). */
function readings(db: FakeOutboxDb, ages: Array<number | null>) {
  db.rpcs.set('get_latest_curated_readings', () => ({
    data: STATIONS.flatMap((id, i) => (ages[i] == null ? [] : [{ gauge_station_id: id, reading_timestamp: ago(ages[i]!) }])),
    error: null,
  }));
}

const check = (result: Awaited<ReturnType<typeof checkPipelineHealth>>, name: string) =>
  result.checks.find((c) => c.name === name)!;

test('a working pipeline passes every check', async () => {
  const result = await checkPipelineHealth(healthy(), NOW);
  assert.equal(result.ok, true, JSON.stringify(result.checks));
});

test('the reviewer\'s case fails: hourly pass failing, evaluator failing to persist, a day-old fleet', async () => {
  // Reproduced ok:true before: the high-frequency pass satisfied the hourly
  // check, every evaluator run was `partial`, and one fresh gauge satisfied
  // freshness for the whole collection.
  const db = healthy();
  for (const row of db.rows('admin_job_runs')) {
    if (row.job === 'update-gauges') row.status = 'error';
    if (row.job === 'evaluate-gauge-alerts') row.status = jobOutcome({ ok: true, outboxFailed: 1, monitoring_status: 'error' }, 500).status;
  }
  readings(db, [40, ...STATIONS.slice(1).map(() => 24 * 60)]);
  const result = await checkPipelineHealth(db, NOW);

  assert.equal(result.ok, false);
  assert.equal(check(result, 'job:update-gauges').ok, false, 'The 15-minute pass does not stand in for the hourly one');
  assert.equal(check(result, 'job:update-gauges:high-frequency').ok, true);
  assert.equal(check(result, 'job:evaluate-gauge-alerts').ok, false, 'Failed alert persistence is not progress');
  assert.equal(check(result, 'freshness:curated-readings').reason, 'low_coverage');
});

test('an evaluator that could not save its alerts records an error, not partial', () => {
  assert.equal(jobOutcome({ ok: true, outboxFailed: 1, monitoring_status: 'error' }, 500).status, 'error');
  // A state write that failed is retried harmlessly next pass: still progress.
  assert.equal(jobOutcome({ ok: true, outboxFailed: 0, stateFailed: 2 }, 200).status, 'partial');
});

test('freshness tolerates one dead sensor but not a stale fleet', async () => {
  const db = healthy();
  readings(db, [null, ...STATIONS.slice(1).map(() => 40)]); // 9 of 10 fresh
  assert.equal(check(await checkPipelineHealth(db, NOW), 'freshness:curated-readings').ok, true);
  readings(db, [null, 300, ...STATIONS.slice(2).map(() => 40)]); // 8 of 10
  const result = check(await checkPipelineHealth(db, NOW), 'freshness:curated-readings');
  assert.equal(result.ok, false);
  assert.deepEqual(result.coverage, { fresh: 8, total: 10, minRatio: 0.9 });
});

test('a job that stopped completing fails, even though it is "deployed"', async () => {
  const db = healthy();
  db.rows('admin_job_runs').find((r) => r.job === 'deliver-push')!.finished_at = ago(45);
  const result = await checkPipelineHealth(db, NOW);
  assert.equal(check(result, 'job:deliver-push').reason, 'stale');
});

test('an alert waiting too long fails the outbox check; an empty outbox passes', async () => {
  const db = healthy();
  assert.equal(check(await checkPipelineHealth(db, NOW), 'outbox:oldest-pending-alert').ok, true);
  db.seed('river_condition_events', [{ kind: 'warning', detected_at: ago(50), push_delivered_at: null, push_attempts: 1 }]);
  assert.equal(check(await checkPipelineHealth(db, NOW), 'outbox:oldest-pending-alert').ok, false);
});

test('a check that cannot be read FAILS rather than passing', async () => {
  const db = healthy().fail({ table: 'gauge_alert_events', mode: 'select' });
  const result = await checkPipelineHealth(db, NOW);
  assert.equal(check(result, 'outbox:oldest-pending-alert').reason, 'unreadable');
});
