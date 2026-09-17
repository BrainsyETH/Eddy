import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequestPool, navigationCacheTtl } from '../../../eddy-ios/src/lib/requestPool';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test('simultaneous cards share a request; one unmount leaves the other running', async () => {
  const pool = createRequestPool();
  const pending = deferred<string>();
  let calls = 0;
  let sharedSignal: AbortSignal | undefined;
  const fetcher = (signal: AbortSignal) => { calls++; sharedSignal = signal; return pending.promise; };
  const controller = new AbortController();
  const first = pool.read('river', fetcher, controller.signal);
  const second = pool.read('river', fetcher);
  const cancelled = assert.rejects(first, { name: 'AbortError' });
  await Promise.resolve();
  controller.abort();
  assert.equal(sharedSignal?.aborted, false);
  pending.resolve('read');
  await cancelled;
  assert.equal(await second, 'read');
  assert.equal(calls, 1);
});

test('last subscriber cancellation aborts the request and permits immediate retry', async () => {
  const pool = createRequestPool();
  const controller = new AbortController();
  let sharedSignal: AbortSignal | undefined;
  const pending = deferred<number>();
  const result = pool.read('history', signal => { sharedSignal = signal; return pending.promise; }, controller.signal, 30_000);
  const rejected = assert.rejects(result, { name: 'AbortError' });
  await Promise.resolve(); controller.abort(); await rejected;
  assert.equal(sharedSignal?.aborted, true);
  pending.resolve(1);
  assert.equal(await pool.read('history', async () => 2, undefined, 30_000), 2);
});

test('navigation cache expires, is bounded, and separates authenticated identities', async () => {
  let now = 0;
  const pool = createRequestPool(2, () => now);
  let calls = 0;
  const fetcher = async () => ++calls;
  const first = JSON.stringify(['/api/eddy-update/current', 'token-a']);
  const second = JSON.stringify(['/api/eddy-update/current', 'token-b']);
  assert.equal(await pool.read(first, fetcher, undefined, 30), 1);
  assert.equal(await pool.read(first, fetcher, undefined, 30), 1);
  assert.equal(await pool.read(second, fetcher, undefined, 30), 2);
  now = 31;
  assert.equal(await pool.read(first, fetcher, undefined, 30), 3);
  await pool.read('third', fetcher, undefined, 30);
  assert.equal(await pool.read(second, fetcher, undefined, 30), 5);
});

test('failures never become cached answers', async () => {
  const pool = createRequestPool();
  await assert.rejects(pool.read('read', async () => { throw new Error('offline'); }, undefined, 30_000));
  assert.equal(await pool.read('read', async () => 'fresh', undefined, 30_000), 'fresh');
});

test('refresh/session invalidation prevents an older request from repopulating cache', async () => {
  const pool = createRequestPool();
  const pending = deferred<string>();
  const result = pool.read('read', () => pending.promise, undefined, 30_000);
  pool.clear(); pending.resolve('old'); await result;
  assert.equal(await pool.read('read', async () => 'new', undefined, 30_000), 'new');
  pool.clear();
  assert.equal(await pool.read('read', async () => 'newer', undefined, 30_000), 'newer');
});

test('only history, outlook and authenticated prose receive short navigation retention', () => {
  for (const path of ['/api/eddy-update/current', '/api/gauge-update/07067000', '/api/gauges/07067000/history?days=7', '/api/rivers/current/outlook?gaugeId=a']) assert.equal(navigationCacheTtl(path), 30_000);
  for (const path of ['/api/me/profile', '/api/conditions/current', '/api/river-alerts', '/api/dams', '/api/rivers', '/api/me/alerts']) assert.equal(navigationCacheTtl(path), 0);
});
