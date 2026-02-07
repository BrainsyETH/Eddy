// src/app/api/admin/gauges/route.ts
// GET /api/admin/gauges - List all gauges with their thresholds and descriptions

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const supabase = createAdminClient();

    // Get all gauge stations with their river associations
    const { data: gaugeStations, error: gaugeError } = await supabase
      .from('gauge_stations')
      .select('id, usgs_site_id, name, active, threshold_descriptions, notes')
      .order('name', { ascending: true });

    if (gaugeError) {
      console.error('Error fetching gauge stations:', gaugeError);
      return NextResponse.json(
        { error: 'Could not fetch gauge stations' },
        { status: 500 }
      );
    }

    // Get all river_gauges (thresholds) with river info
    const { data: riverGauges, error: rgError } = await supabase
      .from('river_gauges')
      .select(`
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
        level_dangerous,
        distance_from_section_miles,
        accuracy_warning_threshold_miles
      `);

    if (rgError) {
      console.error('Error fetching river gauges:', rgError);
      return NextResponse.json(
        { error: 'Could not fetch river gauges' },
        { status: 500 }
      );
    }

    // Get rivers for names
    const { data: rivers, error: riversError } = await supabase
      .from('rivers')
      .select('id, name, slug, float_summary, float_tip, description, difficulty_rating, region');

    if (riversError) {
      console.error('Error fetching rivers:', riversError);
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
      distanceFromSectionMiles: number | null;
      accuracyWarningThresholdMiles: number;
    }>>();

    for (const rg of riverGauges || []) {
      if (!rg.gauge_station_id) continue;

      const river = riverMap.get(rg.river_id);
      const entry = {
        id: rg.id,
        riverId: rg.river_id,
        riverName: river?.name || 'Unknown River',
        riverSlug: river?.slug || '',
        isPrimary: rg.is_primary,
        thresholdUnit: rg.threshold_unit,
        levelTooLow: rg.level_too_low,
        levelLow: rg.level_low,
        levelOptimalMin: rg.level_optimal_min,
        levelOptimalMax: rg.level_optimal_max,
        levelHigh: rg.level_high,
        levelDangerous: rg.level_dangerous,
        distanceFromSectionMiles: rg.distance_from_section_miles,
        accuracyWarningThresholdMiles: rg.accuracy_warning_threshold_miles,
      };

      if (!gaugeThresholds.has(rg.gauge_station_id)) {
        gaugeThresholds.set(rg.gauge_station_id, []);
      }
      gaugeThresholds.get(rg.gauge_station_id)!.push(entry);
    }

    // Format response
    const gauges = (gaugeStations || []).map(gauge => ({
      id: gauge.id,
      usgsSiteId: gauge.usgs_site_id,
      name: gauge.name,
      active: gauge.active,
      thresholdDescriptions: gauge.threshold_descriptions,
      notes: gauge.notes,
      riverAssociations: gaugeThresholds.get(gauge.id) || [],
    }));

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
