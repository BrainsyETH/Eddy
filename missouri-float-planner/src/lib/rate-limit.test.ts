// Guards the F14 audit fix: costly/storage/auth routes fail CLOSED when the
// global limiter is configured but erroring; read-mostly routes still fail open.
import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import { rateLimit } from './rate-limit';

const realFetch = global.fetch;

beforeEach(() => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
});

afterEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  global.fetch = realFetch;
});

function stubRedis(handler: () => Promise<Response>) {
  global.fetch = handler as typeof fetch;
}

function redisOk(count: number, ttlMs = 60_000) {
  stubRedis(async () =>
    new Response(JSON.stringify([{ result: count }, { result: 1 }, { result: ttlMs }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

test('redis outage + failClosed rejects with 503 and Retry-After', async () => {
  stubRedis(async () => {
    throw new Error('connect ECONNREFUSED');
  });
  const res = await rateLimit('test:strict', 5, 60_000, { failClosed: true });
  assert.ok(res, 'strict route must not fail open');
  assert.equal(res.status, 503);
  assert.ok(res.headers.get('Retry-After'));
});

test('redis non-OK response + failClosed rejects with 503', async () => {
  stubRedis(async () => new Response('upstream error', { status: 500 }));
  const res = await rateLimit('test:strict-500', 5, 60_000, { failClosed: true });
  assert.ok(res);
  assert.equal(res.status, 503);
});

test('redis outage without failClosed still fails open (read-mostly routes)', async () => {
  stubRedis(async () => {
    throw new Error('connect ECONNREFUSED');
  });
  const res = await rateLimit('test:lax', 5, 60_000);
  assert.equal(res, null, 'lax route fails open on limiter outage');
});

test('healthy redis under the limit allows, over the limit returns 429', async () => {
  redisOk(3);
  assert.equal(await rateLimit('test:ok', 5, 60_000, { failClosed: true }), null);

  redisOk(6);
  const limited = await rateLimit('test:ok', 5, 60_000, { failClosed: true });
  assert.ok(limited);
  assert.equal(limited.status, 429);
});

test('in-memory fallback enforces the window when Upstash is not configured', async () => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;

  for (let i = 0; i < 3; i++) {
    assert.equal(await rateLimit('test:memory', 3, 60_000, { failClosed: true }), null);
  }
  const limited = await rateLimit('test:memory', 3, 60_000, { failClosed: true });
  assert.ok(limited, 'fourth request in the window must be limited');
  assert.equal(limited.status, 429);
});
