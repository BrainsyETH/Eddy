// src/lib/conditions/live-fallback.ts
// The pairing /api/conditions/[riverId] grades a live USGS reading against when
// the database has no verdict for the river.
//
// That fallback used to rebuild the ladder by hand from six columns, with no
// flood stage, and grade it with computeCondition. James near Boaz at 14.58 ft
// and 16,600 cfs came back "Good - Floatable" from it while gradeReading, on
// the same pairing with its 10 ft NWS flood stage, says dangerous. The row is
// loaded here, once, with the columns gradeReading needs, so the route grades
// it the way every other surface does.

import type { createAdminClient } from '@/lib/supabase/admin';
import type { GaugeLinkRow } from '@/lib/conditions';

/** Ladder, unit, and both sources of the flood stage (see linkFloodStageFt). */
export const LIVE_FALLBACK_LINK_SELECT = `
  level_too_low, level_low, level_optimal_min, level_optimal_max,
  level_high, level_dangerous, threshold_unit, flood_stage_ft,
  gauge_stations!inner (id, name, usgs_site_id, nwps_flood_stage_ft)
`;

export interface LiveFallbackLink {
  /** Pass straight to gradeReading(). */
  link: GaugeLinkRow;
  usgsSiteId: string | null;
  gaugeName: string | null;
}

/**
 * The pairing for `usgsSiteId` on this river, or the river's primary pairing
 * when no site is given. Null when there is none.
 */
export async function loadLiveFallbackLink(
  supabase: ReturnType<typeof createAdminClient>,
  riverId: string,
  usgsSiteId: string | null,
): Promise<LiveFallbackLink | null> {
  const query = supabase.from('river_gauges').select(LIVE_FALLBACK_LINK_SELECT).eq('river_id', riverId);
  const { data } = await (usgsSiteId
    ? query.eq('gauge_stations.usgs_site_id', usgsSiteId)
    : query.eq('is_primary', true)
  )
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  const row = data as unknown as GaugeLinkRow & {
    gauge_stations:
      | { name: string | null; usgs_site_id: string | null }
      | Array<{ name: string | null; usgs_site_id: string | null }>
      | null;
  };
  const station = Array.isArray(row.gauge_stations) ? row.gauge_stations[0] : row.gauge_stations;
  return {
    link: row,
    usgsSiteId: station?.usgs_site_id ?? null,
    gaugeName: station?.name ?? null,
  };
}
