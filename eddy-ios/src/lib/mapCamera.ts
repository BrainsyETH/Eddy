// eddy-ios/src/lib/mapCamera.ts
// Where the map camera last settled, so the next launch opens there.
//
// The map used to open on the user's position or the whole network every
// time, which treats the four-hundredth session like the first: somebody who
// floats the same river all season re-panned to it on every launch. The last
// settled camera is the best guess at what they want to see next, and it is a
// guess the reader made themselves.
//
// ── Device-local, like the layer set, and for the same reasons ─────────────
// A camera is a fact about this screen on this device — see mapPreferences'
// header, whose whole argument transfers. Deliberately NOT imported from:
// that module resolves `@/map/layers` at runtime, and the web suite — the
// only runner this app has — maps `@/*` to its own src, so anything it
// imports must stay free of app-path imports. The two-method storage
// interface is duplicated structurally instead (three lines), which is the
// same trade `serviceLayers` makes against `layers.ts`.
//
// ── Aged, unlike the layer set ─────────────────────────────────────────────
// A layer choice is good for ever; a camera position is a statement about
// what the reader was doing lately. Thirty days is long enough to span a
// fortnight between float weekends and short enough that next season's first
// launch opens fresh rather than on wherever November ended.

/** Bumped only for an incompatible shape — see readMapCamera's validation. */
export const MAP_CAMERA_KEY = 'eddy.map.camera.v1';

export const MAP_CAMERA_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface MapCameraStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface StoredMapCamera {
  lng: number;
  lat: number;
  zoom: number;
  /** Epoch ms of the settle that wrote this. */
  at: number;
}

function deviceStorage(): MapCameraStorage {
  // Lazily required, like mapPreferences': a native module resolved at import
  // costs the app its launch rather than costing this file its feature.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-async-storage/async-storage').default as MapCameraStorage;
}

/** A number that is real and inside the given range. */
function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/**
 * The stored camera, or null when there is nothing usable to restore.
 *
 * Null for: nothing stored, corrupt JSON, a missing or mistyped field, a
 * coordinate off the earth, a zoom outside Mapbox's range, or a camera older
 * than MAP_CAMERA_MAX_AGE_MS. Every one of those answers the caller the same
 * way — open as though nothing were stored — because a camera that cannot be
 * trusted whole is not worth applying in part.
 */
export async function readMapCamera(
  storage: MapCameraStorage = deviceStorage(),
  now: number = Date.now(),
): Promise<StoredMapCamera | null> {
  try {
    const raw = await storage.getItem(MAP_CAMERA_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { lng, lat, zoom, at } = parsed as Record<string, unknown>;
    if (!inRange(lng, -180, 180)) return null;
    if (!inRange(lat, -90, 90)) return null;
    if (!inRange(zoom, 0, 22)) return null;
    if (typeof at !== 'number' || !Number.isFinite(at)) return null;
    if (now - at > MAP_CAMERA_MAX_AGE_MS) return null;
    return { lng, lat, zoom, at };
  } catch {
    // A corrupt value is not worth a crash on the launch screen; opening on
    // the defaults is a perfectly good map.
    return null;
  }
}

/**
 * Remember where the camera settled. Never throws — a map that draws
 * correctly and forgets is a smaller failure than one that stalls on a
 * key-value write.
 */
export async function writeMapCamera(
  camera: { lng: number; lat: number; zoom: number },
  storage: MapCameraStorage = deviceStorage(),
  now: number = Date.now(),
): Promise<void> {
  try {
    const stored: StoredMapCamera = { ...camera, at: now };
    await storage.setItem(MAP_CAMERA_KEY, JSON.stringify(stored));
  } catch {
    // Intentionally silent. See above.
  }
}
