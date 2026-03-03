// src/app/api/eddy-update/[riverSlug]/route.ts
// Returns the latest AI-generated Eddy update for a river.
// Optionally filtered by section via ?section=upper-current

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ riverSlug: string }> }
) {
  try {
    const { riverSlug } = await params;
    const supabase = await createClient();

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
      return NextResponse.json<EddyUpdateResponse>({ available: false, update: null });
    }

    return NextResponse.json<EddyUpdateResponse>({
      available: true,
      update: {
        quoteText: data.quote_text,
        summaryText: data.summary_text || null,
        conditionCode: data.condition_code,
        gaugeHeightFt: data.gauge_height_ft,
        dischargeCfs: data.discharge_cfs,
        sectionSlug: data.section_slug,
        sourcesUsed: data.sources_used || [],
        generatedAt: data.generated_at,
      },
    });
  } catch (error) {
    console.error('[EddyUpdate] Unexpected error:', error);
    return NextResponse.json<EddyUpdateResponse>(
      { available: false, update: null },
      { status: 500 }
    );
  }
}
