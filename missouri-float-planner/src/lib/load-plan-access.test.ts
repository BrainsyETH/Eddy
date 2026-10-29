import assert from 'node:assert/strict';
import test from 'node:test';
import type { MapAccessPoint } from '@eddy/types';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALONG_ROUTE_PREVIEW, alongRoutePoints, loadPlanAccess } from '../../../eddy-ios/src/lib/loadPlanAccess';

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

test('Along the way counts every bail-out and hides none without saying so', () => {
  const at = (riverMile: number) => ({ id: `m${riverMile}`, riverMile });
  // Ten between the ends, out of order, plus both ends and one outside.
  const points = [at(9), at(1), at(5), at(10), at(2), at(8), at(3), at(7), at(4), at(6), at(0), at(11), at(20)];
  const collapsed = alongRoutePoints(points, 0, 11, false);
  assert.equal(collapsed.all.length, 10, 'the heading counts the whole list, not the cap');
  assert.deepEqual(collapsed.all.map((p) => p.riverMile), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(collapsed.shown.length, ALONG_ROUTE_PREVIEW);
  assert.equal(collapsed.hidden, 10 - ALONG_ROUTE_PREVIEW, 'what is hidden is counted for "Show all"');
  const expanded = alongRoutePoints(points, 0, 11, true);
  assert.equal(expanded.shown.length, 10);
  assert.equal(expanded.hidden, 0);
  // One past the preview is shown whole rather than hidden behind a row as tall as it.
  const seven = alongRoutePoints(points, 0, 8, false);
  assert.equal(seven.shown.length, 7);
  assert.equal(seven.hidden, 0);
  assert.deepEqual(alongRoutePoints(undefined, 0, 11, false), { all: [], shown: [], hidden: 0 });

  const source = readFileSync(join(process.cwd(), '..', 'eddy-ios', 'src', 'components', 'PlanAlongRoute.tsx'), 'utf8');
  assert.match(source, /Along the way \(\{all\.length\}\)/);
  assert.match(source, /Show all \{all\.length\}/);
});
