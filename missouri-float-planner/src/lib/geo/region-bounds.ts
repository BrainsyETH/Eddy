// src/lib/geo/region-bounds.ts
// Map viewport bounds computed from active river geometry via the
// get_active_rivers_bounds() function (migration 00146), replacing the
// hardcoded MISSOURI_BOUNDS constant for anything region-aware. The constant
// remains the fallback when the RPC is unavailable.

import { createAdminClient } from '@/lib/supabase/admin';
import { MISSOURI_BOUNDS } from '@/constants';
import type { GeoBounds } from '@/lib/utils/geo';

const CACHE_TTL_MS = 60 * 60 * 1000; // Geometry changes rarely
const cache = new Map<string, { bounds: GeoBounds; loadedAt: number }>();

/**
 * Bounds covering all active rivers (optionally one state's), with a small
 * padding so river lines don't touch the viewport edge.
 */
export async function getRegionBounds(stateCode?: string): Promise<GeoBounds> {
  const key = stateCode ?? '(all)';
  const hit = cache.get(key);
  if (hit && Date.now() - hit.loadedAt < CACHE_TTL_MS) {
    return hit.bounds;
  }

  try {
    const supabase = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('get_active_rivers_bounds', {
      p_state: stateCode ?? null,
    });
    const row = data?.[0];
    if (!error && row && row.min_lng != null) {
      const pad = 0.15;
      const bounds: GeoBounds = {
        minLng: Number(row.min_lng) - pad,
        minLat: Number(row.min_lat) - pad,
        maxLng: Number(row.max_lng) + pad,
        maxLat: Number(row.max_lat) + pad,
      };
      cache.set(key, { bounds, loadedAt: Date.now() });
      return bounds;
    }
    if (error) {
      console.warn('[RegionBounds] RPC failed (pre-00146 DB?):', error.message);
    }
  } catch (e) {
    console.warn('[RegionBounds] Failed to compute bounds:', e);
  }
  return MISSOURI_BOUNDS;
}

/**
 * Bounds for validating human-entered coordinates (access points, POIs):
 * the union of the active-river bounds and the legacy Missouri box, so
 * validation is never stricter than it historically was, but grows to cover
 * new regions automatically (e.g. the Buffalo in Arkansas dips to ~35.82°N,
 * below MISSOURI_BOUNDS.minLat — hardcoding the Missouri box made the upper
 * Buffalo un-editable in the admin).
 */
export async function getServiceAreaBounds(): Promise<GeoBounds> {
  const region = await getRegionBounds();
  return {
    minLng: Math.min(region.minLng, MISSOURI_BOUNDS.minLng),
    minLat: Math.min(region.minLat, MISSOURI_BOUNDS.minLat),
    maxLng: Math.max(region.maxLng, MISSOURI_BOUNDS.maxLng),
    maxLat: Math.max(region.maxLat, MISSOURI_BOUNDS.maxLat),
  };
}

/** True when a lat/lng falls inside the given bounds. */
export function inBounds(lat: number, lng: number, b: GeoBounds): boolean {
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}
