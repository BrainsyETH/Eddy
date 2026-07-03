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
 * Extracts lng/lat coordinates from a PostGIS GeoJSON Point geometry.
 */
export function getCoordinates(geom: unknown): { lng: number; lat: number } | null {
  if (!geom || typeof geom !== 'object') return null;
  const geo = geom as { type?: string; coordinates?: [number, number] };
  if (geo.type === 'Point' && Array.isArray(geo.coordinates) && geo.coordinates.length >= 2) {
    return { lng: geo.coordinates[0], lat: geo.coordinates[1] };
  }
  return null;
}
