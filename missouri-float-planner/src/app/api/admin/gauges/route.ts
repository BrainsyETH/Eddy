// src/app/api/admin/gauges/route.ts
// GET /api/admin/gauges - List all gauges with their thresholds and descriptions

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { toNum } from '@/lib/utils/num';
import { requireAdminAuth } from '@/lib/admin-auth';
import { loadCurrentReadings } from '@/lib/gauges/latest-readings';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authError = await requireAdminAuth(request);
    if (authError) return authError;

    const supabase = createAdminClient();

    // Only stations linked to a river. gauge_stations also holds the national
    // tier (~14,000 rows); listing it unfiltered returned the first 1,000 by
    // name, which contained none of the gauges this tool exists to manage.
    const { data: links, error: linkError } = await supabase
      .from('river_gauges')
      .select('gauge_station_id');
    if (linkError) {
      console.error('Error fetching gauge links:', linkError);
      return NextResponse.json({ error: 'Could not fetch gauge stations' }, { status: 500 });
    }
    const gaugeIds = [
      ...new Set((links ?? []).map((l) => l.gauge_station_id as string | null).filter((id): id is string => !!id)),
    ];

    const { data: gaugeStations, error: gaugeError } = gaugeIds.length
      ? await supabase
          .from('gauge_stations')
          .select('id, usgs_site_id, name, active, threshold_descriptions, notes, provider, curated')
          .in('id', gaugeIds)
          .order('name', { ascending: true })
      : { data: [], error: null };

    if (gaugeError) {
      console.error('Error fetching gauge stations:', gaugeError);
      return NextResponse.json(
        { error: 'Could not fetch gauge stations' },
        { status: 500 }
      );
    }

    // Newest reading per station, from the same two-tier merge the public
    // pages use (gauge_latest + curated history), so a quiet gauge still shows
    // its last reading and its age instead of "N/A".
    const readings = await loadCurrentReadings(supabase, gaugeIds, {
      stations: (gaugeStations ?? []).map((g) => ({
        id: g.id,
        provider: g.provider ?? null,
        curated: !!g.curated,
      })),
    });
    const latestReadings = new Map<string, { gaugeHeightFt: number | null; dischargeCfs: number | null; readingTimestamp: string | null }>();
    for (const [id, r] of readings) {
      latestReadings.set(id, {
        gaugeHeightFt: toNum(r.gauge_height_ft),
        dischargeCfs: toNum(r.discharge_cfs),
        readingTimestamp: r.reading_at ?? null,
      });
    }

    // Get all river_gauges (thresholds) with river info
    // Try with alt columns first; fall back without them if migration hasn't run
    const baseRgCols = `
        id,
        river_id,
        gauge_station_id,
        is_primary,
        threshold_unit,
        level_too_low,
        level_low,
        level_optimal_min,
        level_optimal_max,
        level_high,
        level_dangerous,`;
    const altRgCols = `
        alt_level_too_low,
        alt_level_low,
        alt_level_optimal_min,
        alt_level_optimal_max,
        alt_level_high,
        alt_level_dangerous,`;
    const tailRgCols = `
        distance_from_section_miles,
        accuracy_warning_threshold_miles`;

    let riverGauges: Record<string, unknown>[] | null = null;
    {
      const { data, error } = await supabase
        .from('river_gauges')
        .select(baseRgCols + altRgCols + tailRgCols);

      if (error) {
        console.warn('Admin river_gauges query failed (alt columns may not exist), retrying:', error.message);
        const { data: fallback, error: fallbackError } = await supabase
          .from('river_gauges')
          .select(baseRgCols + tailRgCols);

        if (fallbackError) {
          console.error('Error fetching river gauges:', fallbackError);
          return NextResponse.json(
            { error: 'Could not fetch river gauges' },
            { status: 500 }
          );
        }
        riverGauges = fallback as unknown as Record<string, unknown>[] | null;
      } else {
        riverGauges = data as unknown as Record<string, unknown>[] | null;
      }
    }

    // Get rivers for names
    const { data: rivers, error: riversError } = await supabase
      .from('rivers')
      .select('id, name, slug, float_summary, float_tip, description, difficulty_rating, region')
      .order('name', { ascending: true });

    // Without river names every association would read "Unknown River", and a
    // threshold edit would be made blind. Fail instead.
    if (riversError) {
      console.error('Error fetching rivers:', riversError);
      return NextResponse.json({ error: 'Could not fetch rivers' }, { status: 500 });
    }

    // Create a map of rivers by ID
    const riverMap = new Map(rivers?.map(r => [r.id, r]) || []);

    // Group river_gauges by gauge_station_id
    const gaugeThresholds = new Map<string, Array<{
      id: string;
      riverId: string;
      riverName: string;
      riverSlug: string;
      isPrimary: boolean;
      thresholdUnit: string;
      levelTooLow: number | null;
      levelLow: number | null;
      levelOptimalMin: number | null;
      levelOptimalMax: number | null;
      levelHigh: number | null;
      levelDangerous: number | null;
      altLevelTooLow: number | null;
      altLevelLow: number | null;
      altLevelOptimalMin: number | null;
      altLevelOptimalMax: number | null;
      altLevelHigh: number | null;
      altLevelDangerous: number | null;
      distanceFromSectionMiles: number | null;
      accuracyWarningThresholdMiles: number;
    }>>();

    for (const rg of riverGauges || []) {
      if (!rg.gauge_station_id) continue;

      const river = riverMap.get(rg.river_id as string);
      const entry = {
        id: rg.id as string,
        riverId: rg.river_id as string,
        riverName: river?.name || 'Unknown River',
        riverSlug: river?.slug || '',
        isPrimary: rg.is_primary as boolean,
        thresholdUnit: rg.threshold_unit as string,
        levelTooLow: (rg.level_too_low as number) ?? null,
        levelLow: (rg.level_low as number) ?? null,
        levelOptimalMin: (rg.level_optimal_min as number) ?? null,
        levelOptimalMax: (rg.level_optimal_max as number) ?? null,
        levelHigh: (rg.level_high as number) ?? null,
        levelDangerous: (rg.level_dangerous as number) ?? null,
        altLevelTooLow: (rg.alt_level_too_low as number) ?? null,
        altLevelLow: (rg.alt_level_low as number) ?? null,
        altLevelOptimalMin: (rg.alt_level_optimal_min as number) ?? null,
        altLevelOptimalMax: (rg.alt_level_optimal_max as number) ?? null,
        altLevelHigh: (rg.alt_level_high as number) ?? null,
        altLevelDangerous: (rg.alt_level_dangerous as number) ?? null,
        distanceFromSectionMiles: (rg.distance_from_section_miles as number) ?? null,
        accuracyWarningThresholdMiles: (rg.accuracy_warning_threshold_miles as number) ?? 0,
      };

      const gsId = rg.gauge_station_id as string;
      if (!gaugeThresholds.has(gsId)) {
        gaugeThresholds.set(gsId, []);
      }
      gaugeThresholds.get(gsId)!.push(entry);
    }

    // Format response
    const gauges = (gaugeStations || []).map(gauge => {
      const reading = latestReadings.get(gauge.id);
      return {
        id: gauge.id,
        usgsSiteId: gauge.usgs_site_id,
        name: gauge.name,
        active: gauge.active,
        thresholdDescriptions: gauge.threshold_descriptions,
        notes: gauge.notes,
        riverAssociations: gaugeThresholds.get(gauge.id) || [],
        latestReading: reading
          ? {
              gaugeHeightFt: reading.gaugeHeightFt,
              dischargeCfs: reading.dischargeCfs,
              readingTimestamp: reading.readingTimestamp,
            }
          : null,
      };
    });

    // Also return rivers for summary editing
    const formattedRivers = (rivers || []).map(river => ({
      id: river.id,
      name: river.name,
      slug: river.slug,
      floatSummary: river.float_summary,
      floatTip: river.float_tip,
      description: river.description,
      difficultyRating: river.difficulty_rating,
      region: river.region,
    }));

    return NextResponse.json({ gauges, rivers: formattedRivers });
  } catch (error) {
    console.error('Error in admin gauges endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
