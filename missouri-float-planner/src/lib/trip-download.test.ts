// missouri-float-planner/src/lib/trip-download.test.ts
//
// Covers eddy-ios/src/lib/tripDownload.ts: the corridor plan for a trip's
// offline map and when it counts as Ready offline (ADR 0011). eddy-ios has no
// test runner; see route-preview.test.ts for the same arrangement.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildRouteIndex, type LngLat } from '@eddy/geo';
import { inspectStylePack } from '../../../eddy-ios/src/lib/stylePackRead';
import {
  CHUNK_METERS,
  PAD_METERS,
  isTripPack,
  planTripChunks,
  TRIP_PACKAGE_VERSION,
  tripDownloadState,
  tripPackageKey,
  tripPackName,
  offlineBadge,
  stylePackComplete,
  tripReadiness,
  type TripPackage,
} from '../../../eddy-ios/src/lib/tripDownload';

const { patchOfflineModule } = createRequire(import.meta.url)('../../../eddy-ios/plugins/withSerialMapboxOffline.js') as {
  patchOfflineModule: (source: string) => string;
};
const offlineSource = readFileSync(new URL('./fixtures/mapbox-offline-lifecycle.swift.txt', import.meta.url), 'utf8');

test('the pinned Mapbox lifecycle is patched once and remains safe to prebuild again', () => {
  const patched = patchOfflineModule(offlineSource);
  assert.notEqual(patched, offlineSource);
  assert.equal(patchOfflineModule(patched), patched);
  const config = JSON.parse(readFileSync(new URL('../../../eddy-ios/app.json', import.meta.url), 'utf8'));
  assert.ok(config.expo.plugins.includes('./plugins/withSerialMapboxOffline'));
  // This is a build-time source contract, not a substitute for compiling Swift
  // and exercising Mapbox's callbacks on a phone (ADR 0011 device gates).
  const start = patched.slice(patched.indexOf('  func startLoading('), patched.indexOf('  private func eddyStartNextDownload'));
  assert.ok(start.includes('eddyActiveDownload != pack.name'));
  assert.ok(start.includes('!eddyPendingDownloads.contains'));
  assert.ok(!start.includes('loadStylePack'));
  const complete = patched.slice(patched.indexOf('    taskGroup.notify(queue: .main)'));
  assert.ok(complete.includes('self.eddyFinishedDownload(id)'));
  assert.ok(complete.includes('self._sendEvent(Callbacks.progress.rawValue'));
  assert.ok(!patched.includes('offlinePackProgressDidChange(progress: progess, metadata: metadata, state: .complete)'));
  assert.ok(patched.includes('payload["state"] = state.rawValue'), '100% tile counts cannot detach the late style-error listener');
  assert.ok(patched.includes('pack.cancelables = self.tileRegionPacks[name]?.cancelables ?? []'), 'Status polls retain cancellation handles');
  assert.equal((patched.match(/eddyPendingDownloads.removeAll/g) ?? []).length, 2, 'Pause and removal cancel queued work');
});

test('a changed, ambiguous, or partially applied Mapbox patch fails the build', () => {
  assert.throws(() => patchOfflineModule(offlineSource
    .replace('func startLoading(pack: TileRegionPack)', 'func startLoading(pack: ChangedPack)')), /no longer matches/);
  assert.throws(() => patchOfflineModule(offlineSource + '\n' + offlineSource), /no longer matches/);
  const patched = patchOfflineModule(offlineSource);
  assert.throws(() => patchOfflineModule(patched.replace('self.eddyFinishedDownload(id)', '// lost queue release')), /incomplete/);
});

const LAT0 = 37.0;
const LNG0 = -91.4;
const COS = Math.cos((LAT0 * Math.PI) / 180);
const MILE = 1609.344;

function at(x: number, y = 0): LngLat {
  return [LNG0 + x / (COS * 111_320), LAT0 + y / 111_320];
}

/** A diagonal river heading north-east: 200 steps of 100 m, 20 km. */
const DIAGONAL: LngLat[] = Array.from({ length: 201 }, (_, i) => at(i * 70.7, i * 70.7));

function index() {
  const built = buildRouteIndex(DIAGONAL, [
    { lngLat: DIAGONAL[0], riverMile: 0 },
    { lngLat: DIAGONAL[200], riverMile: 20_000 / MILE },
  ]);
  assert.ok(built.ok);
  return built.index;
}

test('trip downloads can never be mistaken for the removed feature’s packs', () => {
  // packSweep deletes exactly these; a trip pack matching would be wiped.
  const PACK_SWEEP = /^river:[^:]+:\d+$/;
  for (const key of ['abc123', 'river', 'float-lx2-9k3', 'current']) {
    assert.equal(PACK_SWEEP.test(tripPackName(key, 0)), false, key);
  }
  assert.equal(isTripPack(tripPackName('abc', 3), 'abc'), true);
  assert.equal(isTripPack(tripPackName('abcd', 3), 'abc'), false, 'a key is not a prefix of another');
});

test('a long diagonal stretch downloads less than one padded rectangle around it', () => {
  const idx = index();
  const chunks = planTripChunks(idx, 'trip', DIAGONAL[0], DIAGONAL[200]);
  assert.equal(chunks.length, Math.ceil(20_000 / CHUNK_METERS));
  const area = ([[e, n], [w, s]]: [[number, number], [number, number]]) => (e - w) * (n - s);
  // The alternative: one rectangle around the whole stretch, padded the same.
  const dLat = PAD_METERS / 111_320;
  const dLng = PAD_METERS / (111_320 * COS);
  const [[w, s], [e, n]] = [DIAGONAL[0], DIAGONAL[200]];
  const single = area([[e + dLng, n + dLat], [w - dLng, s - dLat]]);
  // Summed chunk areas still count overlaps twice, so this understates the win.
  const corridor = chunks.reduce((sum, chunk) => sum + area(chunk.bounds), 0);
  assert.ok(corridor < single * 0.8, `corridor ${corridor} vs single ${single}`);
  // Bounds are north-east first, as createPack expects.
  for (const { bounds: [[ce, cn], [cw, cs]] } of chunks) assert.ok(ce > cw && cn > cs);
});

test('the corridor reaches past both ends, and either order of ends works', () => {
  const idx = index();
  const forward = planTripChunks(idx, 'trip', DIAGONAL[50], DIAGONAL[100]);
  const backward = planTripChunks(idx, 'trip', DIAGONAL[100], DIAGONAL[50]);
  assert.deepEqual(forward, backward);
  const [[, firstNorth], [firstWest, firstSouth]] = forward[0].bounds;
  void firstNorth;
  // The first chunk starts BEYOND_ENDS_METERS before the put-in, plus padding.
  assert.ok(firstWest < DIAGONAL[50][0] && firstSouth < DIAGONAL[50][1]);
});

test('Ready offline needs every chunk present and complete', () => {
  const expected = ['float:t:0', 'float:t:1'];
  const pack = (name: string, done: number, required = 100) => ({
    name, requiredResourceCount: required, completedResourceCount: done, completedResourceSize: done * 1000,
  });
  assert.deepEqual(tripDownloadState(expected, []), { kind: 'none' });
  assert.deepEqual(tripDownloadState([], [pack('float:t:0', 100)]), { kind: 'none' });
  assert.deepEqual(tripDownloadState(expected, [pack('float:t:0', 100), pack('float:t:1', 100)]), { kind: 'ready', bytes: 200_000 });
  const missing = tripDownloadState(expected, [pack('float:t:0', 100)]);
  assert.equal(missing.kind, 'partial');
  assert.ok(missing.kind === 'partial' && Math.abs(missing.fraction - 0.5) < 1e-9);
  assert.equal(tripDownloadState(expected, [pack('float:t:0', 100), pack('float:t:1', 40)]).kind, 'partial');
  const queued = tripDownloadState(expected, [pack('float:t:0', 100), pack('float:t:1', 0, 0)]);
  assert.ok(queued.kind === 'partial');
  assert.equal(queued.fraction, 0.5, 'A queued pack with no counts is unfinished, not free progress');
  // A pack that has not worked out what it needs yet is not complete.
  assert.equal(tripDownloadState(expected, [pack('float:t:0', 0, 0), pack('float:t:1', 100)]).kind, 'partial');
  // Other trips' packs are ignored.
  assert.equal(tripDownloadState(expected, [pack('float:other:0', 100), pack('float:t:0', 100)]).kind, 'partial');
});

test('offline style checks distinguish missing support, unknown data, and a failed read', async () => {
  assert.deepEqual(await inspectStylePack(null), { kind: 'unconfirmed', reason: 'module-missing' });
  assert.deepEqual(await inspectStylePack(async () => null), { kind: 'unconfirmed', reason: 'native-unconfirmed' });
  assert.deepEqual(await inspectStylePack(async () => { throw new Error('native failure'); }),
    { kind: 'unconfirmed', reason: 'read-failed' });
  const counts = { requiredResourceCount: 40, completedResourceCount: 40 };
  const result = await inspectStylePack(async () => counts);
  assert.deepEqual(result, { kind: 'counts', counts });
  assert.equal(stylePackComplete(result.kind === 'counts' ? result.counts : null), true);
});

test('a stalled style check ends and a later recheck can confirm the saved map', async () => {
  let finish!: (counts: { requiredResourceCount: number; completedResourceCount: number }) => void;
  const pending = new Promise<{ requiredResourceCount: number; completedResourceCount: number }>(resolve => { finish = resolve; });
  const result = await inspectStylePack(() => pending, 5);
  assert.deepEqual(result, { kind: 'unconfirmed', reason: 'timeout' });
  finish({ requiredResourceCount: 40, completedResourceCount: 40 });
  assert.deepEqual(result, { kind: 'unconfirmed', reason: 'timeout' }, 'Late answers cannot change the timed-out check');
  assert.deepEqual(await inspectStylePack(() => pending), {
    kind: 'counts', counts: { requiredResourceCount: 40, completedResourceCount: 40 },
  });
});

test('Ready offline means the whole trip, not only its tiles', () => {
  const STYLE = 'mapbox://styles/mapbox/outdoors-v12';
  const names = ['float:t:0', 'float:t:1'];
  const complete = names.map((name) => ({ name, requiredResourceCount: 10, completedResourceCount: 10, completedResourceSize: 1_000 }));
  const pkg: TripPackage = {
    version: TRIP_PACKAGE_VERSION,
    tripKey: 't',
    route: { riverSlug: 'current', riverName: 'Current', line: [], anchors: [], fetchedAt: null },
    fromId: 'a',
    toId: 'b',
    styleURL: STYLE,
    chunkNames: names,
    savedAt: '2026-07-01T00:00:00Z',
  };
  assert.deepEqual(tripReadiness(pkg, STYLE, complete, names, true), { kind: 'ready', bytes: 2_000 });
  // Tiles intact but the route package gone (cleared, or never saved).
  assert.equal(tripReadiness(null, STYLE, complete, names, true).kind, 'partial');
  // Tiles complete is not the whole map: without positive evidence the style
  // pack is complete, it is saved, never Ready offline.
  assert.deepEqual(tripReadiness(pkg, STYLE, complete, names, false), { kind: 'tiles-saved', bytes: 2_000 });
  // Downloaded for a different style than the app now draws.
  assert.equal(tripReadiness(pkg, 'mapbox://styles/mapbox/streets-v12', complete, names, true).kind, 'outdated');
  // A package from an older format is not trusted.
  assert.equal(tripReadiness({ ...pkg, version: 0 as never }, STYLE, complete, names, true).kind, 'partial');
  // Readiness checks the package's own chunks, not whatever happens to exist.
  assert.equal(tripReadiness({ ...pkg, chunkNames: [...names, 'float:t:2'] }, STYLE, complete, names, true).kind, 'partial');
  // A complete style pack does not make missing tiles ready.
  assert.equal(tripReadiness(pkg, STYLE, complete.slice(0, 1), names, true).kind, 'partial');
});

test('the style pack counts as complete only on positive evidence', () => {
  // No native module, no pack, or an error.
  assert.equal(stylePackComplete(null), false);
  // A pack that requires nothing has proved nothing.
  assert.equal(stylePackComplete({ requiredResourceCount: 0, completedResourceCount: 0 }), false);
  assert.equal(stylePackComplete({ requiredResourceCount: 40, completedResourceCount: 39 }), false);
  assert.equal(stylePackComplete({ requiredResourceCount: 40, completedResourceCount: 40 }), true);
});

test('the route package lives outside the cache that "clear saved river data" removes', () => {
  assert.equal(tripPackageKey('abc').startsWith('eddy.cache.'), false);
});

test('a saved float row never claims more than its trip card', () => {
  assert.equal(offlineBadge({ kind: 'ready', bytes: 1 }, true), 'Ready offline');
  // Tiles complete but the style pack unconfirmed is saved, not ready.
  assert.equal(offlineBadge({ kind: 'tiles-saved', bytes: 1 }, true), 'Download incomplete');
  assert.equal(offlineBadge({ kind: 'partial', fraction: 0.4, bytes: 1 }, true), 'Map partly saved');
  assert.equal(offlineBadge({ kind: 'outdated', bytes: 1 }, true), 'Map needs update');
  // The route package alone: the float starts offline, with no map.
  assert.equal(offlineBadge({ kind: 'none' }, true), 'Route saved');
  assert.equal(offlineBadge(null, true), 'Route saved');
  // Nothing on the phone says nothing.
  assert.equal(offlineBadge({ kind: 'none' }, false), null);
  assert.equal(offlineBadge(null, false), null);
});
