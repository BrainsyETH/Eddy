// src/app/api/rivers/[slug]/visuals/pins/route.ts
// GET /api/rivers/[slug]/visuals/pins — verified river-visual photos as map pins
// (ALL levels, with coordinates). Separate from the gallery endpoint, which
// filters to the current condition and omits coordinates.

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders, getCoordinates } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPhotoConditionCode, buildGaugeThresholds, buildGaugeNameMap } from '@/lib/river-visuals';
import { riverAccessPath } from '@/lib/navigation/river-path';
import type { ConditionCode, RiverVisualPin } from '@/types/api';

export const dynamic = 'force-dynamic';

// Photos submitted without an access point default to the Missouri centroid;
// don't pin those — they'd pile up in the middle of the state.
const DEFAULT_LAT = 37.5;
const DEFAULT_LNG = -91.5;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = createAdminClient();

    const { data: river, error: riverError } = await supabase
      .from('rivers')
      .select('id, state')
      .eq('slug', slug)
      .single();

    if (riverError || !river) {
      return NextResponse.json({ error: 'River not found' }, { status: 404 });
    }

    const [gaugesResult, visualsResult] = await Promise.all([
      // Every gauge's thresholds + name — each photo is banded by (and labeled
      // with) the gauge that recorded it (its reach gauge), matching the gallery.
      supabase
        .from('river_gauges')
        .select('gauge_station_id, is_primary, level_too_low, level_low, level_optimal_min, level_optimal_max, level_high, level_dangerous, threshold_unit, gauge_stations(name)')
        .eq('river_id', river.id),
      supabase
        .from('community_reports')
        .select(`
          id,
          image_url,
          coordinates,
          gauge_height_ft,
          discharge_cfs,
          access_point_id,
          gauge_station_id,
          created_at,
          access_points(name, slug)
        `)
        .eq('river_id', river.id)
        .eq('type', 'river_visual')
        .eq('status', 'verified')
        // A pin IS its photo thumbnail — a row whose image was never published
        // (image_url null, e.g. verified before the quarantine copy ran) has
        // nothing to show and would crash the map marker builder, so exclude it.
        .not('image_url', 'is', null)
        .order('created_at', { ascending: false }),
    ]);

    const gaugeRows = gaugesResult.data || [];
    const { thresholdsByGauge, primaryThresholds } = buildGaugeThresholds(gaugeRows);
    const gaugeNamesById = buildGaugeNameMap(gaugeRows);

    const pins: RiverVisualPin[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (visualsResult.data || []) as any[]) {
      // No published image → no thumbnail to render (defensive; the query
      // already filters these out).
      if (!row.image_url) continue;
      const coords = getCoordinates(row.coordinates);
      if (!coords) continue;
      // Skip the default state-centroid placeholder (no real location).
      if (Math.abs(coords.lat - DEFAULT_LAT) < 1e-6 && Math.abs(coords.lng - DEFAULT_LNG) < 1e-6) continue;

      const accessPointData = Array.isArray(row.access_points) ? row.access_points[0] : row.access_points;
      // Band by the gauge that recorded THIS photo (reach-aware), primary fallback.
      const photoThresholds =
        (row.gauge_station_id ? thresholdsByGauge.get(row.gauge_station_id) : null) ?? primaryThresholds;
      const conditionCode: ConditionCode = photoThresholds
        ? getPhotoConditionCode(
            row.gauge_height_ft ? parseFloat(row.gauge_height_ft) : null,
            row.discharge_cfs ? parseFloat(row.discharge_cfs) : null,
            photoThresholds
          )
        : 'unknown';

      pins.push({
        id: row.id,
        imageUrl: row.image_url,
        lat: coords.lat,
        lng: coords.lng,
        conditionCode,
        gaugeHeightFt: row.gauge_height_ft ? parseFloat(row.gauge_height_ft) : null,
        dischargeCfs: row.discharge_cfs ? parseFloat(row.discharge_cfs) : null,
        gaugeName: (row.gauge_station_id ? gaugeNamesById.get(row.gauge_station_id) : null) ?? null,
        accessPointName: accessPointData?.name || null,
        accessPointHref: accessPointData?.slug ? riverAccessPath(river.state, slug, accessPointData.slug) : null,
        createdAt: row.created_at,
      });
    }

    return NextResponse.json({ pins }, { headers: cdnCacheHeaders(300, 3600) });
  } catch (error) {
    console.error('Error fetching river visual pins:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
