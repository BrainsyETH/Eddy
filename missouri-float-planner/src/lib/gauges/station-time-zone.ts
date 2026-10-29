import { find } from 'geo-tz';
import type { createAdminClient } from '@/lib/supabase/admin';

/** Geographic boundaries are server-only. Ambiguous/missing locations use UTC. */
export function stationTimeZone(lat: unknown, lng: unknown): string {
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180 ||
    (lat === 0 && lng === 0)
  )
    return 'UTC';
  const zones = find(lat, lng);
  return zones.length === 1 ? zones[0] : 'UTC';
}

/**
 * Use the exact same database-projected coordinates as gaugeDetailResponse.
 * The RPC owns ST_X/ST_Y; application code never decodes PostGIS binary data.
 * A lookup outage is not a missing location and must not become a cached UTC answer.
 *
 * Neither is a station the lookup did not return. search_gauges matches by
 * prefix, lists only active stations and stops at 50 rows, so an inactive
 * station or one crowded out of the first page comes back absent. That is
 * "unknown" (null), which the history route serves uncached and without a
 * `timeZone`, not "this station keeps UTC". Only a station that was found and
 * has no single zone at its coordinates is a real UTC answer.
 */
export async function stationTimeZoneForSite(
  client: ReturnType<typeof createAdminClient>,
  siteId: string,
): Promise<string | null> {
  const { data, error } = await client.rpc('search_gauges', {
    p_query: siteId,
    p_limit: 50,
  });
  if (error) throw new Error('Station calendar lookup unavailable');
  const row = (data ?? []).find(
    (candidate: { site_id: string | null }) => candidate.site_id === siteId,
  );
  if (!row) return null;
  return stationTimeZone(row.lat, row.lng);
}
