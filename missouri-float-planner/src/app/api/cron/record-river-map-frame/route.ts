// src/app/api/cron/record-river-map-frame/route.ts
// GET/POST /api/cron/record-river-map-frame — capture one national frame.
//
// Reads every in-scope USGS station's gauge_latest row and NOAA's official
// flood status for every NWS forecast point, writes them as one frame to
// national_map_frames, then prunes on the retention schedule in
// src/lib/national-map/frame.ts. The frame route serves the newest row.
//
// SCHEDULED at :12/:27/:42/:57 (vercel.json): seven minutes after each
// sync-gauge-latest pass starts (:05/:20/:35/:50; ~47 s median, measured), so a
// frame captures a finished pass instead of half a country mid-upsert.
//
// NOAA failing is not a failed capture. The frame is written with
// noaaOk=false and no NWS points, which the map draws as "flood status
// unavailable" — never as "no flooding". A failed USGS read IS a failed
// capture: nothing is written, and the previous frame stays newest.

import { NextRequest, NextResponse } from 'next/server';
import { withJobRun } from '@/lib/admin/dashboard/job-run';
import { createAdminClient } from '@/lib/supabase/admin';
import { tryCronLock, releaseCronLock } from '@/lib/social/cron-lock';
import { logger } from '@/lib/logger';
import { buildFrame, captureHour, retentionCutoffs, type NwsInput } from '@/lib/national-map/frame';
import { fetchNoaaFloodStatus } from '@/lib/national-map/noaa-flood';
import {
  crosswalk,
  loadLatestForStations,
  loadNationalStations,
} from '@/lib/national-map/station-source';

export const dynamic = 'force-dynamic';
// ~15 PostgREST pages for stations, ~15 for latest, ~14 NOAA pages, one ~1 MB
// insert. Measured well under a minute; 120 s leaves room for a slow NOAA day.
export const maxDuration = 120;

const JOB = 'record_river_map_frame';

async function run(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('CRON_SECRET not configured');
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const locked = await tryCronLock(supabase, JOB, 110);
  if (!locked) return NextResponse.json({ skipped: 'another run holds the lock' });

  const startedAt = Date.now();
  try {
    const capturedAt = new Date();
    const stations = await loadNationalStations(supabase);
    const latest = await loadLatestForStations(supabase, stations);
    // Same outage rule as NOAA: production holds ~14,000 latest rows. A read
    // that returns a few hundred is a broken read, and recording it would
    // make the next 24-hour comparison claim most of the country vanished.
    if (latest.length < 1000) {
      throw new Error(`gauge_latest returned only ${latest.length} in-scope rows`);
    }

    let nws: NwsInput[] = [];
    let noaaOk = false;
    let observedIngestAt: string | null = null;
    let forecastIngestAt: string | null = null;
    try {
      const noaa = await fetchNoaaFloodStatus();
      nws = noaa.points;
      observedIngestAt = noaa.observedIngestAt;
      forecastIngestAt = noaa.forecastIngestAt;
      noaaOk = true;
    } catch (err) {
      logger.error('[record-river-map-frame] NOAA read failed', { err });
    }

    const frame = buildFrame({
      capturedAt,
      latest,
      nws,
      lidToSite: crosswalk(stations),
      noaaOk,
      noaaObservedIngestAt: observedIngestAt,
      noaaForecastIngestAt: forecastIngestAt,
    });

    // First capture in its UTC hour keeps the hourly flag.
    const hourStart = captureHour(capturedAt);
    const { count: keepers, error: keeperError } = await supabase
      .from('national_map_frames')
      .select('captured_at', { count: 'exact', head: true })
      .eq('hourly', true)
      .gte('captured_at', hourStart);
    if (keeperError) throw new Error(`hourly lookup: ${keeperError.message}`);

    const body = JSON.stringify(frame);
    const { error: insertError } = await supabase.from('national_map_frames').insert({
      captured_at: frame.capturedAt,
      version: frame.v,
      hourly: (keepers ?? 0) === 0,
      gauge_count: frame.g.length,
      nws_count: frame.n.length,
      noaa_ok: noaaOk,
      // Passed as parsed JSON so PostgREST stores it in the json column; the
      // byte size is reported from the serialized text.
      body: frame,
    });
    if (insertError) throw new Error(`insert: ${insertError.message}`);

    const cut = retentionCutoffs(capturedAt);
    const { error: thinError } = await supabase
      .from('national_map_frames')
      .delete()
      .lt('captured_at', cut.thinBefore)
      .eq('hourly', false);
    const { error: dropError } = await supabase
      .from('national_map_frames')
      .delete()
      .lt('captured_at', cut.deleteBefore);
    if (thinError || dropError) {
      // Retention failing is an operational problem, not a bad capture.
      logger.error('[record-river-map-frame] prune failed', {
        thin: thinError?.message,
        drop: dropError?.message,
      });
    }

    return NextResponse.json({
      ok: true,
      capturedAt: frame.capturedAt,
      durationMs: Date.now() - startedAt,
      stations: stations.length,
      gauges: frame.g.length,
      nws: frame.n.length,
      nwsMatched: frame.n.filter((r) => r[10] !== null).length,
      noaaOk,
      bytes: body.length,
      pruneOk: !thinError && !dropError,
    });
  } catch (err) {
    logger.error('[record-river-map-frame] capture failed', { err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  } finally {
    await releaseCronLock(supabase, JOB);
  }
}

async function handleGET(request: NextRequest) {
  return run(request);
}

async function handlePOST(request: NextRequest) {
  return run(request);
}

export const GET = withJobRun('record-river-map-frame', handleGET);
export const POST = withJobRun('record-river-map-frame', handlePOST);
