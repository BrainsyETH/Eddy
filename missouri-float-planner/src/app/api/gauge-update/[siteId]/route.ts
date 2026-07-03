// src/app/api/gauge-update/[siteId]/route.ts
// Returns the latest non-expired per-gauge Haiku update for a USGS site.

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { toNum } from '@/lib/utils/num';

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
      .select('quote_text, summary_text, condition_code, gauge_height_ft, discharge_cfs, river_slug, sources_used, model_used, generated_at, expires_at')
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

    return NextResponse.json<GaugeUpdateResponse>({
      available: true,
      update: {
        quoteText: data.quote_text,
        summaryText: data.summary_text,
        conditionCode: data.condition_code,
        gaugeHeightFt: toNum(data.gauge_height_ft),
        dischargeCfs: toNum(data.discharge_cfs),
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
