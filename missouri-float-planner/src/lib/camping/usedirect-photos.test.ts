import { createCampsitePhotoQueue } from '../../../../eddy-ios/src/lib/campsitePhotoQueue';
import { navigationCacheTtl } from '../../../../eddy-ios/src/lib/requestPool';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fetchStateParkPhotos, stateParkPhotos } from './usedirect-photos';
import { listsRows } from '../../../../eddy-ios/src/components/map-sheet/siteList';

// Public reservation response observed for Meramec site 112, 2026-09-21.
// Grid dictionary key 3370.1 is NOT the UnitId (11972).
const detail = {
  Unit: { UnitId: 11972, FacilityId: 803, Name: '112', Inactive: false, IsWebViewable: true },
  Images: ['ParkImages/Units/SaturnResizeImages/11972_1.jpg', 'ParkImages/Units/SaturnResizeImages/11972_2.jpg'],
};
const place = { SelectedPlace: { PlaceId: 60, Facilities: {
  '1': { FacilityId: 803, Category: 'Campgrounds' },
  '2': { FacilityId: 802, Category: 'Group Camping' },
} } };

test('State Parks uses exact unit and global campground IDs, preserving image provenance', () => {
  const photos = stateParkPhotos(detail, '11972', [803]);
  assert.equal(photos.length, 2);
  assert.equal(photos[0].url, 'https://icampmo.usedirect.com/MSPWeb/images/Missouri/ParkImages/Units/SaturnResizeImages/11972_1.jpg');
  assert.equal(photos[0].source, 'Missouri State Parks');
  assert.deepEqual(stateParkPhotos(detail, '3370.1', [803]), []);
  assert.deepEqual(stateParkPhotos(detail, '11972', [1]), []);
  assert.deepEqual(stateParkPhotos({ ...detail, Unit: { ...detail.Unit, Inactive: true } }, '11972', [803]), []);
});

test('ignores unknown galleries, icons, URLs and traversal; deduplicates actual photos', () => {
  assert.deepEqual(stateParkPhotos({}, '11972', [803]), []);
  assert.deepEqual(stateParkPhotos({ ...detail, Images: null }, '11972', [803]), []);
  const photos = stateParkPhotos({ ...detail, Images: [detail.Images[0], detail.Images[0],
    'https://example.com/other.jpg', 'ParkImages/Units/../Place/60.jpg',
    'ParkImages/Units/%2e%2e/other.jpg', 'Missouri/Units/ElectricWater50.png', null] }, '11972', [803]);
  assert.equal(photos.length, 1);
});

test('fetches one exact site and verifies its campground belongs to the requested park', async () => {
  const calls: string[] = [];
  const request: typeof fetch = async (input, init) => {
    calls.push(String(input));
    assert.equal((init as RequestInit & { next: { revalidate: number } }).next.revalidate, 86400);
    if (calls.length === 1) {
      assert.equal(JSON.parse(String(init?.body)).PlaceId, 60);
      return Response.json(place);
    }
    return Response.json(detail);
  };
  assert.equal((await fetchStateParkPhotos('60', '11972', request, new Date('2026-09-21T12:00:00Z'))).length, 2);
  assert.equal(calls.length, 2);
  assert.match(calls[1], /details\/11972\/startdate\/2026-09-21\/nights\/1\/0\/0$/);
});

test('provider outages and malformed answers are retryable failures, not cached absence', async () => {
  await assert.rejects(fetchStateParkPhotos('60', '11972', async () => new Response('', { status: 503 })));
  await assert.rejects(fetchStateParkPhotos('60', '11972', async () => Response.json({})));
  await assert.rejects(fetchStateParkPhotos('61', '11972', async () => Response.json(place)));
  await assert.rejects(fetchStateParkPhotos('60', '../11972', async () => { throw new Error('must not request'); }), /Invalid State Parks ID/);
});

test('available State Park sites retain rows and filters without a per-site booking URL', () => {
  const entries = [{ site: { id: 'id', name: 'Basic #001', loop: null, siteType: null,
    maxOccupancy: null, bookingUrl: null, nights: 'A' }, state: 'open' as const, tags: ['No hookup'] }];
  assert.equal(listsRows(entries), false);
  assert.equal(listsRows(entries, true), true);
  assert.equal(listsRows([{ ...entries[0], state: 'reserved' }], true), false);
});


test('photo queue caps concurrency and cancels hidden rows before they request upstream', async () => {
  const queue = createCampsitePhotoQueue(1);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const first = queue(() => gate, new AbortController().signal);
  const controller = new AbortController();
  let calls = 0;
  const next = queue(async () => { calls++; }, controller.signal);
  const cancelled = assert.rejects(next, { name: 'AbortError' });
  await Promise.resolve();
  assert.equal(calls, 0);
  controller.abort();
  await cancelled;
  release();
  await first;
  await queue(async () => { calls++; }, new AbortController().signal);
  assert.equal(calls, 1);
  assert.equal(navigationCacheTtl('/api/campsites/photos?facility=a&site=b'), 3_600_000);
  assert.equal(navigationCacheTtl('/api/campsites?facility=a'), 0);
});
