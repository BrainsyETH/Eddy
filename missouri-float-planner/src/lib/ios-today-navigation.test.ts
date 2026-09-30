import assert from 'node:assert/strict';
import test from 'node:test';
import type { MapGauge, RiverListItem } from '@eddy/types';
import { createTodayCatalog } from '../../../eddy-ios/src/lib/todayCatalog';
import { readFilterFromParam, riverFilterFromParam } from '../../../eddy-ios/src/lib/todayNavigation';

const river = (name: string) => ({ id: name, name, slug: name.toLowerCase() }) as RiverListItem;
const current = [river('Current')];
const cached = [river('Meramec')];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function catalog(overrides: Partial<Parameters<typeof createTodayCatalog>[0]> = {}) {
  return createTodayCatalog({
    loadRivers: async () => current,
    loadGauges: async () => [],
    readCache: async () => null,
    describeError: () => 'Could not load rivers',
    ...overrides,
  });
}

test('Today paints the disk snapshot while the live request is pending', async () => {
  const pending = deferred<RiverListItem[]>();
  const painted = deferred<void>();
  const order: string[] = [];
  const store = catalog({
    loadRivers: () => { order.push('network'); return pending.promise; },
    readCache: async () => { order.push('disk'); return { rivers: cached, seeded: false }; },
  });
  store.subscribe(() => { if (store.getSnapshot().rivers === cached) painted.resolve(); });
  const loading = store.load();
  await painted.promise;
  assert.deepEqual(order, ['network', 'disk']);
  assert.equal(store.getSnapshot().rivers, cached);
  pending.resolve(current);
  await loading;
  assert.equal(store.getSnapshot().rivers, current);
  assert.equal(store.getSnapshot().error, null);
});

test('simultaneous Today and child mounts share one request and snapshot', async () => {
  const pending = deferred<RiverListItem[]>();
  let requests = 0;
  const store = catalog({ loadRivers: () => { requests++; return pending.promise; } });
  const today = store.load();
  const conditions = store.load();
  const reads = store.load();
  assert.equal(today, conditions);
  assert.equal(conditions, reads);
  assert.equal(requests, 1);
  pending.resolve(current);
  await Promise.all([today, conditions, reads]);
  assert.equal(store.getSnapshot().rivers, current);
  await store.load();
  assert.equal(requests, 1, 'a child opened after the response must use the fresh snapshot');
});

test('closing one screen cannot cancel another screen’s shared response', async () => {
  const pending = deferred<RiverListItem[]>();
  const store = catalog({ loadRivers: () => pending.promise });
  let todayUpdates = 0;
  let childUpdates = 0;
  store.subscribe(() => { todayUpdates++; });
  const closeChild = store.subscribe(() => { childUpdates++; });
  const loading = store.load();
  closeChild();
  pending.resolve(current);
  await loading;
  assert.equal(todayUpdates, 1);
  assert.equal(childUpdates, 0);
  assert.equal(store.getSnapshot().rivers, current);
});

test('foreground loads respect five-minute freshness; manual refresh bypasses it', async () => {
  let time = 0;
  let requests = 0;
  const store = catalog({ now: () => time, loadRivers: async () => { requests++; return current; } });
  await store.load();
  time = 299_999;
  await store.load();
  assert.equal(requests, 1);
  time = 300_000;
  await store.load();
  assert.equal(requests, 2);
  await store.load(true);
  assert.equal(requests, 3);
});

test('a failed refresh retains the live list, never the older disk snapshot', async () => {
  let fail = false;
  const store = catalog({
    loadRivers: async () => { if (fail) throw new Error('offline'); return current; },
    readCache: async () => ({ rivers: cached, seeded: false }),
  });
  await store.load();
  fail = true;
  await store.load(true);
  assert.equal(store.getSnapshot().rivers, current);
  assert.match(store.getSnapshot().error!, /Offline/);
  assert.equal(store.getSnapshot().awaitingConditions, false);
  fail = false;
  await store.load(true);
  assert.equal(store.getSnapshot().error, null);
});

test('seed rows are marked loading, then accurately described when offline', async () => {
  const pending = deferred<RiverListItem[]>();
  const painted = deferred<void>();
  let fail = true;
  const store = catalog({
    loadRivers: () => fail ? pending.promise : Promise.resolve(current),
    readCache: async () => ({ rivers: cached, seeded: true }),
  });
  store.subscribe(() => { if (store.getSnapshot().awaitingConditions) painted.resolve(); });
  const loading = store.load();
  await painted.promise;
  assert.equal(store.getSnapshot().awaitingConditions, true);
  pending.reject(new Error('offline'));
  await loading;
  assert.equal(store.getSnapshot().awaitingConditions, false);
  assert.match(store.getSnapshot().error!, /not today’s water/);
  fail = false;
  await store.load();
  assert.equal(store.getSnapshot().rivers, current);
  assert.equal(store.getSnapshot().error, null);
});

test('a failed first load does not spend the freshness window or block retry', async () => {
  let requests = 0;
  const store = catalog({
    loadRivers: async () => { if (++requests === 1) throw new Error('offline'); return current; },
  });
  await store.load();
  assert.equal(store.getSnapshot().rivers, null);
  assert.equal(store.getSnapshot().error, 'Could not load rivers');
  await store.load();
  assert.equal(requests, 2);
  assert.equal(store.getSnapshot().rivers, current);
});

test('cache storage failure cannot stop a successful network answer', async () => {
  const store = catalog({ readCache: async () => { throw new Error('disk unavailable'); } });
  await store.load();
  assert.equal(store.getSnapshot().rivers, current);
});

test('gauge enrichment is shared and retries after a failed attempt', async () => {
  const pending = deferred<MapGauge[]>();
  let requests = 0;
  const gauges = [{ id: 'gauge' } as MapGauge];
  const store = catalog({ loadGauges: () => ++requests === 1 ? pending.promise : Promise.resolve(gauges) });
  const first = store.ensureGauges();
  assert.equal(store.ensureGauges(), first);
  pending.reject(new Error('offline'));
  assert.deepEqual(await first, []);
  assert.equal(store.getSnapshot().gauges, null);
  assert.equal(await store.ensureGauges(), gauges);
  assert.equal(await store.ensureGauges(), gauges);
  assert.equal(requests, 2);
});

test('river links preserve supported filters and safely default malformed values', () => {
  for (const filter of ['all', 'floatable', 'starred', 'low', 'high', 'unknown']) {
    assert.equal(riverFilterFromParam(filter), filter);
  }
  assert.equal(riverFilterFromParam(['high', 'low']), 'high');
  assert.equal(riverFilterFromParam('flood'), 'all');
  assert.equal(riverFilterFromParam(undefined), 'all');
});

test('read links preserve supported filters and safely default malformed values', () => {
  for (const filter of ['for-you', 'following', 'nearby', 'floatable', 'all']) {
    assert.equal(readFilterFromParam(filter), filter);
  }
  assert.equal(readFilterFromParam(['following']), 'following');
  assert.equal(readFilterFromParam('invalid'), 'for-you');
  assert.equal(readFilterFromParam(undefined), 'for-you');
});
