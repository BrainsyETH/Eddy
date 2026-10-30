// src/lib/eddy/latest-update.ts
// The latest non-expired Eddy update for a river, safety-gated against live
// water and tiered for the caller — the one read behind GET /api/eddy-update
// and the server-rendered embeds, so the two cannot drift on which prose is
// safe to show.

import { toNum } from '@/lib/utils/num';
import { overlayLiveConditions, WEBSITE_PROSE_STALE_HOURS } from '@/lib/social/live-conditions';
import { tierGeneratedEddyProse } from '@/lib/eddy/tiered-prose';

export interface LatestEddyUpdate {
  /** Premium long-form prose. Null for public callers. */
  quoteText: string | null;
  summaryText: string | null;
  /** Premium short interpretation. Null for public callers. */
  eddyRead: string | null;
  conditionCode: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  sectionSlug: string | null;
  sourcesUsed: string[];
  generatedAt: string;
  readingTimestamp: string | null;
  snapshotId: string | null;
}

export type LatestEddyUpdateResult =
  | { state: 'ok'; update: LatestEddyUpdate | null }
  | { state: 'error' };

/**
 * `update: null` means no safe prose exists right now (nothing generated, it
 * expired, or the live condition has crossed into another bucket and the
 * written report no longer describes the water). Callers fall back to a
 * static line rather than show "sweet spot" copy beside a High badge.
 */
export async function loadLatestEddyUpdate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  riverSlug: string,
  options: { entitled?: boolean; sectionSlug?: string | null } = {},
): Promise<LatestEddyUpdateResult> {
  const entitled = options.entitled === true;
  const sectionSlug = options.sectionSlug ?? null;

  let query = supabase
    .from('eddy_updates')
    .select('quote_text, summary_text, eddy_read, condition_code, gauge_height_ft, discharge_cfs, section_slug, sources_used, generated_at, expires_at')
    .eq('river_slug', riverSlug)
    .gt('expires_at', new Date().toISOString())
    .order('generated_at', { ascending: false })
    .limit(1);
  query = sectionSlug ? query.eq('section_slug', sectionSlug) : query.is('section_slug', null);

  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error(`[EddyUpdate] Query error for ${riverSlug}:`, error);
    return { state: 'error' };
  }
  if (!data) return { state: 'ok', update: null };

  // Overlay the live gauge-derived condition + reading so the prose matches
  // the hero badge computed from gauge_readings + thresholds. When the live
  // condition has crossed into a different bucket, the overlay drops the prose.
  const [overlaid] = await overlayLiveConditions(supabase, [{
    river_slug: riverSlug,
    condition_code: data.condition_code,
    gauge_height_ft: data.gauge_height_ft,
    discharge_cfs: data.discharge_cfs,
    quote_text: data.quote_text,
    summary_text: data.summary_text,
  }], {
    proseStaleHours: WEBSITE_PROSE_STALE_HOURS,
    logLabel: 'eddy-update',
  });

  // quote_text and summary_text are the fields the overlay clears when the
  // report is stale or contradicts current water. eddy_read comes from the
  // same model run, so it is returned only when one of those survived.
  const prose = tierGeneratedEddyProse(entitled, {
    quoteText: overlaid.quote_text || null,
    summaryText: overlaid.summary_text ?? null,
    eddyRead: data.eddy_read ?? null,
  });
  if (!prose.available) return { state: 'ok', update: null };

  return {
    state: 'ok',
    update: {
      quoteText: prose.quoteText,
      summaryText: prose.summaryText,
      eddyRead: prose.eddyRead,
      conditionCode: overlaid.condition_code,
      gaugeHeightFt: toNum(overlaid.gauge_height_ft),
      dischargeCfs: toNum(overlaid.discharge_cfs),
      sectionSlug: data.section_slug,
      sourcesUsed: data.sources_used || [],
      generatedAt: data.generated_at,
      readingTimestamp: overlaid.reading_timestamp ?? null,
      snapshotId: overlaid.snapshot_id ?? null,
    },
  };
}
