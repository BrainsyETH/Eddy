// src/lib/arrival-trial/public-results.ts
// What the release-arrival trial may show the public: results, after the fact.
//
// THE ONE RULE HERE: an estimate leaves this module only together with what
// the river did. While a release is still travelling its row carries the
// release time and nothing else, so nothing published can be read as a
// forecast and nobody can time a wade on it. `publicResults` is the only
// place that decision is made; the page and any future API read its output and
// never the tables.
//
// Scored the way the study scores (protocol_forward.json): an issued estimate
// whose outcome is `matched` is compared; every other detected increase is
// accounted for as waiting, not comparable, or no estimate, with its reason.

import type { SupabaseClient } from '@supabase/supabase-js';
import { HOUR_MS, RULE_VERSION, TRIAL_SITES } from './rule';
import type { OutcomeStatus } from './run';

export interface StoredPrediction {
  id: string;
  onset_hour: string;
  decision: 'issued' | 'withheld';
  reason: string | null;
  predicted_arrival_at: string | null;
  range_early_at: string | null;
  range_late_at: string | null;
  peak_cfs: number | null;
}

export interface StoredOutcome {
  prediction_id: string;
  status: OutcomeStatus;
  matched_rise_at: string | null;
}

interface Base {
  id: string;
  /** When the release rose at the dam: half past its first hour. */
  releasedAt: string;
}
export type PublicResult =
  | (Base & { kind: 'compared'; peakCfs: number | null; estimateAt: string; earlyAt: string; lateAt: string; roseAt: string })
  | (Base & { kind: 'waiting' })
  | (Base & { kind: 'not-compared'; why: string })
  | (Base & { kind: 'no-estimate'; why: string });

export interface PublicResults {
  /** Newest first. Releases under 2,000 cfs are not releases for this page and are left out. */
  results: PublicResult[];
  tally: {
    compared: number;
    insideWindow: number;
    within2Hours: number;
    notCompared: number;
    waiting: number;
    noEstimate: Array<{ why: string; count: number }>;
  };
}

/** Why Eddy made no estimate, in the page's words. Null means "not a release this page counts". */
const NO_ESTIMATE: Record<string, string | null> = {
  'increase under 2,000 cfs': null,
  'river high': 'The river was already high',
  'release already raised': 'The dam was already releasing',
  'smaller increase went first': 'A smaller increase had just gone out',
  'tributaries moving': 'Side streams were rising',
  'tributaries moved before issue': 'Side streams were rising',
};
const NO_READINGS = 'The readings did not arrive in time';

const NOT_COMPARED: Record<Exclude<OutcomeStatus, 'matched'>, string> = {
  ambiguous: 'More than one rise or release overlapped',
  'no rise found': 'The gauge did not record a rise',
  'gauge gap': 'The gauge record had a gap',
  'gauge data unavailable': 'The gauge record could not be read',
};

/** Pure: the public view of the stored rows. */
export function publicResults(predictions: StoredPrediction[], outcomes: StoredOutcome[]): PublicResults {
  const outcomeFor = new Map(outcomes.map((outcome) => [outcome.prediction_id, outcome]));
  const results: PublicResult[] = [];
  for (const row of predictions) {
    const base: Base = { id: row.id, releasedAt: new Date(Date.parse(row.onset_hour) + HOUR_MS / 2).toISOString() };
    if (row.decision === 'withheld') {
      const why = row.reason !== null && row.reason in NO_ESTIMATE ? NO_ESTIMATE[row.reason] : NO_READINGS;
      if (why !== null) results.push({ ...base, kind: 'no-estimate', why });
      continue;
    }
    const outcome = outcomeFor.get(row.id);
    if (!outcome) {
      results.push({ ...base, kind: 'waiting' });
    } else if (
      outcome.status === 'matched' &&
      outcome.matched_rise_at &&
      row.predicted_arrival_at &&
      row.range_early_at &&
      row.range_late_at
    ) {
      results.push({
        ...base,
        kind: 'compared',
        peakCfs: row.peak_cfs,
        estimateAt: row.predicted_arrival_at,
        earlyAt: row.range_early_at,
        lateAt: row.range_late_at,
        roseAt: outcome.matched_rise_at,
      });
    } else {
      results.push({ ...base, kind: 'not-compared', why: outcome.status === 'matched' ? NOT_COMPARED['gauge data unavailable'] : NOT_COMPARED[outcome.status] });
    }
  }
  results.sort((a, b) => Date.parse(b.releasedAt) - Date.parse(a.releasedAt));

  const compared = results.filter((r) => r.kind === 'compared');
  const reasons = new Map<string, number>();
  for (const r of results) if (r.kind === 'no-estimate') reasons.set(r.why, (reasons.get(r.why) ?? 0) + 1);
  return {
    results,
    tally: {
      compared: compared.length,
      insideWindow: compared.filter((r) => comparison(r).position === 'inside').length,
      within2Hours: compared.filter((r) => Math.abs(comparison(r).fromEstimateMinutes) <= 120).length,
      notCompared: results.filter((r) => r.kind === 'not-compared').length,
      waiting: results.filter((r) => r.kind === 'waiting').length,
      noEstimate: [...reasons].map(([why, count]) => ({ why, count })).sort((a, b) => b.count - a.count || a.why.localeCompare(b.why)),
    },
  };
}

/** Where the rise fell against the estimated window. Minutes are whole and never negative for the gaps. */
export function comparison(result: Extract<PublicResult, { kind: 'compared' }>) {
  const rose = Date.parse(result.roseAt);
  const early = Date.parse(result.earlyAt);
  const late = Date.parse(result.lateAt);
  const minutes = (ms: number) => Math.round(ms / 60_000);
  return {
    position: rose < early ? ('before' as const) : rose > late ? ('after' as const) : ('inside' as const),
    /** Outside the window only: how far outside. */
    outsideMinutes: rose < early ? minutes(early - rose) : rose > late ? minutes(rose - late) : 0,
    /** Negative when the river rose before the estimate. */
    fromEstimateMinutes: minutes(rose - Date.parse(result.estimateAt)),
  };
}

/** Enough for the page's history without unbounded reads: about two years at the busiest rate seen. */
const MAX_ROWS = 400;

/**
 * Reads the trial's rows with the service role, on the server. Returns null
 * when they cannot be read, so the page can say so instead of showing "no
 * results yet" over an outage.
 */
export async function loadPublicResults(db: SupabaseClient): Promise<PublicResults | null> {
  try {
    const predictions = await db
      .from('release_arrival_predictions')
      .select('id, onset_hour, decision, reason, predicted_arrival_at, range_early_at, range_late_at, peak_cfs:inputs->peak_cfs')
      .eq('dam_id', TRIAL_SITES.damId)
      .eq('gauge_site_id', TRIAL_SITES.gaugeSiteId)
      .eq('rule_version', RULE_VERSION)
      .order('onset_hour', { ascending: false })
      .limit(MAX_ROWS)
      .abortSignal(AbortSignal.timeout(4000));
    if (predictions.error) return null;
    const rows = (predictions.data ?? []).map((row) => ({
      ...(row as unknown as StoredPrediction),
      peak_cfs: typeof row.peak_cfs === 'number' ? row.peak_cfs : null,
    }));
    if (!rows.some((row) => row.decision === 'issued')) return publicResults(rows, []);
    // Outcomes are written at least a day after their release, so everything
    // evaluated since the oldest release in hand covers every row above.
    const outcomes = await db
      .from('release_arrival_outcomes')
      .select('prediction_id, status, matched_rise_at')
      .gte('evaluated_at', rows[rows.length - 1].onset_hour)
      .order('evaluated_at', { ascending: false })
      .limit(MAX_ROWS)
      .abortSignal(AbortSignal.timeout(4000));
    if (outcomes.error) return null;
    return publicResults(rows, (outcomes.data ?? []) as StoredOutcome[]);
  } catch {
    return null;
  }
}
