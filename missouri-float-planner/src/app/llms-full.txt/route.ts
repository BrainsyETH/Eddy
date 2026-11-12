// GET /llms-full.txt
// Extended version of llms.txt with dynamically populated river data,
// access point counts, current conditions, and gauge info. The text is built
// in src/lib/llms/content.ts.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getConditionShortLabel, gradeReading } from '@/lib/conditions';
import { loadCurrentReadings } from '@/lib/gauges/latest-readings';
import { buildLlmsFullTxt, type LlmsRiver } from '@/lib/llms/content';
import { riverPath } from '@/lib/navigation/river-path';
import { X402_ENABLED } from '@/lib/x402/config';

// Rendered per request; the Cache-Control header below lets the CDN hold a
// successful response for an hour.
export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eddy.guide';

async function loadRivers(): Promise<LlmsRiver[]> {
  const supabase = await createClient();

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

export async function GET() {
  let rivers: LlmsRiver[];
  try {
    rivers = await loadRivers();
  } catch (error) {
    console.error('llms-full.txt unavailable:', error);
    return new NextResponse('River data is temporarily unavailable. Try again shortly.', {
      status: 503,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'Retry-After': '300',
      },
    });
  }

  const content = buildLlmsFullTxt({ baseUrl: BASE_URL, x402Enabled: X402_ENABLED, rivers });

  return new NextResponse(content.trim(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
