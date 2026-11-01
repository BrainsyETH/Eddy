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
  reason?: 'stale' | 'never' | 'unreadable';
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
  // Hourly full pass plus the */15 high-frequency pass; either proves ingestion runs.
  { name: 'job:update-gauges', jobs: ['update-gauges', 'update-gauges:high-frequency'], thresholdMinutes: 75 },
  { name: 'job:evaluate-gauge-alerts', jobs: ['evaluate-gauge-alerts'], thresholdMinutes: 50 },
  { name: 'job:deliver-push', jobs: ['deliver-push'], thresholdMinutes: 20 },
];
export const FRESHNESS_THRESHOLD_MINUTES = 120;
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

/** The most recent finish among several job identities, or null. */
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

async function newestCuratedReading(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<string | null> {
  const { data: stations, error } = await supabase
    .from('gauge_stations')
    .select('id')
    .eq('curated', true)
    .eq('active', true)
    .order('id')
    .limit(1000);
  if (error) throw new Error(error.message);
  const ids = (stations ?? []).map((s: { id: string }) => s.id);
  if (ids.length === 0) return null;
  // One index seek per station; a max over gauge_readings has no index to use.
  const { data, error: rpcError } = await supabase.rpc('get_latest_curated_readings', { p_station_ids: ids });
  if (rpcError) throw new Error(rpcError.message);
  let newest: string | null = null;
  for (const row of (data ?? []) as Array<{ reading_timestamp: string | null }>) {
    if (row.reading_timestamp && (newest === null || row.reading_timestamp > newest)) newest = row.reading_timestamp;
  }
  return newest;
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
    checks.push(judge('freshness:curated-readings', await newestCuratedReading(supabase), FRESHNESS_THRESHOLD_MINUTES, now));
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
