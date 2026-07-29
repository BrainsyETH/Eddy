// src/lib/api-utils.ts
// Shared utility functions for admin API routes

import { NextResponse } from 'next/server';

/**
 * CDN cache headers for public read-mostly API routes.
 *
 * The underlying data is refreshed by cron (gauges hourly, Eddy updates
 * daily) or edited rarely (rivers, access points, blog), so letting the
 * Vercel CDN serve responses for a few minutes cuts function invocations
 * and Supabase load dramatically without meaningful staleness.
 *
 * Note: routes exporting `dynamic = 'force-dynamic'` still get CDN caching
 * from this header — `s-maxage` governs the CDN independently of Next's
 * route-segment cache.
 */
export function cdnCacheHeaders(sMaxageSeconds: number, staleWhileRevalidateSeconds: number): Record<string, string> {
  return {
    'Cache-Control': `public, s-maxage=${sMaxageSeconds}, stale-while-revalidate=${staleWhileRevalidateSeconds}`,
  };
}

/**
 * Cache headers for authenticated, per-user responses (`/api/me/*`).
 *
 * The inverse of cdnCacheHeaders, and not merely decorative. A response with no
 * Cache-Control at all is eligible for HEURISTIC caching under RFC 9111 — a
 * shared cache may store it and pick its own freshness lifetime. For a route
 * whose body differs per caller that is a cross-user data leak, so the absence
 * of a cache header is not the same as saying "don't cache this".
 *
 * `private` bars shared caches outright; `no-store` additionally stops the
 * response being written to disk on the device.
 */
export function privateNoStore(): Record<string, string> {
  return { 'Cache-Control': 'private, no-store' };
}

/**
 * NextResponse.json with privateNoStore applied.
 *
 * Used for EVERY response in `/api/me/*`, including errors, rather than only
 * the ones carrying user data. A total convention is auditable — you can grep a
 * route for `NextResponse.json` and expect none — whereas "add the header where
 * it matters" quietly fails the first time someone adds a response and doesn't
 * think about caching.
 */
export function jsonPrivate(body: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: { ...(init?.headers ?? {}), ...privateNoStore() },
  });
}

/**
 * Type guard for Supabase joined river relation data.
 * Used when a query includes `rivers(id, name, slug)`.
 */
export function getRiverData(rivers: unknown): { id?: string; name?: string; slug?: string } | null {
  if (!rivers || typeof rivers !== 'object') return null;
  return rivers as { id?: string; name?: string; slug?: string };
}

/**
 * Extracts lng/lat coordinates from the GeoJSON, WKT, or EWKB point shapes
 * PostgREST can return for a PostGIS geography column.
 */
export function getCoordinates(geom: unknown): { lng: number; lat: number } | null {
  if (!geom) return null;
  if (typeof geom === 'object') {
    const geo = geom as { type?: string; coordinates?: [number, number] };
    if (geo.type === 'Point' && Array.isArray(geo.coordinates) && geo.coordinates.length >= 2) {
      return { lng: geo.coordinates[0], lat: geo.coordinates[1] };
    }
    return null;
  }
  if (typeof geom !== 'string') return null;

  const wkt = geom.match(/POINT\s*\(\s*([\d.-]+)\s+([\d.-]+)\s*\)/i);
  if (wkt) return { lng: Number(wkt[1]), lat: Number(wkt[2]) };

  const hex = geom.replace(/\s/g, '');
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length < 42 || hex.slice(0, 2) !== '01') return null;
  try {
    const typeHex = hex.slice(2, 10);
    const hasSrid = typeHex === '01000020' || typeHex === '21000020';
    const coordStart = hasSrid ? 18 : 10;
    const readLittleEndianDouble = (value: string) => {
      const bytes = value.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)).reverse();
      if (!bytes || bytes.length !== 8) return Number.NaN;
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      bytes.forEach((byte, index) => view.setUint8(index, byte));
      return view.getFloat64(0, false);
    };
    const lng = readLittleEndianDouble(hex.slice(coordStart, coordStart + 16));
    const lat = readLittleEndianDouble(hex.slice(coordStart + 16, coordStart + 32));
    if (Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90) {
      return { lng, lat };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * A `?limit=` row cap from a query string, clamped.
 *
 * ── The hole this closes ───────────────────────────────────────────────────
 * The expression this replaces was written once and copied into every route
 * that pages:
 *
 *     Math.min(MAX, Math.max(1, parseInt(raw ?? '', 10) || DEFAULT))
 *
 * It reads as "a junk limit falls back to the default", and for a missing or
 * unparseable value it does — `parseInt('')` is NaN, which is falsy, so the
 * `|| DEFAULT` runs. But a NEGATIVE limit parses to a negative NUMBER, which is
 * truthy, so the fallback never runs and `Math.max(1, -5)` clamps it to **1**.
 *
 * `?limit=-5` therefore returned exactly one row. Both routes using this order
 * their results by size — gauges by discharge, public land by acreage — so the
 * one row is the largest thing in the viewport, and the map draws a single
 * enormous feature and calls it the answer. It also sets `capped: true`, so the
 * response cheerfully reports 1 of 1,240.
 *
 * Found in /api/public-lands by a test, and it was there because the expression
 * came from /api/gauges/map. Fixed in one place so the next route to page
 * cannot inherit it a third time: a limit that is absent, unparseable, zero or
 * negative all mean the same thing, which is "no limit given".
 *
 * @param raw       the raw query-string value, or null when absent
 * @param fallback  used when nothing usable was given
 * @param max       hard ceiling, so no caller can pull a whole table
 */
export function parseRowLimit(raw: string | null | undefined, fallback: number, max: number): number {
  const parsed = parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(max, parsed);
}
