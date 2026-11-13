// src/lib/arrival-trial/status.ts
// What the release-arrival trial is doing right now, in words for the admin
// job table.
//
// Kept apart from the scheduled job's last result on purpose. The job reports
// "skipped" when the trial is switched off, when it is deliberately paused and
// when another pass holds the lock, so its result cannot say whether anything
// is being collected. This reads the switch and the trial's own pass records
// (release_arrival_passes, one row per pass) instead.

import type { SupabaseClient } from '@supabase/supabase-js';
import { HOUR_MS, RULE_VERSION } from './rule';

export type TrialMode = 'on' | 'paused' | 'off';

/** Serializable: this crosses into a client component. */
export interface TrialCollection {
  state: 'off' | 'paused' | 'collecting' | 'issue';
  headline: string;
  detail: string;
  /** A time the detail refers to, shown after it. */
  at: string | null;
}

export interface PassMark {
  state: 'active' | 'paused';
  ranAt: string;
  errors: number;
}

/**
 * `not-created` is the tables missing altogether (the migration has not been
 * applied); `unavailable` is any other failed read.
 */
export type TrialReadings =
  | { passes: PassMark[]; logged: number }
  | 'not-created'
  | 'unavailable';

/** Passes run hourly. Two missed in a row is a stall, not a slow tick. */
const STALE_MS = 2 * HOUR_MS + 15 * 60_000;
/** Two days of hourly passes: far enough back to find the last clean one. */
const PASS_LOOKBACK = 48;

export function trialMode(value: string | undefined = process.env.RELEASE_ARRIVAL_TRIAL_ENABLED): TrialMode {
  return value === 'true' ? 'on' : value === 'paused' ? 'paused' : 'off';
}

/** `readings.passes` is newest first. */
export function describeCollection(mode: TrialMode, readings: TrialReadings, now: number): TrialCollection {
  const known = typeof readings === 'object' ? readings : null;
  const lastActive = known?.passes.find((pass) => pass.state === 'active') ?? null;

  if (mode === 'off') {
    if (readings === 'unavailable') {
      return { state: 'off', headline: 'Off', detail: 'Collection history could not be read', at: null };
    }
    return lastActive
      ? { state: 'off', headline: 'Off', detail: 'Last collected', at: lastActive.ranAt }
      : { state: 'off', headline: 'Off', detail: 'Collection hasn’t started', at: null };
  }

  // Switched on or paused, but there is nowhere to write: every pass is failing.
  if (readings === 'not-created') {
    return { state: 'issue', headline: 'Collection issue', detail: 'Results tables are not set up', at: null };
  }
  if (!known) {
    return { state: 'issue', headline: 'Collection issue', detail: 'Results could not be read', at: null };
  }
  if (mode === 'paused') {
    return { state: 'paused', headline: 'Paused', detail: 'Existing results retained', at: null };
  }

  const latest = known.passes[0] ?? null;
  const fresh = (pass: PassMark) => now - Date.parse(pass.ranAt) <= STALE_MS;
  // Just switched on, or just resumed: the next hourly pass has not run yet.
  if (!latest || (latest.state === 'paused' && fresh(latest))) {
    return { state: 'collecting', headline: 'Collecting', detail: 'Waiting for the first check', at: null };
  }
  if (!lastActive || lastActive.errors > 0 || !fresh(lastActive)) {
    const clean = known.passes.find((pass) => pass.state === 'active' && pass.errors === 0);
    return clean
      ? { state: 'issue', headline: 'Collection issue', detail: 'Last successful check', at: clean.ranAt }
      : { state: 'issue', headline: 'Collection issue', detail: 'No successful check in the last two days', at: null };
  }
  return known.logged === 0
    ? { state: 'collecting', headline: 'Collecting', detail: 'No qualifying release yet', at: null }
    : { state: 'collecting', headline: 'Collecting', detail: 'Last checked', at: lastActive.ranAt };
}

/** Postgres "undefined table", and PostgREST's "not in the schema cache". */
const MISSING_TABLE = new Set(['42P01', 'PGRST205']);

async function readTrial(db: SupabaseClient): Promise<TrialReadings> {
  try {
    const [passes, logged] = await Promise.all([
      db
        .from('release_arrival_passes')
        .select('state, ran_at, summary')
        .eq('rule_version', RULE_VERSION)
        .order('ran_at', { ascending: false })
        .limit(PASS_LOOKBACK)
        .abortSignal(AbortSignal.timeout(3000)),
      db
        .from('release_arrival_predictions')
        .select('id', { count: 'exact', head: true })
        .eq('rule_version', RULE_VERSION)
        .abortSignal(AbortSignal.timeout(3000)),
    ]);
    const failed = passes.error ?? logged.error;
    if (failed) return MISSING_TABLE.has(failed.code ?? '') ? 'not-created' : 'unavailable';
    if (logged.count === null) return 'unavailable';
    return {
      logged: logged.count,
      passes: (passes.data ?? []).map((row) => {
        const errors = (row.summary as { errors?: unknown } | null)?.errors;
        return {
          state: row.state === 'paused' ? 'paused' : 'active',
          ranAt: row.ran_at as string,
          errors: typeof errors === 'number' ? errors : 0,
        };
      }),
    };
  } catch {
    return 'unavailable';
  }
}

/** Never throws: the job table must render whatever the trial's tables are doing. */
export async function loadCollection(db: SupabaseClient, now = Date.now()): Promise<TrialCollection> {
  return describeCollection(trialMode(), await readTrial(db), now);
}
