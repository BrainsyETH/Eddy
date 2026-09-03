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

// ── requireGlobalLimiter: absent is not the same as erroring ──────────────
//
// failClosed governs a CONFIGURED limiter that is failing. With no Upstash at
// all it only warns, and per-instance limiting stands in — right for login and
// uploads, wrong for a route that spends a paid third-party call per request.
// Such a route asks for the global limiter by name and gets a 503 without it,
// in production only; dev and test keep the in-memory map.

/**
 * NODE_ENV is typed readonly by @types/node, and this is the one thing a test
 * of a production-only branch has to move. defineProperty rather than a cast,
 * so the restore below puts the property back the way it was found instead of
 * leaving a plain value where the runtime expects its own descriptor.
 */
function setNodeEnv(value: string | undefined): void {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value,
    configurable: true,
    enumerable: true,
    writable: true,
  });
}

test('requireGlobalLimiter rejects in production when Upstash is not configured', async () => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  const env = process.env.NODE_ENV;
  setNodeEnv('production');
  try {
    const res = await rateLimit('require-global:prod', 10, 60_000, {
      failClosed: true,
      requireGlobalLimiter: true,
    });
    assert.ok(res, 'expected a rejection');
    assert.equal(res.status, 503);
  } finally {
    setNodeEnv(env);
  }
});

test('requireGlobalLimiter falls back to the in-memory map outside production', async () => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  const res = await rateLimit('require-global:dev', 10, 60_000, {
    failClosed: true,
    requireGlobalLimiter: true,
  });
  assert.equal(res, null);
});

test('requireGlobalLimiter is satisfied by a configured, working Upstash', async () => {
  redisOk(1);
  const res = await rateLimit('require-global:redis', 10, 60_000, {
    failClosed: true,
    requireGlobalLimiter: true,
  });
  assert.equal(res, null);
});
