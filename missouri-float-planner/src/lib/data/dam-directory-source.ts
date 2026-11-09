// Where /dams gets its readings: the stored dam snapshots, read narrowly, with
// a deadline and a short, bounded cache.
//
// ── Why not readStoredSnapshots ───────────────────────────────────────────
// That reads every stored payload whole, about 160 KB, of which the observed
// pattern alone is about 96 KB (measured 2026-11-09); the directory strips it
// before rendering anyway. This selects only `metrics` and `schedule` and
// rebuilds the rest from the registry through buildSnapshot, which is what
// wrote the stored payload in the first place, so the fields cannot drift.
//
// ── Why a deadline ─────────────────────────────────────────────────────────
// The page renders per request (connection()), so a slow database used to
// stall it with nothing to show. Past DIRECTORY_READ_TIMEOUT_MS the read is
// abandoned and the page renders the registry fallback: every dam listed and
// linked, no readings, nothing invented.
//
// ── Why the cache is a module memo and not unstable_cache ─────────────────
// unstable_cache serves stale entries with no upper age, the reason the dam
// detail page left it (see dam-page-snapshot.ts). This memo keeps raw rows for
// at most DIRECTORY_ROWS_TTL_MS after they were read, per server instance, so
// its bound holds by construction. Only the database read is shared: the page
// still renders on the request's clock, and each request re-checks row
// freshness (isFresh) and re-bands staleness (refreshStaleness) on that clock,
// so a cached row can never carry yesterday's "today".

import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { buildSnapshot, refreshStaleness } from '@/lib/data/dams';
import { isFresh } from '@/lib/data/dam-snapshot-store';
import { getUsaceDam, type UsaceMetric } from '@/lib/flow-providers/usace-registry';
import type { DamMetricValue, DamScheduleDay, DamSnapshot } from '@shared/dam-types';

/** How long one database read serves later requests on the same instance. */
export const DIRECTORY_ROWS_TTL_MS = 60_000;
/** How long the page waits for the stored readings before rendering without them. */
export const DIRECTORY_READ_TIMEOUT_MS = 2_500;

/** One stored snapshot, as narrowly as the directory reads it. */
export interface DirectoryRow {
  dam_id: string;
  built_at: string;
  metrics: unknown;
  schedule: unknown;
}

/** Null means the read failed and must not be cached. */
export type DirectoryRowFetcher = (signal: AbortSignal) => Promise<DirectoryRow[] | null>;

async function fetchDirectoryRowsFromDb(signal: AbortSignal): Promise<DirectoryRow[] | null> {
  try {
    const { data, error } = await createAdminClient(signal)
      .from('dam_snapshots')
      .select('dam_id, built_at, metrics:payload->metrics, schedule:payload->schedule');
    if (error) {
      logger.warn('dam-directory: stored readings unavailable', { error: error.message });
      return null;
    }
    return (data ?? []) as DirectoryRow[];
  } catch (err) {
    logger.warn('dam-directory: stored readings read threw', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * A reader that shares one database read across requests for up to `ttlMs`,
 * joins a read already in flight, never caches a failure, and gives up after
 * `timeoutMs` (answering no rows) even if the fetcher ignores its signal.
 */
export function createDirectoryRowReader(
  fetchRows: DirectoryRowFetcher,
  options: { ttlMs?: number; timeoutMs?: number; clock?: () => number } = {},
): () => Promise<DirectoryRow[]> {
  const ttlMs = options.ttlMs ?? DIRECTORY_ROWS_TTL_MS;
  const timeoutMs = options.timeoutMs ?? DIRECTORY_READ_TIMEOUT_MS;
  const clock = options.clock ?? Date.now;
  let cached: { rows: DirectoryRow[]; readAt: number } | null = null;
  let pending: Promise<DirectoryRow[] | null> | null = null;

  return async function readDirectoryRows(): Promise<DirectoryRow[]> {
    if (cached && clock() - cached.readAt < ttlMs) return cached.rows;

    if (!pending) {
      const read = fetchRows(AbortSignal.timeout(timeoutMs))
        .then((rows) => {
          if (rows) cached = { rows, readAt: clock() };
          return rows;
        })
        .catch(() => null);
      pending = read;
      void read.finally(() => {
        if (pending === read) pending = null;
      });
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    try {
      return (await Promise.race([pending, deadline])) ?? [];
    } finally {
      clearTimeout(timer);
    }
  };
}

/** The production reader: one shared memo per server instance. */
export const readDirectoryRows = createDirectoryRowReader(fetchDirectoryRowsFromDb);

/**
 * Stored rows as the snapshots the directory renders, on the request's clock.
 *
 * Rows past the stored-snapshot freshness bound, rows for dams the registry no
 * longer carries, and duplicate rows are dropped. Each kept row is rebuilt from
 * the registry with its own metrics and schedule, then re-banded against `now`.
 * Missing dams are filled in by the caller's catalogue, never invented here.
 */
export function directorySnapshotsFromRows(rows: DirectoryRow[], now: number): DamSnapshot[] {
  const seen = new Set<string>();
  const out: DamSnapshot[] = [];
  for (const row of rows) {
    if (!row?.dam_id || seen.has(row.dam_id) || !isFresh(row.built_at, now)) continue;
    const dam = getUsaceDam(row.dam_id);
    if (!dam) continue;
    seen.add(row.dam_id);
    const metrics =
      row.metrics && typeof row.metrics === 'object' && !Array.isArray(row.metrics)
        ? (row.metrics as Partial<Record<UsaceMetric, DamMetricValue>>)
        : {};
    const schedule = Array.isArray(row.schedule) ? (row.schedule as DamScheduleDay[]) : [];
    out.push(refreshStaleness(buildSnapshot(dam, metrics, schedule), now));
  }
  return out;
}
