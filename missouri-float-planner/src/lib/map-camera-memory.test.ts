import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAP_CAMERA_KEY,
  MAP_CAMERA_MAX_AGE_MS,
  readMapCamera,
  writeMapCamera,
  type MapCameraStorage,
} from '../../../eddy-ios/src/lib/mapCamera';

// The map opens on the camera the last session settled on — see mapCamera.ts.
// The module is pure key-value logic behind an injectable storage, which is
// what lets this suite (the app's only runner) exercise it: same arrangement
// as mapPreferences, whose storage interface it deliberately mirrors rather
// than imports (that module resolves `@/map/layers` at runtime, and `@/` here
// is the web app's src).

/** In-memory storage double. */
function memory(initial: Record<string, string> = {}): MapCameraStorage & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => Promise.resolve(data[key] ?? null),
    setItem: (key, value) => {
      data[key] = value;
      return Promise.resolve();
    },
  };
}

const NOW = 1_700_000_000_000;
const CAMERA = { lng: -91.5, lat: 37.5, zoom: 8.6 };

test('a written camera round-trips, stamped with when it settled', async () => {
  const storage = memory();
  await writeMapCamera(CAMERA, storage, NOW);
  assert.deepEqual(await readMapCamera(storage, NOW), { ...CAMERA, at: NOW });
});

test('nothing stored is null, never a default camera', async () => {
  assert.equal(await readMapCamera(memory(), NOW), null);
});

test('corrupt or mis-shaped values restore nothing rather than crashing', async () => {
  for (const raw of [
    'not json',
    '42',
    'null',
    '[]',
    '{}',
    JSON.stringify({ lng: -91.5, lat: 37.5 }), // no zoom, no at
    JSON.stringify({ ...CAMERA, at: 'yesterday' }),
    JSON.stringify({ ...CAMERA, lng: '-91.5', at: NOW }),
    JSON.stringify({ ...CAMERA, zoom: Number.NaN, at: NOW }),
  ]) {
    const storage = memory({ [MAP_CAMERA_KEY]: raw });
    assert.equal(await readMapCamera(storage, NOW), null, `must reject ${raw}`);
  }
});

test('a camera off the earth or off the zoom scale is rejected whole', async () => {
  // A camera that cannot be trusted whole is not applied in part — one bad
  // field invalidates the record rather than being clamped.
  for (const bad of [
    { ...CAMERA, lng: 181 },
    { ...CAMERA, lng: -181 },
    { ...CAMERA, lat: 91 },
    { ...CAMERA, lat: -91 },
    { ...CAMERA, zoom: -1 },
    { ...CAMERA, zoom: 23 },
  ]) {
    const storage = memory({ [MAP_CAMERA_KEY]: JSON.stringify({ ...bad, at: NOW }) });
    assert.equal(await readMapCamera(storage, NOW), null);
  }
});

test('a camera ages out at thirty days, and exactly-at-the-boundary survives', async () => {
  const storage = memory();
  await writeMapCamera(CAMERA, storage, NOW);
  assert.notEqual(
    await readMapCamera(storage, NOW + MAP_CAMERA_MAX_AGE_MS),
    null,
    'exact age is still a restorable camera',
  );
  assert.equal(
    await readMapCamera(storage, NOW + MAP_CAMERA_MAX_AGE_MS + 1),
    null,
    'past the window, next season opens fresh',
  );
});

test('a throwing storage is swallowed on write and read alike', async () => {
  const broken: MapCameraStorage = {
    getItem: () => Promise.reject(new Error('disk gone')),
    setItem: () => Promise.reject(new Error('disk gone')),
  };
  await writeMapCamera(CAMERA, broken, NOW); // must not throw
  assert.equal(await readMapCamera(broken, NOW), null);
});
