import { withJobRun } from '@/lib/admin/dashboard/job-run';
// Hourly rotating batches over the complete station catalog.
import { percentileBatch, PERCENTILE_SHARDS } from '@shared/percentile-shards';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasValidMachineBearer } from '@/lib/security/machine-auth';
import {
  PARAM_DISCHARGE,
  assertSnapshotParameter,
  snapshotSite,
} from '@/lib/usgs/percentile-snapshot';

export const dynamic = 'force-dynamic';
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

  let parameterCode;
  try {
    parameterCode = assertSnapshotParameter(
      request.nextUrl.searchParams.get('parameter') ?? PARAM_DISCHARGE
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  const supabase = createAdminClient();
  const startedAt = Date.now();

  const allSiteIds: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('gauge_stations')
      .select('usgs_site_id').not('usgs_site_id', 'is', null)
      .order('usgs_site_id').range(from, from + 999);
    if (error) return NextResponse.json({ error: 'Could not list gauge stations' }, { status: 500 });
    allSiteIds.push(...(data ?? []).map(row => row.usgs_site_id));
    if (!data || data.length < 1000) break;
  }
  const hour = Math.floor(startedAt / 3_600_000);
  const siteIds = percentileBatch(allSiteIds, hour);

  let snapshotted = 0;
  let withoutStatistics = 0;
  let failed = 0;

  for (const [index, siteId] of siteIds.entries()) {
    try {
      const written = await snapshotSite(supabase, siteId, parameterCode);
      if (written) snapshotted++;
      else withoutStatistics++;
    } catch (err) {
      failed++;
      console.warn(`[SnapshotPercentiles] ${siteId} failed:`, err);
    }

    // Leave headroom; the next cycle rotates the starting point.
    if (Date.now() - startedAt > 270_000) {
      console.warn(`[SnapshotPercentiles] Stopping early at ${index + 1}/${siteIds.length}`);
      break;
    }
    if (index < siteIds.length - 1) await sleep(DELAY_MS);
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    `[SnapshotPercentiles] [${parameterCode}] ${snapshotted} snapshotted, ${withoutStatistics} without statistics, ` +
    `${failed} failed of ${siteIds.length} site(s) (${durationMs}ms)`
  );

  return NextResponse.json({
    ok: true,
    parameter: parameterCode,
    sites: siteIds.length,
    catalogSize: allSiteIds.length,
    shard: hour % PERCENTILE_SHARDS,
    shardCount: PERCENTILE_SHARDS,
    complete: snapshotted + withoutStatistics + failed === siteIds.length,
    snapshotted,
    withoutStatistics,
    failed,
    durationMs,
  });
}

async function handleGET(request: NextRequest) {
  return run(request);
}

async function handlePOST(request: NextRequest) {
  return run(request);
}

export const GET = withJobRun("snapshot-percentiles", handleGET);

export const POST = withJobRun("snapshot-percentiles", handlePOST);
