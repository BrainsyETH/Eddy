import assert from 'node:assert/strict';
import test from 'node:test';
import type { AccessPointDetailResponse, DamSnapshot, RiverService } from '../../../packages/eddy-types';
import { createSavedPlacesStore, decodeSavedPlaces, placeFromAccess, placeFromPin, placeFromService, savedScheduleState, wholeRiverDam, SAVED_PLACES_KEY } from '../../../eddy-ios/src/lib/savedPlaces';
import { createSavedPlaceRefresher, refreshedDam } from '../../../eddy-ios/src/lib/savedPlaceRefresh';

const now = '2026-10-25T16:00:00Z';
const observed = '2026-10-24T09:00:00Z';
const day = { scheduleDate: '2026-10-24', retrievedAt: observed, hours: [{ hourEnding: 14, megawatts: 20, cfs: 1000, isRamp: false }], idle: [] };
const dam = (id = 'dam-a'): DamSnapshot => ({ id, name: id, schedule: [day], metrics: {}, tailwater: { riverSlug: 'white', gaugeSiteId: '07000000' } } as unknown as DamSnapshot);
const detail = { accessPoint: { id: 'access', slug: 'landing', name: 'Landing', river: { slug: 'white', name: 'White River' },
  types: ['boat_ramp'], coordinates: { lat: 36, lng: -92 }, drivingLat: 36.001, drivingLng: -92.001,
  isPublic: true, description: '<p>Gravel ramp</p>', roadSurface: ['gravel_unmaintained'], parkingCapacity: 'limited',
  roadAccess: 'Gate closes at dusk', amenities: ['toilets'], localTips: '<p>Keep the ramp clear</p>',
  feeRequired: true, feeNotes: '$5 parking', booking: { url: 'https://example.com/book' },
}, gaugeStatus: { gaugeId: 'gauge', gaugeName: 'White gauge', usgsId: '07000000', cfs: 0, heightFt: 2.5, lastUpdated: observed, trend: 'steady', level: 'low', label: 'Low' }, nearbyAccessPoints: [] } as unknown as AccessPointDetailResponse;
const place = () => placeFromAccess(detail, now);
function memory() {
  const values = new Map<string, string>();
  return { values, getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    removeItem: async (key: string) => { values.delete(key); } };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const api = () => ({ access: async () => detail, dams: async () => [dam()], dam: async (id: string) => dam(id), service: async (): Promise<RiverService> => { throw Error('missing'); } });

test('access snapshot opens after a cold offline load with observation and download ages separate', async () => {
  const disk = memory(); const store = createSavedPlacesStore(disk);
  const saved = { ...place(), dam: { snapshot: dam(), downloadedAt: now } };
  await store.save(saved);
  const cold = createSavedPlacesStore(disk); await cold.load();
  assert.deepEqual(cold.snapshot().places, [saved]);
  assert.equal(saved.gauge?.reading.lastUpdated, observed);
  assert.equal(saved.gauge?.reading.cfs, 0);
  assert.equal(saved.dam.snapshot.schedule[0].retrievedAt, observed);
  assert.ok(saved.notes.includes('Gate closes at dusk'));
  assert.ok(saved.notes.includes('Unmaintained gravel'));
  assert.ok(saved.notes.includes('Limited parking'));
  assert.equal(saved.drivingLat, 36.001);
  assert.equal(saved.notes.some(n => n.includes('<p>')), false);
});

test('map and detail use one identity; bare pins never invent driving coordinates or a completed download', () => {
  const pin = placeFromPin({ id: 'map-id', name: 'Landing', layer: 'access', coordinates: { lat: 36, lng: -92 }, detailRoute: '/river/white/access/landing' }, now)!;
  assert.equal(pin.id, place().id); assert.equal(pin.detailsDownloadedAt, null); assert.equal(pin.canDrive, false);
  assert.equal(placeFromPin({ id: 'gauge', name: 'Gauge', layer: 'gauges', coordinates: { lat: 36, lng: -92 } }, now), null);
});

test('campgrounds save useful contact/logistics without route creation or live availability promises', () => {
  const pin = placeFromPin({ id: 'service:camp', name: 'Camp', layer: 'campgrounds', coordinates: { lat: 36, lng: -92 },
    body: '<p>Office closes at 6</p>', contactLinks: [{ label: 'Call', url: 'tel:5551112222' }] }, now)!;
  assert.equal(pin.id, 'place:service:camp'); assert.equal(pin.riverSlug, null);
  const updated = placeFromService({ name: 'Camp', description: 'Gate closes at 7', phone: '5551112222', website: 'example.com', latitude: 36, longitude: -92, availability: { sitesOpen: 20 } } as RiverService, pin, now);
  assert.equal(updated.links.length, 2); assert.deepEqual(updated.notes, ['Gate closes at 7']);
  assert.equal('availability' in updated, false);
  assert.ok(placeFromService({ description: '', status: 'temporarily_closed' } as RiverService, pin, now).notes.includes('Temporarily closed'));
});

test('only one unambiguous whole-river association is automatic', () => {
  assert.equal(wholeRiverDam([dam()], 'white')?.id, 'dam-a');
  assert.equal(wholeRiverDam([dam(), dam('dam-b')], 'white'), null);
  assert.equal(wholeRiverDam([{ ...dam(), tailwater: { ...dam().tailwater!, sectionSlug: 'lower' } }], 'white'), null);
  assert.equal(wholeRiverDam([dam()], 'current'), null);
});

test('schedule age uses Central dates and never turns an old download into a current schedule', () => {
  assert.equal(savedScheduleState(day, new Date(now)), 'Historical schedule');
  assert.equal(savedScheduleState({ ...day, scheduleDate: '2026-10-25' }, new Date(now)), 'Older schedule');
  assert.equal(savedScheduleState({ ...day, scheduleDate: '2026-10-25', retrievedAt: now }, new Date(now)), 'Downloaded schedule');
  assert.equal(savedScheduleState({ ...day, scheduleDate: '2026-10-25', retrievedAt: null }, new Date(now)), 'Schedule age unknown');
  assert.notEqual(savedScheduleState(day, new Date('2026-10-25T02:00:00Z')), 'Historical schedule'); // Still Oct 24 Central.
  const previous = { snapshot: dam(), downloadedAt: observed };
  assert.deepEqual(refreshedDam(previous, { ...dam(), schedule: [] }, now).snapshot.schedule, [day]);
  assert.deepEqual(refreshedDam(previous, { ...dam('dam-b'), schedule: [] }, now).snapshot.schedule, []);
});

test('failed writes do not claim success or lose a previously saved place', async () => {
  const disk = memory(); const store = createSavedPlacesStore(disk); const first = place();
  await store.save(first);
  disk.setItem = async () => { throw Error('disk full'); };
  await assert.rejects(store.remove(first.id));
  assert.equal(store.snapshot().places[0], first);
});

test('failed reads preserve unseen data and retry; unknown schema cannot be overwritten', async () => {
  const disk = memory(); const saved = place();
  disk.values.set(SAVED_PLACES_KEY, JSON.stringify({ version: 1, places: [saved] }));
  const original = disk.getItem; disk.getItem = async () => { throw Error('busy'); };
  const store = createSavedPlacesStore(disk); await store.load();
  await assert.rejects(store.save(saved));
  disk.getItem = original; await store.load(); assert.equal(store.snapshot().places.length, 1);
  disk.values.set(SAVED_PLACES_KEY, '{"version":2,"places":[]}');
  const future = createSavedPlacesStore(disk); await assert.rejects(future.save(saved));
  assert.equal(disk.values.get(SAVED_PLACES_KEY), '{"version":2,"places":[]}');
});

test('late refreshes cannot resurrect removed or re-saved places', async () => {
  const store = createSavedPlacesStore(memory()); const first = place(); await store.save(first);
  await store.remove(first.id); const second = { ...first, name: 'Re-saved' }; await store.save(second);
  await store.replace(first, { ...first, name: 'Late download' });
  assert.equal(store.snapshot().places[0], second);
});

test('a star tap during cold hydration toggles the stored value and cannot outlive deletion', async () => {
  const disk = memory(); disk.values.set(SAVED_PLACES_KEY, JSON.stringify({ version: 1, places: [place()] }));
  const cold = createSavedPlacesStore(disk); await cold.toggle(place());
  assert.deepEqual(cold.snapshot().places, []);
  const read = deferred<string | null>(); disk.getItem = () => read.promise;
  const slow = createSavedPlacesStore(disk); const toggle = slow.toggle(place()); await flush();
  const clear = slow.clear(); read.resolve(null); await Promise.all([toggle, clear]);
  assert.deepEqual(slow.snapshot().places, []); assert.equal(disk.values.has(SAVED_PLACES_KEY), false);
});

test('account deletion wins against both a late disk load and an in-flight write', async () => {
  const disk = memory(); const pendingRead = deferred<string>(); disk.getItem = () => pendingRead.promise;
  const store = createSavedPlacesStore(disk); const loading = store.load(); await store.clear();
  pendingRead.resolve(JSON.stringify({ version: 1, places: [place()] })); await loading;
  assert.deepEqual(store.snapshot().places, []);
  const pendingWrite = deferred<void>(); disk.setItem = async (key, value) => { await pendingWrite.promise; disk.values.set(key, value); };
  const saving = store.save(place()); await flush(); const clearing = store.clear();
  pendingWrite.resolve(); await Promise.all([saving, clearing]);
  assert.equal(disk.values.has(SAVED_PLACES_KEY), false); assert.deepEqual(store.snapshot().places, []);
});

test('broken nested snapshots are dropped without losing sound place logistics', () => {
  const saved = { ...place(), gauge: { reading: {} }, dam: { snapshot: { schedule: 'broken' } } };
  const loaded = decodeSavedPlaces(JSON.stringify({ version: 1, places: [saved] }));
  assert.equal(loaded.length, 1); assert.equal(loaded[0].gauge, null); assert.equal(loaded[0].dam, null);
});

test('saving an associated access downloads the full dam schedule after the lightweight index', async () => {
  const store = createSavedPlacesStore(memory()); await store.save(place()); const calls: string[] = [];
  const refresh = createSavedPlaceRefresher(store, { ...api(), dams: async () => [{ ...dam(), schedule: [] }], dam: async id => { calls.push(id); return dam(id); } }, () => now);
  assert.equal(await refresh(place().id), true); assert.deepEqual(calls, ['dam-a']);
  assert.deepEqual(store.snapshot().places[0].dam?.snapshot.schedule, [day]);
});

test('an explicit dam choice wins while the automatic association is still loading', async () => {
  const store = createSavedPlacesStore(memory()); await store.save(place()); const index = deferred<DamSnapshot[]>();
  const refresh = createSavedPlaceRefresher(store, { ...api(), dams: () => index.promise }, () => now);
  const automatic = refresh(place().id); await flush(); await refresh(place().id, 'dam-b');
  index.resolve([dam()]); await automatic;
  assert.equal(store.snapshot().places[0].dam?.snapshot.id, 'dam-b');
});

test('a failed refresh retains all cached details and their original dates', async () => {
  const store = createSavedPlacesStore(memory()); const first = { ...place(), dam: { snapshot: dam(), downloadedAt: observed } }; await store.save(first);
  const offline = async (): Promise<never> => { throw Error('offline'); };
  const refresh = createSavedPlaceRefresher(store, { access: offline, dams: offline, dam: offline, service: offline });
  assert.equal(await refresh(first.id), false); assert.equal(store.snapshot().places[0], first);
});
