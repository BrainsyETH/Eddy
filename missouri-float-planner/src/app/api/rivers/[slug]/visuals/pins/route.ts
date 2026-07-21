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
          captured_at,
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

    // Each gauge's CURRENT band from its latest reading, so a pin is compared
    // against conditions at ITS OWN gauge — a Montauk photo judged by the
    // river-wide (Van Buren) code is apples vs oranges. Best-effort: on any
    // failure the map falls back to treating every pin as current.
    const primaryGaugeId =
      gaugeRows.find((g) => g.is_primary)?.gauge_station_id ?? gaugeRows[0]?.gauge_station_id ?? null;
    const currentBandByGauge = new Map<string, ConditionCode>();
    try {
      const stationIds = gaugeRows
        .map((g) => g.gauge_station_id)
        .filter((id): id is string => !!id);
      if (stationIds.length > 0) {
        const { data: readings } = await supabase.rpc('latest_readings_for_stations', {
          p_station_ids: stationIds,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const r of (readings || []) as any[]) {
          if (currentBandByGauge.has(r.gauge_station_id)) continue;
          const t = thresholdsByGauge.get(r.gauge_station_id);
          if (!t) continue;
          currentBandByGauge.set(
            r.gauge_station_id,
            getPhotoConditionCode(
              r.gauge_height_ft != null ? Number(r.gauge_height_ft) : null,
              r.discharge_cfs != null ? Number(r.discharge_cfs) : null,
              t
            )
          );
        }
      }
    } catch (err) {
      console.warn('Could not resolve current gauge bands for photo pins:', err);
    }

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

      // Current-level match, judged at the pin's own gauge. Unknown on either
      // side counts as a match — only positive evidence de-emphasizes a pin.
      const pinGaugeId: string | null = row.gauge_station_id ?? primaryGaugeId;
      const gaugeNow = pinGaugeId ? currentBandByGauge.get(pinGaugeId) : undefined;
      const matchesCurrent =
        !gaugeNow || gaugeNow === 'unknown' || conditionCode === 'unknown'
          ? true
          : conditionCode === gaugeNow;

      pins.push({
        id: row.id,
        imageUrl: row.image_url,
        lat: coords.lat,
        lng: coords.lng,
        conditionCode,
        matchesCurrent,
        gaugeHeightFt: row.gauge_height_ft ? parseFloat(row.gauge_height_ft) : null,
        dischargeCfs: row.discharge_cfs ? parseFloat(row.discharge_cfs) : null,
        gaugeName: (row.gauge_station_id ? gaugeNamesById.get(row.gauge_station_id) : null) ?? null,
        accessPointName: accessPointData?.name || null,
        accessPointHref: accessPointData?.slug ? riverAccessPath(river.state, slug, accessPointData.slug) : null,
        capturedAt: row.captured_at ?? null,
        createdAt: row.created_at,
      });
    }

    // Short CDN window: a moderator verifying a photo should see it appear
    // within about a minute, not after a 5-minute cache ride.
    return NextResponse.json({ pins }, { headers: cdnCacheHeaders(60, 600) });
  } catch (error) {
    console.error('Error fetching river visual pins:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
