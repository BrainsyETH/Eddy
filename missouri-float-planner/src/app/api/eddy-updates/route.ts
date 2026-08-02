// src/app/api/eddy-updates/route.ts
// Batched Eddy updates for the home page: the latest non-expired river-level
// update for every river (plus the statewide "global" row) in one request, so
// the landing page makes a single call instead of one per river. Live gauge
// conditions are overlaid (dropping prose that no longer matches the river's
// live condition), mirroring the per-river /api/eddy-update/[riverSlug] route.

import { NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import type { EddyUpdateEntry, EddyUpdatesResponse } from '@/types/api';
import { createAdminClient } from '@/lib/supabase/admin';
import { withX402Route } from '@/lib/x402-config';
import {
  buildLiveConditionsMap,
  overlayLiveConditions,
  WEBSITE_PROSE_STALE_HOURS,
} from '@/lib/social/live-conditions';
import { gateGlobalProse } from '@/lib/eddy/global-prose-gate';

export const dynamic = 'force-dynamic';

// Declared in src/types/api.ts now rather than inline here, so the Expo app's
// copy in packages/eddy-types has a counterpart to be checked against. Still
// re-exported from this module: useEddyUpdates imports them from the route.
export type { EddyUpdateEntry, EddyUpdatesResponse } from '@/types/api';

interface EddyUpdateRow {
  river_slug: string | null;
  quote_text: string | null;
  summary_text: string | null;
  condition_code: string | null;
  gauge_height_ft: number | null;
  discharge_cfs: number | null;
  generated_at: string | null;
}

async function _GET() {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('eddy_updates')
      .select('river_slug, quote_text, summary_text, condition_code, gauge_height_ft, discharge_cfs, generated_at')
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

    // Built ONCE and shared, because two things need it: the per-river overlay
    // below, and the statewide gate under it. Two reads would also let the two
    // disagree across the gap between them.
    const liveConditions = await buildLiveConditionsMap(supabase);

    // Reconcile AI prose with live conditions. 'global' has no live match and
    // falls through here unchanged — see the gate below, which is what covers
    // it instead.
    const overlaid = await overlayLiveConditions(
      supabase,
      Array.from(latestBySlug.values()).map((r) => ({
        river_slug: r.river_slug as string,
        condition_code: r.condition_code ?? 'unknown',
        gauge_height_ft: r.gauge_height_ft,
        discharge_cfs: r.discharge_cfs,
        quote_text: r.quote_text ?? '',
        summary_text: r.summary_text,
        generated_at: r.generated_at ?? new Date().toISOString(),
      })),
      // Website prose is valid only for the current, non-stale snapshot.
      { proseStaleHours: WEBSITE_PROSE_STALE_HOURS, logLabel: 'eddy-updates', liveConditions },
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
        dischargeCfs: u.discharge_cfs ?? null,
        readingTimestamp: u.reading_timestamp ?? null,
        snapshotId: u.snapshot_id ?? null,
        generatedAt: u.generated_at,
      };
    }

    /**
     * The statewide summary, held to the same standard as everything else.
     *
     * It is the only row the overlay cannot check, because it has no river and
     * therefore no live reading to be checked against. Left alone it was
     * guarded by nothing but a 25-hour expires_at — which is how a 6:10am
     * "warm and steady across the eastern Ozarks" survives into an afternoon
     * the basin spent in flood.
     *
     * Dropped rather than annotated. A summary is two or three sentences of
     * prose; there is no way to caveat one into being true about water it was
     * written before. The count and the live list below it still answer the
     * question, which is why removing this costs the screen nothing.
     */
    if (updates.global) {
      const verdict = gateGlobalProse({
        generatedAt: updates.global.generatedAt,
        live: Array.from(liveConditions.values()).map((c) => ({
          conditionCode: c.condition_code,
          readingTimestamp: c.reading_timestamp,
        })),
      });
      if (!verdict.show) {
        console.warn(`[EddyUpdates] statewide summary withheld: ${verdict.reason}`);
        delete updates.global;
      }
    }

    return NextResponse.json<EddyUpdatesResponse>({ updates }, { headers: cdnCacheHeaders(300, 1800) });
  } catch (error) {
    console.error('[EddyUpdates] Unexpected error:', error);
    return NextResponse.json<EddyUpdatesResponse>({ updates: {} }, { status: 500 });
  }
}

export const GET = withX402Route(_GET, '/api/eddy-updates');
