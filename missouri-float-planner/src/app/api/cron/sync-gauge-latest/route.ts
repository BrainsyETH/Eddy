// src/app/api/cron/sync-gauge-latest/route.ts
// GET/POST /api/cron/sync-gauge-latest — refresh the national "All Gauges" tier.
//
// Writes ONE row per station into gauge_latest, overwritten in place. It never
// touches gauge_readings: that table is append-only history for the ~46 curated
// stations, and appending 14,000 more hourly would cost ~145M rows and ~40 GB a
// year to store readings nobody grades (00196's header does this arithmetic).
//
// ── Why this is not part of update-gauges ───────────────────────────────────
// /api/cron/update-gauges is 700+ lines of alerting, Eddy prose regeneration,
// flatline detection, condition debounce and outbox publishing, all scoped to
// river-wired stations. NONE of that should ever run for a reference gauge —
// Eddy issues no verdict on an uncurated gauge, so there is nothing to alert
// on and nothing to write prose about. Sharing the route would mean guarding
// every one of those stages with the same `if (curated)`, and the first one
// anybody forgot would push a floatability alert for a creek in Oregon.
//
// ── Why regions, sequentially ───────────────────────────────────────────────
// One national request per parameter is ~12 MB of JSON. Holding both parsed at
// once, plus a Supabase client and an upsert buffer, is a few hundred MB in a
// 1024 MB lambda. Region-at-a-time keeps each parse small and makes a bad
// response cost one region instead of the run.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { US_REGIONS, fetchRegionLatest } from '@/lib/usgs/national-sites';
import { readAllSnapshotStatistics } from '@/lib/usgs/percentile-snapshot';
import { calculateDischargePercentile } from '@/lib/usgs/gauges';
import { tryCronLock, releaseCronLock } from '@/lib/social/cron-lock';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
// A full national pass is ~14 regional round trips against USGS plus the
// upserts. Measured at ~2.5 minutes end to end; 300s is the Pro ceiling and
// leaves room for a slow upstream day. Mirrored in vercel.json's `functions`,
// which is what actually applies it on deploy.
export const maxDuration = 300;

// SCHEDULED AT :20, not :00 (vercel.json). update-gauges runs hourly at :00 and
// again every 15 minutes, and both take the same cron lock table; putting the
// heavy national pass on a different minute keeps them from queueing behind
// each other every hour.

const JOB = 'sync_gauge_latest';
const UPSERT_CHUNK = 1000;

interface LatestRow {
  gauge_station_id: string;
  reading_timestamp: string;
  gauge_height_ft: number | null;
  discharge_cfs: number | null;
  qualifiers: string[];
  flow_percentile: number | null;
  fetched_at: string;
}

/**
 * site id → gauge_stations.id, for every active station.
 *
 * Paged: PostgREST caps at 1,000 rows, and a truncated map would silently make
 * most of the country look like "not a station we know" — which the caller
 * counts as unknown sites rather than treating as an error.
 */
async function loadStationIds(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('gauge_stations')
      .select('id, usgs_site_id, site_id_external, provider')
      .eq('provider', 'usgs')
      .eq('active', true)
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`station lookup failed: ${error.message}`);
    for (const row of data ?? []) {
      const key = row.usgs_site_id ?? row.site_id_external;
      if (key) out.set(key, row.id);
    }
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function runSync(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('CRON_SECRET not configured');
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // 280s stale window: just under maxDuration, so a lambda killed mid-pass
  // frees the lock for the next hourly run rather than wedging the job.
  const locked = await tryCronLock(supabase, JOB, 280);
  if (!locked) {
    return NextResponse.json({ skipped: 'another run holds the lock' });
  }

  const startedAt = Date.now();
  let stationsSeen = 0;
  let written = 0;
  let unknownSites = 0;
  let graded = 0;
  const regionErrors: string[] = [];

  try {
    const [stationIds, stats] = await Promise.all([
      loadStationIds(supabase),
      // One query for the whole day rather than one per site. Empty is fine and
      // expected before the national percentile backfill has run — every gauge
      // simply grades as null, which the client renders as a neutral pin.
      readAllSnapshotStatistics(supabase),
    ]);

    for (const region of US_REGIONS) {
      let readings;
      try {
        readings = await fetchRegionLatest(region.bbox);
      } catch (err) {
        // fetchRegionLatest already swallows per-request failures; this catches
        // anything structural. One region must not end the pass.
        regionErrors.push(region.name);
        logger.error('[sync-gauge-latest] region failed', { region: region.name, err });
        continue;
      }

      const rows: LatestRow[] = [];
      const fetchedAt = new Date().toISOString();

      for (const reading of readings) {
        const stationId = stationIds.get(reading.siteId);
        if (!stationId) {
          // A live site we hold no station row for. Reported, never inserted:
          // station creation belongs to import-usgs-gauges.ts, so a malformed
          // OGC response can never invent rows in gauge_stations.
          unknownSites++;
          continue;
        }
        if (!reading.readingTimestamp) continue;

        let percentile: number | null = null;
        if (reading.dischargeCfs !== null) {
          const siteStats = stats.get(reading.siteId);
          if (siteStats) {
            percentile = calculateDischargePercentile(reading.dischargeCfs, siteStats);
            if (percentile !== null) graded++;
          }
        }

        rows.push({
          gauge_station_id: stationId,
          reading_timestamp: reading.readingTimestamp,
          gauge_height_ft: reading.gaugeHeightFt,
          discharge_cfs: reading.dischargeCfs,
          qualifiers: reading.qualifiers,
          flow_percentile: percentile,
          fetched_at: fetchedAt,
        });
      }

      stationsSeen += readings.length;

      for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
        const chunk = rows.slice(i, i + UPSERT_CHUNK);
        const { error } = await supabase
          .from('gauge_latest')
          .upsert(chunk, { onConflict: 'gauge_station_id' });
        if (error) {
          regionErrors.push(`${region.name} (upsert)`);
          logger.error('[sync-gauge-latest] upsert failed', {
            region: region.name,
            message: error.message,
          });
          break;
        }
        written += chunk.length;
      }
    }
  } catch (err) {
    logger.error('[sync-gauge-latest] pass failed', { err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  } finally {
    await releaseCronLock(supabase, JOB);
  }

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - startedAt,
    stationsSeen,
    written,
    graded,
    unknownSites,
    regionErrors,
  });
}

export async function GET(request: NextRequest) {
  return runSync(request);
}

export async function POST(request: NextRequest) {
  return runSync(request);
}
