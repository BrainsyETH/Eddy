import assert from 'node:assert/strict';
import test from 'node:test';
import { FakeOutboxDb } from '../alerts/fake-outbox-db';
import { checkPipelineHealth } from './pipeline-health';

const NOW = new Date('2026-07-25T12:00:00.000Z');
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60000).toISOString();

function healthy() {
  const db = new FakeOutboxDb(NOW.toISOString())
    .seed('admin_job_runs', [
      { job: 'update-gauges:high-frequency', status: 'ok', started_at: ago(10), finished_at: ago(9) },
      { job: 'evaluate-gauge-alerts', status: 'ok', started_at: ago(12), finished_at: ago(11) },
      { job: 'deliver-push', status: 'partial', started_at: ago(4), finished_at: ago(3) },
    ])
    .seed('gauge_stations', [{ id: 'st-1', curated: true, active: true }]);
  db.rpcs.set('get_latest_curated_readings', () => ({
    data: [{ gauge_station_id: 'st-1', reading_timestamp: ago(40) }],
    error: null,
  }));
  return db;
}

const check = (result: Awaited<ReturnType<typeof checkPipelineHealth>>, name: string) =>
  result.checks.find((c) => c.name === name)!;

test('a working pipeline passes every check', async () => {
  const result = await checkPipelineHealth(healthy(), NOW);
  assert.equal(result.ok, true, JSON.stringify(result.checks));
});

test('a job that stopped completing fails, even though it is "deployed"', async () => {
  const db = healthy();
  db.rows('admin_job_runs').find((r) => r.job === 'deliver-push')!.finished_at = ago(45);
  const result = await checkPipelineHealth(db, NOW);
  assert.equal(result.ok, false);
  assert.equal(check(result, 'job:deliver-push').reason, 'stale');
});

test('runs that only ever skipped or errored count as never completing', async () => {
  // The lock-outage case: every run recorded, none of them did anything.
  const db = healthy();
  for (const row of db.rows('admin_job_runs')) if (row.job === 'evaluate-gauge-alerts') row.status = 'skipped';
  const result = await checkPipelineHealth(db, NOW);
  assert.equal(check(result, 'job:evaluate-gauge-alerts').reason, 'never');
});

test('stale readings fail freshness', async () => {
  const db = healthy();
  db.rpcs.set('get_latest_curated_readings', () => ({ data: [{ reading_timestamp: ago(200) }], error: null }));
  const result = await checkPipelineHealth(db, NOW);
  assert.equal(check(result, 'freshness:curated-readings').ok, false);
});

test('an alert waiting too long fails the outbox check; an empty outbox passes', async () => {
  const db = healthy();
  assert.equal(check(await checkPipelineHealth(db, NOW), 'outbox:oldest-pending-alert').ok, true);
  db.seed('river_condition_events', [
    { kind: 'warning', detected_at: ago(50), push_delivered_at: null, push_attempts: 1 },
  ]);
  assert.equal(check(await checkPipelineHealth(db, NOW), 'outbox:oldest-pending-alert').ok, false);
});

test('a check that cannot be read FAILS rather than passing', async () => {
  const db = healthy().fail({ table: 'gauge_alert_events', mode: 'select' });
  const result = await checkPipelineHealth(db, NOW);
  assert.equal(result.ok, false);
  assert.equal(check(result, 'outbox:oldest-pending-alert').reason, 'unreadable');
});
