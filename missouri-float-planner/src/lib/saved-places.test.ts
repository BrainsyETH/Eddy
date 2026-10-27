import assert from 'node:assert/strict';
import test from 'node:test';
import type { AccessPointDetailResponse, CampsiteAvailabilitySummary, DamSnapshot, RiverService } from '../../../packages/eddy-types';
import { createSavedPlacesStore, decodeSavedPlaces, placeFromAccess, placeFromPin, placeFromService, savedScheduleState, wholeRiverDam, SAVED_PLACES_KEY, savedPlacesKey, savedPlacesOwner } from '../../../eddy-ios/src/lib/savedPlaces';
import { createSavedPlaceRefresher, refreshedDam, createPlaceAutoRefresh, placeRefreshNeeds } from '../../../eddy-ios/src/lib/savedPlaceRefresh';

import { savedCampingDisplay, savedGaugeDisplay, savedPlaceSummary, savedScheduleDayLabel, scheduleGroups, sortedPlaceDams } from '../../../eddy-ios/src/lib/savedPlaceDisplay';
import { CAMPING_MAX_AGE_MS } from '../../shared/camping-freshness';
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
const availability = (overrides: Partial<CampsiteAvailabilitySummary> = {}): CampsiteAvailabilitySummary => ({
  window: { startDate: '2026-10-25', endDate: '2026-10-27', label: 'Oct 25–27' },
  sitesOpen: 4, sitesReservable: 20, sitesWalkUp: 3, status: 'open',
  kind: 'campground', source: 'recreation_gov', fetchedAt: '2026-10-25T15:00:00Z', facilityId: 'facility-a',
  nights: [
    { date: '2026-10-25', sitesOpen: 4, sitesReservable: 20, sitesWalkUp: 3, status: 'open' },
    { date: '2026-10-26', sitesOpen: 7, sitesReservable: 20, sitesWalkUp: 3, status: 'open' },
  ],
  ...overrides,
});
const campingPlace = (summary = availability()) => ({
  ...place(), camping: { availability: summary, name: 'Landing Campground', downloadedAt: now },
});
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

test('campgrounds save useful contact/logistics without promoting malformed inventory', () => {
  const pin = placeFromPin({ id: 'service:camp', name: 'Camp', layer: 'campgrounds', coordinates: { lat: 36, lng: -92 },
    body: '<p>Office closes at 6</p>', contactLinks: [{ label: 'Call', url: 'tel:5551112222' }] }, now)!;
  assert.equal(pin.id, 'place:service:camp'); assert.equal(pin.riverSlug, null);
  const updated = placeFromService({ name: 'Camp', description: 'Gate closes at 7', phone: '5551112222', website: 'example.com', latitude: 36, longitude: -92, availability: { sitesOpen: 20 } } as RiverService, pin, now);
  assert.equal(updated.links.length, 2); assert.deepEqual(updated.notes, ['Gate closes at 7']);
  assert.equal('availability' in updated, false);
  assert.equal(updated.camping, null);
  assert.ok(placeFromService({ description: '', status: 'temporarily_closed' } as RiverService, pin, now).tags.includes('Temporarily closed'));
});

test('saved access inventory uses the common source resolver even when the access is not typed as a campground', () => {
  const statePark = availability({ source: 'mo_state_parks', facilityId: 'state-park', sitesWalkUp: null });
  const nested = availability({ facilityId: 'nps-camp' });
  const both = { ...detail, accessPoint: { ...detail.accessPoint, availability: statePark,
    npsCampground: { name: 'Linked Campground', availability: nested } } } as AccessPointDetailResponse;
  const saved = placeFromAccess(both, now);
  assert.equal(saved.kind, 'access');
  assert.deepEqual(saved.camping?.availability, statePark);
  assert.equal(saved.camping?.name, 'Linked Campground');
  assert.equal(saved.camping?.downloadedAt, now);
  assert.equal(saved.camping?.availability.fetchedAt, statePark.fetchedAt);
  assert.equal(saved.gauge?.reading.usgsId, detail.gaugeStatus?.usgsId, 'the detail view still retains its gauge');
  const olderServer = { ...both, accessPoint: { ...both.accessPoint, availability: undefined } };
  assert.deepEqual(placeFromAccess(olderServer, now).camping?.availability, nested);
  const parkOnly = { ...both, accessPoint: { ...both.accessPoint, npsCampground: null } };
  assert.deepEqual(placeFromAccess(parkOnly, now).camping?.availability, statePark);
  assert.equal(placeFromAccess(parkOnly, now).camping?.name, detail.accessPoint.name);
});

test('service snapshots retain supported inventory and successful absent inventory clears the previous copy', () => {
  const pin = placeFromPin({ id: 'service:camp', name: 'Camp', layer: 'campgrounds', coordinates: { lat: 36, lng: -92 } }, now)!;
  const inventory = availability({ source: 'mo_state_parks', sitesWalkUp: null });
  const service = { name: 'State Park Campground', description: 'Campground', availability: inventory } as RiverService;
  const saved = placeFromService(service, pin, now);
  assert.deepEqual(saved.camping, { availability: inventory, name: service.name, downloadedAt: now });
  assert.equal(placeFromService({ ...service, availability: null }, saved, now).camping, null);
  assert.equal(placeFromAccess(detail, now, campingPlace()).camping, null);
});

test('camping inventory survives a cold load with its original observation date', async () => {
  const disk = memory(); const store = createSavedPlacesStore(disk); const saved = campingPlace();
  await store.save(saved);
  const cold = createSavedPlacesStore(disk); await cold.load();
  assert.deepEqual(cold.snapshot().places, [saved]);
  const display = savedCampingDisplay(cold.snapshot().places[0], Date.parse(now));
  assert.deepEqual(display?.availability, saved.camping.availability);
  assert.equal(display?.age, '1 hr ago');
  assert.match(display?.summary ?? '', /4 open.*20.*Tonight/);
  assert.match(savedPlaceSummary(saved, Date.parse(now)) ?? '', /4 open/);
  assert.match(savedPlaceSummary({ ...saved, kind: 'campground' }, Date.parse(now)) ?? '', /4 open/);
});

test('legacy and malformed camping data never discard an otherwise usable saved place', () => {
  const legacy = { ...place() }; delete legacy.camping;
  const old = decodeSavedPlaces(JSON.stringify({ version: 2, places: [legacy] }));
  assert.equal(old.length, 1); assert.equal(old[0].camping, undefined);
  for (const camping of [
    {},
    { availability: { sitesOpen: 99 }, name: 'Broken', downloadedAt: now },
    { ...campingPlace().camping, availability: availability({ sitesOpen: -1 }) },
    { ...campingPlace().camping, availability: availability({ nights: [{ date: 'not-a-date', sitesOpen: 3, sitesReservable: 10, status: 'open' }] }) },
  ]) {
    const loaded = decodeSavedPlaces(JSON.stringify({ version: 2, places: [{ ...place(), camping }] }));
    assert.equal(loaded.length, 1); assert.equal(loaded[0].camping, null);
    assert.deepEqual(loaded[0].facts, place().facts);
    assert.deepEqual(loaded[0].gauge, place().gauge);
  }
});

test('saved camping uses provider age, rejects future/invalid times, and expires at the canonical boundary', () => {
  const at = Date.parse(now);
  const almostExpired = availability({ fetchedAt: new Date(at - CAMPING_MAX_AGE_MS + 1).toISOString() });
  assert.ok(savedCampingDisplay(campingPlace(almostExpired), at)?.availability);
  for (const fetchedAt of [new Date(at - CAMPING_MAX_AGE_MS).toISOString(), new Date(at + 1).toISOString(), 'invalid', '']) {
    const saved = campingPlace(availability({ fetchedAt }));
    const display = savedCampingDisplay(saved, at);
    assert.equal(display?.availability, null, fetchedAt);
    assert.equal(display?.summary, 'Availability out of date');
    assert.equal(savedPlaceSummary(saved, at), 'Availability out of date');
    assert.equal(savedPlaceSummary({ ...saved, kind: 'campground' }, at), 'Availability out of date');
    assert.doesNotMatch(display?.accessibilityLabel ?? '', /4 open|20 sites|cfs/);
  }
  assert.equal(savedCampingDisplay(place(), at), null);
  assert.match(savedPlaceSummary(place(), at) ?? '', /0 cfs/);
});

test('saved camping rolls its named night at Central midnight and never revives past-only weekend totals', () => {
  const saved = campingPlace(availability({ fetchedAt: '2026-10-26T04:00:00Z' }));
  const before = savedCampingDisplay(saved, Date.parse('2026-10-26T04:59:59Z'));
  const after = savedCampingDisplay(saved, Date.parse('2026-10-26T05:00:00Z'));
  assert.equal(before?.today, '2026-10-25'); assert.match(before?.summary ?? '', /4 open/);
  assert.equal(after?.today, '2026-10-26'); assert.match(after?.summary ?? '', /7 open/);
  const pastWindow = { startDate: '2026-10-23', endDate: '2026-10-25', label: 'Past weekend' };
  for (const nights of [undefined, [], [availability().nights![0]]]) {
    const past = campingPlace(availability({ fetchedAt: '2026-10-26T04:00:00Z', window: pastWindow, nights }));
    const display = savedCampingDisplay(past, Date.parse('2026-10-26T05:00:00Z'));
    assert.equal(display?.availability, null);
    assert.equal(display?.summary, 'Availability out of date');
  }
  const upcoming = campingPlace(availability({ fetchedAt: '2026-10-26T04:00:00Z', window: pastWindow }));
  assert.ok(savedCampingDisplay(upcoming, Date.parse('2026-10-26T05:00:00Z'))?.availability, 'current measured nights remain usable even when the old window ended');
});

test('legacy camping discovery and live camping refresh reuse bounded detail downloads without requiring a gauge', () => {
  const at = Date.parse(now), current = { ...campingPlace(), gauge: null, damsCheckedAt: now };
  assert.equal(placeRefreshNeeds(current, at + 15 * 60_000 - 1).details, false);
  assert.equal(placeRefreshNeeds(current, at + 15 * 60_000).details, true);
  const legacy = { ...place(), gauge: null }; delete legacy.camping;
  assert.equal(placeRefreshNeeds(legacy, at).details, true);
  assert.equal(placeRefreshNeeds({ ...legacy, id: 'place:service:camp', detailRoute: null }, at).details, true);
  assert.equal(placeRefreshNeeds({ ...legacy, id: 'place:unlinked', detailRoute: null }, at).details, false);
  assert.equal(placeRefreshNeeds({ ...legacy, camping: null }, at).details, false);
});

test('failed camping refresh retains inventory and provider age; a successful empty response clears it', async () => {
  const saved = { ...campingPlace(), gauge: null, damChoice: 'none' };
  const store = createSavedPlacesStore(memory()); await store.save(saved);
  const failed = createSavedPlaceRefresher(store, { ...api(), access: async () => { throw Error('offline'); } }, () => now);
  assert.equal(await failed(saved.id), false); assert.deepEqual(store.snapshot().places[0].camping, saved.camping);
  const fresh = createSavedPlaceRefresher(store, { ...api(), access: async () => ({ ...detail,
    accessPoint: { ...detail.accessPoint, availability: saved.camping.availability }, gaugeStatus: null }) }, () => '2026-10-25T17:00:00Z');
  assert.equal(await fresh(saved.id), true);
  assert.equal(store.snapshot().places[0].camping?.downloadedAt, '2026-10-25T17:00:00Z');
  assert.equal(store.snapshot().places[0].camping?.availability.fetchedAt, saved.camping.availability.fetchedAt);
  const empty = createSavedPlaceRefresher(store, api(), () => now);
  assert.equal(await empty(saved.id), true); assert.equal(store.snapshot().places[0].camping, null);
});

test('late camping inventory cannot cross an account switch or restore a removed favorite', async () => {
  for (const boundary of ['account', 'removed']) {
    const store = createSavedPlacesStore(memory()); await store.select('a');
    const saved = { ...place(), damChoice: 'none' }; await store.save(saved);
    const pending = deferred<AccessPointDetailResponse>();
    const refresh = createSavedPlaceRefresher(store, { ...api(), access: () => pending.promise }, () => now);
    const loading = refresh(saved.id, undefined, { owner: 'a' }); await flush();
    if (boundary === 'account') { await store.select('b'); await store.save({ ...saved, name: 'B landing' }); }
    else await store.remove(saved.id, 'a');
    pending.resolve({ ...detail, accessPoint: { ...detail.accessPoint, availability: availability() } });
    await loading;
    if (boundary === 'account') {
      assert.equal(store.snapshot().owner, 'b'); assert.equal(store.snapshot().places[0].camping, null);
      await store.select('a'); assert.equal(store.snapshot().places[0].camping, null);
    } else assert.deepEqual(store.snapshot().places, []);
  }
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
  assert.equal(store.snapshot().places[0].name, 'Guest'); await store.save({ ...place(), name: 'A' });
  const loading = store.select('b'); assert.deepEqual(store.snapshot().places, []); assert.equal(store.snapshot().ready, false);
  await loading; await store.save({ ...place(), name: 'B' });
  await store.select('guest'); assert.deepEqual(store.snapshot().places, []);
  await store.select('a'); assert.equal(store.snapshot().places[0].name, 'A'); await store.clear('a');
  await store.select('b'); assert.equal(store.snapshot().places[0].name, 'B');
  assert.equal(disk.values.has(savedPlacesKey('a')), false);
  assert.equal(savedPlacesOwner('anonymous', true), 'guest'); assert.equal(savedPlacesOwner('a', false), 'a');
});

test('guest saves survive sign-in once, merge by ID and earliest date, and stay hidden from B', async () => {
  const disk = memory(); const store = createSavedPlacesStore(disk);
  const earlier = '2026-10-20T16:00:00Z';
  const account = { ...place(), name: 'Account copy', damChoice: 'none' };
  disk.values.set(savedPlacesKey('a'), JSON.stringify({ version: 2, places: [account] }));
  await store.save({ ...place(), savedAt: earlier });
  await store.save({ ...place(), id: 'second', name: 'Second landing' });
  await store.select('a');
  assert.equal(store.snapshot().places.length, 2);
  assert.deepEqual(store.snapshot().places.find(p => p.id === account.id), { ...account, savedAt: earlier });
  assert.equal(disk.values.has(SAVED_PLACES_KEY), false);
  await store.select('b'); assert.deepEqual(store.snapshot().places, []);
  await store.select('guest'); assert.deepEqual(store.snapshot().places, []);
  await store.select('a'); assert.equal(store.snapshot().places.length, 2);
  await store.remove(account.id);
  const cold = createSavedPlacesStore(disk); await cold.select('a');
  assert.deepEqual(cold.snapshot().places.map(p => p.id), ['second']); // No later replay.
});

test('interrupted sign-in resumes only into its original account, even after a restart into B', async () => {
  for (const failure of ['account write', 'guest clear']) {
    const disk = memory(); const store = createSavedPlacesStore(disk); await store.save(place());
    const write = disk.setItem; const remove = disk.removeItem;
    disk.setItem = async (key, value) => { if (failure === 'account write' && key === savedPlacesKey('a')) throw Error('full'); await write(key, value); };
    disk.removeItem = async key => { if (failure === 'guest clear' && key === SAVED_PLACES_KEY) throw Error('busy'); await remove(key); };
    await store.select('a'); assert.ok(store.snapshot().error);
    assert.equal(JSON.parse(disk.values.get(SAVED_PLACES_KEY)!).claimedBy, 'a');
    disk.setItem = write; disk.removeItem = remove;
    const cold = createSavedPlacesStore(disk); await cold.select('b');
    assert.deepEqual(cold.snapshot().places, []); assert.equal(disk.values.has(SAVED_PLACES_KEY), false);
    await cold.select('a'); assert.deepEqual(cold.snapshot().places, [place()]);
  }
});

test('account deletion removes an interrupted transfer before it can restore the account', async () => {
  const disk = memory(); const store = createSavedPlacesStore(disk); await store.save(place());
  const write = disk.setItem;
  disk.setItem = async (key, value) => { if (key === savedPlacesKey('a')) throw Error('full'); await write(key, value); };
  await store.select('a'); assert.ok(store.snapshot().error);
  disk.setItem = write;
  await store.clear('a');
  const cold = createSavedPlacesStore(disk); await cold.select('b'); await cold.select('a');
  assert.deepEqual(cold.snapshot().places, []); assert.equal(disk.values.has(SAVED_PLACES_KEY), false);
});

test('account deletion and B selection win against an in-flight guest transfer', async () => {
  const disk = memory(); const store = createSavedPlacesStore(disk); await store.save(place());
  const pending = deferred<void>(); const write = disk.setItem;
  disk.setItem = async (key, value) => { if (key === savedPlacesKey('a')) await pending.promise; await write(key, value); };
  const signingIn = store.select('a'); await flush();
  const switching = store.select('b'); const clearing = store.clear('a');
  pending.resolve(); await Promise.all([signingIn, switching, clearing]);
  assert.equal(store.snapshot().owner, 'b'); assert.deepEqual(store.snapshot().places, []);
  assert.equal(disk.values.has(savedPlacesKey('a')), false); assert.equal(disk.values.has(SAVED_PLACES_KEY), false);
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


test('offline campground pins retain inventory and missing inventory remains eligible for lookup', () => {
  const pin = { id: 'service:camp', name: 'Camp', layer: 'campgrounds', coordinates: { lat: 36, lng: -92 } };
  const saved = placeFromPin({ ...pin, availability: availability() }, now)!;
  assert.equal(saved.camping?.availability.fetchedAt, availability().fetchedAt);
  const cold = decodeSavedPlaces(JSON.stringify({ version: 2, places: [saved] }))[0];
  assert.deepEqual(cold.camping, saved.camping);
  for (const inventory of [undefined, null]) {
    const unchecked = placeFromPin({ ...pin, availability: inventory }, now)!;
    assert.equal(unchecked.camping, undefined);
    assert.equal(placeRefreshNeeds(unchecked, Date.parse(now)).details, true);
  }
});

test('camping leads for every saved place regardless of access or campground tags', () => {
  for (const type of ['boat_ramp', 'gravel_bar', 'bridge', 'access'] as const) {
    const mixed = placeFromAccess({ ...detail, accessPoint: { ...detail.accessPoint, types: ['campground', type], availability: availability() } }, now);
    assert.equal(mixed.kind, 'campground');
    assert.match(savedPlaceSummary(mixed, Date.parse(now)) ?? '', /4 open/);
    assert.match(savedPlaceSummary({ ...mixed, kind: 'access' }, Date.parse(now)) ?? '', /4 open/);
  }
  const camp = placeFromAccess({ ...detail, accessPoint: { ...detail.accessPoint, types: ['campground'], availability: availability() } }, now);
  assert.equal(camp.kind, 'campground');
  assert.match(savedPlaceSummary(camp, Date.parse(now)) ?? '', /4 open/);
  const ungauged = { ...campingPlace(), gauge: null };
  assert.match(savedPlaceSummary(ungauged, Date.parse(now)) ?? '', /4 open/);
  const scheduled = { ...ungauged, dam: { snapshot: { ...dam(), schedule: [{ ...day, scheduleDate: '2026-10-25', retrievedAt: now, hours: Array.from({ length: 24 }, (_, i) => ({ hourEnding: i + 1, megawatts: 0, cfs: 0, isRamp: false })) }] }, downloadedAt: now } };
  assert.match(savedPlaceSummary(scheduled, Date.parse(now)) ?? '', /4 open/);
  assert.equal(savedPlaceSummary({ ...scheduled, camping: null }, Date.parse(now)), 'No generation scheduled today');
});
