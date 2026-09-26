import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  assembleMetrics,
  inboxCount,
  needsAttention,
  versionAdoption,
} from './model';
import { METRICS } from './catalog';
import { jobOutcome } from './jobs-model';
import { nextScheduledAt } from './job-schedule';
import { summarizeRuns } from './jobs-summary';

test('partial sources never become zero, and inbox needs all three sources', () => {
  const metrics = assembleMetrics({ feedback: { state: 'ok', value: 2 } });
  assert.equal(inboxCount(metrics), null);
  assert.equal(metrics.find((m) => m.key === 'reports')?.value, null);
  assert.equal(metrics.filter(needsAttention).length, 1);
});
test('version comparison is numeric and unknown versions retain their denominator', () => {
  assert.deepEqual(
    versionAdoption(
      [
        { name: '1.9.0', count: 2 },
        { name: '1.10.0', count: 3 },
        { name: 'Unknown', count: 1 },
      ],
      '1.10.0',
      '1.10.0',
    ),
    { below: 2, newest: 3, unknown: 1, total: 6 },
  );
});
test('job status distinguishes partial application failures and never stores response text', () => {
  assert.deepEqual(
    jobOutcome({ gauge: { errors: 2 }, message: 'private' }, 200),
    { status: 'partial', counters: { 'gauge.errors': 2 } },
  );
  assert.equal(jobOutcome({ skipped: true }, 200).status, 'skipped');
  assert.equal(jobOutcome({}, 500).status, 'error');
});
test('SQL aggregates, source isolation, and service-only grants', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      readFileSync('src/lib/admin/dashboard/fixture-schema.sql', 'utf8'),
    );
    await db.exec(
      readFileSync(
        'supabase/migrations/20260926182334_admin_dashboard_summary.sql',
        'utf8',
      ),
    );
    const now = '2026-09-26T12:00:00Z';
    await db.exec(`INSERT INTO entitlements(entitlement_id,environment,expires_at,will_renew) VALUES
   ('eddy_premium','PRODUCTION','2026-10-01',false),('eddy_premium','SANDBOX','2026-10-01',false),('eddy_premium','PRODUCTION','2026-09-01',false),('other','PRODUCTION','2026-10-01',false);
   INSERT INTO feedback(status) VALUES('pending'),('pending'),('resolved');
   INSERT INTO community_reports(status) VALUES('pending');
   INSERT INTO inbound_emails(status) VALUES('unread');
   INSERT INTO gauge_alert_events(detected_at,push_attempts,push_delivered_at) VALUES('2026-09-26T11:00Z',0,NULL),('2026-09-26T11:00Z',2,NULL),('2026-09-26T11:00Z',5,NULL),('2026-09-26T11:00Z',0,'2026-09-26T11:05Z');
   INSERT INTO embed_impressions(day,count) VALUES('2026-09-26',5),('2026-08-01',50);
   INSERT INTO chat_logs(session_id,duration_ms,created_at) VALUES('one',100,'2026-09-26'),('one',300,'2026-09-26'),('two',900,'2026-09-26');`);
    const result = await db.query<{
      value: Record<string, { state: 'ok' | 'unknown'; value: number }>;
    }>('SELECT admin_dashboard_summary($1,$2) value', [now, 'eddy_premium']);
    const data = result.rows[0].value;
    assert.equal(Object.keys(data).length, METRICS.length);
    for (const m of METRICS) {
      assert.ok(data[m.key], m.key);
      assert.ok(!('reason' in data[m.key]), m.key + ' query failed');
    }
    assert.equal(data.subscribers.value, 1);
    assert.equal(data.renewal_off.value, 1);
    assert.equal(inboxCount(assembleMetrics(data)), 4);
    assert.equal(data.gauge_waiting.value, 1);
    assert.equal(data.gauge_retry.value, 1);
    assert.equal(data.gauge_exhausted.value, 1);
    assert.equal(data.embeds.value, 5);
    assert.equal(data.chat_sessions.value, 2);
    assert.equal(data.chat_duration.value, 300);
    await db.exec('DROP TABLE chat_logs');
    const missing = await db.query<{ v: { state: string; value: null } }>(
      "SELECT admin_dashboard_metric('chat_sessions',$1,$2) v",
      [now, 'eddy_premium'],
    );
    assert.equal(missing.rows[0].v.state, 'unknown');
    assert.equal(missing.rows[0].v.value, null);
    await db.exec('SET ROLE anon');
    await assert.rejects(
      () =>
        db.query('SELECT admin_dashboard_summary($1,$2)', [
          now,
          'eddy_premium',
        ]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

test('cron deadlines handle lists, multiple daily runs, UTC rollover and weekly schedules', () => {
  const next = (s: string[], at: string) =>
    new Date(nextScheduledAt(s, Date.parse(at))).toISOString();
  assert.equal(
    next(['5,20,35,50 * * * *'], '2026-09-26T12:05:30Z'),
    '2026-09-26T12:20:00.000Z',
  );
  assert.equal(
    next(['*/15 * * * *'], '2026-09-26T23:59:59Z'),
    '2026-09-27T00:00:00.000Z',
  );
  assert.equal(
    next(['0 13 * * *', '0 23 * * *'], '2026-09-26T13:00:00Z'),
    '2026-09-26T23:00:00.000Z',
  );
  assert.equal(
    next(['0 8 * * 0'], '2026-09-27T08:00:00Z'),
    '2026-10-04T08:00:00.000Z',
  );
  assert.throws(
    () => next(['0 0 1 * *'], '2026-09-26T12:00:00Z'),
    /Unsupported/,
  );
});

test('missing-run deadlines survive rollout and do not confuse a failed source with an empty one', () => {
  const schedules = [
    { path: '/api/cron/sync-gauge-latest', schedule: '5,20,35,50 * * * *' },
  ];
  const options = { expected: schedules, deployed: schedules };
  const snapshot = { started_at: '2026-09-26T12:06:00Z', runs: [] };
  const before = summarizeRuns(
    snapshot,
    Date.parse('2026-09-26T12:35:00Z'),
    options,
  )[0];
  assert.equal(before.attention, false);
  const after = summarizeRuns(
    snapshot,
    Date.parse('2026-09-26T12:35:01Z'),
    options,
  )[0];
  assert.equal(after.state, 'ok');
  assert.equal(after.attention, true);
  assert.match(after.detail, /Overdue/);
  assert.equal(
    summarizeRuns(snapshot, Date.parse('2026-10-26T12:00Z'), options)[0]
      .attention,
    true,
  );
  const unavailable = summarizeRuns(
    null,
    Date.parse('2026-10-26T12:00Z'),
    options,
  )[0];
  assert.equal(unavailable.state, 'unknown');
  assert.equal(unavailable.attention, false);
  assert.equal(
    summarizeRuns(snapshot, Date.parse('2026-10-26T12:00Z'), {
      ...options,
      active: false,
    })[0].attention,
    false,
  );
  assert.equal(
    summarizeRuns(snapshot, Date.now(), { ...options, deployed: [] })[0]
      .attention,
    true,
  );
});

test('explicit outcomes preserve skips without hiding HTTP failures', () => {
  assert.equal(
    jobOutcome({ ok: true, skipped: true, reason: 'lock_contended' }, 200)
      .status,
    'skipped',
  );
  assert.equal(
    jobOutcome({ ok: false, skipped: true, reason: 'lock_unavailable' }, 503)
      .status,
    'error',
  );
  assert.equal(
    jobOutcome({ ok: false, monitoring_status: 'skipped', skipped: true }, 200)
      .status,
    'skipped',
  );
  assert.equal(
    jobOutcome({ monitoring_status: 'skipped' }, 503).status,
    'error',
  );
  assert.equal(
    jobOutcome({ monitoring_status: 'partial' }, 200).status,
    'partial',
  );
  assert.equal(
    jobOutcome({ monitoring_status: 'invalid', errors: 2 }, 200).status,
    'partial',
  );
});

test('rollout baseline persists independently of retained runs and is service-only', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      readFileSync('src/lib/admin/dashboard/fixture-schema.sql', 'utf8'),
    );
    await db.exec(
      readFileSync(
        'supabase/migrations/20260926182346_admin_job_runs.sql',
        'utf8',
      ),
    );
    const read = async () =>
      (
        await db.query<{ v: { started_at: string; runs: unknown[] } }>(
          'SELECT admin_dashboard_job_status() v',
        )
      ).rows[0].v;
    await db.exec('SET ROLE service_role');
    const before = await read();
    await db.exec('RESET ROLE');
    assert.ok(before.started_at);
    assert.deepEqual(before.runs, []);
    await db.exec(
      "INSERT INTO admin_job_runs(job,status) VALUES('test','ok'); DELETE FROM admin_job_runs; INSERT INTO admin_monitoring_state(id) VALUES(true) ON CONFLICT DO NOTHING;",
    );
    assert.deepEqual(await read(), before);
    for (const role of ['anon', 'authenticated']) {
      await db.exec('SET ROLE ' + role);
      await assert.rejects(read, /permission denied/);
      await assert.rejects(
        () => db.query('SELECT * FROM admin_monitoring_state'),
        /permission denied/,
      );
      await db.exec('RESET ROLE');
    }
  } finally {
    await db.close();
  }
});

test('every deployed schedule has an independent expectation and a monitored handler', () => {
  const deployed = JSON.parse(readFileSync('vercel.json', 'utf8'))
    .crons as Array<{ path: string; schedule: string }>;
  const expected = JSON.parse(
    readFileSync('src/lib/admin/dashboard/expected-jobs.json', 'utf8'),
  );
  assert.deepEqual(expected, deployed);
  for (const cron of deployed) {
    assert.ok(
      Number.isFinite(
        nextScheduledAt([cron.schedule], Date.parse('2026-09-26T00:00Z')),
      ),
    );
    const path = new URL(cron.path, 'https://eddy.guide').pathname;
    assert.match(
      readFileSync('src/app' + path + '/route.ts', 'utf8'),
      /withJobRun\(/,
      path,
    );
  }
  assert.ok(
    !METRICS.some((m) =>
      ['cleared_unknown', 'condition_mismatch'].includes(m.key),
    ),
  );
});

test('overview compares equal complete periods and never invents growth from missing data', async () => {
  const { dailyCounts, comparePeriod, friendlyJob } = await import(
    './overview-model'
  );
  const end = Date.parse('2026-09-26T00:00:00Z');
  const points = dailyCounts(
    [
      { created_at: '2026-09-25T23:59:59Z' },
      { created_at: '2026-09-25T12:00:00Z' },
      { created_at: '2026-09-18T00:00:00Z' },
      { created_at: '2026-09-26T00:00:00Z' },
    ],
    end,
  );
  assert.equal(points.length, 60);
  assert.equal(points.at(-1)?.day, '2026-09-25');
  const result = comparePeriod({ state: 'ok', points }, 7)!;
  assert.equal(result.total, 2);
  assert.equal(result.prior, 1);
  assert.equal(result.percent, 100);
  const zero = comparePeriod(
    { state: 'ok', points: dailyCounts([], end) },
    30,
  )!;
  assert.equal(zero.total, 0);
  assert.equal(zero.percent, null);
  assert.equal(comparePeriod({ state: 'unknown', points: [] }, 7), null);
  assert.equal(comparePeriod({ state: 'ok', points: [] }, 7), null);
  assert.equal(
    friendlyJob('update-gauges:high-frequency'),
    'Refresh river gauges · priority gauges',
  );
  assert.equal(
    friendlyJob('generate-eddy-updates:global-only'),
    'Write Eddy Reads · Ozarks Pulse',
  );
});
