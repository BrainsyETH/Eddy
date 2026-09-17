import assert from 'node:assert/strict';
import test from 'node:test';
import type { MapAccessPoint } from '@eddy/types';
import { loadPlanAccess } from '../../../eddy-ios/src/lib/loadPlanAccess';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness() {
  const cache = deferred<MapAccessPoint[] | undefined>();
  const network = deferred<MapAccessPoint[]>();
  const controller = new AbortController();
  const shown: MapAccessPoint[][] = [];
  let unavailable = 0;
  const done = loadPlanAccess({
    cached: () => cache.promise,
    fresh: () => network.promise,
    publish: (points) => shown.push(points),
    unavailable: () => { unavailable += 1; },
    signal: controller.signal,
  });
  return { cache, network, controller, shown, done, unavailable: () => unavailable };
}

const cached = [{ id: 'old' }] as MapAccessPoint[];
const fresh = [{ id: 'new' }] as MapAccessPoint[];

test('places render from cache while the network is still pending, then refresh', async () => {
  const h = harness();
  h.cache.resolve(cached);
  await Promise.resolve();
  assert.deepEqual(h.shown, [cached]);
  h.network.resolve(fresh);
  await h.done;
  assert.deepEqual(h.shown, [cached, fresh]);
});

test('a late cache cannot replace a fresh response, including a known-empty river', async () => {
  for (const points of [fresh, []]) {
    const h = harness();
    h.network.resolve(points);
    await h.done;
    h.cache.resolve(cached);
    await Promise.resolve();
    assert.deepEqual(h.shown, [points]);
  }
});

test('network failure retains cached places, including a cached empty array', async () => {
  for (const points of [cached, []]) {
    const h = harness();
    h.network.reject(new Error('offline'));
    h.cache.resolve(points);
    await h.done;
    assert.deepEqual(h.shown, [points]);
    assert.equal(h.unavailable(), 0);
  }
});

test('no cache and failed network reports unavailable rather than an empty route', async () => {
  const h = harness();
  h.cache.resolve(undefined);
  h.network.reject(new Error('offline'));
  await h.done;
  assert.deepEqual(h.shown, []);
  assert.equal(h.unavailable(), 1);
});

test('a broken cache cannot prevent fresh places from rendering', async () => {
  const h = harness();
  h.cache.reject(new Error('storage unavailable'));
  h.network.resolve(fresh);
  await h.done;
  assert.deepEqual(h.shown, [fresh]);
  assert.equal(h.unavailable(), 0);
});

test('changing river or leaving the screen suppresses late responses and errors', async () => {
  for (const fail of [false, true]) {
    const h = harness();
    h.controller.abort();
    h.cache.resolve(cached);
    if (fail) h.network.reject(new Error('cancelled'));
    else h.network.resolve(fresh);
    await h.done;
    assert.deepEqual(h.shown, []);
    assert.equal(h.unavailable(), 0);
  }
});
