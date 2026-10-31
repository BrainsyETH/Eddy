import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  assembleMetrics,
  inboxCount,
  needsAttention,
  uncheckedMetrics,
  versionAdoption,
} from './model';
import { METRICS } from './catalog';
import { jobOutcome } from './jobs-model';
import { nextScheduledAt } from './job-schedule';
import { summarizeRuns, type JobSnapshot, type Run } from './jobs-summary';

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

test('skipped ticks and running retries preserve the last completed failure', () => {
  const schedules = [{ path: '/api/cron/post-blog', schedule: '0 14,15 * * 1-5' }];
  const options = { expected: schedules, deployed: schedules };
  const now = Date.parse('2026-10-26T15:05:00Z');
  const latest: Run = {
    job: 'post-blog',
    started_at: '2026-10-26T15:00:00Z',
    finished_at: '2026-10-26T15:00:01Z',
    status: 'skipped',
    duration_ms: 1000,
    last_success_at: null,
    counters: {},
    last_result: { status: 'error', started_at: '2026-10-26T14:00:00Z' },
  };
  const summarize = (run: Run) => summarizeRuns({
    started_at: '2026-10-01T00:00:00Z', runs: [run],
  }, now, options)[0];
  for (const status of ['error', 'partial'] as const) {
    const metric = summarize({ ...latest, last_result: { ...latest.last_result!, status } });
    assert.equal(metric.attention, true);
    assert.equal(metric.value, 1);
    assert.match(metric.detail, /State: skipped/);
    assert.match(metric.detail, new RegExp(`Last completed work: ${status}.*14:00:00Z`));
    assert.doesNotMatch(metric.detail, /Overdue/);
  }
  assert.equal(summarize({ ...latest, status: 'started', finished_at: null }).attention, true);
  const recovered = summarize({ ...latest, last_result: {
    status: 'ok', started_at: '2026-10-26T14:30:00Z',
  } });
  assert.equal(recovered.attention, false);
  assert.equal(recovered.value, 'skipped');
  const onlySkips = summarize({ ...latest, last_result: null });
  assert.equal(onlySkips.attention, false);
  assert.equal(onlySkips.state, 'ok');
  assert.equal(onlySkips.value, 'skipped');
});

test('old job snapshots cannot report skipped work as a healthy completed outcome', () => {
  const schedules = [{ path: '/api/cron/post-blog', schedule: '0 14,15 * * 1-5' }];
  const run: Run = {
    job: 'post-blog', started_at: '2026-10-26T15:00:00Z', finished_at: null,
    status: 'skipped', duration_ms: 10, last_success_at: null, counters: {},
  };
  const snapshot = { started_at: '2026-10-01T00:00:00Z', runs: [run] };
  const options = { expected: schedules, deployed: schedules };
  const metric = summarizeRuns(snapshot, Date.parse('2026-10-26T15:05:00Z'), options)[0];
  assert.equal(metric.state, 'unknown');
  assert.equal(metric.value, null);
  assert.match(metric.detail, /pending job monitoring migration/);
  assert.equal(summarizeRuns(snapshot, Date.parse('2026-10-27T14:16:00Z'), options)[0].attention, true);
  const failed = summarizeRuns({ ...snapshot, runs: [{ ...run, status: 'error' }] },
    Date.parse('2026-10-26T15:05:00Z'), options)[0];
  assert.equal(failed.state, 'ok');
  assert.equal(failed.attention, true);
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

test('job RPC preserves failed work through skips and clears it only after successful work', async () => {
  const db = new PGlite();
  try {
    await db.exec(readFileSync('src/lib/admin/dashboard/fixture-schema.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/20260926182346_admin_job_runs.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/20261027111520_admin_job_last_result.sql', 'utf8'));
    const read = async () => (await db.query<{ v: JobSnapshot }>(
      'SELECT admin_dashboard_job_status() v',
    )).rows[0].v;
    const schedules = [{ path: '/api/cron/post-blog', schedule: '0 14,15 * * 1-5' }];
    const metric = (snapshot: JobSnapshot) => summarizeRuns(snapshot, Date.now(), {
      active: false, expected: schedules, deployed: schedules,
    })[0];
    await db.exec('SET ROLE service_role');
    await db.exec(`INSERT INTO admin_job_runs(job, started_at, finished_at, status) VALUES
      ('post-blog', now()-interval '2 hours', now()-interval '119 minutes', 'error'),
      ('post-blog', now()-interval '1 hour', now()-interval '59 minutes', 'skipped'),
      ('post-blog', now()-interval '1 minute', now()-interval '59 seconds', 'skipped');`);
    const failed = await read();
    assert.equal(failed.runs.length, 1, 'the RPC still returns one latest tick per job');
    assert.equal(failed.runs[0].status, 'skipped');
    assert.equal(failed.runs[0].last_result?.status, 'error');
    assert.equal(failed.runs[0].last_success_at, null);
    assert.equal(metric(failed).attention, true);

    await db.exec(`INSERT INTO admin_job_runs(job, started_at, finished_at, status) VALUES
      ('post-blog', now()-interval '30 seconds', now()-interval '20 seconds', 'ok'),
      ('post-blog', now()-interval '10 seconds', now()-interval '9 seconds', 'skipped');`);
    const recovered = await read();
    assert.equal(recovered.runs[0].status, 'skipped');
    assert.equal(recovered.runs[0].last_result?.status, 'ok');
    assert.ok(recovered.runs[0].last_success_at);
    assert.equal(metric(recovered).attention, false);

    await db.exec(`INSERT INTO admin_job_runs(job, started_at, finished_at, status) VALUES
      ('post-blog', now()-interval '5 seconds', now()-interval '4 seconds', 'partial'),
      ('post-blog', now()-interval '2 seconds', now()-interval '1 second', 'skipped');
      INSERT INTO admin_job_runs(job, started_at, status) VALUES
      ('post-blog', now(), 'started'),
      ('only-skips', now()-interval '1 minute', 'skipped'),
      ('expired-failure', now()-interval '31 days', 'error'),
      ('expired-failure', now()-interval '1 minute', 'skipped');`);
    const retrying = await read();
    const retry = retrying.runs.find(run => run.job === 'post-blog')!;
    assert.equal(retry.status, 'started');
    assert.equal(retry.last_result?.status, 'partial');
    assert.equal(metric(retrying).attention, true);
    assert.equal(retrying.runs.find(run => run.job === 'only-skips')?.last_result, null);
    assert.equal(retrying.runs.find(run => run.job === 'expired-failure')?.last_result, null);

    await db.exec('RESET ROLE');
    for (const role of ['anon', 'authenticated']) {
      await db.exec('SET ROLE ' + role);
      await assert.rejects(read, /permission denied/);
      await assert.rejects(() => db.query('SELECT admin_dashboard_jobs()'), /permission denied/);
      await db.exec('RESET ROLE');
    }
  } finally {
    await db.close();
  }
});

test('unfinished attempts stay visible after skips without treating fresh retries as failures', async () => {
  const db = new PGlite();
  try {
    await db.exec(readFileSync('src/lib/admin/dashboard/fixture-schema.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/20260926182346_admin_job_runs.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/20261027111520_admin_job_last_result.sql', 'utf8'));
    await db.exec('SET ROLE service_role');
    const read = async () => (await db.query<{ v: JobSnapshot }>(
      'SELECT admin_dashboard_job_status() v',
    )).rows[0].v;
    const schedules = [{ path: '/api/cron/post-blog', schedule: '0 14,15 * * 1-5' }];
    const metric = (snapshot: JobSnapshot) => summarizeRuns(snapshot, Date.now(), {
      active: false, expected: schedules, deployed: schedules,
    })[0];
    await db.exec(`INSERT INTO admin_job_runs(job, started_at, finished_at, status) VALUES
      ('post-blog', now()-interval '1 day', now()-interval '1 day'+interval '1 minute', 'ok'),
      ('post-blog', now()-interval '11 minutes', null, 'started'),
      ('post-blog', now()-interval '1 minute', now()-interval '59 seconds', 'skipped'),
      ('fresh-retry', now()-interval '1 day', now()-interval '1 day'+interval '1 minute', 'ok'),
      ('fresh-retry', now()-interval '2 minutes', null, 'started'),
      ('fresh-retry', now()-interval '1 minute', now()-interval '59 seconds', 'skipped');`);
    const unfinished = await read();
    const post = unfinished.runs.find(run => run.job === 'post-blog')!;
    assert.equal(post.status, 'skipped');
    assert.equal(post.last_result?.status, 'error');
    assert.equal(post.last_result?.completion_missing, true);
    assert.equal(metric(unfinished).attention, true);
    assert.match(metric(unfinished).detail, /did not report completion/);
    assert.doesNotMatch(metric(unfinished).detail, /Last completed work: error/);
    assert.equal((await db.query<{ status: string }>(
      "SELECT status FROM admin_job_runs WHERE job = 'post-blog' AND finished_at IS NULL",
    )).rows[0].status, 'started', 'inferred failure must not rewrite the original run');
    const fresh = unfinished.runs.find(run => run.job === 'fresh-retry')!;
    assert.equal(fresh.last_result?.status, 'ok');
    assert.equal(fresh.last_result?.completion_missing, false);

    await db.exec(`INSERT INTO admin_job_runs(job, started_at, finished_at, status) VALUES
      ('post-blog', now()-interval '30 seconds', now()-interval '20 seconds', 'ok'),
      ('post-blog', now()-interval '10 seconds', now()-interval '9 seconds', 'skipped');`);
    const recovered = await read();
    const latest = recovered.runs.find(run => run.job === 'post-blog')!;
    assert.equal(latest.status, 'skipped');
    assert.equal(latest.last_result?.status, 'ok');
    assert.equal(latest.last_result?.completion_missing, false);
    assert.equal(metric(recovered).attention, false);
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

test('widget attribution reconciles totals, keeps unknown separate, and preserves drilldown filters', async () => {
  const { trafficSource, widgetBreakdown } = await import('./widget-model');
  assert.equal(trafficSource('WWW.EDDY.GUIDE.'), 'eddy');
  assert.equal(
    trafficSource('preview.example.com', ['preview.example.com']),
    'eddy',
  );
  assert.equal(trafficSource('noteddy.guide'), 'external');
  assert.equal(trafficSource('direct'), 'unknown');
  const history = {
    state: 'ok' as const,
    through: '2026-09-26',
    firstPartyHosts: [],
    rows: [
      {
        day: '2026-09-20',
        widget_type: 'eddy-quote',
        widget_key: 'current',
        referrer_host: 'eddy.guide',
        count: 349,
      },
      {
        day: '2026-09-26',
        widget_type: 'widget',
        widget_key: 'current',
        referrer_host: 'www.dillardmill.com',
        count: 18,
      },
      {
        day: '2026-09-26',
        widget_type: 'badge',
        widget_key: 'meramec',
        referrer_host: 'm.facebook.com',
        count: 10,
      },
      {
        day: '2026-09-26',
        widget_type: 'badge',
        widget_key: 'meramec',
        referrer_host: 'direct',
        count: 2,
      },
      {
        day: '2026-09-19',
        widget_type: 'widget',
        widget_key: 'current',
        referrer_host: 'www.dillardmill.com',
        count: 30,
      },
      {
        day: '2026-09-27',
        widget_type: 'widget',
        widget_key: 'current',
        referrer_host: 'www.dillardmill.com',
        count: 99,
      },
    ],
  };
  const all = widgetBreakdown(history, 7)!;
  assert.deepEqual(all.totals, {
    all: 379,
    eddy: 349,
    external: 28,
    unknown: 2,
  });
  assert.equal(
    all.daily.reduce((n, p) => n + p.count, 0),
    all.total,
  );
  assert.equal(all.daily.length, 7);
  assert.equal(widgetBreakdown(history, 7, 'external')!.total, 28);
  const host = widgetBreakdown(history, 7, 'external', 'www.dillardmill.com')!;
  assert.equal(host.total, 18);
  assert.deepEqual(host.types, [{ name: 'widget', count: 18 }]);
  assert.equal(
    widgetBreakdown(history, 30, 'external', 'www.dillardmill.com')!.total,
    48,
  );
  assert.equal(widgetBreakdown({ ...history, state: 'unknown' }, 7), null);
  assert.equal(widgetBreakdown(undefined, 7), null);
});

test('referring sites count distinct outside hosts and keep links, Eddy and unknown out', async () => {
  const { referringSites, isLinkHost } = await import('./widget-model');
  assert.ok(isLinkHost('m.facebook.com'));
  assert.ok(isLinkHost('www.google.com'));
  assert.ok(!isLinkHost('www.dillardmill.com'));
  assert.ok(!isLinkHost('notfacebook.com'));
  const row = (day: string, host: string, count = 1) => ({
    day,
    widget_type: 'river-card',
    widget_key: 'current',
    referrer_host: host,
    count,
  });
  const sites = referringSites({
    state: 'ok',
    through: '2026-09-30',
    firstPartyHosts: [],
    rows: [
      row('2026-09-02', 'www.dillardmill.com', 4),
      row('2026-09-29', 'www.dillardmill.com', 6),
      row('2026-09-28', 'WWW.DILLARDMILL.COM.', 1),
      row('2026-09-26', 'newoutfitter.example', 3),
      row('2026-09-05', 'oldblog.example', 2),
      row('2026-09-29', 'eddy.guide', 500),
      row('2026-09-29', 'direct', 7),
      row('2026-09-29', 'l.facebook.com', 9),
      row('2026-08-31', 'outside-window.example', 99),
    ],
  })!;
  assert.equal(sites.total, 3);
  assert.deepEqual(
    sites.sites.map((s) => [s.host, s.loads, s.loads7, s.isNew, s.quiet]),
    [
      ['www.dillardmill.com', 11, 7, false, false],
      ['newoutfitter.example', 3, 3, true, false],
      ['oldblog.example', 2, 0, false, true],
    ],
  );
  assert.equal(sites.activeThisWeek, 2);
  assert.equal(sites.newThisWeek, 1);
  assert.equal(sites.quietThisWeek, 1);
  assert.deepEqual(sites.links, [{ name: 'l.facebook.com', count: 9 }]);
  assert.equal(sites.unknownLoads, 7);
  // Widget and river rankings use the same rows as the site count: the
  // Facebook, Eddy and unknown loads are not in them.
  assert.deepEqual(sites.types, [{ name: 'river-card', count: 16 }]);
  assert.deepEqual(sites.keys, [{ name: 'current', count: 16 }]);
  assert.equal(
    sites.types.reduce((n, r) => n + r.count, 0),
    sites.sites.reduce((n, s) => n + s.loads, 0),
  );
  const mill = sites.sites[0];
  assert.equal(mill.daily.length, 30);
  assert.equal(mill.daily.reduce((n, v) => n + v, 0), mill.loads);
  assert.equal(mill.daily[0], 0, 'the window starts on Sep 1');
  assert.equal(mill.daily[1], 4);
  assert.equal(referringSites({ state: 'unknown', through: '2026-09-30', rows: [], firstPartyHosts: [] }), null);
});

test('every dashboard number has plain copy, and every flagged one says what to do', async () => {
  const { PLAIN, plain } = await import('./plain');
  for (const m of METRICS) {
    const copy = PLAIN[m.key];
    assert.ok(copy, `${m.key} needs plain copy in plain.ts`);
    assert.ok(copy.title && copy.means, m.key);
    if (m.attention) assert.ok(copy.todo, `${m.key} is flagged, so it needs a "what to do" line`);
  }
  for (const key of ['job_post-blog', 'sentry_web', 'upstream_usgs', '429_mapbox', 'errors_nws', 'effective_push'])
    assert.notEqual(plain({ key, label: key }, 'Publish blog posts').title, key, key);
});

test('copy follows the value: healthy jobs and enabled push never read as broken', async () => {
  const { plain, valueText } = await import('./plain');
  const job = (value: number | string, state: 'ok' | 'unknown' = 'ok') => ({
    key: 'job_post-blog', label: 'post-blog', state, value, attention: value === 1,
  });
  const healthy = plain(job('ok'), 'Publish blog posts');
  assert.equal(healthy.title, 'Publish blog posts');
  assert.equal(healthy.todo, undefined);
  assert.doesNotMatch(healthy.means, /fail|stall|miss/);
  assert.equal(valueText(job('ok')), 'Worked');
  assert.equal(valueText(job('skipped')), 'Skipped');
  const failed = plain(job(1), 'Publish blog posts');
  assert.equal(failed.title, 'Publish blog posts');
  assert.ok(failed.todo);
  assert.equal(valueText(job(1)), 'Needs a look');
  assert.equal(plain(job('x', 'unknown')).todo, undefined);

  const push = (value: number) => ({ key: 'effective_push', label: '', state: 'ok' as const, value });
  assert.equal(valueText(push(0)), 'On');
  assert.equal(plain(push(0)).todo, undefined);
  assert.doesNotMatch(plain(push(0)).means, /not sending/);
  assert.equal(valueText(push(1)), 'Off');
  assert.ok(plain(push(1)).todo);

  // A count of zero, or a count we couldn't read, carries no instructions.
  const billing = (value: number | null, state: 'ok' | 'unknown') => ({ key: 'billing', label: '', state, value });
  assert.equal(plain(billing(0, 'ok')).todo, undefined);
  assert.equal(plain(billing(null, 'unknown')).todo, undefined);
  assert.ok(plain(billing(2, 'ok')).todo);
});

test('a check that did not answer is counted, never treated as healthy', () => {
  const metrics = assembleMetrics({
    gauge_stale: { state: 'ok', value: 0 },
    reports: { state: 'ok', value: 0 },
  });
  const unchecked = uncheckedMetrics(metrics);
  assert.ok(unchecked.some((m) => m.key === 'gauge_missing'));
  assert.ok(!unchecked.some((m) => m.key === 'gauge_stale'));
  assert.ok(
    !unchecked.some((m) => !m.attention),
    'only metrics that could raise a flag count',
  );
  const job = {
    key: 'job_post-blog', section: 'Scheduled jobs', label: '', detail: '', href: '',
    attention: false, state: 'unknown' as const, value: null,
  };
  assert.ok(uncheckedMetrics([job]).length === 1, 'an unreadable task result counts');
  assert.equal(uncheckedMetrics([{ ...job, state: 'ok', value: 'ok' }]).length, 0);
});
