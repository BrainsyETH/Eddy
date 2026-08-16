// src/app/api/cron/sync-dam-history/route.ts
// GET/POST /api/cron/sync-dam-history — keep the hourly record of what each
// powerhouse actually did.
//
// Writes hourly means of turbine discharge and total release into
// dam_metric_readings, one row per dam per metric per hour. That table is the
// past half of the generation pattern strip; the future half comes from SWPA
// and never from here.
//
// ── Why this is a cache fill and not an accumulator ────────────────────────
// CWMS serves roughly a week of hourly Flow-Plant and Flow-Res Out on request,
// so the strip does not have to wait for history to build up: pass
// `?backfillHours=192` once at deploy and it is full the same day. The ordinary
// pass re-reads SYNC_LOOKBACK_HOURS (48) because the primary key makes an
// overlapping re-read idempotent, which is what repairs a failed or skipped run
// instead of leaving a permanent hole nobody notices.
//
// ── Why not part of update-gauges ──────────────────────────────────────────
// That route is 700+ lines of alerting, condition debounce and Eddy prose
// regeneration scoped to river-wired USGS stations. None of it should run for a
// dam: Eddy issues no verdict on a powerhouse. Same argument sync-gauge-latest
// makes for staying separate.
//
// SCHEDULED AT :25 (vercel.json) — update-gauges holds the cron lock table at
// :00 and every 15 minutes, sync-gauge-latest at :20.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { tryCronLock, releaseCronLock } from '@/lib/social/cron-lock';
import { logger } from '@/lib/logger';
import { fetchTimeseries } from '@/lib/usace/cda';
import { USACE_DAMS, type UsaceDam } from '@/lib/flow-providers/usace-registry';
import { seriesFor } from '@/lib/data/dams';
import { bucketHourly, SYNC_LOOKBACK_HOURS, type DamHistoryMetric } from '@/lib/data/dam-history';
import { pruneHistory, writeHours } from '@/lib/data/dam-history-store';

export const dynamic = 'force-dynamic';
// Twenty dams × two series, each one CDA window. Measured well under a minute,
// but a backfill pass pulls eight days per series and CDA is not fast on a bad
// day. Mirrored in vercel.json's `functions`, which is what applies it on deploy.
export const maxDuration = 300;

const JOB = 'sync_dam_history';

/** The two series the pattern strip draws. Nothing else is stored. */
const HISTORY_METRICS: DamHistoryMetric[] = ['generationFlow', 'release'];

/**
 * The most any one pass will ask CWMS for.
 *
 * DELIBERATELY NOT DERIVED FROM HISTORY_RETENTION_DAYS. It was `35 * 24`, which
 * silently meant "the retention window", and when retention grew to two years
 * that expression would have started requesting two years of hourly data from
 * CWMS in a single lambda — a request that upstream will not serve and this
 * function would not survive.
 *
 * This is a bound on what an UPSTREAM FETCH can reasonably return; retention is
 * a bound on what Eddy KEEPS. They are different questions and must not share a
 * constant. Ninety days is comfortably past anything CWMS repairs and still
 * finishes inside maxDuration.
 */
const MAX_BACKFILL_HOURS = 90 * 24;

/** Parallel dams. CDA is the constraint, not us — same ceiling readMetrics uses. */
const DAM_CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** One dam's two series, read and written. Never throws — a bad dam is not a bad run. */
async function syncDam(
  supabase: ReturnType<typeof createAdminClient>,
  dam: UsaceDam,
  lookbackHours: number,
  now: number
): Promise<{ written: number; metrics: number }> {
  let written = 0;
  let metrics = 0;

  try {
    const sources = await seriesFor(dam, HISTORY_METRICS);

    for (const metric of HISTORY_METRICS) {
      const source = sources[metric];
      if (!source) continue;

      // A daily mean is not an hourly observation and must never become one:
      // averaging a day into 24 identical bars would draw a flat week at every
      // St. Louis dam and call it a generation pattern.
      if (source.dailyMean) continue;

      const end = new Date(now);
      const begin = new Date(now - lookbackHours * 3_600_000);
      // skipCache: this is the writer of record. Serving it a fetch-cached
      // window would store the same hours over and over and never advance.
      const series = await fetchTimeseries(dam.office ?? '', source.tsId, source.unit, begin, end, {
        skipCache: true,
      });
      if (!series || series.points.length === 0) continue;

      metrics += 1;
      // The most recent hour is still filling — its mean would be built from
      // whatever fraction of samples has arrived, then frozen by the upsert
      // only to be corrected on the next pass anyway. Drop it and let the next
      // run write it whole.
      const currentHour = Math.floor(now / 3_600_000) * 3_600_000;
      const buckets = bucketHourly(series.points).filter(
        (b) => Date.parse(b.observedHour) < currentHour
      );
      written += await writeHours(supabase, dam.id, metric, buckets);
    }
  } catch (err) {
    logger.warn('sync-dam-history: dam failed', {
      damId: dam.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { written, metrics };
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
  const lookbackHours =
    Number.isFinite(requested) && requested > 0
      ? Math.min(requested, MAX_BACKFILL_HOURS)
      : SYNC_LOOKBACK_HOURS;

  const supabase = createAdminClient();

  const locked = await tryCronLock(supabase, JOB, 280);
  if (!locked) {
    return NextResponse.json({ skipped: 'another run holds the lock' });
  }

  const startedAt = Date.now();
  let written = 0;
  let metricsSeen = 0;

  try {
    // Only projects that can report turbine flow at all. A flood-control dam
    // has no generation pattern, and storing its release alone would build a
    // strip whose top half is permanently empty.
    //
    // Two shapes qualify: an explicit generationFlow series (SWL, LRN), or a
    // SWPA column plus a resolvable location (the Tulsa projects, whose
    // turbine series resolve at request time). The old test was swpaCode
    // alone plus fetchability, which was the same set until the Nashville
    // dams — turbines, no SWPA column — would have been silently skipped.
    const dams = Object.values(USACE_DAMS).filter(
      (d) => d.office && (d.series.generationFlow || (d.swpaCode && d.cdaLocation))
    );

    const results = await mapWithConcurrency(dams, DAM_CONCURRENCY, (dam) =>
      syncDam(supabase, dam, lookbackHours, startedAt)
    );
    for (const r of results) {
      written += r.written;
      metricsSeen += r.metrics;
    }

    await pruneHistory(supabase, startedAt);
  } finally {
    await releaseCronLock(supabase, JOB);
  }

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - startedAt,
    lookbackHours,
    metricsSeen,
    written,
  });
}

export async function GET(request: NextRequest) {
  return runSync(request);
}

export async function POST(request: NextRequest) {
  return runSync(request);
}
