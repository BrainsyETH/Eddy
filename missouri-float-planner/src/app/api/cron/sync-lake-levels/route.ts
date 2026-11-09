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

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const JOB = 'sync_lake_levels';
/** Two days of hourly pool per read: a missed run or two still leaves no hole. */
const LOOKBACK_HOURS = 48;

interface LakeResult {
  lake: string;
  source: string | null;
  readings: number;
  error?: string;
}

async function readingsFor(lake: LakeEntry, now: Date): Promise<{ source: string | null; readings: PoolReadingWrite[] }> {
  const dam = poolDamFor(lake);
  if (!dam) return { source: null, readings: [] };

  if (dam.amerenMetrics === 'truman') {
    const daily = await fetchTrumanDaily(now);
    if (!daily) return { source: 'Ameren Missouri', readings: [] };
    return {
      source: 'Ameren Missouri',
      readings: [{ at: new Date(daily.timestamp).toISOString(), elevationFt: daily.poolElevationFt, datum: lake.datum, source: 'Ameren Missouri', daily: true }],
    };
  }

  if (!dam.office) return { source: null, readings: [] };
  const resolved = await seriesFor(dam, ['poolElevation']);
  const series = resolved.poolElevation;
  if (!series) return { source: 'USACE CWMS', readings: [] };
  const result = await fetchTimeseries(dam.office, series.tsId, 'ft', new Date(now.getTime() - LOOKBACK_HOURS * 3_600_000), now, { skipCache: true });
  if (!result) return { source: 'USACE CWMS', readings: [] };
  return {
    source: 'USACE CWMS',
    readings: result.points.map((p) => ({ at: new Date(p.timestamp).toISOString(), elevationFt: p.value, datum: lake.datum, source: 'USACE CWMS', daily: false })),
  };
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
  const locked = await tryCronLock(supabase, JOB, 110);
  if (!locked) {
    return NextResponse.json({ monitoring_status: 'skipped', skipped: 'another run holds the lock' });
  }

  const startedAt = Date.now();
  const results: LakeResult[] = [];
  try {
    for (const lake of Object.values(LAKES)) {
      try {
        const { source, readings } = await readingsFor(lake, new Date(startedAt));
        const written = await writePoolReadings(supabase, lake.slug, readings);
        results.push({ lake: lake.slug, source, readings: written });
      } catch (error) {
        results.push({ lake: lake.slug, source: null, readings: 0, error: error instanceof Error ? error.message : String(error) });
      }
    }
  } finally {
    await releaseCronLock(supabase, JOB);
  }

  const failed = results.filter((r) => r.error || r.readings === 0);
  const status = failed.length === 0 ? 'ok' : failed.length === results.length ? 'error' : 'partial';
  if (status !== 'ok') logger.warn('sync-lake-levels: degraded', { results });
  return NextResponse.json({ ok: status === 'ok', monitoring_status: status, results, durationMs: Date.now() - startedAt });
}

async function handleGET(request: NextRequest) {
  return runSync(request);
}

async function handlePOST(request: NextRequest) {
  return runSync(request);
}

export const GET = withJobRun('sync-lake-levels', handleGET);
export const POST = withJobRun('sync-lake-levels', handlePOST);
