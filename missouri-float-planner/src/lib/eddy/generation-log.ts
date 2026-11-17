// src/lib/eddy/generation-log.ts
// Writes generation records to public.eddy_generation_log, and prunes them.
//
// Evidence, not product. Nothing here may change what a reader sees: a failed
// write is logged and swallowed, and the generator carries on. See
// generation-record.ts for what a record holds and why.

import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GenerationLogRow } from './generation-record';

/** How long records are kept. Long enough to compare one season's storms with
 * the next dry spell; the cron prunes past it on full passes. */
export const GENERATION_LOG_RETENTION_DAYS = 180;

/** A write that hangs must not hold a generation slot. */
const WRITE_TIMEOUT_MS = 5_000;

/**
 * Set once the table is known to be absent, so a project without the
 * migration costs one failed request per process rather than one per target.
 * Production has had the table since 2026-11-17; this is for a preview or
 * local database that has not been migrated, where the generator must still
 * run.
 */
let tableMissing = false;

function isMissingTable(error: { code?: string; message?: string }): boolean {
  // 42P01: Postgres "undefined_table". PGRST205: PostgREST has no such table
  // in its schema cache, which is what an unapplied migration looks like here.
  return error.code === '42P01' || error.code === 'PGRST205';
}

/** Never throws. */
export async function recordGeneration(row: GenerationLogRow): Promise<void> {
  if (tableMissing) return;
  try {
    const supabase = createAdminClient(AbortSignal.timeout(WRITE_TIMEOUT_MS));
    const { error } = await supabase.from('eddy_generation_log').insert(row);
    if (!error) return;
    if (isMissingTable(error)) {
      tableMissing = true;
      console.warn(
        '[EddyGenLog] eddy_generation_log does not exist; generation records are not being kept. ' +
          'Apply 20261117041752_eddy_generation_log.sql.',
      );
      return;
    }
    console.warn(`[EddyGenLog] Insert failed for ${row.river_slug}/${row.section_slug ?? 'whole'}: ${error.message}`);
  } catch (e) {
    console.warn(`[EddyGenLog] Insert threw for ${row.river_slug}/${row.section_slug ?? 'whole'}:`, e);
  }
}

/** Deletes records older than the retention window. Never throws. */
export async function pruneGenerationLog(supabase: SupabaseClient, now: number = Date.now()): Promise<void> {
  if (tableMissing) return;
  try {
    const cutoff = new Date(now - GENERATION_LOG_RETENTION_DAYS * 86_400_000).toISOString();
    const { error } = await supabase.from('eddy_generation_log').delete().lt('created_at', cutoff);
    if (error && !isMissingTable(error)) console.warn('[EddyGenLog] Prune failed:', error.message);
  } catch (e) {
    console.warn('[EddyGenLog] Prune threw:', e);
  }
}
