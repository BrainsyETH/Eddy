// The /llms-full.txt response: the live river catalog, or a 503 when it cannot
// be read. Kept out of the route file so the test suite can drive it with a
// client whose queries fail.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getConditionShortLabel, gradeReading } from '@/lib/conditions';
import { loadCurrentReadings } from '@/lib/gauges/latest-readings';
import { riverPath } from '@/lib/navigation/river-path';
import type { Database } from '@/types/database';
import { buildLlmsFullTxt, type LlmsRiver } from './content';

type Client = SupabaseClient<Database>;

export async function loadLlmsRivers(supabase: Client): Promise<LlmsRiver[]> {
  // Fetch rivers, access point counts, and gauge data in parallel
  const [rivers, accessPoints, hazards, riverGauges] = await Promise.all([
    supabase
      .from('rivers')
      .select('id, name, slug, state, length_miles, description, difficulty_rating, region')
      .eq('active', true)
      .order('name'),
    supabase
      .from('access_points')
      .select('id, river_id')
      .eq('approved', true),
    supabase
      .from('river_hazards')
      .select('id, river_id')
      .eq('active', true),
    supabase
      .from('river_gauges')
      .select(`
        river_id, is_primary, threshold_unit,
        level_too_low, level_low, level_optimal_min, level_optimal_max,
        level_high, level_dangerous, flood_stage_ft,
        gauge_stations ( id, usgs_site_id, name )
      `)
      .eq('is_primary', true),
  ]);

  // A failed query must not read as "no rivers" or "no access points": the
  // caller turns this into a 503 instead of publishing an empty catalog.
  for (const [name, result] of Object.entries({ rivers, accessPoints, hazards, riverGauges })) {
    if (result.error || !result.data) {
      throw new Error(`llms-full.txt: ${name} query failed`, { cause: result.error });
    }
  }

  // Build condition lookups
  const conditionsByRiver: Record<string, string> = {};
  const gaugeIdOf = (rg: { gauge_stations: unknown }) => {
    const gs = Array.isArray(rg.gauge_stations) ? rg.gauge_stations[0] : rg.gauge_stations;
    return (gs as { id: string } | null)?.id;
  };
  const gaugeIds = (riverGauges.data ?? []).map(gaugeIdOf).filter(Boolean) as string[];

  if (gaugeIds.length > 0) {
    // The newest reading per gauge through the shared read path. This used to
    // be one unbounded `.in(...).order(desc)` over every primary gauge's whole
    // history — truncated at PostgREST's row cap, so sparse gauges fell off
    // the end and their river showed no condition.
    const latest = await loadCurrentReadings(supabase, gaugeIds);

    for (const rg of riverGauges.data ?? []) {
      const gaugeId = gaugeIdOf(rg);
      const reading = gaugeId ? latest.get(gaugeId) : undefined;
      if (!reading) continue;

      // Same grading as every other surface, flood stage included.
      const condition = gradeReading(rg, reading.gauge_height_ft, reading.discharge_cfs);
      if (rg.river_id) conditionsByRiver[rg.river_id] = getConditionShortLabel(condition.code);
    }
  }

  // Count access points and hazards per river
  const apCountByRiver: Record<string, number> = {};
  for (const ap of accessPoints.data ?? []) {
    if (!ap.river_id) continue;
    apCountByRiver[ap.river_id] = (apCountByRiver[ap.river_id] || 0) + 1;
  }
  const hazardCountByRiver: Record<string, number> = {};
  for (const h of hazards.data ?? []) {
    if (!h.river_id) continue;
    hazardCountByRiver[h.river_id] = (hazardCountByRiver[h.river_id] || 0) + 1;
  }

  return (rivers.data ?? []).map((river) => {
    const lengthMiles = river.length_miles == null ? NaN : parseFloat(String(river.length_miles));
    return {
      name: river.name,
      slug: river.slug,
      path: riverPath(river.state, river.slug),
      lengthMiles: Number.isFinite(lengthMiles) && lengthMiles > 0 ? lengthMiles : null,
      difficulty: river.difficulty_rating,
      region: river.region,
      accessPointCount: apCountByRiver[river.id] || 0,
      hazardCount: hazardCountByRiver[river.id] || 0,
      conditionLabel: conditionsByRiver[river.id] ?? null,
      description: river.description,
    };
  });
}

export async function llmsFullResponse(
  getClient: () => Promise<Client>,
  options: { baseUrl: string; x402Enabled: boolean },
): Promise<Response> {
  let rivers: LlmsRiver[];
  try {
    rivers = await loadLlmsRivers(await getClient());
  } catch (error) {
    console.error('llms-full.txt unavailable:', error);
    return new Response('River data is temporarily unavailable. Try again shortly.', {
      status: 503,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'Retry-After': '300',
      },
    });
  }

  return new Response(buildLlmsFullTxt({ ...options, rivers }).trim(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
