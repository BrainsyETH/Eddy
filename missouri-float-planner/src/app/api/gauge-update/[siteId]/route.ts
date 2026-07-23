// src/app/api/gauge-update/[siteId]/route.ts
// Returns the latest non-expired per-gauge Haiku update for a USGS site.

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { toNum } from '@/lib/utils/num';
import { computeConditionFromDbRow } from '@/lib/conditions';
import { isGaugeReportCompatible } from '@/lib/eddy/gauge-update-policy';

export const dynamic = 'force-dynamic';

export interface GaugeUpdateResponse {
  available: boolean;
  update: {
    quoteText: string;
    summaryText: string | null;
    conditionCode: string;
    gaugeHeightFt: number | null;
    dischargeCfs: number | null;
    riverSlug: string | null;
    sourcesUsed: string[];
    modelUsed: string | null;
    generatedAt: string;
  } | null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('gauge_updates')
      .select('quote_text, summary_text, condition_code, gauge_height_ft, discharge_cfs, river_slug, sources_used, model_used, generated_at, expires_at, gauge_station_id')
      .eq('usgs_site_id', siteId)
      .gt('expires_at', new Date().toISOString())
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(`[GaugeUpdate] Query error for ${siteId}:`, error);
      return NextResponse.json<GaugeUpdateResponse>({ available: false, update: null }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json<GaugeUpdateResponse>({ available: false, update: null }, { headers: cdnCacheHeaders(300, 1800) });
    }

    const [{ data: reading }, { data: thresholdRow }] = await Promise.all([
      supabase
        .from('gauge_readings')
        .select('gauge_height_ft, discharge_cfs, reading_timestamp')
        .eq('gauge_station_id', data.gauge_station_id)
        .order('reading_timestamp', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('river_gauges')
        .select('level_too_low, level_low, level_optimal_min, level_optimal_max, level_high, level_dangerous, flood_stage_ft, threshold_unit, rivers!inner(slug)')
        .eq('gauge_station_id', data.gauge_station_id)
        .eq('rivers.slug', data.river_slug ?? '')
        .limit(1)
        .maybeSingle(),
    ]);

    if (!reading || !thresholdRow) {
      return NextResponse.json<GaugeUpdateResponse>({ available: false, update: null }, { headers: cdnCacheHeaders(300, 1800) });
    }

    const liveHeight = toNum(reading.gauge_height_ft);
    const liveDischarge = toNum(reading.discharge_cfs);
    let liveCondition = computeConditionFromDbRow(liveHeight, thresholdRow, liveDischarge).code;
    const floodStage = toNum(thresholdRow.flood_stage_ft);
    if (liveHeight != null && floodStage != null && liveHeight >= floodStage) liveCondition = 'dangerous';

    if (!isGaugeReportCompatible({
      storedCondition: data.condition_code,
      liveCondition,
      readingTimestamp: reading.reading_timestamp,
    })) {
      console.log(`[GaugeUpdate] Withholding ${siteId}: ${data.condition_code} is incompatible with live ${liveCondition}`);
      return NextResponse.json<GaugeUpdateResponse>({ available: false, update: null }, { headers: cdnCacheHeaders(300, 1800) });
    }

    return NextResponse.json<GaugeUpdateResponse>({
      available: true,
      update: {
        quoteText: data.quote_text,
        summaryText: data.summary_text,
        conditionCode: liveCondition,
        gaugeHeightFt: liveHeight ?? toNum(data.gauge_height_ft),
        dischargeCfs: liveDischarge ?? toNum(data.discharge_cfs),
        riverSlug: data.river_slug,
        sourcesUsed: data.sources_used || [],
        modelUsed: data.model_used,
        generatedAt: data.generated_at,
      },
    }, { headers: cdnCacheHeaders(300, 1800) });
  } catch (error) {
    console.error('[GaugeUpdate] Unexpected error:', error);
    return NextResponse.json<GaugeUpdateResponse>({ available: false, update: null }, { status: 500 });
  }
}
