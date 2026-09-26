import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { makeTrackedFetch, measure } from './core';
import {
  decodeHash,
  fields,
  historyDays,
  mergeHistograms,
  percentile,
  type Observation,
} from './model';
import { telemetryConfig, recordBatch } from './redis';
const base: Observation = {
  provider: 'usgs',
  operation: 'latest',
  kind: 'fetch_no_store',
  outcome: '2xx',
  durationMs: 150,
  at: Date.parse('2026-09-26T23:59:59Z'),
};

test('fetch preserves identity, options, response body, and HTTP errors', async () => {
  const observations: Observation[] = [];
  const response = new Response('body', { status: 429 });
  const options: RequestInit = {
    cache: 'no-store',
    signal: new AbortController().signal,
    next: { revalidate: 0 },
  };
  const wrapped = makeTrackedFetch(
    (e) => observations.push(e),
    async (input, init) => {
      assert.equal(input, 'https://example.test/private?token=never-log');
      assert.equal(init, options);
      return response;
    },
  );
  assert.equal(
    await wrapped(
      'usgs',
      'latest',
      'https://example.test/private?token=never-log',
      options,
    ),
    response,
  );
  assert.equal(await response.text(), 'body');
  assert.equal(observations[0].outcome, '429');
  assert.equal(observations[0].kind, 'fetch_no_store');
  assert.ok(!JSON.stringify(observations).includes('never-log'));
});
test('telemetry failures cannot replace results or original network errors', async () => {
  const failure = new TypeError('network');
  const wrapped = makeTrackedFetch(
    () => {
      throw new Error('Redis down');
    },
    async () => {
      throw failure;
    },
  );
  await assert.rejects(
    () => wrapped('usgs', 'latest', 'https://example.test'),
    (error) => error === failure,
  );
  const response = new Response('ok');
  assert.equal(
    await makeTrackedFetch(
      () => {
        throw new Error('Redis down');
      },
      async () => response,
    )('usgs', 'latest', 'https://example.test'),
    response,
  );
});
test('timeout, cancellation and network failure remain distinct', async () => {
  for (const [name, outcome] of [
    ['TimeoutError', 'timeout'],
    ['AbortError', 'cancelled'],
    ['TypeError', 'network'],
  ]) {
    let recorded: Observation | undefined;
    const error = new Error('original');
    error.name = name;
    await assert.rejects(
      () =>
        makeTrackedFetch(
          (e) => {
            recorded = e;
          },
          async () => {
            throw error;
          },
        )('usgs', 'latest', 'https://example.test'),
      (e) => e === error,
    );
    assert.equal(recorded?.outcome, outcome);
  }
});
test('SDK usage and MCP tool-level failures are measured without inspecting content', async () => {
  const events: Observation[] = [];
  const result = {
    usage: {
      input_tokens: 20,
      output_tokens: 10,
      cache_read_input_tokens: 50,
      cache_creation_input_tokens: 100,
    },
    content: 'secret',
  };
  assert.equal(
    await measure(
      'anthropic',
      'chat',
      'claude-sonnet-4-6',
      async () => result,
      (e) => events.push(e),
    ),
    result,
  );
  assert.equal(events[0].tokens?.cacheRead, 50);
  assert.ok(!JSON.stringify(events).includes('secret'));
  await measure(
    'mcp',
    'get_river',
    undefined,
    async () => ({ isError: true }),
    (e) => events.push(e),
  );
  assert.equal(events[1].outcome, '5xx');
});
test('sampling weights and combined histograms preserve a meaningful 7-day percentile', () => {
  const hash = Object.fromEntries([
    ...fields(base, 0.1),
    ...fields({ ...base, outcome: '429', durationMs: 4000 }, 1),
  ]);
  const rows = decodeHash(hash, '2026-09-26', 'production');
  assert.equal(
    rows.reduce((n, r) => n + r.estimated_calls, 0),
    11,
  );
  assert.equal(
    rows.reduce((n, r) => n + r.estimated_errors, 0),
    1,
  );
  assert.equal(percentile(mergeHistograms(rows), 0.95), '≤5000 ms');
  assert.deepEqual(historyDays(Date.parse('2026-09-27T00:00:01Z'), 2), [
    '2026-09-27',
    '2026-09-26',
  ]);
  assert.equal(percentile(Array(10).fill(0), 0.95), null);
});
test('missing Redis configuration disables all collection', async () => {
  const previous = process.env.UPSTREAM_TELEMETRY_ENABLED;
  delete process.env.UPSTREAM_TELEMETRY_ENABLED;
  try {
    assert.equal(telemetryConfig().enabled, false);
    await recordBatch([{ event: base, rate: 1 }]);
  } finally {
    if (previous !== undefined)
      process.env.UPSTREAM_TELEMETRY_ENABLED = previous;
  }
});
test('daily snapshots are idempotent, survive late writes, and reject stale concurrent snapshots', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;',
    );
    await db.exec(
      readFileSync(
        'supabase/migrations/20260926182352_upstream_usage_daily.sql',
        'utf8',
      ),
    );
    const rows = decodeHash(
      Object.fromEntries(fields(base, 1)),
      '2026-09-26',
      'production',
      '2026-09-27T00:01Z',
    );
    const save = (value: unknown) =>
      db.query('SELECT store_upstream_snapshot($1::jsonb)', [
        JSON.stringify(value),
      ]);
    await save(rows);
    await save(rows);
    const newer = rows.map((r) => ({
      ...r,
      observed_calls: 2,
      estimated_calls: 2,
      histogram: r.histogram.map((n) => n * 2),
      collected_at: '2026-09-27T00:02Z',
    }));
    await save(newer);
    await save(rows);
    const result = await db.query<{ observed_calls: number }>(
      'SELECT observed_calls FROM upstream_usage_daily',
    );
    assert.equal(result.rows.length, 1);
    assert.equal(Number(result.rows[0].observed_calls), 2);
    await db.exec('SET ROLE anon');
    await assert.rejects(() => save(rows), /permission denied/);
  } finally {
    await db.close();
  }
});

test('MCP transport supplies telemetry to the shared tool catalog and is limited', () => {
  const source = readFileSync('src/app/api/mcp/route.ts', 'utf8');
  assert.match(source, /track:.*trackedMcp/);
  assert.match(source, /rateLimit\(`mcp:/);
  assert.match(source, /requireGlobalLimiter: true/);
});
