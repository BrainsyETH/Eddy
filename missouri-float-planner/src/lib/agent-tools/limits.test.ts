import assert from 'node:assert/strict';
import test from 'node:test';
import { createMcpLimiter, mcpLimits, mcpNetworkBucket } from './limits';
import { admitMcpWork, ADMISSION_SCRIPT, type WorkBucket } from './admission';

const heavy = { method: 'tools/call', params: { name: 'find_floats' } };
const detail = { method: 'tools/call', params: { name: 'plan_float' } };

test('shared-IP limits retain separate bounded search and detail allocations', () => {
  assert.deepEqual(mcpLimits({}), {
    requestsPerIp: 600,
    heavyPerIp: 60,
    heavyGlobal: 120,
    searchGlobal: 60,
    detailGlobal: 60,
  });
  assert.deepEqual(
    mcpLimits({
      MCP_REQUESTS_PER_IP_PER_MINUTE: '-1',
      MCP_HEAVY_PER_IP_PER_MINUTE: '0',
      MCP_HEAVY_GLOBAL_PER_MINUTE: 'Infinity',
    }),
    mcpLimits({}),
  );
  assert.equal(mcpLimits({ MCP_HEAVY_PER_IP_PER_MINUTE: '80' }).heavyPerIp, 80);
  assert.equal(mcpLimits({ MCP_HEAVY_GLOBAL_PER_MINUTE: '1' }).heavyGlobal, 2);
});

test('network log IDs require their own key and rotate daily', () => {
  const env = { MCP_LOG_HASH_KEY: 'test-secret' },
    now = Date.parse('2026-09-26T12:00:00Z');
  const id = mcpNetworkBucket('192.0.2.1', env, now);
  assert.ok(id);
  assert.doesNotMatch(id, /192\.0\.2/);
  assert.equal(
    id,
    mcpNetworkBucket(
      '192.0.2.1',
      { ...env, UPSTASH_REDIS_REST_TOKEN: 'rotated' },
      now + 1000,
    ),
  );
  assert.notEqual(id, mcpNetworkBucket('192.0.2.1', env, now + 86400000));
  assert.notEqual(
    id,
    mcpNetworkBucket('192.0.2.1', { MCP_LOG_HASH_KEY: 'another-secret' }, now),
  );
  assert.equal(
    mcpNetworkBucket(
      '192.0.2.1',
      { UPSTASH_REDIS_REST_TOKEN: 'must-not-reuse' },
      now,
    ),
    undefined,
  );
});

test('heavy admission is one atomic operation; only opaque correlation is logged', async () => {
  const events: Record<string, unknown>[] = [];
  const limiter = createMcpLimiter('192.0.2.2', {
    env: { MCP_LOG_HASH_KEY: 'test-secret' },
    admit: async (buckets) => {
      assert.deepEqual(
        buckets.map((b) => b.name),
        ['ip_heavy', 'global_search', 'global_heavy'],
      );
      assert.deepEqual(
        buckets.map((b) => b.allowance),
        [60, 60, 120],
      );
      return {
        bucket: 'global_search',
        response: new Response(null, {
          status: 429,
          headers: { 'Retry-After': '45' },
        }),
      };
    },
    log: (event) => events.push(event),
  });
  assert.equal((await limiter.tool(heavy))?.status, 429);
  assert.equal(events[0].bucket, 'global_search');
  assert.equal(events[0].tool, 'find_floats');
  assert.equal(events[0].retryAfter, '45');
  assert.doesNotMatch(JSON.stringify(events), /192\.0\.2/);
  assert.equal(await limiter.tool({ method: 'tools/list' }), null);
});

test('a rejection consumes no other work buckets, including under concurrent admission', async () => {
  const prefix = `test-${Math.random()}`;
  const env = { NODE_ENV: 'test' };
  const ip = (name: string): WorkBucket => ({
    name: 'ip',
    key: `${prefix}-${name}`,
    allowance: 1,
  });
  const global: WorkBucket = {
    name: 'global',
    key: `${prefix}-global`,
    allowance: 2,
  };
  assert.equal(await admitMcpWork([ip('a'), global], env), null);
  assert.equal((await admitMcpWork([ip('a'), global], env))?.bucket, 'ip');
  assert.equal(await admitMcpWork([ip('b'), global], env), null);
  assert.equal((await admitMcpWork([ip('c'), global], env))?.bucket, 'global');
  // c wasn't charged when global refused it.
  assert.equal(await admitMcpWork([ip('c')], env), null);
  const concurrent = await Promise.all(
    Array.from({ length: 10 }, () => admitMcpWork([ip('race')], env)),
  );
  assert.equal(concurrent.filter((r) => r === null).length, 1);
});

test('exhausted search capacity leaves detailed planning capacity available', async () => {
  const prefix = Math.random().toString();
  const options = {
    env: { MCP_HEAVY_GLOBAL_PER_MINUTE: '4', MCP_HEAVY_PER_IP_PER_MINUTE: '4' },
    admit: (buckets: WorkBucket[]) =>
      admitMcpWork(
        buckets.map((b) => ({ ...b, key: prefix + b.key })),
        { NODE_ENV: 'test' },
      ),
    log: () => {},
  };
  const a = createMcpLimiter('a', options),
    b = createMcpLimiter('b', options);
  assert.equal(await a.tool(heavy), null);
  assert.equal(await b.tool(heavy), null);
  assert.equal((await b.tool(heavy))?.status, 429);
  assert.equal(await a.tool(detail), null);
  assert.equal(await b.tool(detail), null);
  assert.equal((await a.tool(detail))?.status, 429);
});

test('Redis uses one EVAL request and fails closed on malformed responses or outage', async () => {
  const saved = globalThis.fetch;
  const env = {
    NODE_ENV: 'production',
    UPSTASH_REDIS_REST_URL: 'https://fixture.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'fixture',
  };
  const buckets = [{ name: 'global', key: 'fixture', allowance: 4 }];
  try {
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body, [
        'EVAL',
        ADMISSION_SCRIPT,
        1,
        'fixture',
        60000,
        4,
      ]);
      return Response.json({ result: [1, 1500] });
    };
    const denied = await admitMcpWork(buckets, env);
    assert.equal(denied?.response.status, 429);
    assert.equal(denied?.response.headers.get('retry-after'), '2');
    for (const body of [
      { error: 'ERR' },
      { result: [99, 0] },
      { result: [0, null] },
    ]) {
      globalThis.fetch = async () => Response.json(body);
      assert.equal((await admitMcpWork(buckets, env))?.response.status, 503);
    }
    globalThis.fetch = async () => {
      throw new Error('offline');
    };
    assert.equal((await admitMcpWork(buckets, env))?.response.status, 503);
    assert.equal(
      (await admitMcpWork(buckets, { NODE_ENV: 'production' }))?.response
        .status,
      503,
    );
  } finally {
    globalThis.fetch = saved;
  }
});

test('stateless HTTP refuses SSE and distinguishes parse, shape and size errors', async () => {
  const { GET, DELETE, POST } = await import('@/app/api/mcp/route');
  for (const [method, handle] of [
    ['GET', GET],
    ['DELETE', DELETE],
  ] as const) {
    const response = await handle(
      new Request('https://eddy.guide/api/mcp', { method }),
    );
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'POST');
  }
  assert.equal(
    (
      await GET(
        new Request('https://eddy.guide/api/mcp', {
          headers: { origin: 'https://another.example' },
        }),
      )
    ).status,
    403,
  );
  for (const [body, status, code] of [
    ['{', 400, -32700],
    ['', 400, -32700],
    ['[]', 400, -32600],
    ['null', 400, -32600],
    ['x'.repeat(33 * 1024), 413, -32600],
  ] as const) {
    const response = await POST(
      new Request('https://eddy.guide/api/mcp', { method: 'POST', body }),
    );
    assert.equal(response.status, status);
    assert.equal((await response.json()).error.code, code);
  }
});

test('general attempt limits still reject and a logging failure cannot admit heavy work', async () => {
  const limiter = createMcpLimiter(`general-${Math.random()}`, {
    env: { MCP_REQUESTS_PER_IP_PER_MINUTE: '2' },
    admit: async () => ({
      bucket: 'ip_heavy',
      response: new Response(null, { status: 429 }),
    }),
    log: () => {
      throw new Error('logging offline');
    },
  });
  assert.equal(await limiter.general(), null);
  assert.equal(await limiter.general(), null);
  assert.equal((await limiter.general())?.status, 429);
  assert.equal((await limiter.tool(heavy))?.status, 429);
});
