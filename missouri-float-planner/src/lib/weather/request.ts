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

import { NextResponse, type NextRequest } from 'next/server';
import { getClientIp, rateLimit } from '@/lib/rate-limit';

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

// ── The shared request flow for both coordinate routes ───────────────────────
//
// Order matters, and is the point of having one implementation:
//   1. validate and snap the coordinates (400 before anything else);
//   2. serve the cache — no upstream cost, so no limiter round trip either;
//   3. only then rate-limit, STRICTLY: failClosed (a Redis outage rejects
//      rather than waving every request through) and requireGlobalLimiter (a
//      production process with no global limiter rejects rather than falling
//      back to a per-instance map that fan-out across instances defeats). An
//      uncached request is the one that spends a paid OpenWeather call, so
//      "unlimited while the limiter is down" is the failure to avoid here;
//   4. then the upstream call.


export const WEATHER_LIMIT = { requests: 30, windowMs: 60 * 1000 } as const;
export const WEATHER_LIMIT_POLICY = { failClosed: true, requireGlobalLimiter: true } as const;

export interface CoordinateWeatherRoute<T> {
  /** Limiter bucket prefix and log label, e.g. 'weather-forecast'. */
  name: string;
  cache: BoundedTtlCache<T>;
  cacheKeyPrefix?: string;
  cdnHeaders: Record<string, string>;
  load: (lat: number, lon: number, apiKey: string) => Promise<T>;
  /** Injected for tests; defaults to the strict global limiter. */
  limit?: (key: string) => Promise<NextResponse | null>;
  /** Injected for tests; defaults to OPENWEATHER_API_KEY. */
  apiKey?: () => string | undefined;
}

export function coordinateWeatherHandler<T>(route: CoordinateWeatherRoute<T>) {
  const limit =
    route.limit ?? ((key: string) => rateLimit(key, WEATHER_LIMIT.requests, WEATHER_LIMIT.windowMs, WEATHER_LIMIT_POLICY));
  const apiKey = route.apiKey ?? (() => process.env.OPENWEATHER_API_KEY);

  return async (request: NextRequest): Promise<NextResponse> => {
    const coords = parseWeatherCoords(request.nextUrl.searchParams);
    if (!coords.ok) return NextResponse.json({ error: coords.error }, { status: 400 });

    const cacheKey = `${route.cacheKeyPrefix ?? ''}${coords.key}`;
    const cached = route.cache.get(cacheKey);
    if (cached !== undefined) return NextResponse.json(cached, { headers: route.cdnHeaders });

    const limited = await limit(`${route.name}:${getClientIp(request)}`);
    if (limited) return limited;

    const key = apiKey();
    if (!key) return NextResponse.json({ error: 'Weather service not configured' }, { status: 503 });

    try {
      const data = await route.load(coords.lat, coords.lon, key);
      route.cache.set(cacheKey, data);
      return NextResponse.json(data, { headers: route.cdnHeaders });
    } catch (error) {
      console.error(`[${route.name}] fetch error:`, error);
      return NextResponse.json({ error: 'Failed to fetch weather data' }, { status: 500 });
    }
  };
}
