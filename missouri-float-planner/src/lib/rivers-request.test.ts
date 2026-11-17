import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRiver, loadRivers } from './rivers-request';
import { loadCampingRivers } from './camping/web-rivers';

test('river list and detail handoffs work without AbortSignal.any or timeout', async t => {
  for (const key of ['any', 'timeout'] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(AbortSignal, key)!;
    Object.defineProperty(AbortSignal, key, { ...descriptor, value: undefined });
    t.after(() => Object.defineProperty(AbortSignal, key, descriptor));
  }
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify(url === '/api/rivers' ? { rivers: [{ slug: 'current' }] } : { river: { slug: 'current' } }));
  });
  assert.equal((await loadRivers())[0].slug, 'current');
  assert.equal((await loadRiver('current')).slug, 'current');
  assert.deepEqual(calls, ['/api/rivers', '/api/rivers/current']);
});

test('river handoffs time out while reading the body and preserve caller cancellation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => ({
    ok: true,
    json: () => new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true })),
  }));
  const parent = new AbortController();
  const result = loadRiver('current', parent.signal);
  const rejected = assert.rejects(result, { name: 'TimeoutError' });
  await Promise.resolve();
  t.mock.timers.tick(15_000);
  await rejected;
  assert.equal(parent.signal.aborted, false);
  parent.abort();
  await assert.rejects(loadRivers(parent.signal), { name: 'AbortError' });
});

test('camping accounts for HTTP cache time before aging a legacy relative-age response', async t => {
  const now = Date.parse('2026-11-17T12:00:00Z');
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ rivers: [] }), {
    headers: { date: 'Tue, 17 Nov 2026 11:30:00 GMT', age: '3600' },
  }));
  const snapshot = await loadCampingRivers();
  assert.equal(snapshot.receivedAt, now - 3_600_000);
});

test('an unsuccessful river response rejects instead of publishing empty data', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 503 }));
  await assert.rejects(loadRivers(), /Failed to fetch rivers/);
  await assert.rejects(loadRiver('current'), /Failed to fetch river/);
  await assert.rejects(loadCampingRivers(), /Rivers could not be loaded/);
});
