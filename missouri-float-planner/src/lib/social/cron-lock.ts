// src/lib/social/cron-lock.ts
// Serializes cron runs across Vercel instances via a heartbeat row.
// See migration 00090_social_cron_locks.sql for schema.

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Why the two failures are not the same failure.
 *
 * `tryCronLock` collapses both into `false`, and every caller reads `false` as
 * "another instance holds it — skip this pass, all is well". That is right for
 * contention and wrong for a missing function, a revoked grant, or a database
 * outage: those mean the lock is not protecting anything, and a run that skips
 * on them reports a healthy no-op while the job silently stops happening.
 *
 * Contention is ordinary and should stay quiet. Infrastructure failure is an
 * outage and should be loud. Callers that care ask for the outcome.
 */
export type CronLockOutcome =
  | { acquired: true }
  | { acquired: false; reason: 'contended' }
  | { acquired: false; reason: 'unavailable'; error: string };

export async function tryCronLockDetailed(
  supabase: SupabaseClient,
  job: string,
  staleAfterSeconds = 600,
): Promise<CronLockOutcome> {
  const { data, error } = await supabase.rpc('try_cron_lock', {
    job_name: job,
    stale_after_seconds: staleAfterSeconds,
  });
  if (error) {
    console.error(`[CronLock] try_cron_lock(${job}) failed:`, error.message);
    return { acquired: false, reason: 'unavailable', error: error.message };
  }
  return data === true ? { acquired: true } : { acquired: false, reason: 'contended' };
}

/**
 * The original boolean form, unchanged for the social crons that use it.
 *
 * Kept deliberately rather than migrated wholesale: those jobs post to external
 * services, and "skip when unsure" is the correct bias there. The trust tick has
 * the opposite bias — it is the thing that notices when jobs stop — so it uses
 * the detailed form.
 */
export async function tryCronLock(
  supabase: SupabaseClient,
  job: string,
  staleAfterSeconds = 600,
): Promise<boolean> {
  const outcome = await tryCronLockDetailed(supabase, job, staleAfterSeconds);
  return outcome.acquired;
}

export async function releaseCronLock(supabase: SupabaseClient, job: string): Promise<void> {
  const { error } = await supabase.rpc('release_cron_lock', { job_name: job });
  if (error) {
    console.error(`[CronLock] release_cron_lock(${job}) failed:`, error.message);
  }
}
