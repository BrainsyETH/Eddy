// src/app/api/eddy-update/[riverSlug]/route.ts
// Returns the latest AI-generated Eddy update for a river.
// Optionally filtered by section via ?section=upper-current

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { withX402Route } from '@/lib/x402-config';
import { toNum } from '@/lib/utils/num';
import { overlayLiveConditions, WEBSITE_PROSE_STALE_HOURS } from '@/lib/social/live-conditions';

export const dynamic = 'force-dynamic';

export interface EddyUpdateResponse {
  available: boolean;
  update: {
    quoteText: string;
    summaryText: string | null;
    conditionCode: string;
    gaugeHeightFt: number | null;
    dischargeCfs: number | null;
    sectionSlug: string | null;
    sourcesUsed: string[];
    generatedAt: string;
  } | null;
}

async function _GET(
  request: NextRequest,
  { params }: { params: Promise<{ riverSlug: string }> }
) {
  try {
    const { riverSlug } = await params;
    const supabase = createAdminClient();

    const sectionSlug = request.nextUrl.searchParams.get('section') || null;

    // Fetch the most recent non-expired update for this river/section
    let query = supabase
      .from('eddy_updates')
      .select('quote_text, summary_text, condition_code, gauge_height_ft, discharge_cfs, section_slug, sources_used, generated_at, expires_at')
      .eq('river_slug', riverSlug)
      .gt('expires_at', new Date().toISOString())
      .order('generated_at', { ascending: false })
      .limit(1);

    if (sectionSlug) {
      query = query.eq('section_slug', sectionSlug);
    } else {
      query = query.is('section_slug', null);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error(`[EddyUpdate] Query error for ${riverSlug}:`, error);
      return NextResponse.json<EddyUpdateResponse>(
        { available: false, update: null },
        { status: 500 }
      );
    }

    if (!data) {
      // No AI update available — frontend will fall back to static quote
      return NextResponse.json<EddyUpdateResponse>({ available: false, update: null }, { headers: cdnCacheHeaders(300, 1800) });
    }

    // Overlay live gauge-derived condition + height so the river page's
    // "Eddy Says" card matches the hero condition badge (which already
    // computes live from gauge_readings + thresholds). When the live
    // condition has crossed into a different bucket, the AI prose is
    // dropped — the frontend falls back to a static quote rather than
    // showing "sweet spot" copy next to a "High Water" badge.
    const overlayInput = {
      river_slug: riverSlug,
      condition_code: data.condition_code,
      gauge_height_ft: data.gauge_height_ft,
      quote_text: data.quote_text,
      summary_text: data.summary_text,
    };
    const [overlaid] = await overlayLiveConditions(supabase, [overlayInput], {
      // Website surface: keep the rich quote through routine reading gaps;
      // only blank on a real condition change or a day-plus dead gauge.
      proseStaleHours: WEBSITE_PROSE_STALE_HOURS,
      logLabel: 'eddy-update',
    });
    const proseAvailable = Boolean(overlaid.quote_text || overlaid.summary_text);

    if (!proseAvailable) {
      // Live condition has diverged from the AI snapshot — surface no prose
      // so the client falls back to the static quote.
      return NextResponse.json<EddyUpdateResponse>({ available: false, update: null }, { headers: cdnCacheHeaders(300, 1800) });
    }

    return NextResponse.json<EddyUpdateResponse>({
      available: true,
      update: {
        quoteText: overlaid.quote_text ?? '',
        summaryText: overlaid.summary_text ?? null,
        conditionCode: overlaid.condition_code,
        gaugeHeightFt: toNum(overlaid.gauge_height_ft),
        dischargeCfs: toNum(data.discharge_cfs),
        sectionSlug: data.section_slug,
        sourcesUsed: data.sources_used || [],
        generatedAt: data.generated_at,
      },
    }, { headers: cdnCacheHeaders(300, 1800) });
  } catch (error) {
    console.error('[EddyUpdate] Unexpected error:', error);
    return NextResponse.json<EddyUpdateResponse>(
      { available: false, update: null },
      { status: 500 }
    );
  }
}

export const GET = withX402Route<{ params: Promise<{ riverSlug: string }> }>(_GET, '/api/eddy-update/:riverSlug');
