// src/lib/api-utils.ts
// Shared utility functions for admin API routes

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
