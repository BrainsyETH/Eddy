// src/lib/camping/sync.ts
// One nightly pass over every enabled facility, one source at a time.
//
// The pacing constants below are the whole point of this module, so they sit at
// the top where a reviewer trips over them:
//
//   Recreation.gov  10s   because robots.txt says `Crawl-delay: 10` and names
//                         `/api/*`, the exact path we read. The community
//                         tools use 1s; the site asks for ten.
//   UseDirect        2s   no robots.txt at all, so no stated policy — this is
//                         courtesy. Measured latency is ~400ms and nine parks
//                         at 1.5s produced zero errors.
//
// Everything else here exists to keep a bad night from turning into a bad
// neighbour: a ceiling, a breaker, a time budget, and a cursor.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createLimiter, type Limiter } from './limiter';
import { resolveWeekend, type CampingWindow } from './window';
import type { CampingSource, DailyAggregate, FacilityLink } from './types';
import * as recgov from './recgov';
import * as usedirect from './usedirect';

interface SourceConfig {
  minSpacingMs: number;
  jitterMs: number;
  /** Hard ceiling on attempts. Sized ~3x the expected count, not to the inch. */
  maxRequests: number;
  fetchWindow: (
    facility: FacilityLink,
    window: CampingWindow,
    limiter: Limiter,
  ) => Promise<DailyAggregate[]>;
}

const SOURCES: Record<CampingSource, SourceConfig> = {
  recreation_gov: {
    minSpacingMs: 10_000,
    jitterMs: 1_000,
    maxRequests: 60,
    fetchWindow: recgov.fetchWindow,
  },
  mo_state_parks: {
    minSpacingMs: 2_000,
    jitterMs: 500,
    maxRequests: 150,
    fetchWindow: usedirect.fetchWindow,
  },
};

/**
 * Wall-clock budget for one invocation.
 *
 * Vercel kills the function at 300s. Stopping at 240 leaves room for the
 * in-flight request plus the writes, and the cursor means the remainder is
 * picked up next run rather than lost.
 */
const TIME_BUDGET_MS = 240_000;

export interface SyncResult {
  source: CampingSource;
  window: string;
  facilitiesSynced: number;
  facilitiesFailed: number;
  facilitiesRemaining: number;
  nightsWritten: number;
  requestsMade: number;
  durationMs: number;
  errors: string[];
}

interface FacilityRow {
  id: string;
  source: string;
  source_facility_id: string;
  display_name: string;
  kind: string;
}

function toLink(row: FacilityRow): FacilityLink {
  return {
    id: row.id,
    source: row.source as CampingSource,
    sourceFacilityId: row.source_facility_id,
    displayName: row.display_name,
    kind: row.kind as FacilityLink['kind'],
  };
}

/**
 * Refresh one source's availability for the coming weekend.
 *
 * Failures are per-facility and never fatal: a facility that throws keeps its
 * previous rows, because a night-old number beats a blank card. Only the
 * circuit breaker stops the run early, and that is the point of it.
 */
export async function syncSource(
  supabase: SupabaseClient,
  source: CampingSource,
  options: { now?: Date; timeBudgetMs?: number } = {},
): Promise<SyncResult> {
  const startedAt = Date.now();
  const budget = options.timeBudgetMs ?? TIME_BUDGET_MS;
  const config = SOURCES[source];
  const window = resolveWeekend(options.now);

  const limiter = createLimiter({
    name: source,
    minSpacingMs: config.minSpacingMs,
    jitterMs: config.jitterMs,
    maxRequests: config.maxRequests,
  });

  const { data, error } = await supabase
    .from('campsite_facilities')
    .select('id, source, source_facility_id, display_name, kind')
    .eq('source', source)
    .eq('enabled', true)
    // Least-recently-synced first: this ordering IS the cursor.
    .order('last_synced_at', { ascending: true, nullsFirst: true });

  if (error) throw new Error(`campsite_facilities: ${error.message}`);

  const facilities = (data ?? []) as FacilityRow[];
  const errors: string[] = [];
  let synced = 0;
  let failed = 0;
  let nightsWritten = 0;
  let index = 0;

  for (const row of facilities) {
    if (Date.now() - startedAt > budget) break;
    index++;

    const facility = toLink(row);
    let nights: DailyAggregate[];

    try {
      nights = await config.fetchWindow(facility, window, limiter);
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${facility.displayName}: ${message}`);
      // The breaker is already open by the time it throws CircuitOpenError, so
      // every remaining facility would fail identically. Stop and keep the
      // rows we have.
      if (message.includes('circuit open')) break;
      continue;
    }

    if (nights.length > 0) {
      const fetchedAt = new Date().toISOString();
      const { error: writeError } = await supabase.from('campsite_availability').upsert(
        nights.map((night) => ({
          facility_id: facility.id,
          date: night.date,
          sites_open: night.sitesOpen,
          sites_reservable: night.sitesReservable,
          status: night.status,
          fetched_at: fetchedAt,
        })),
        { onConflict: 'facility_id,date' },
      );

      if (writeError) {
        failed++;
        errors.push(`${facility.displayName}: write failed — ${writeError.message}`);
        continue;
      }
      nightsWritten += nights.length;
    }

    // Stamped even when the facility returned nothing. A dead id that never
    // writes rows would otherwise sit at the head of the queue forever and
    // crowd out the facilities that do have something to say.
    await supabase
      .from('campsite_facilities')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', facility.id);

    synced++;
  }

  return {
    source,
    window: window.label,
    facilitiesSynced: synced,
    facilitiesFailed: failed,
    facilitiesRemaining: Math.max(0, facilities.length - index),
    nightsWritten,
    requestsMade: limiter.stats().attempts,
    durationMs: Date.now() - startedAt,
    errors,
  };
}

/**
 * Drop nights that have already happened.
 *
 * Cheap, and it keeps a stale row from ever being served: the read path
 * filters by date anyway, but a table that only grows is a table nobody
 * notices going wrong.
 */
export async function pruneOldNights(supabase: SupabaseClient, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const { error, count } = await supabase
    .from('campsite_availability')
    .delete({ count: 'exact' })
    .lt('date', cutoff);

  if (error) throw new Error(`prune: ${error.message}`);
  return count ?? 0;
}
