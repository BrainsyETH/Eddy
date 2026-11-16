import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { loadCampgroundSites } from './web-detail-cache';
import { withCampingTimeout } from './web-request';

let clock = 0;
beforeEach(() => {
  clock += 120_000; // Expire entries from the previous test without a test-only cache API.
  mock.method(Date, 'now', () => clock);
});
afterEach(() => mock.restoreAll());
const load = (facility = 'camp', arrival = '2026-11-11', departure = '2026-11-12') =>
  loadCampgroundSites(facility, arrival, departure);
const response = () => Response.json({ facilityId: 'camp', sites: [], availableSites: [], summary: null });

test('shares in-flight and completed requests for the same campground and dates', async t => {
  let resolve!: (value: Response) => void;
  const request = t.mock.method(globalThis, 'fetch', () => new Promise<Response>(done => { resolve = done; }));
  const first = load();
  assert.equal(load(), first);
  assert.equal(request.mock.callCount(), 1);
  resolve(response());
  assert.equal((await first)?.facilityId, 'camp');
  assert.equal(load(), first);
  assert.equal(request.mock.callCount(), 1);
});

test('isolates facilities and both stay dates in the cache key', async t => {
  const request = t.mock.method(globalThis, 'fetch', async () => response());
  await Promise.all([load(), load('other'), load('camp', '2026-11-10'), load('camp', undefined, '2026-11-13')]);
  assert.equal(request.mock.callCount(), 4);
  const params = new URL(String(request.mock.calls[3].arguments[0]), 'https://example.test').searchParams;
  assert.equal(params.get('facility'), 'camp');
  assert.equal(params.get('arrival'), '2026-11-11');
  assert.equal(params.get('departure'), '2026-11-13');
});

test('reuses before expiry and refetches exactly at the 60-second boundary', async t => {
  const request = t.mock.method(globalThis, 'fetch', async () => response());
  const first = load();
  await first;
  clock += 59_999;
  assert.equal(load(), first);
  clock++;
  const second = load();
  assert.notEqual(second, first);
  await second;
  assert.equal(request.mock.callCount(), 2);
});

test('evicts the oldest entry when the 40-entry limit is reached', async t => {
  const request = t.mock.method(globalThis, 'fetch', async () => response());
  const first = load('camp-0');
  const retained = load('camp-1');
  await Promise.all([first, retained, ...Array.from({ length: 39 }, (_, i) => load(`camp-${i + 2}`))]);
  assert.equal(request.mock.callCount(), 41);
  assert.equal(load('camp-1'), retained);
  const replacement = load('camp-0');
  assert.notEqual(replacement, first);
  await replacement;
  assert.equal(request.mock.callCount(), 42);
});

test('evicts network, HTTP and invalid-body failures so the next request can retry', async t => {
  const attempts = [() => Promise.reject(new Error('Network failed')),
    async () => new Response('', { status: 503 }),
    async () => new Response('not JSON'),
    async () => response()];
  const request = t.mock.method(globalThis, 'fetch', () => attempts.shift()!());
  for (let i = 0; i < 3; i++) await assert.rejects(load());
  assert.equal((await load())?.facilityId, 'camp');
  assert.equal(request.mock.callCount(), 4);
});

test('an expired request failing later cannot evict its replacement', async t => {
  let reject!: (error: Error) => void;
  let calls = 0;
  t.mock.method(globalThis, 'fetch', () => ++calls === 1
    ? new Promise<Response>((_, fail) => { reject = fail; }) : Promise.resolve(response()));
  const old = load();
  const oldFailure = assert.rejects(old, /Old request/);
  clock += 60_000;
  const current = load();
  await current;
  reject(new Error('Old request'));
  await oldFailure;
  assert.equal(load(), current);
  assert.equal(calls, 2);
});

test('caches a missing facility as null for only the normal cache lifetime', async t => {
  const request = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }));
  assert.equal(await load(), null);
  assert.equal(await load(), null);
  assert.equal(request.mock.callCount(), 1);
  clock += 60_000;
  assert.equal(await load(), null);
  assert.equal(request.mock.callCount(), 2);
});

test('detail timeout covers a stalled response body and permits retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const request = t.mock.method(globalThis, 'fetch', async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => ({
    status: 200, ok: true,
    json: () => new Promise((_, reject) => init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true })),
  } as Response));
  const first = load();
  const rejected = assert.rejects(first, { name: 'TimeoutError' });
  await Promise.resolve(); // Enter response.json before advancing the deadline.
  t.mock.timers.tick(8000);
  await rejected;
  request.mock.mockImplementation(async () => response());
  assert.equal((await load())?.facilityId, 'camp');
  assert.equal(request.mock.callCount(), 2);
});

test('photo deadline works without AbortSignal.any or timeout and leaves the parent active', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const key of ['any', 'timeout'] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(AbortSignal, key)!;
    Object.defineProperty(AbortSignal, key, { ...descriptor, value: undefined });
    t.after(() => Object.defineProperty(AbortSignal, key, descriptor));
  }
  const parent = new AbortController();
  const promise = withCampingTimeout(signal => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }), 10000, parent.signal);
  const rejected = assert.rejects(promise, { name: 'TimeoutError' });
  t.mock.timers.tick(10000);
  await rejected;
  assert.equal(parent.signal.aborted, false, 'a timeout must reach the photo retry UI, not look like unmount cancellation');
});

test('parent abort cancels running work, and pre-aborted work never starts', async () => {
  const parent = new AbortController();
  let calls = 0;
  const operation = (signal: AbortSignal) => new Promise((_, reject) => {
    calls++;
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  const running = withCampingTimeout(operation, 10000, parent.signal);
  const rejected = assert.rejects(running, { name: 'AbortError' });
  parent.abort();
  await rejected;
  await assert.rejects(withCampingTimeout(operation, 10000, parent.signal), { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('settled requests clear their timer and detach the parent abort listener', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const parent = new AbortController();
  const remove = t.mock.method(parent.signal, 'removeEventListener');
  let child!: AbortSignal;
  assert.equal(await withCampingTimeout(async signal => { child = signal; return 'done'; }, 10, parent.signal), 'done');
  assert.equal(remove.mock.callCount(), 1);
  t.mock.timers.tick(10);
  parent.abort();
  assert.equal(child.aborted, false);
});
