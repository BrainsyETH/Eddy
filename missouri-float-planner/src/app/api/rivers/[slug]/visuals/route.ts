// src/app/api/rivers/[slug]/visuals/route.ts
// GET /api/rivers/[slug]/visuals - Fetch approved river visuals matching current conditions

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { type ConditionThresholds } from '@/lib/conditions';
import { mapConditionCode } from '@/lib/conditions';
import { getPhotoConditionCode } from '@/lib/river-visuals';
import type { ConditionCode, RiverVisual, RiverVisualsResponse } from '@/types/api';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = createAdminClient();

    // Optional access point filter
    const accessPointId = request.nextUrl.searchParams.get('accessPointId');

    // 1. Look up river by slug
    const { data: river, error: riverError } = await supabase
      .from('rivers')
      .select('id')
      .eq('slug', slug)
      .single();

    if (riverError || !river) {
      return NextResponse.json({ error: 'River not found' }, { status: 404 });
    }

    // 2. Fetch thresholds + current condition + visuals in parallel
    const [thresholdsResult, conditionResult, visualsResult] = await Promise.all([
      // Primary gauge thresholds
      supabase
        .from('river_gauges')
        .select(`
          level_too_low, level_low, level_optimal_min, level_optimal_max,
          level_high, level_dangerous, threshold_unit,
          gauge_station_id
        `)
        .eq('river_id', river.id)
        .eq('is_primary', true)
        .limit(1)
        .maybeSingle(),

      // Current condition from RPC
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.rpc as any)('get_river_condition', { p_river_id: river.id }),

      // All approved river_visual reports for this river
      supabase
        .from('community_reports')
        .select(`
          id,
          image_url,
          description,
          gauge_height_ft,
          discharge_cfs,
          access_point_id,
          gauge_station_id,
          submitter_name,
          created_at,
          access_points(name)
        `)
        .eq('river_id', river.id)
        .eq('type', 'river_visual')
        .eq('status', 'verified')
        .order('created_at', { ascending: false }),
    ]);

    // Extract current condition
    const conditionData = conditionResult.data?.[0];
    const currentGaugeHeightFt: number | null = conditionData?.gauge_height_ft ?? null;
    const currentDischargeCfs: number | null = conditionData?.discharge_cfs ?? null;
    const currentConditionCode: ConditionCode = conditionData?.condition_code
      ? mapConditionCode(conditionData.condition_code)
      : 'unknown';

    // Build thresholds object
    const thresholds: ConditionThresholds | null = thresholdsResult.data
      ? {
          levelTooLow: thresholdsResult.data.level_too_low,
          levelLow: thresholdsResult.data.level_low,
          levelOptimalMin: thresholdsResult.data.level_optimal_min,
          levelOptimalMax: thresholdsResult.data.level_optimal_max,
          levelHigh: thresholdsResult.data.level_high,
          levelDangerous: thresholdsResult.data.level_dangerous,
          thresholdUnit: thresholdsResult.data.threshold_unit as 'ft' | 'cfs' | undefined,
        }
      : null;

    // Map visuals and compute their condition codes dynamically
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allVisuals: RiverVisual[] = (visualsResult.data || []).map((row: any) => {
      const accessPointData = Array.isArray(row.access_points)
        ? row.access_points[0]
        : row.access_points;

      const conditionCode: ConditionCode = thresholds
        ? getPhotoConditionCode(
            row.gauge_height_ft ? parseFloat(row.gauge_height_ft) : null,
            row.discharge_cfs ? parseFloat(row.discharge_cfs) : null,
            thresholds
          )
        : 'unknown';

      return {
        id: row.id,
        imageUrl: row.image_url,
        description: row.description,
        gaugeHeightFt: row.gauge_height_ft ? parseFloat(row.gauge_height_ft) : null,
        dischargeCfs: row.discharge_cfs ? parseFloat(row.discharge_cfs) : null,
        accessPointId: row.access_point_id,
        accessPointName: accessPointData?.name || null,
        gaugeStationId: row.gauge_station_id,
        submitterName: row.submitter_name,
        conditionCode,
        createdAt: row.created_at,
      };
    });

    // Filter to matching condition band and sort by proximity
    const useCfs = thresholds?.thresholdUnit === 'cfs';
    const currentValue = useCfs
      ? (currentDischargeCfs ?? currentGaugeHeightFt)
      : (currentGaugeHeightFt ?? currentDischargeCfs);

    const matchedVisuals = allVisuals
      .filter((v) => v.conditionCode === currentConditionCode)
      .sort((a, b) => {
        // Prefer matching access point
        if (accessPointId) {
          const aMatch = a.accessPointId === accessPointId ? 0 : 1;
          const bMatch = b.accessPointId === accessPointId ? 0 : 1;
          if (aMatch !== bMatch) return aMatch - bMatch;
        }

        // Sort by proximity to current reading
        if (currentValue !== null) {
          const aVal = useCfs
            ? (a.dischargeCfs ?? a.gaugeHeightFt)
            : (a.gaugeHeightFt ?? a.dischargeCfs);
          const bVal = useCfs
            ? (b.dischargeCfs ?? b.gaugeHeightFt)
            : (b.gaugeHeightFt ?? b.dischargeCfs);
          const aDiff = aVal !== null ? Math.abs(aVal - currentValue) : Infinity;
          const bDiff = bVal !== null ? Math.abs(bVal - currentValue) : Infinity;
          return aDiff - bDiff;
        }

        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    const response: RiverVisualsResponse = {
      visuals: matchedVisuals,
      currentCondition: currentConditionCode,
      currentGaugeHeightFt,
      currentDischargeCfs,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching river visuals:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
