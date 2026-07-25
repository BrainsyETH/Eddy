// src/app/api/cron/snapshot-percentiles/route.ts
// GET/POST /api/cron/snapshot-percentiles — refresh the USGS percentile snapshot.
//
// Runs monthly. The underlying statistics describe decades of record and
// barely move year to year, so this is not a freshness job — it is insurance.
// The USGS legacy statistics service has no modern OGC equivalent and is
// scheduled for decommission in early 2027 (degradation possible sooner);
// keeping a local copy current means percentile framing survives the shutdown.
// See src/lib/usgs/percentile-snapshot.ts and docs/OBSERVABILITY_AND_UPGRADES.md.
//
// Sites with too short a record simply have no published statistics — that is
// normal and counted separately from real failures.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasValidMachineBearer } from '@/lib/security/machine-auth';
import { snapshotSite } from '@/lib/usgs/percentile-snapshot';

export const dynamic = 'force-dynamic';
// ~250 curated sites at 400ms apart plus request time; Pro allows 300s.
export const maxDuration = 300;

const DELAY_MS = 400;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function run(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[SnapshotPercentiles] CRON_SECRET not configured');
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 });
  }
  if (!hasValidMachineBearer(request.headers.get('authorization'), cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const startedAt = Date.now();

  const { data, error } = await supabase
    .from('gauge_stations')
    .select('usgs_site_id')
    .not('usgs_site_id', 'is', null);

  if (error) {
    console.error('[SnapshotPercentiles] Could not list gauge stations:', error);
    return NextResponse.json({ error: 'Could not list gauge stations' }, { status: 500 });
  }

  const siteIds = [...new Set((data ?? []).map((r: { usgs_site_id: string }) => r.usgs_site_id))];

  let snapshotted = 0;
  let withoutStatistics = 0;
  let failed = 0;

  for (const [index, siteId] of siteIds.entries()) {
    try {
      const written = await snapshotSite(supabase, siteId);
      if (written) snapshotted++;
      else withoutStatistics++;
    } catch (err) {
      failed++;
      console.warn(`[SnapshotPercentiles] ${siteId} failed:`, err);
    }

    // Leave headroom rather than getting killed mid-run; the next monthly
    // pass picks up whatever we didn't reach, and rows are upserted so
    // partial progress is never lost.
    if (Date.now() - startedAt > 270_000) {
      console.warn(`[SnapshotPercentiles] Stopping early at ${index + 1}/${siteIds.length}`);
      break;
    }
    if (index < siteIds.length - 1) await sleep(DELAY_MS);
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    `[SnapshotPercentiles] ${snapshotted} snapshotted, ${withoutStatistics} without statistics, ` +
    `${failed} failed of ${siteIds.length} site(s) (${durationMs}ms)`
  );

  return NextResponse.json({
    ok: true,
    sites: siteIds.length,
    snapshotted,
    withoutStatistics,
    failed,
    durationMs,
  });
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
