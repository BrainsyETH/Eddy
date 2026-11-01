// src/lib/weather/request.ts
// Input rules for the coordinate weather routes (/api/weather, /api/weather/forecast).
//
// Both are public and each NEW location costs a paid OpenWeather call. They
// used to accept any coordinates (NaN and the far side of the planet
// included), round to 0.01° (~1 km, so a sweep of nearby points was a sweep of
// paid calls), and cache in a per-instance Map that never evicted. Now:
//
//   * coordinates must be finite and inside a generous US envelope — Eddy's
//     gauges are national, so a Missouri box would break real users;
//   * they are snapped to the same 0.05° grid the iOS app already quantises to
//     (eddy-ios/src/api/client.ts), so app requests and server cache keys agree
//     and the number of distinct upstream calls is bounded;
//   * the in-memory cache is size-bounded (least recently used goes first);
//   * the routes rate-limit per client before any of this runs.

export const WEATHER_GRID_DEGREES = 0.05;

/** Continental US, Alaska and Hawaii, generously. Outside this Eddy has no rivers. */
export const US_ENVELOPE = { minLat: 17, maxLat: 72, minLon: -180, maxLon: -64 } as const;

export type CoordResult = { ok: true; lat: number; lon: number; key: string } | { ok: false; error: string };

const snap = (value: number) => Math.round(value / WEATHER_GRID_DEGREES) * WEATHER_GRID_DEGREES;

export function parseWeatherCoords(params: URLSearchParams): CoordResult {
  const rawLat = params.get('lat');
  const rawLon = params.get('lon');
  if (!rawLat || !rawLon) return { ok: false, error: 'Missing lat or lon parameter' };
  const lat = Number(rawLat);
  const lon = Number(rawLon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { ok: false, error: 'lat and lon must be numbers' };
  const { minLat, maxLat, minLon, maxLon } = US_ENVELOPE;
  if (lat < minLat || lat > maxLat || lon < minLon || lon > maxLon) {
    return { ok: false, error: 'Weather is only available for locations in the United States' };
  }
  const snappedLat = Number(snap(lat).toFixed(2));
  const snappedLon = Number(snap(lon).toFixed(2));
  return { ok: true, lat: snappedLat, lon: snappedLon, key: `${snappedLat},${snappedLon}` };
}

/** A small TTL cache that evicts the least recently used entry past `maxEntries`. */
export class BoundedTtlCache<T> {
  private readonly entries = new Map<string, { value: T; at: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
  ) {}

  get(key: string, now = Date.now()): T | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (now - hit.at >= this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    // Re-insert so Map order tracks recency.
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit.value;
  }

  set(key: string, value: T, now = Date.now()): void {
    this.entries.delete(key);
    this.entries.set(key, { value, at: now });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}
