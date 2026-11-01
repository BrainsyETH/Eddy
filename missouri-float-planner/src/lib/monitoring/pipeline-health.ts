// src/lib/monitoring/pipeline-health.ts
// Is the alert pipeline actually WORKING — as opposed to merely deployed?
//
// /api/health answers liveness: the function boots. Every failure that has
// actually hurt Eddy looked healthy from there. A kill switch left on for six
// days, a cron lock that could not be evaluated and reported "skipped" on every
// run, a gauge pass that died before writing a reading: in each the site
// answered 200, the dashboard showed nothing unless someone opened it, and the
// trust ledger has no notification layer of its own.
//
// So this checks outcomes, not processes, and is built to be polled by
// something OUTSIDE Vercel — an uptime monitor that alerts on a non-200. A
// monitor living inside the thing it watches stops when the thing stops.
//
//   jobs       the core crons finished (ok or partial) recently
//   freshness  the newest curated gauge reading is recent
//   outbox     no deliverable alert has been waiting long
//
// A check whose query fails is reported failing, never passing: "could not
// tell" is exactly the state a monitor exists to surface.

import { logger } from '@/lib/logger';

export interface CheckResult {
  name: string;
  ok: boolean;
  /** Minutes since the thing being measured, when it could be measured. */
  ageMinutes: number | null;
  thresholdMinutes: number;
  /** Why it failed, in a word, for the authenticated view. */
  reason?: 'stale' | 'never' | 'unreadable' | 'low_coverage';
  /** Freshness only: how many curated stations are fresh, of how many. */
  coverage?: { fresh: number; total: number; minRatio: number };
}

export interface PipelineHealth {
  ok: boolean;
  checkedAt: string;
  checks: CheckResult[];
}

/**
 * Job cadences and their alert thresholds. A threshold is a few missed runs,
 * not one: Vercel occasionally drops a single invocation and a monitor that
 * pages on that is a monitor people learn to ignore.
 */
export const JOB_CHECKS: Array<{ name: string; jobs: string[]; thresholdMinutes: number }> = [
  // The two gauge passes are watched SEPARATELY. They used to share one check,
  // so the :15/:30/:45 high-frequency pass kept it green while the hourly
  // full pass — the only one covering most gauges — failed every hour.
  { name: 'job:update-gauges', jobs: ['update-gauges'], thresholdMinutes: 75 },
  // :15/:30/:45 leaves a 30-minute gap across the hour.
  { name: 'job:update-gauges:high-frequency', jobs: ['update-gauges:high-frequency'], thresholdMinutes: 50 },
  { name: 'job:evaluate-gauge-alerts', jobs: ['evaluate-gauge-alerts'], thresholdMinutes: 50 },
  { name: 'job:deliver-push', jobs: ['deliver-push'], thresholdMinutes: 20 },
];
export const FRESHNESS_THRESHOLD_MINUTES = 120;
/**
 * Share of curated stations that must have a reading inside the freshness
 * window. COVERAGE, not the newest reading anywhere: one live gauge used to
 * pass the check for the whole collection. Not 100% — some sensor is down at
 * any given time (51 of 52 were fresh when this was set), and a check that
 * pages on every dead sensor is one people learn to ignore.
 */
export const FRESHNESS_MIN_COVERAGE = 0.9;
export const OUTBOX_THRESHOLD_MINUTES = 30;
/** Mirrors deliver-push: rows at or past this are no longer deliverable. */
const MAX_ATTEMPTS = 5;

const minutesSince = (iso: string, now: Date) => Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));

function judge(name: string, iso: string | null, thresholdMinutes: number, now: Date, emptyIsOk = false): CheckResult {
  if (iso === null) {
    return emptyIsOk
      ? { name, ok: true, ageMinutes: null, thresholdMinutes }
      : { name, ok: false, ageMinutes: null, thresholdMinutes, reason: 'never' };
  }
  const ageMinutes = minutesSince(iso, now);
  const ok = ageMinutes <= thresholdMinutes;
  return { name, ok, ageMinutes, thresholdMinutes, ...(ok ? {} : { reason: 'stale' as const }) };
}

const unreadable = (name: string, thresholdMinutes: number): CheckResult => ({
  name,
  ok: false,
  ageMinutes: null,
  thresholdMinutes,
  reason: 'unreadable',
});

/**
 * The most recent finish among several job identities, or null.
 *
 * `partial` counts as a completion because it means useful progress (an
 * enrichment budget ran out, a few sends to dead tokens failed). A run that
 * could NOT do its job — the evaluator failing to save its alerts — records
 * itself as `error` (monitoring_status), not partial, so it never satisfies
 * this check.
 */
async function lastCompletion(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  jobs: string[],
): Promise<string | null> {
  let latest: string | null = null;
  for (const job of jobs) {
    // Per job so each read is one seek on admin_job_runs(job, started_at desc).
    const { data, error } = await supabase
      .from('admin_job_runs')
      .select('finished_at')
      .eq('job', job)
      .in('status', ['ok', 'partial'])
      .order('started_at', { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    const at = (data?.[0]?.finished_at as string | null | undefined) ?? null;
    if (at && (latest === null || at > latest)) latest = at;
  }
  return latest;
}

async function curatedCoverage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  now: Date,
): Promise<{ fresh: number; total: number }> {
  const { data: stations, error } = await supabase
    .from('gauge_stations')
    .select('id')
    .eq('curated', true)
    .eq('active', true)
    .order('id')
    .limit(1000);
  if (error) throw new Error(error.message);
  const ids = (stations ?? []).map((s: { id: string }) => s.id);
  if (ids.length === 0) return { fresh: 0, total: 0 };
  // One index seek per station; a max over gauge_readings has no index to use.
  const { data, error: rpcError } = await supabase.rpc('get_latest_curated_readings', { p_station_ids: ids });
  if (rpcError) throw new Error(rpcError.message);
  const cutoff = now.getTime() - FRESHNESS_THRESHOLD_MINUTES * 60000;
  const freshStations = new Set<string>();
  for (const row of (data ?? []) as Array<{ gauge_station_id: string; reading_timestamp: string | null }>) {
    if (row.reading_timestamp && Date.parse(row.reading_timestamp) >= cutoff) freshStations.add(row.gauge_station_id);
  }
  // A station with no reading at all counts against coverage, not for it.
  return { fresh: freshStations.size, total: ids.length };
}

/** Oldest still-deliverable event across both outboxes, or null when empty. */
async function oldestPendingAlert(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<string | null> {
  const reads = await Promise.all([
    supabase
      .from('river_condition_events')
      .select('detected_at')
      .is('push_delivered_at', null)
      .lt('push_attempts', MAX_ATTEMPTS)
      .in('kind', ['floatable', 'warning', 'easing'])
      .order('detected_at', { ascending: true })
      .limit(1),
    supabase
      .from('gauge_alert_events')
      .select('detected_at')
      .is('push_delivered_at', null)
      .lt('push_attempts', MAX_ATTEMPTS)
      .order('detected_at', { ascending: true })
      .limit(1),
  ]);
  let oldest: string | null = null;
  for (const { data, error } of reads) {
    if (error) throw new Error(error.message);
    const at = (data?.[0]?.detected_at as string | undefined) ?? null;
    if (at && (oldest === null || at < oldest)) oldest = at;
  }
  return oldest;
}

export async function checkPipelineHealth(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  now: Date = new Date(),
): Promise<PipelineHealth> {
  const checks: CheckResult[] = [];

  for (const job of JOB_CHECKS) {
    try {
      checks.push(judge(job.name, await lastCompletion(supabase, job.jobs), job.thresholdMinutes, now));
    } catch (error) {
      logger.warn('[pipeline-health] job check unreadable', { check: job.name, error: String(error) });
      checks.push(unreadable(job.name, job.thresholdMinutes));
    }
  }

  try {
    const { fresh, total } = await curatedCoverage(supabase, now);
    const ok = total > 0 && fresh / total >= FRESHNESS_MIN_COVERAGE;
    checks.push({
      name: 'freshness:curated-readings',
      ok,
      ageMinutes: null,
      thresholdMinutes: FRESHNESS_THRESHOLD_MINUTES,
      coverage: { fresh, total, minRatio: FRESHNESS_MIN_COVERAGE },
      ...(ok ? {} : { reason: total === 0 ? ('never' as const) : ('low_coverage' as const) }),
    });
  } catch (error) {
    logger.warn('[pipeline-health] freshness check unreadable', { error: String(error) });
    checks.push(unreadable('freshness:curated-readings', FRESHNESS_THRESHOLD_MINUTES));
  }

  try {
    // An empty outbox is healthy; only a waiting alert has an age.
    checks.push(judge('outbox:oldest-pending-alert', await oldestPendingAlert(supabase), OUTBOX_THRESHOLD_MINUTES, now, true));
  } catch (error) {
    logger.warn('[pipeline-health] outbox check unreadable', { error: String(error) });
    checks.push(unreadable('outbox:oldest-pending-alert', OUTBOX_THRESHOLD_MINUTES));
  }

  return { ok: checks.every((c) => c.ok), checkedAt: now.toISOString(), checks };
}
