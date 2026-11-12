// src/lib/arrival-trial/store.ts
// Database and USGS access for the release-arrival trial.
//
// Both tables are append-only for the service role (insert and select, no
// update or delete), which is what makes a logged estimate evidence: once a
// row is written, neither this code nor a later fix can revise it.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getFlowProvider } from '@/lib/flow-providers';
import { logger } from '@/lib/logger';
import { HOUR_MS, RULE_VERSION, TRIAL_SITES, type Sample } from './rule';
import type { LoggedIncrease, OutcomeRow, PredictionRow, ReleaseHour, TrialDeps } from './run';

const PREDICTIONS = 'release_arrival_predictions';
const OUTCOMES = 'release_arrival_outcomes';
const UNIQUE_VIOLATION = '23505';

async function readRelease(db: SupabaseClient, fromMs: number, toMs: number): Promise<ReleaseHour[]> {
  const { data, error } = await db
    .from('dam_metric_readings')
    .select('observed_hour, value_cfs, updated_at')
    .eq('dam_id', TRIAL_SITES.damId)
    .eq('metric', 'release')
    .gte('observed_hour', new Date(fromMs).toISOString())
    .lte('observed_hour', new Date(toMs).toISOString())
    .order('observed_hour', { ascending: true })
    .limit(500);
  if (error) throw new Error(`arrival-trial: release read failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    hourMs: Date.parse(row.observed_hour as string),
    cfs: Number(row.value_cfs),
    receivedAtMs: row.updated_at ? Date.parse(row.updated_at as string) : null,
  }));
}

async function loggedSince(db: SupabaseClient, fromMs: number): Promise<LoggedIncrease[]> {
  const { data, error } = await db
    .from(PREDICTIONS)
    .select('id, onset_hour, decision, predicted_arrival_at')
    .eq('dam_id', TRIAL_SITES.damId)
    .eq('gauge_site_id', TRIAL_SITES.gaugeSiteId)
    .eq('rule_version', RULE_VERSION)
    .gte('onset_hour', new Date(fromMs).toISOString())
    .order('onset_hour', { ascending: true })
    .limit(500);
  if (error) throw new Error(`arrival-trial: prediction read failed: ${error.message}`);
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const done = await db
    .from(OUTCOMES)
    .select('prediction_id')
    .in('prediction_id', rows.map((row) => row.id as string));
  if (done.error) throw new Error(`arrival-trial: outcome read failed: ${done.error.message}`);
  const finished = new Set((done.data ?? []).map((row) => row.prediction_id as string));
  return rows.map((row) => ({
    id: row.id as string,
    onsetHourMs: Date.parse(row.onset_hour as string),
    decision: row.decision as 'issued' | 'withheld',
    predictedArrivalMs: row.predicted_arrival_at ? Date.parse(row.predicted_arrival_at as string) : null,
    hasOutcome: finished.has(row.id as string),
  }));
}

async function insert(db: SupabaseClient, table: string, row: PredictionRow | OutcomeRow) {
  const { error } = await db.from(table).insert(row);
  if (!error) return 'saved' as const;
  // Two passes overlapping is the only way to get here, and the first row stands.
  if (error.code === UNIQUE_VIOLATION) return 'duplicate' as const;
  logger.warn('arrival-trial: insert failed', { table, error: error.message });
  return 'error' as const;
}

/** USGS readings for one site over an explicit window. Null when the request fails. */
export async function readUsgs(
  siteId: string,
  field: 'gaugeHeightFt' | 'dischargeCfs',
  fromMs: number,
  toMs: number
): Promise<Sample[] | null> {
  try {
    const days = Math.max(1, Math.ceil((toMs - fromMs) / (24 * HOUR_MS)));
    const history = await getFlowProvider('usgs')!.fetchHistory(siteId, days, {
      from: new Date(fromMs),
      to: new Date(toMs),
      resolution: 'instant',
    });
    // The provider answers null for a failed request and for an empty window
    // alike. Treat both as "not known yet" so the pass retries rather than
    // recording a missing reading that was really a bad minute at USGS.
    if (!history) return null;
    const samples: Sample[] = [];
    for (const reading of history.readings) {
      const v = reading[field];
      const t = Date.parse(reading.timestamp);
      if (typeof v === 'number' && Number.isFinite(v) && Number.isFinite(t)) samples.push({ t, v });
    }
    return samples.sort((a, b) => a.t - b.t);
  } catch (error) {
    logger.warn('arrival-trial: USGS read failed', {
      siteId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function trialDeps(db: SupabaseClient, now = Date.now()): TrialDeps {
  return {
    now,
    readRelease: (fromMs, toMs) => readRelease(db, fromMs, toMs),
    readStage: (fromMs, toMs) => readUsgs(TRIAL_SITES.gaugeSiteId, 'gaugeHeightFt', fromMs, Math.min(toMs, now)),
    readTributary: (siteId, fromMs, toMs) => readUsgs(siteId, 'dischargeCfs', fromMs, Math.min(toMs, now)),
    loggedSince: (fromMs) => loggedSince(db, fromMs),
    savePrediction: (row) => insert(db, PREDICTIONS, row),
    saveOutcome: (row) => insert(db, OUTCOMES, row),
  };
}
