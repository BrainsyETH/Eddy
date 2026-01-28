// src/app/api/gauge-thresholds/route.ts
// GET /api/gauge-thresholds - Get all river gauge thresholds for About page

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export interface GaugeThreshold {
  riverId: string;
  riverName: string;
  riverSlug: string;
  gauges: {
    gaugeName: string;
    usgsId: string;
    isPrimary: boolean;
    thresholds: {
      tooLow: number | null;
      low: number | null;
      optimalMin: number | null;
      optimalMax: number | null;
      high: number | null;
      dangerous: number | null;
    };
  }[];
}

export interface GaugeThresholdsResponse {
  rivers: GaugeThreshold[];
}

// Cache for 5 minutes
export const revalidate = 300;

export async function GET() {
  try {
    const supabase = await createClient();

    // Fetch all rivers with their gauge thresholds
    const { data: riverGauges, error } = await supabase
      .from('river_gauges')
      .select(`
        river_id,
        is_primary,
        level_too_low,
        level_low,
        level_optimal_min,
        level_optimal_max,
        level_high,
        level_dangerous,
        rivers (
          id,
          name,
          slug
        ),
        gauge_stations (
          name,
          usgs_site_id
        )
      `)
      .order('rivers(name)', { ascending: true })
      .order('is_primary', { ascending: false });

    if (error) {
      console.error('[Gauge Thresholds API] Error fetching data:', error);
      return NextResponse.json(
        { error: 'Failed to fetch gauge thresholds' },
        { status: 500 }
      );
    }

    // Group by river
    const riverMap = new Map<string, GaugeThreshold>();

    for (const rg of riverGauges || []) {
      const river = Array.isArray(rg.rivers) ? rg.rivers[0] : rg.rivers;
      const gauge = Array.isArray(rg.gauge_stations) ? rg.gauge_stations[0] : rg.gauge_stations;

      if (!river || !gauge) continue;

      const riverId = river.id;

      if (!riverMap.has(riverId)) {
        riverMap.set(riverId, {
          riverId,
          riverName: river.name,
          riverSlug: river.slug,
          gauges: [],
        });
      }

      const riverData = riverMap.get(riverId)!;
      riverData.gauges.push({
        gaugeName: gauge.name,
        usgsId: gauge.usgs_site_id,
        isPrimary: rg.is_primary || false,
        thresholds: {
          tooLow: rg.level_too_low,
          low: rg.level_low,
          optimalMin: rg.level_optimal_min,
          optimalMax: rg.level_optimal_max,
          high: rg.level_high,
          dangerous: rg.level_dangerous,
        },
      });
    }

    const rivers = Array.from(riverMap.values());

    const response: GaugeThresholdsResponse = {
      rivers,
    };

    return NextResponse.json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Gauge Thresholds API] Unexpected error:', errorMessage);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
