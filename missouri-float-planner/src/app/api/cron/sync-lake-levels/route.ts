// src/app/api/cron/sync-lake-levels/route.ts
// GET/POST /api/cron/sync-lake-levels — keep Eddy's own record of each lake's
// pool, so the lake section can say how the level moved over a day and a week.
//
// One reading source per lake, decided by the registry: the controlling dam's
// `poolElevation` series read through the same resolver the dam page uses
// (hourly, CWMS), or Ameren's daily Truman report for the one lake whose
// district publishes nothing. An overlapping re-read is idempotent on the
// table's primary key, which is what repairs a skipped run.
//
// ── Healthy means a RECENT observation, not a successful write ─────────────
// A run that re-writes two-day-old rows and nothing newer has written nothing
// anybody can read as current. Each lake is healthy only when its newest
// observation is younger than its cadence allows: six hours for an hourly
// source, thirty-six for the daily one, matching the public page.
//
// ── Backfill ───────────────────────────────────────────────────────────────
// `?backfillHours=N` (capped at 90 days) widens the CWMS window so the 7-day
// chart is full on the first run rather than a week later. Ameren's report is
// one day per request, so a backfill asks it one day at a time, capped at 14;
// the dated endpoint and parser were verified against eight distinct real
// reports on 2026-11-09 (scripts/ingestion/lakes/2026-11-09/reviewed-pilot/).
// The scheduled handler still needs a recorded production run before rollout.
//
// SCHEDULED AT :40 (vercel.json) — after sync-dam-snapshots at :35 and off
// the :00/:15/:20/:25 slots the gauge and dam-history jobs hold.

import { withJobRun } from '@/lib/admin/dashboard/job-run';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { tryCronLock, releaseCronLock } from '@/lib/social/cron-lock';
import { logger } from '@/lib/logger';
import { fetchTimeseries } from '@/lib/usace/cda';
import { fetchTrumanDaily } from '@/lib/ameren/osage';
import { seriesFor } from '@/lib/data/dams';
import { LAKES, poolDamFor, type LakeEntry } from '@/lib/lakes/registry';
import { writePoolReadings, type PoolReadingWrite } from '@/lib/lakes/store';
import { lakeObservationIsCurrent } from '@/lib/lakes/freshness';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const JOB = 'sync_lake_levels';
/** Two days of hourly pool per read: a missed run or two still leaves no hole. */
const LOOKBACK_HOURS = 48;
const MAX_BACKFILL_HOURS = 90 * 24;
const MAX_DAILY_BACKFILL_DAYS = 14;

interface LakeResult {
  lake: string;
  source: string | null;
  readings: number;
  newestAt: string | null;
  healthy: boolean;
  error?: string;
}

async function readingsFor(lake: LakeEntry, now: Date, backfillHours: number | null): Promise<{ source: string | null; readings: PoolReadingWrite[] }> {
  const dam = poolDamFor(lake);
  if (!dam) return { source: null, readings: [] };

  if (dam.amerenMetrics === 'truman') {
    const days = backfillHours ? Math.min(MAX_DAILY_BACKFILL_DAYS, Math.ceil(backfillHours / 24)) : 1;
    const readings: PoolReadingWrite[] = [];
    for (let d = 0; d < days; d++) {
      const daily = await fetchTrumanDaily(new Date(now.getTime() - d * 86_400_000));
      if (daily) readings.push({ at: new Date(daily.timestamp).toISOString(), elevationFt: daily.poolElevationFt, datum: lake.datum, source: 'Ameren Missouri', daily: true });
    }
    return { source: 'Ameren Missouri', readings };
  }

  if (!dam.office) return { source: null, readings: [] };
  const resolved = await seriesFor(dam, ['poolElevation']);
  const series = resolved.poolElevation;
  if (!series) return { source: 'USACE CWMS', readings: [] };
  const hours = backfillHours ?? LOOKBACK_HOURS;
  const result = await fetchTimeseries(dam.office, series.tsId, 'ft', new Date(now.getTime() - hours * 3_600_000), now, { skipCache: true });
  if (!result) return { source: 'USACE CWMS', readings: [] };
  return {
    source: 'USACE CWMS',
    readings: result.points.map((p) => ({ at: new Date(p.timestamp).toISOString(), elevationFt: p.value, datum: lake.datum, source: 'USACE CWMS', daily: false })),
  };
}

/** Pure so the health rule can be asserted without a network. */
export function lakeHealth(lake: LakeEntry, readings: Array<{ at: string }>, now: number): { newestAt: string | null; healthy: boolean } {
  const newest = readings.map((r) => Date.parse(r.at)).filter(Number.isFinite).sort((a, b) => b - a)[0];
  if (newest === undefined) return { newestAt: null, healthy: false };
  const newestAt = new Date(newest).toISOString();
  return { newestAt, healthy: lakeObservationIsCurrent(newestAt, lake.poolCadence, now) };
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

  const requested = Number(request.nextUrl.searchParams.get('backfillHours'));
  const backfillHours = Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_BACKFILL_HOURS) : null;

  const supabase = createAdminClient();
  const locked = await tryCronLock(supabase, JOB, 110);
  if (!locked) {
    return NextResponse.json({ monitoring_status: 'skipped', skipped: 'another run holds the lock' });
  }

  const startedAt = Date.now();
  const results: LakeResult[] = [];
  try {
    for (const lake of Object.values(LAKES)) {
      try {
        const { source, readings } = await readingsFor(lake, new Date(startedAt), backfillHours);
        const written = await writePoolReadings(supabase, lake.slug, readings);
        results.push({ lake: lake.slug, source, readings: written, ...lakeHealth(lake, readings, startedAt) });
      } catch (error) {
        results.push({ lake: lake.slug, source: null, readings: 0, newestAt: null, healthy: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
  } finally {
    await releaseCronLock(supabase, JOB);
  }

  const unhealthy = results.filter((r) => !r.healthy);
  const status = unhealthy.length === 0 ? 'ok' : unhealthy.length === results.length ? 'error' : 'partial';
  if (status !== 'ok') logger.warn('sync-lake-levels: degraded', { results });
  return NextResponse.json({ ok: status === 'ok', monitoring_status: status, results, backfillHours, durationMs: Date.now() - startedAt });
}

async function handleGET(request: NextRequest) {
  return runSync(request);
}

async function handlePOST(request: NextRequest) {
  return runSync(request);
}

export const GET = withJobRun('sync-lake-levels', handleGET);
export const POST = withJobRun('sync-lake-levels', handlePOST);
