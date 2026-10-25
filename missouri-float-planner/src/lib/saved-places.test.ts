import assert from 'node:assert/strict';
import test from 'node:test';
import type { AccessPointDetailResponse, DamSnapshot, RiverService } from '../../../packages/eddy-types';
import { createSavedPlacesStore, decodeSavedPlaces, placeFromAccess, placeFromPin, placeFromService, savedScheduleState, wholeRiverDam, SAVED_PLACES_KEY, savedPlacesKey, LEGACY_SAVED_PLACES_KEY, savedPlacesOwner } from '../../../eddy-ios/src/lib/savedPlaces';
import { createSavedPlaceRefresher, refreshedDam, createPlaceAutoRefresh, placeRefreshNeeds } from '../../../eddy-ios/src/lib/savedPlaceRefresh';

import { savedGaugeDisplay, savedPlaceSummary, savedScheduleDayLabel, scheduleGroups, sortedPlaceDams } from '../../../eddy-ios/src/lib/savedPlaceDisplay';
import { DAM_CATALOG } from '../../../eddy-ios/src/lib/damCatalog';
import { coldDetailPath } from '../../../eddy-ios/src/lib/tabRoutes';

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
  assert.equal(saved.facts.find(f => f.label === 'Road')?.value, 'Gate closes at dusk\nUnmaintained gravel');
  assert.equal(saved.facts.find(f => f.label === 'Parking')?.value, 'Limited parking');
  assert.deepEqual(saved.tags, ['Fee required']);
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
  assert.ok(placeFromService({ description: '', status: 'temporarily_closed' } as RiverService, pin, now).tags.includes('Temporarily closed'));
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
  disk.values.set(SAVED_PLACES_KEY, '{"version":3,"places":[]}');
  const future = createSavedPlacesStore(disk); await assert.rejects(future.save(saved));
  assert.equal(disk.values.get(SAVED_PLACES_KEY), '{"version":3,"places":[]}');
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

test('account collections survive switches and delete independently', async () => {
  const disk = memory(); const store = createSavedPlacesStore(disk);
  await store.save({ ...place(), name: 'Guest' }); await store.select('a');
  assert.deepEqual(store.snapshot().places, []); await store.save({ ...place(), name: 'A' });
  const loading = store.select('b'); assert.deepEqual(store.snapshot().places, []); assert.equal(store.snapshot().ready, false);
  await loading; await store.save({ ...place(), name: 'B' });
  await store.select('guest'); assert.equal(store.snapshot().places[0].name, 'Guest');
  await store.select('a'); assert.equal(store.snapshot().places[0].name, 'A'); await store.clear('a');
  await store.select('b'); assert.equal(store.snapshot().places[0].name, 'B');
  assert.equal(disk.values.has(savedPlacesKey('a')), false);
  assert.equal(savedPlacesOwner('anonymous', true), 'guest'); assert.equal(savedPlacesOwner('a', false), 'a');
});

test('unowned saves migrate only to guest and failed migration preserves the source', async () => {
  const disk = memory(); const legacy = JSON.stringify({ version: 1, places: [{ ...place(), version: 1, facts: undefined, tags: undefined, damChoice: undefined }] });
  disk.values.set(LEGACY_SAVED_PLACES_KEY, legacy);
  const store = createSavedPlacesStore(disk); await store.select('a'); assert.deepEqual(store.snapshot().places, []);
  assert.equal(disk.values.get(LEGACY_SAVED_PLACES_KEY), legacy);
  const write = disk.setItem; disk.setItem = async () => { throw Error('full'); };
  await store.select('guest'); assert.ok(store.snapshot().error); assert.equal(disk.values.get(LEGACY_SAVED_PLACES_KEY), legacy);
  disk.setItem = write; await store.load(); assert.equal(store.snapshot().places[0].version, 2);
  assert.deepEqual(store.snapshot().places[0].facts, []); assert.equal(disk.values.has(LEGACY_SAVED_PLACES_KEY), false);
});

test('deletion wins against guest migration already writing', async () => {
  const disk = memory(); disk.values.set(LEGACY_SAVED_PLACES_KEY, JSON.stringify({ version: 1, places: [place()] }));
  const pending = deferred<void>(); const write = disk.setItem;
  disk.setItem = async (key, value) => { await pending.promise; await write(key, value); };
  const store = createSavedPlacesStore(disk); const loading = store.load(); await flush();
  const clearing = store.clear(); pending.resolve(); await Promise.all([loading, clearing]);
  assert.deepEqual(store.snapshot().places, []); assert.equal(disk.values.size, 0);
});

test('returning to an account waits for its pending write', async () => {
  const disk = memory(); const store = createSavedPlacesStore(disk); await store.select('a');
  const pending = deferred<void>(); const write = disk.setItem;
  disk.setItem = async (key, value) => { await pending.promise; await write(key, value); };
  const saving = store.save(place(), 'a'); await flush();
  const other = store.select('b'); const returning = store.select('a');
  pending.resolve(); await Promise.all([saving, other, returning]);
  assert.equal(store.snapshot().places[0].name, 'Landing'); assert.equal(disk.values.has(savedPlacesKey('b')), false);
});

test('old-account downloads cannot publish after switching away and back', async () => {
  const store = createSavedPlacesStore(memory()); await store.select('a'); await store.save(place());
  const pending = deferred<AccessPointDetailResponse>();
  const refresh = createSavedPlaceRefresher(store, { ...api(), access: () => pending.promise }, () => now);
  const download = refresh(place().id); await flush();
  await store.select('b'); await store.save({ ...place(), name: 'B' }); await store.select('a');
  pending.resolve({ ...detail, accessPoint: { ...detail.accessPoint, name: 'Late A' } });
  assert.equal(await download, false); assert.equal(store.snapshot().places[0].name, 'Landing');
  await store.select('b'); assert.equal(store.snapshot().places[0].name, 'B');
});

test('dam removal survives refresh and cold load; offline choices remain retryable', async () => {
  const disk = memory(); const store = createSavedPlacesStore(disk); await store.save(place());
  const refresh = createSavedPlaceRefresher(store, api(), () => now);
  await refresh(place().id); await store.linkDam(place().id, null); await refresh(place().id);
  assert.equal(store.snapshot().places[0].dam, null);
  const cold = createSavedPlacesStore(disk); await cold.load(); assert.equal(cold.snapshot().places[0].damChoice, 'none');
  const offline = createSavedPlaceRefresher(cold, { ...api(), dam: async () => { throw Error('offline'); } }, () => now);
  assert.equal(await offline(place().id, 'dam-b'), false);
  assert.equal(cold.snapshot().places[0].damChoice, 'dam-b'); assert.equal(cold.snapshot().places[0].dam, null);
  assert.equal(placeRefreshNeeds(cold.snapshot().places[0], Date.parse(now)).dam, true);
});

test('automatic retries are bounded, back off, and stop starting work in background', async () => {
  const store = createSavedPlacesStore(memory());
  for (let i = 0; i < 6; i++) await store.save({ ...place(), id: String(i), detailsDownloadedAt: null });
  const pending = deferred<boolean>(); let calls = 0; let active = true; let time = Date.parse(now);
  const batch = createPlaceAutoRefresh(store, async () => { calls++; return pending.promise; }, () => time);
  await batch(() => false); assert.equal(calls, 0);
  const first = batch(() => active); await flush(); assert.equal(calls, 2);
  active = false; pending.resolve(false); await first; assert.equal(calls, 2);
  active = true; await batch(() => active); assert.equal(calls, 6);
  await batch(() => active); assert.equal(calls, 6);
  time += 60_000; await batch(() => active); assert.equal(calls, 10);
  await batch(() => active); assert.equal(calls, 12);
  time += 60_000; await batch(() => active); assert.equal(calls, 12);
});

test('refresh cadence uses download age without making an old observation fresh', () => {
  const current = { ...place(), damsCheckedAt: now, dam: { snapshot: dam(), downloadedAt: now } };
  assert.deepEqual(placeRefreshNeeds(current, Date.parse(now)), { details: false, dam: false, association: false });
  assert.deepEqual(placeRefreshNeeds(current, Date.parse(now) + 15 * 60_000), { details: true, dam: true, association: false });
  assert.equal(placeRefreshNeeds({ ...current, gauge: null }, Date.parse(now) + 15 * 60_000).details, false);
  const at = Date.parse(now);
  const dated = (hours: number) => ({ ...place(), gauge: { ...place().gauge!, reading: { ...place().gauge!.reading, lastUpdated: new Date(at - hours * 3_600_000).toISOString() } } });
  assert.equal(savedGaugeDisplay(dated(0.25), at).condition, 'Low'); assert.equal(savedGaugeDisplay(dated(0.25), at).age, '15 min ago');
  assert.equal(savedGaugeDisplay(dated(30), at).band, 'stale'); assert.equal(savedGaugeDisplay(dated(30), at).condition, null);
  assert.equal(savedGaugeDisplay(dated(72), at).reading, null); assert.equal(savedGaugeDisplay(dated(-2), at).band, 'expired');
  assert.match(savedPlaceSummary(dated(72), at)!, /Out of date.*3 days ago/);
});

test('schedules lead with Central today and tomorrow and separate historical days', () => {
  const snapshot = { ...place(), gauge: null, dam: { snapshot: { ...dam(), schedule: [
    { ...day, scheduleDate: '2026-10-26' }, day, { ...day, scheduleDate: '2026-10-25' },
  ] }, downloadedAt: now } };
  const groups = scheduleGroups(snapshot, Date.parse(now));
  assert.deepEqual(groups.upcoming.map(d => savedScheduleDayLabel(d.scheduleDate, Date.parse(now))), ['Today', 'Tomorrow']);
  assert.deepEqual(groups.earlier.map(d => d.scheduleDate), ['2026-10-24']);
  assert.equal(savedScheduleDayLabel('2026-10-24', Date.parse('2026-10-25T02:00:00Z')), 'Today');
  const hours = Array.from({ length: 24 }, (_, i) => ({ hourEnding: i + 1, megawatts: i >= 14 && i < 18 ? 20 : 0, cfs: 1000, isRamp: false }));
  snapshot.dam.snapshot.schedule = [{ ...day, scheduleDate: '2026-10-25', retrievedAt: now, hours }];
  assert.match(savedPlaceSummary(snapshot, Date.parse(now))!, /^Scheduled /);
  assert.match(savedPlaceSummary(snapshot, Date.parse(now))!, /2.*6.*CT/);
});

test('river dams sort first, access restrictions have labels, and place links belong to Favorites', () => {
  const related = DAM_CATALOG.at(-1)!;
  assert.equal(sortedPlaceDams(DAM_CATALOG, [related.id])[0].id, related.id);
  assert.ok(sortedPlaceDams(DAM_CATALOG, [], related.name.toUpperCase()).some(d => d.id === related.id));
  const saved = placeFromAccess({ ...detail, accessPoint: { ...detail.accessPoint, isPublic: false } }, now);
  assert.deepEqual(saved.tags, ['Private access', 'Fee required']); assert.equal(saved.facts.find(f => f.label === 'Fees')?.value, '$5 parking');
  assert.equal(coldDetailPath('/saved-place?id=landing'), '/(tabs)/(favorites)/saved-place?id=landing');
});
