// src/app/api/eddy-updates/route.ts
// Batched Eddy updates for the home page: the latest non-expired river-level
// update for every river (plus the statewide "global" row) in one request, so
// the landing page makes a single call instead of one per river. Live gauge
// conditions are overlaid (dropping prose that no longer matches the river's
// live condition), mirroring the per-river /api/eddy-update/[riverSlug] route.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withX402Route } from '@/lib/x402-config';
import { overlayLiveConditions } from '@/lib/social/live-conditions';

export const dynamic = 'force-dynamic';

export interface EddyUpdateEntry {
  quoteText: string;
  summaryText: string | null;
  conditionCode: string;
  gaugeHeightFt: number | null;
  generatedAt: string;
}

export interface EddyUpdatesResponse {
  /** Keyed by river_slug (includes the "global" statewide entry). */
  updates: Record<string, EddyUpdateEntry>;
}

interface EddyUpdateRow {
  river_slug: string | null;
  quote_text: string | null;
  summary_text: string | null;
  condition_code: string | null;
  gauge_height_ft: number | null;
  generated_at: string | null;
}

async function _GET() {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('eddy_updates')
      .select('river_slug, quote_text, summary_text, condition_code, gauge_height_ft, generated_at')
      .gt('expires_at', new Date().toISOString())
      .is('section_slug', null)
      .order('generated_at', { ascending: false });

    if (error) {
      console.error('[EddyUpdates] Query error:', error);
      return NextResponse.json<EddyUpdatesResponse>({ updates: {} }, { status: 500 });
    }

    // Keep the most recent row per river (results are ordered desc).
    const latestBySlug = new Map<string, EddyUpdateRow>();
    for (const row of (data || []) as EddyUpdateRow[]) {
      const slug = row.river_slug;
      if (!slug || latestBySlug.has(slug)) continue;
      latestBySlug.set(slug, row);
    }

    // Reconcile AI prose with live conditions. 'global' has no live match and
    // falls through unchanged.
    const overlaid = await overlayLiveConditions(
      supabase,
      Array.from(latestBySlug.values()).map((r) => ({
        river_slug: r.river_slug as string,
        condition_code: r.condition_code ?? 'unknown',
        gauge_height_ft: r.gauge_height_ft,
        quote_text: r.quote_text ?? '',
        summary_text: r.summary_text,
        generated_at: r.generated_at ?? new Date().toISOString(),
      })),
    );

    const updates: Record<string, EddyUpdateEntry> = {};
    for (const u of overlaid) {
      const quoteText = u.quote_text ?? '';
      const summaryText = u.summary_text ?? null;
      // Skip rivers whose prose the overlay cleared (live condition diverged).
      if (!quoteText && !summaryText) continue;
      updates[u.river_slug] = {
        quoteText,
        summaryText,
        conditionCode: u.condition_code,
        gaugeHeightFt: u.gauge_height_ft,
        generatedAt: u.generated_at,
      };
    }

    return NextResponse.json<EddyUpdatesResponse>({ updates });
  } catch (error) {
    console.error('[EddyUpdates] Unexpected error:', error);
    return NextResponse.json<EddyUpdatesResponse>({ updates: {} }, { status: 500 });
  }
}

export const GET = withX402Route(_GET, '$0.01', 'Eddy updates (all rivers)');
