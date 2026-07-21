// src/app/api/rivers/[slug]/visuals/route.ts
// GET /api/rivers/[slug]/visuals - Fetch approved river visuals matching current conditions

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { mapConditionCode } from '@/lib/conditions';
import { getPhotoConditionCode, buildGaugeThresholds, buildGaugeNameMap } from '@/lib/river-visuals';
import { riverAccessPath } from '@/lib/navigation/river-path';
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
      .select('id, state')
      .eq('slug', slug)
      .single();

    if (riverError || !river) {
      return NextResponse.json({ error: 'River not found' }, { status: 404 });
    }

    // When scoped to an access point, resolve its put-in point so "current
    // condition" comes from the gauge that represents that reach (segment-aware),
    // not the river's single primary gauge.
    let putInPoint: string | null = null;
    if (accessPointId) {
      const { data: ap } = await supabase
        .from('access_points')
        .select('location_snap, location_orig')
        .eq('id', accessPointId)
        .eq('river_id', river.id)
        .maybeSingle();
      const coords = ap?.location_snap?.coordinates || ap?.location_orig?.coordinates;
      if (coords) putInPoint = `SRID=4326;POINT(${coords[0]} ${coords[1]})`;
    }

    // 2. Fetch every gauge's thresholds + current condition + visuals in parallel
    const [gaugeRowsResult, conditionResult, visualsResult] = await Promise.all([
      // Thresholds + names for ALL of the river's gauges — each photo is banded
      // by (and labeled with) the gauge that represents its reach.
      supabase
        .from('river_gauges')
        .select(`
          gauge_station_id, is_primary,
          level_too_low, level_low, level_optimal_min, level_optimal_max,
          level_high, level_dangerous, threshold_unit,
          gauge_stations(name)
        `)
        .eq('river_id', river.id),

      // Current condition — segment-aware when a put-in access point is given.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.rpc as any)(
        putInPoint ? 'get_river_condition_segment' : 'get_river_condition',
        putInPoint ? { p_river_id: river.id, p_put_in_point: putInPoint } : { p_river_id: river.id }
      ),

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
          access_points(name, slug)
        `)
        .eq('river_id', river.id)
        .eq('type', 'river_visual')
        .eq('status', 'verified')
        // Skip rows whose image was never published (image_url null) — the
        // gallery renders each via next/image, which throws on a null src.
        .not('image_url', 'is', null)
        .order('created_at', { ascending: false }),
    ]);

    // Extract current condition
    const conditionData = conditionResult.data?.[0];
    const currentGaugeHeightFt: number | null = conditionData?.gauge_height_ft ?? null;
    const currentDischargeCfs: number | null = conditionData?.discharge_cfs ?? null;
    const currentConditionCode: ConditionCode = conditionData?.condition_code
      ? mapConditionCode(conditionData.condition_code)
      : 'unknown';

    // Band each photo by the gauge that recorded it (its reach gauge), falling
    // back to the primary gauge for legacy rows — shared with the map pins so a
    // photo lands in the same condition band on either surface.
    const gaugeRows = gaugeRowsResult.data || [];
    const { thresholdsByGauge, primaryThresholds } = buildGaugeThresholds(gaugeRows);
    const gaugeNamesById = buildGaugeNameMap(gaugeRows);

    // Map visuals and compute their condition codes dynamically. Guard against
    // unpublished rows (null image_url) defensively — next/image throws on a
    // null src, which would blank the whole planner page.
    const allVisuals: RiverVisual[] = (visualsResult.data || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((row: any) => row.image_url)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((row: any) => {
      const accessPointData = Array.isArray(row.access_points)
        ? row.access_points[0]
        : row.access_points;

      // Band by the gauge that recorded THIS photo (reach-aware), falling back
      // to the primary gauge for legacy rows with no gauge_station_id.
      const photoThresholds =
        (row.gauge_station_id ? thresholdsByGauge.get(row.gauge_station_id) : null) ?? primaryThresholds;
      const conditionCode: ConditionCode = photoThresholds
        ? getPhotoConditionCode(
            row.gauge_height_ft ? parseFloat(row.gauge_height_ft) : null,
            row.discharge_cfs ? parseFloat(row.discharge_cfs) : null,
            photoThresholds
          )
        : 'unknown';

      const accessPointHref = accessPointData?.slug
        ? riverAccessPath(river.state, slug, accessPointData.slug)
        : null;

      return {
        id: row.id,
        imageUrl: row.image_url,
        description: row.description,
        gaugeHeightFt: row.gauge_height_ft ? parseFloat(row.gauge_height_ft) : null,
        dischargeCfs: row.discharge_cfs ? parseFloat(row.discharge_cfs) : null,
        accessPointId: row.access_point_id,
        accessPointName: accessPointData?.name || null,
        accessPointHref,
        gaugeStationId: row.gauge_station_id,
        gaugeName: (row.gauge_station_id ? gaugeNamesById.get(row.gauge_station_id) : null) ?? null,
        submitterName: row.submitter_name,
        conditionCode,
        createdAt: row.created_at,
      };
    });

    // Filter to matching condition band and sort by proximity. Use the selected
    // (reach) gauge's unit, falling back to the primary's.
    const selectedUnit = (conditionData?.threshold_unit as string | undefined) ?? primaryThresholds?.thresholdUnit;
    const useCfs = selectedUnit === 'cfs';
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

    // Group every verified visual by its computed level (dry → flood) so the
    // client can let users scrub across bands, not just the current one.
    const LEVEL_ORDER: ConditionCode[] = ['too_low', 'low', 'good', 'flowing', 'high', 'dangerous', 'unknown'];
    const grouped = new Map<ConditionCode, RiverVisual[]>();
    for (const v of allVisuals) {
      const arr = grouped.get(v.conditionCode);
      if (arr) arr.push(v);
      else grouped.set(v.conditionCode, [v]);
    }
    const byLevel = LEVEL_ORDER
      .filter((code) => grouped.has(code))
      .map((code) => ({
        code,
        visuals: grouped
          .get(code)!
          .slice()
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      }));

    const response: RiverVisualsResponse = {
      visuals: matchedVisuals,
      byLevel,
      currentCondition: currentConditionCode,
      currentGaugeHeightFt,
      currentDischargeCfs,
    };

    return NextResponse.json(response, { headers: cdnCacheHeaders(300, 3600) });
  } catch (error) {
    console.error('Error fetching river visuals:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
