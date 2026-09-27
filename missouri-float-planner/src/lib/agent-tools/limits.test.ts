import assert from 'node:assert/strict';
import test from 'node:test';
import { createMcpLimiter, mcpLimits, mcpNetworkBucket } from './limits';
import { rateLimit } from '@/lib/rate-limit';

const heavy = { method: 'tools/call', params: { name: 'find_floats' } };

test('shared-IP limits are configurable with bounded positive defaults', () => {
  assert.deepEqual(mcpLimits({}), { requestsPerIp: 600, heavyPerIp: 60, heavyGlobal: 120 });
  assert.deepEqual(
    mcpLimits({
      MCP_REQUESTS_PER_IP_PER_MINUTE: '-1',
      MCP_HEAVY_PER_IP_PER_MINUTE: '0',
      MCP_HEAVY_GLOBAL_PER_MINUTE: 'Infinity',
    }),
    mcpLimits({}),
  );
  assert.equal(mcpLimits({ MCP_HEAVY_PER_IP_PER_MINUTE: '80' }).heavyPerIp, 80);
});

test('network log IDs are keyed, rotate daily and never claim user identity', () => {
  const env = { MCP_LOG_HASH_KEY: 'test-secret' },
    now = Date.parse('2026-09-26T12:00:00Z');
  const id = mcpNetworkBucket('192.0.2.1', env, now);
  assert.doesNotMatch(id, /192\.0\.2/);
  assert.equal(id, mcpNetworkBucket('192.0.2.1', env, now + 1000));
  assert.notEqual(id, mcpNetworkBucket('192.0.2.1', env, now + 86400000));
  assert.notEqual(id, mcpNetworkBucket('192.0.2.1', { MCP_LOG_HASH_KEY: 'another-secret' }, now));
  assert.equal(mcpNetworkBucket('192.0.2.1', {}, now), 'unavailable');
});

test('one find_floats request consumes one heavy allowance and logs the rejecting bucket', async () => {
  const calls: string[] = [],
    events: Record<string, unknown>[] = [];
  const limiter = createMcpLimiter('192.0.2.2', {
    env: { MCP_LOG_HASH_KEY: 'test-secret' },
    limit: async (key, _limit, _window, options) => {
      assert.equal(options?.requireGlobalLimiter, true);
      calls.push(key);
      return key === 'mcp-heavy:global'
        ? new Response(null, { status: 429, headers: { 'Retry-After': '45' } })
        : null;
    },
    log: (event) => events.push(event),
  });
  assert.equal(await limiter.general(), null);
  assert.equal((await limiter.tool(heavy))?.status, 429);
  assert.deepEqual(calls, ['mcp:192.0.2.2', 'mcp-heavy:192.0.2.2', 'mcp-heavy:global']);
  assert.equal(events[0].bucket, 'global_heavy');
  assert.equal(events[0].tool, 'find_floats');
  assert.equal(events[0].retryAfter, '45');
  assert.doesNotMatch(JSON.stringify(events), /192\.0\.2/);
});

test('an IP rejection never consumes global allowance; logging failure never admits it', async () => {
  const calls: string[] = [];
  const limiter = createMcpLimiter('fixture-ip', {
    env: {},
    limit: async (key) => {
      calls.push(key);
      return new Response(null, { status: 429 });
    },
    log: () => {
      throw new Error('logging unavailable');
    },
  });
  assert.equal((await limiter.tool(heavy))?.status, 429);
  assert.deepEqual(calls, ['mcp-heavy:fixture-ip']);
  assert.equal(await limiter.tool({ method: 'tools/list' }), null);
});

test('configured limits return actual 429 and Retry-After through the memory backend', async () => {
  const original = {
    node: process.env.NODE_ENV,
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
  const env = process.env as Record<string, string | undefined>;
  env.NODE_ENV = 'test';
  delete env.UPSTASH_REDIS_REST_URL;
  delete env.UPSTASH_REDIS_REST_TOKEN;
  try {
    const limiter = createMcpLimiter(`test-${Date.now()}`, {
      env: { MCP_REQUESTS_PER_IP_PER_MINUTE: '2', MCP_HEAVY_PER_IP_PER_MINUTE: '1' },
      limit: rateLimit,
      log: () => {},
    });
    assert.equal(await limiter.general(), null);
    assert.equal(await limiter.general(), null);
    const response = await limiter.general();
    assert.equal(response?.status, 429);
    assert.ok(Number(response?.headers.get('retry-after')) > 0);
    assert.equal(await limiter.tool(heavy), null);
    assert.equal((await limiter.tool(heavy))?.status, 429);
  } finally {
    for (const [key, value] of Object.entries({
      NODE_ENV: original.node,
      UPSTASH_REDIS_REST_URL: original.url,
      UPSTASH_REDIS_REST_TOKEN: original.token,
    })) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  }
});

test('stateless HTTP refuses standalone SSE and session deletion instead of reconnect loops', async () => {
  const { GET, DELETE } = await import('@/app/api/mcp/route');
  for (const [method, handle] of [
    ['GET', GET],
    ['DELETE', DELETE],
  ] as const) {
    const response = await handle(new Request('https://eddy.guide/api/mcp', { method }));
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'POST');
  }
  const invalidOrigin = await GET(
    new Request('https://eddy.guide/api/mcp', { headers: { origin: 'https://another.example' } }),
  );
  assert.equal(invalidOrigin.status, 403);
});
