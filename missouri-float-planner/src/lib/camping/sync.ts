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
//
// ── Why recreation.gov has TWO cron slots ─────────────────────────────────
//
// Its endpoint is month-locked, so a window straddling month-end costs two
// payloads per facility instead of one. A two-night weekend did that about one
// week in five; a fourteen-night horizon does it on roughly thirteen days in
// thirty. Fifteen unique federal ids × two months × ten seconds is 300s, past
// both the budget below and Vercel's own ceiling.
//
// The cursor already handles it — a truncated run resumes where it stopped —
// but at forty percent of nights the tail would routinely wait a full day, and
// read.ts stops serving a row once it is stale. So vercel.json runs this source
// twice each morning, forty minutes apart. The second slot needs no code: the
// `last_synced_at` ordering means it picks up exactly what the first did not
// reach, and finds nothing to do on the days one pass was enough.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createLimiter, type Limiter } from './limiter';
import { resolveHorizon, type CampingWindow } from './window';
import type { CampingSource, FacilityLink, FetchResult } from './types';
import * as recgov from './recgov';
import type { MonthCache } from './recgov';
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
    cache?: MonthCache,
  ) => Promise<FetchResult>;
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
  sitesWritten: number;
  requestsMade: number;
  durationMs: number;
  errors: string[];
}

/** Postgres takes a large upsert happily; a 20k-row one is still rude. */
const WRITE_CHUNK = 500;

async function upsertChunked<T>(
  supabase: SupabaseClient,
  table: string,
  rows: T[],
  onConflict: string,
): Promise<void> {
  for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
    const { error } = await supabase
      .from(table)
      .upsert(rows.slice(i, i + WRITE_CHUNK), { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

/**
 * Persist one facility's individual sites and their nights.
 *
 * Two round trips, not two per site: the catalog goes up first so every row has
 * an id, then the ids come back in one read and the calendar follows. A site
 * Eddy has seen before keeps its uuid, so nothing downstream has to care that
 * the catalog is rewritten nightly.
 */
async function writeSites(
  supabase: SupabaseClient,
  facilityId: string,
  result: FetchResult,
  fetchedAt: string,
): Promise<number> {
  if (result.sites.length === 0) return 0;

  await upsertChunked(
    supabase,
    'campsite_sites',
    result.sites.map((site) => ({
      facility_id: facilityId,
      source_site_id: site.sourceSiteId,
      name: site.name,
      loop: site.loop,
      site_type: site.siteType,
      max_occupancy: site.maxOccupancy,
      last_seen_at: fetchedAt,
    })),
    'facility_id,source_site_id',
  );

  const { data, error } = await supabase
    .from('campsite_sites')
    .select('id, source_site_id')
    .eq('facility_id', facilityId);

  if (error) throw new Error(`campsite_sites read-back: ${error.message}`);

  const idOf = new Map<string, string>();
  for (const row of (data ?? []) as { id: string; source_site_id: string }[]) {
    idOf.set(row.source_site_id, row.id);
  }

  const rows = result.siteNights
    .filter((night) => idOf.has(night.sourceSiteId))
    .map((night) => ({
      site_id: idOf.get(night.sourceSiteId)!,
      date: night.date,
      status: night.status,
      fetched_at: fetchedAt,
    }));

  await upsertChunked(supabase, 'campsite_site_availability', rows, 'site_id,date');
  return rows.length;
}

interface FacilityRow {
  id: string;
  source: string;
  source_facility_id: string;
  source_loop: string | null;
  display_name: string;
  kind: string;
}

function toLink(row: FacilityRow): FacilityLink {
  return {
    id: row.id,
    source: row.source as CampingSource,
    sourceFacilityId: row.source_facility_id,
    sourceLoop: row.source_loop,
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
  const window = resolveHorizon(options.now);

  const limiter = createLimiter({
    name: source,
    minSpacingMs: config.minSpacingMs,
    jitterMs: config.jitterMs,
    maxRequests: config.maxRequests,
  });

  const { data, error } = await supabase
    .from('campsite_facilities')
    .select('id, source, source_facility_id, source_loop, display_name, kind')
    .eq('source', source)
    .eq('enabled', true)
    // Least-recently-synced first: this ordering IS the cursor.
    .order('last_synced_at', { ascending: true, nullsFirst: true });

  if (error) throw new Error(`campsite_facilities: ${error.message}`);

  const facilities = (data ?? []) as FacilityRow[];
  // Shared across the whole run: eighteen Ozark campgrounds sit behind three
  // district ids, and without this each loop would re-fetch the same payload.
  const monthCache: MonthCache = new Map();
  const errors: string[] = [];
  let synced = 0;
  let failed = 0;
  let nightsWritten = 0;
  let sitesWritten = 0;
  let index = 0;

  for (const row of facilities) {
    if (Date.now() - startedAt > budget) break;
    index++;

    const facility = toLink(row);
    let result: FetchResult;

    try {
      result = await config.fetchWindow(facility, window, limiter, monthCache);
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

    if (result.nights.length > 0) {
      const fetchedAt = new Date().toISOString();
      const { error: writeError } = await supabase.from('campsite_availability').upsert(
        result.nights.map((night) => ({
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
      nightsWritten += result.nights.length;

      // The site list is an enhancement on top of the count, so it fails on its
      // own terms: a facility whose sites could not be written keeps its
      // aggregate and its cursor stamp rather than being retried forever for
      // the sake of the tab nobody has opened yet.
      try {
        sitesWritten += await writeSites(supabase, facility.id, result, fetchedAt);
      } catch (err) {
        errors.push(
          `${facility.displayName}: sites — ${err instanceof Error ? err.message : String(err)}`,
        );
      }
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
    sitesWritten,
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

  // Per-site nights need their own sweep. The cascade is on the SITE, not on
  // the date, so a facility that keeps its sites keeps every night they ever
  // had — and at ~1,250 sites a fortnight that is the table that would grow.
  const { error: siteError } = await supabase
    .from('campsite_site_availability')
    .delete()
    .lt('date', cutoff);

  if (siteError) throw new Error(`prune sites: ${siteError.message}`);
  return count ?? 0;
}
