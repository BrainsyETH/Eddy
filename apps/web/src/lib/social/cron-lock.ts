// src/lib/social/cron-lock.ts
// Serializes cron runs across Vercel instances via a heartbeat row.
// See migration 00090_social_cron_locks.sql for schema.

import type { SupabaseClient } from '@supabase/supabase-js';

export async function tryCronLock(
  supabase: SupabaseClient,
  job: string,
  staleAfterSeconds = 600,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('try_cron_lock', {
    job_name: job,
    stale_after_seconds: staleAfterSeconds,
  });
  if (error) {
    console.error(`[CronLock] try_cron_lock(${job}) failed:`, error.message);
    return false;
  }
  return data === true;
}

export async function releaseCronLock(supabase: SupabaseClient, job: string): Promise<void> {
  const { error } = await supabase.rpc('release_cron_lock', { job_name: job });
  if (error) {
    console.error(`[CronLock] release_cron_lock(${job}) failed:`, error.message);
  }
}
