import assert from 'node:assert/strict';
import test from 'node:test';
import { floatPlanDestination } from '../../../eddy-ios/src/lib/planRequest';
import { createNavigationGate } from '../../../eddy-ios/src/lib/navigationGate';
import {
  floatCollectionStatus,
  floatRiverChoices,
  visibleFloats,
} from '../../../eddy-ios/src/lib/floatCollection';
import { selectSearchLocation, selectSearchRiver } from '../../../eddy-ios/src/lib/floatSearchSelection';
import type { FloatSearchInput } from '../../shared/float-search';
import { loadPlannerResource } from '../../../eddy-ios/src/lib/plannerResource';

test('a fresh build cannot inherit a featured route, and finder keeps its exact vessel and endpoints', () => {
  const pick = {
    focusRiver: 'current',
    planPutIn: 'a',
    planTakeOut: 'b',
    planVesselTypeId: 'kayak-id',
  };
  const featured = floatPlanDestination(pick);
  const fresh = floatPlanDestination();
  assert.equal(featured.pathname, '/plan-route');
  assert.equal(fresh.pathname, '/plan-route');
  for (const [key, value] of Object.entries(pick))
    assert.equal(featured.params[key as keyof typeof featured.params], value);
  assert.notEqual(featured.params.planRequest, fresh.params.planRequest);
  assert.deepEqual(Object.keys(fresh.params).sort(), ['openPlan', 'planRequest']);
});

test('rapid taps across actions navigate once; returning or a failed push allows another try', () => {
  const gate = createNavigationGate();
  const visits: string[] = [];
  gate.run(() => visits.push('featured'));
  gate.run(() => visits.push('build'));
  assert.deepEqual(visits, ['featured']);
  gate.reset();
  assert.throws(() =>
    gate.run(() => {
      throw new Error('unavailable');
    }),
  );
  gate.run(() => visits.push('build'));
  assert.deepEqual(visits, ['featured', 'build']);
});

test('switching between a town, river, and current location removes the old geographic constraint', () => {
  const input: FloatSearchInput = {
    near: { lat: 38.6, lng: -90.2 },
    radiusMiles: 100,
    targetHours: 5,
    vesselType: 'kayak',
    publicOnly: true,
  };
  const river = { ...input, ...selectSearchRiver('current') };
  assert.equal(river.river, 'current');
  assert.equal(river.near, undefined);
  const nearby = {
    ...river,
    ...selectSearchLocation({ lat: 37.2, lng: -91.3 }),
  };
  assert.equal(nearby.river, undefined);
  assert.deepEqual(nearby.near, { lat: 37.2, lng: -91.3 });
  assert.equal(nearby.vesselType, 'kayak');
  assert.equal(nearby.targetHours, 5);
});

test('river filters and alphabetical sorting preserve recent or editorial order within a river', () => {
  const rows = [
    { riverSlug: 'jacks-fork', riverName: 'Jacks Fork', id: 'new-jacks' },
    { riverSlug: 'current', riverName: 'Current River', id: 'new-current' },
    { riverSlug: 'jacks-fork', riverName: 'Jacks Fork', id: 'old-jacks' },
  ];
  assert.deepEqual(
    floatRiverChoices(rows).map((r) => r.riverSlug),
    ['current', 'jacks-fork'],
  );
  assert.deepEqual(
    visibleFloats(rows, 'jacks-fork', 'default').map((r) => r.id),
    ['new-jacks', 'old-jacks'],
  );
  assert.deepEqual(
    visibleFloats(rows, '', 'river').map((r) => r.id),
    ['new-current', 'new-jacks', 'old-jacks'],
  );
  assert.deepEqual(visibleFloats(rows, '', 'default'), rows);
  assert.equal(rows[0].id, 'new-jacks');
});

test('an unreadable local collection exposes an error instead of indefinite loading or an empty collection', () => {
  const archive = {
    ready: false,
    error: null,
    owner: null,
    syncing: false,
    rows: [],
  };
  assert.deepEqual(floatCollectionStatus(archive), {
    load: 'loading',
    backup: 'Loading your collection…',
  });
  assert.deepEqual(floatCollectionStatus({ ...archive, error: 'Disk read failed' }), {
    load: 'error',
    backup: 'Your collection could not be opened',
  });
  assert.deepEqual(floatCollectionStatus({ ...archive, ready: true, owner: 'guest' }), {
    load: 'ready',
    backup: 'Saved on this phone',
  });
});

test('backup failures preserve a ready local collection and distinguish pending, syncing, and backed-up states', () => {
  const archive = {
    ready: true,
    error: null,
    owner: 'account',
    syncing: false,
    rows: [{ dirty: true }],
  };
  assert.deepEqual(floatCollectionStatus({ ...archive, error: 'Offline' }), {
    load: 'ready',
    backup: 'Backup needs attention',
  });
  assert.equal(floatCollectionStatus(archive).backup, 'Waiting to back up');
  assert.equal(floatCollectionStatus({ ...archive, syncing: true }).backup, 'Backing up…');
  assert.equal(
    floatCollectionStatus({
      ...archive,
      rows: [{ dirty: true, backupError: 'Rejected' }],
    }).backup,
    'Backup needs attention',
  );
  assert.deepEqual(floatCollectionStatus({ ...archive, rows: [{ dirty: false }] }), {
    load: 'ready',
    backup: 'Backed up to your account',
  });
  assert.deepEqual(
    floatCollectionStatus({
      ...archive,
      owner: 'guest',
      error: 'Local write failed',
    }),
    {
      load: 'ready',
      backup: 'Your floats need attention',
    },
  );
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const flush = () => new Promise<void>((done) => setImmediate(done));

test('standalone picker shows cached endpoints before the network and then refreshes them', async () => {
  const fresh = deferred<string[]>();
  const seen: (string[] | null)[] = [];
  const request = loadPlannerResource({
    readCached: async () => ['cached'], fetchFresh: () => fresh.promise,
    signal: new AbortController().signal, publish: (value) => { seen.push(value); }, errorMessage: 'Unavailable',
  });
  await flush();
  assert.deepEqual(seen, [['cached']]);
  fresh.resolve(['fresh']);
  await request;
  assert.deepEqual(seen, [['cached'], ['fresh']]);
});

test('a slow cache cannot overwrite fresh planner data', async () => {
  const cached = deferred<string[]>();
  const seen: (string[] | null)[] = [];
  await loadPlannerResource({
    readCached: () => cached.promise, fetchFresh: async () => ['fresh'],
    signal: new AbortController().signal, publish: (value) => { seen.push(value); }, errorMessage: 'Unavailable',
  });
  cached.resolve(['old']);
  await flush();
  assert.deepEqual(seen, [['fresh']]);
});

test('closing or switching rivers cancels both late cache and network updates', async () => {
  const controller = new AbortController();
  const cached = deferred<string[]>();
  const fresh = deferred<string[]>();
  const seen: (string[] | null)[] = [];
  const request = loadPlannerResource({
    readCached: () => cached.promise, fetchFresh: () => fresh.promise,
    signal: controller.signal, publish: (value) => { seen.push(value); }, errorMessage: 'Unavailable',
  });
  controller.abort();
  cached.resolve(['old river']);
  fresh.resolve(['old river']);
  await request;
  await flush();
  assert.deepEqual(seen, []);
});

test('offline planners keep cached endpoints, including a valid empty list, and expose retryable missing data', async () => {
  for (const cached of [['cached'], [], null]) {
    const seen: { value: string[] | null; error: string | null }[] = [];
    await loadPlannerResource<string[]>({
      readCached: async () => cached, fetchFresh: async () => { throw new Error('Offline'); },
      signal: new AbortController().signal, publish: (value, error) => { seen.push({ value, error }); }, errorMessage: 'Unavailable',
    });
    assert.deepEqual(seen, [{ value: cached, error: cached === null ? 'Unavailable' : null }]);
  }
});
