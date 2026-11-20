// src/lib/eddy/outlook-prose.ts
// The model-written prose GET /api/rivers/[slug]/outlook may serve, after the
// same live-water guards and the same Premium tier the singular report routes
// apply (latest-update.ts for a river, /api/gauge-update for a station).
//
// One model run writes summary_text, eddy_read and quote_text together. When
// the run no longer describes the water — the river has crossed into another
// floatability class, or the reading behind it is stale — every one of them is
// stale, the short Read included. Withholding only the long Read left iOS to
// fall back to the same run's eddy_read beside the new condition badge.
// Returning null here leaves buildEddyTakeSections' code-written live line.

import { overlayLiveConditions, WEBSITE_PROSE_STALE_HOURS } from '@/lib/social/live-conditions';
import { isGaugeReportCompatible } from '@/lib/eddy/gauge-update-policy';
import { tierGeneratedEddyProse } from '@/lib/eddy/tiered-prose';

/** The columns of an eddy_updates or gauge_updates row this needs. */
export interface StoredOutlookReport {
  quote_text: string | null;
  summary_text: string | null;
  eddy_read: string | null;
  condition_code: string;
  generated_at: string;
}

/** An eddy_updates row also carries the reading it was written against. */
export interface StoredRiverOutlookReport extends StoredOutlookReport {
  gauge_height_ft: number | null;
  discharge_cfs: number | null;
}

export interface OutlookProse {
  /** Premium long-form Read (quote_text). */
  fullRead: string | null;
  /** Premium short Read (eddy_read). Null means use the live guidance line. */
  eddyRead: string | null;
  /** When the served prose was written; null when none was served. */
  generatedAt: string | null;
}

const NO_PROSE: OutlookProse = { fullRead: null, eddyRead: null, generatedAt: null };

function servedProse(
  entitled: boolean,
  report: StoredOutlookReport,
  kept: { quoteText: string | null; summaryText: string | null },
): OutlookProse {
  const prose = tierGeneratedEddyProse(entitled, { ...kept, eddyRead: report.eddy_read });
  const fullRead = prose.quoteText;
  const eddyRead = prose.eddyRead;
  return {
    fullRead,
    eddyRead,
    generatedAt: fullRead || eddyRead ? report.generated_at : null,
  };
}

export async function loadOutlookProse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  {
    entitled,
    slug,
    riverReport,
    gaugeReport,
    liveCondition,
    readingTimestamp,
    overlay = overlayLiveConditions,
    now = new Date(),
  }: {
    entitled: boolean;
    slug: string;
    /** The river's eddy_updates row, on the primary gauge only. */
    riverReport: StoredRiverOutlookReport | null;
    /** A picked station's gauge_updates row. Ignored when riverReport is set. */
    gaugeReport: StoredOutlookReport | null;
    /** The picked station's condition, graded on this river's ladder. */
    liveCondition: string;
    /** The picked station's newest reading. */
    readingTimestamp: string | null;
    overlay?: typeof overlayLiveConditions;
    now?: Date;
  },
): Promise<OutlookProse> {
  // Every generated field is Premium. A public outlook gets the live line and
  // skips the overlay's database read entirely.
  if (!entitled) return NO_PROSE;

  if (riverReport) {
    try {
      const [overlaid] = await overlay(
        supabase,
        [{
          river_slug: slug,
          condition_code: riverReport.condition_code,
          gauge_height_ft: riverReport.gauge_height_ft,
          discharge_cfs: riverReport.discharge_cfs,
          quote_text: riverReport.quote_text ?? '',
          summary_text: riverReport.summary_text,
        }],
        { proseStaleHours: WEBSITE_PROSE_STALE_HOURS, logLabel: 'river-outlook' },
      );
      // The overlay clears quote_text and summary_text when the report is
      // stale or contradicts current water; eddy_read survives only with them.
      return servedProse(entitled, riverReport, {
        quoteText: overlaid?.quote_text || null,
        summaryText: overlaid?.summary_text ?? null,
      });
    } catch (error) {
      // Withholding is the safe direction: the failure this guard exists to
      // prevent is showing prose, not hiding it.
      console.warn(`[RiverOutlook] Live-condition overlay failed for ${slug}:`, error);
      return NO_PROSE;
    }
  }

  if (gaugeReport) {
    // The check /api/gauge-update applies before serving a station's report:
    // withhold when its reading is over a day old or the river has since made
    // a material move.
    if (!isGaugeReportCompatible({
      storedCondition: gaugeReport.condition_code,
      liveCondition,
      readingTimestamp,
      now,
    })) return NO_PROSE;
    return servedProse(entitled, gaugeReport, {
      quoteText: gaugeReport.quote_text,
      summaryText: gaugeReport.summary_text,
    });
  }

  return NO_PROSE;
}
