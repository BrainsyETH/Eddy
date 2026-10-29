import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { floatMapDestination, floatPlanDestination } from '../../../eddy-ios/src/lib/planRequest';
import { createNavigationGate } from '../../../eddy-ios/src/lib/navigationGate';
import {
  floatCollectionStatus,
  floatRiverChoices,
  visibleFloats,
  visibleFeaturedFloats,
} from '../../../eddy-ios/src/lib/floatCollection';
import { dailyFavoriteFloats } from '../../../eddy-ios/src/lib/todayFloats';
import { canDefaultToCurrentLocation, selectSearchLocation, selectSearchRiver } from '../../../eddy-ios/src/lib/floatSearchSelection';
import type { FloatSearchInput } from '../../shared/float-search';
import { loadPlannerResource } from '../../../eddy-ios/src/lib/plannerResource';
import { featuredFloatsForDay, featuredFloatPath, type FeaturedFloat } from './featured-floats';
import type { FavoriteFloatSummary } from '../../../packages/eddy-types';

test('web featured floats follow the iOS daily selection without changing the source catalogue', () => {
  const rows = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => ({ id }));
  for (const day of ['2026-10-28', '2026-10-29', '2026-12-31']) {
    const localDate = new Date(`${day}T23:30:00`);
    assert.deepEqual(featuredFloatsForDay(rows, localDate), dailyFavoriteFloats(rows, day));
    assert.deepEqual(featuredFloatsForDay([...rows].reverse(), localDate), dailyFavoriteFloats(rows, day));
  }
  assert.deepEqual(rows.map(row => row.id), ['a', 'b', 'c', 'd', 'e', 'f']);
  // The web's deployed projection must remain assignable from the native API type.
  const fromNative = (float: FavoriteFloatSummary): FeaturedFloat => float;
  assert.equal(typeof fromNative, 'function');
});

test('featured route links carry their exact endpoints, including escaped identifiers', () => {
  const href = featuredFloatPath({ riverSlug: 'current', putInId: 'a&b', takeOutId: 'end point' });
  const url = new URL(href, 'https://eddy.guide');
  assert.equal(url.pathname, '/plan');
  assert.deepEqual(Object.fromEntries(url.searchParams), { river: 'current', putIn: 'a&b', takeOut: 'end point' });
});

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

test('full featured list matches the carousel rotation and keeps River A–Z distinct', () => {
  const rows = ['alpha', 'bravo', 'charlie', 'delta', 'echo'].flatMap(river => [
    { id: `${river}:upper`, riverSlug: river, riverName: river },
    { id: `${river}:lower`, riverSlug: river, riverName: river },
  ]);
  const day = '2026-10-17';
  const featured = visibleFeaturedFloats(rows, '', 'default', day);
  const alphabetical = visibleFeaturedFloats(rows, '', 'river', day);
  assert.deepEqual(featured.slice(0, 3), dailyFavoriteFloats(rows, day).slice(0, 3));
  assert.notDeepEqual(featured, alphabetical);
  assert.deepEqual(alphabetical.map(row => row.riverName), rows.map(row => row.riverName));
  assert.deepEqual(visibleFeaturedFloats([...rows].reverse(), '', 'default', day), featured);
  assert.deepEqual(visibleFeaturedFloats(rows, 'bravo', 'default', day), featured.filter(row => row.riverSlug === 'bravo'));
  assert.deepEqual(visibleFeaturedFloats(rows, '', 'default', day), featured, 'returning from A–Z restores the daily order');
  assert.notDeepEqual(visibleFeaturedFloats(rows, '', 'default', '2026-10-18'), featured);
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
    const seen: { value: string[] | null; error: string | null; settled: boolean }[] = [];
    await loadPlannerResource<string[]>({
      readCached: async () => cached, fetchFresh: async () => { throw new Error('Offline'); },
      signal: new AbortController().signal, publish: (value, error, settled) => { seen.push({ value, error, settled }); }, errorMessage: 'Unavailable',
    });
    // The cached list is shown at once, then confirmed as the final answer
    // once the network has failed: a caller looking for a missing endpoint
    // waits for that second publish instead of guessing.
    assert.deepEqual(seen, cached === null
      ? [{ value: null, error: 'Unavailable', settled: true }]
      : [{ value: cached, error: null, settled: false }, { value: cached, error: null, settled: true }]);
  }
});

test('only the fresh answer, or the fallback after a failed fetch, is final', async () => {
  const fresh = deferred<string[]>();
  const seen: boolean[] = [];
  const request = loadPlannerResource({
    readCached: async () => ['cached'], fetchFresh: () => fresh.promise,
    signal: new AbortController().signal, publish: (_value, _error, settled) => { seen.push(settled); }, errorMessage: 'Unavailable',
  });
  await flush();
  fresh.resolve(['fresh']);
  await request;
  assert.deepEqual(seen, [false, true]);
});


test('nearby defaults require a live grant and never replace an intentional selection', () => {
  assert.equal(canDefaultToCurrentLocation({}, 'ready', false), true);
  for (const status of ['idle', 'remembered', 'locating', 'denied', 'unavailable']) {
    assert.equal(canDefaultToCurrentLocation({}, status, false), false);
  }
  assert.equal(canDefaultToCurrentLocation({}, 'ready', true), false);
  assert.equal(canDefaultToCurrentLocation({ river: 'current' }, 'ready', false), false);
  assert.equal(canDefaultToCurrentLocation({ near: { lat: 37, lng: -91 } }, 'ready', false), false);
});

test('View on Map targets the existing Map tab with exact endpoints and a fresh request each time', () => {
  const route = { focusRiver: 'current', planPutIn: 'akers', planTakeOut: 'pulltite', planVesselTypeId: 'kayak' };
  const first = floatMapDestination(route);
  assert.equal(first.pathname, '/');
  assert.equal(first.params.planPresentation, 'map');
  assert.equal(first.params.openPlan, '1');
  for (const [key, value] of Object.entries(route)) assert.equal(first.params[key as keyof typeof first.params], value);
  assert.notEqual(first.params.planRequest, floatMapDestination(route).params.planRequest);
});

test('web Build a Route CTAs draw the same Eddy-with-map artwork as the iOS Floats hub', () => {
  assert.ok(readFileSync('public/icons/eddy-build-route.png').equals(readFileSync('../eddy-ios/assets/float-action-icons/build-route@3x.png')));
  for (const file of ['src/app/find-float/FindFloatClient.tsx', 'src/components/home/HomePage.tsx']) {
    assert.match(readFileSync(file, 'utf8'), /<BuildRouteIcon[^>]*\/>\s*Build a Route/, file);
  }
});
