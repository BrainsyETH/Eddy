// src/lib/data/dam-history-store.ts
// The database half of dam generation history — everything dam-history.ts
// deliberately refuses to know about.
//
// Kept apart so the bucketing and Central-day arithmetic stay testable with no
// Supabase and no network, and so this file has nothing in it worth a unit test
// beyond "did the query name the right columns".
//
// Reads and writes both go through the service client. The table carries no
// anon or authenticated grant and no RLS policy (see the migration header): its
// only reader is /api/dams/[damId] assembling a snapshot server-side, and its
// only writer is /api/cron/sync-dam-history.

import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import {
  HISTORY_RETENTION_DAYS,
  PATTERN_PAST_DAYS,
  type DamHistoryMetric,
  type HourBucket,
  type StoredHour,
} from '@/lib/data/dam-history';

const TABLE = 'dam_metric_readings';

/** PostgREST caps a response at 1,000 rows; one dam-week is 8 × 24 × 2 = 384. */
const PATTERN_ROW_LIMIT = 1_000;

/** Upsert batch size, matching the convention in sync-gauge-latest. */
const UPSERT_CHUNK = 1_000;

interface Row {
  dam_id: string;
  metric: string;
  observed_hour: string;
  value_cfs: number;
  sample_count: number;
}

/**
 * Every stored hour for one dam inside the pattern window.
 *
 * Returns an empty array — never throws — when the table is unreachable. The
 * pattern strip is the last section on the page and the least load-bearing; a
 * database blip must not take the current-generation hero down with it.
 */
export async function readPatternHours(
  damId: string,
  options?: { past?: number; now?: number }
): Promise<StoredHour[]> {
  const past = options?.past ?? PATTERN_PAST_DAYS;
  const now = options?.now ?? Date.now();

  // One extra day at each end of the UTC window: a Central calendar day spans
  // UTC hours on both sides of its own date, so a query cut to exactly the day
  // keys would clip the first and last few bars of the strip.
  const from = new Date(now - (past + 1) * 86_400_000).toISOString();
  const to = new Date(now + 86_400_000).toISOString();

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select('metric, observed_hour, value_cfs')
      .eq('dam_id', damId)
      .gte('observed_hour', from)
      .lte('observed_hour', to)
      .order('observed_hour', { ascending: true })
      .limit(PATTERN_ROW_LIMIT);

    if (error) {
      logger.warn('dam-history: pattern read failed', { damId, error: error.message });
      return [];
    }

    return (data ?? []).map((r) => ({
      metric: r.metric as DamHistoryMetric,
      observedHour: r.observed_hour as string,
      valueCfs: Number(r.value_cfs),
    }));
  } catch (err) {
    logger.warn('dam-history: pattern read threw', {
      damId,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Write one dam's hourly buckets for one metric.
 *
 * Upsert on the composite primary key, which is what makes the cron's
 * overlapping re-read idempotent rather than duplicative — see
 * SYNC_LOOKBACK_HOURS.
 */
export async function writeHours(
  supabase: ReturnType<typeof createAdminClient>,
  damId: string,
  metric: DamHistoryMetric,
  buckets: HourBucket[]
): Promise<number> {
  if (buckets.length === 0) return 0;

  const rows: Row[] = buckets.map((b) => ({
    dam_id: damId,
    metric,
    observed_hour: b.observedHour,
    value_cfs: b.valueCfs,
    sample_count: b.sampleCount,
  }));

  let written = 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase
      .from(TABLE)
      .upsert(chunk, { onConflict: 'dam_id,metric,observed_hour' });
    if (error) {
      logger.warn('dam-history: upsert failed', { damId, metric, error: error.message });
      continue;
    }
    written += chunk.length;
  }
  return written;
}

/**
 * Drop everything past the retention horizon.
 *
 * Run in the same pass that writes, so retention cannot drift into a job of its
 * own that nobody notices has stopped.
 */
export async function pruneHistory(
  supabase: ReturnType<typeof createAdminClient>,
  now = Date.now()
): Promise<void> {
  const cutoff = new Date(now - HISTORY_RETENTION_DAYS * 86_400_000).toISOString();
  const { error } = await supabase.from(TABLE).delete().lt('observed_hour', cutoff);
  if (error) logger.warn('dam-history: prune failed', { error: error.message });
}
