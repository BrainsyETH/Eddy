import assert from 'node:assert/strict';
import test from 'node:test';
import { BoundedTtlCache, parseWeatherCoords } from './request';

const parse = (query: string) => parseWeatherCoords(new URLSearchParams(query));

test('coordinates snap to the same 0.05° grid the iOS app quantises to', () => {
  const result = parse('lat=37.1234&lon=-91.4321');
  assert.deepEqual(result, { ok: true, lat: 37.1, lon: -91.45, key: '37.1,-91.45' });
  // Two nearby points are one upstream call, not two.
  assert.equal((parse('lat=37.11&lon=-91.44') as { key: string }).key, '37.1,-91.45');
});

test('non-numbers and locations outside the US are rejected before any paid call', () => {
  for (const query of ['lat=abc&lon=-91', 'lat=NaN&lon=-91', 'lat=37', 'lat=48.85&lon=2.35', 'lat=-33.9&lon=151.2', 'lat=1e9&lon=-91']) {
    assert.equal(parse(query).ok, false, query);
  }
  assert.equal(parse('lat=61.2&lon=-149.9').ok, true, 'Alaska is in');
  assert.equal(parse('lat=21.3&lon=-157.8').ok, true, 'Hawaii is in');
});

test('the cache is bounded and evicts the least recently used entry', () => {
  const cache = new BoundedTtlCache<number>(60_000, 2);
  cache.set('a', 1, 0);
  cache.set('b', 2, 0);
  cache.get('a', 1); // a is now most recent
  cache.set('c', 3, 2);
  assert.equal(cache.size, 2);
  assert.equal(cache.get('b', 3), undefined, 'b was least recently used');
  assert.equal(cache.get('a', 3), 1);
});

test('entries expire after their TTL', () => {
  const cache = new BoundedTtlCache<number>(1000);
  cache.set('a', 1, 0);
  assert.equal(cache.get('a', 999), 1);
  assert.equal(cache.get('a', 1000), undefined);
});

// ── The request flow: cache first, then a limiter that fails closed ─────────

import { NextRequest } from 'next/server';
import { coordinateWeatherHandler, WEATHER_LIMIT_POLICY } from './request';

function route(overrides: Partial<Parameters<typeof coordinateWeatherHandler<{ t: number }>>[0]> = {}) {
  const calls = { load: 0, limit: 0 };
  const handler = coordinateWeatherHandler<{ t: number }>({
    name: 'weather-test',
    cache: new BoundedTtlCache<{ t: number }>(60_000),
    cdnHeaders: {},
    apiKey: () => 'key',
    load: async () => {
      calls.load++;
      return { t: 1 };
    },
    ...overrides,
  });
  return { handler, calls };
}
const req = (query = 'lat=37.1&lon=-91.4') => new NextRequest(`https://eddy.guide/api/weather?${query}`);

test('the weather limiter fails closed and requires a global limiter', () => {
  assert.deepEqual(WEATHER_LIMIT_POLICY, { failClosed: true, requireGlobalLimiter: true });
});

test('when the limiter rejects (e.g. Redis down), no paid call is made', async () => {
  const { handler, calls } = route({
    limit: async () => {
      const { NextResponse } = await import('next/server');
      return NextResponse.json({ error: 'limiter unavailable' }, { status: 503 });
    },
  });
  const response = await handler(req());
  assert.equal(response.status, 503);
  assert.equal(calls.load, 0);
});

test('a cached point is served without touching the limiter or the provider', async () => {
  let limited = 0;
  const { handler, calls } = route({ limit: async () => (limited++, null) });
  await handler(req());
  await handler(req());
  assert.equal(calls.load, 1);
  assert.equal(limited, 1, 'Only the uncached request paid the limiter round trip');
});

test('in production with no global limiter configured, an uncached request is refused', async () => {
  const saved = { node: process.env.NODE_ENV, url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN };
  const env = process.env as Record<string, string | undefined>;
  env.NODE_ENV = 'production';
  delete env.UPSTASH_REDIS_REST_URL;
  delete env.UPSTASH_REDIS_REST_TOKEN;
  try {
    const { handler, calls } = route(); // default, real limiter
    const response = await handler(req());
    assert.equal(response.status, 503);
    assert.equal(calls.load, 0, 'Per-instance fallback is not a limit for a paid call');
  } finally {
    env.NODE_ENV = saved.node;
    if (saved.url !== undefined) env.UPSTASH_REDIS_REST_URL = saved.url;
    if (saved.token !== undefined) env.UPSTASH_REDIS_REST_TOKEN = saved.token;
  }
});

test('bad coordinates are rejected before the cache or limiter', async () => {
  let limited = 0;
  const { handler, calls } = route({ limit: async () => (limited++, null) });
  assert.equal((await handler(req('lat=48.85&lon=2.35'))).status, 400);
  assert.equal(limited + calls.load, 0);
});
