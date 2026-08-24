// src/app/api/cron/snapshot-percentiles/route.ts
// GET/POST /api/cron/snapshot-percentiles — refresh the USGS percentile snapshot.
//
// Runs monthly. The underlying statistics describe decades of record and
// barely move year to year, so this is not a freshness job — it is the local
// copy every read falls back to, and the ONLY source for the ~14,000 national
// gauges no cron polls live.
//
// The source is now the USGS Statistics API (src/lib/flow-providers/
// usgs-statistics.ts), not the decommissioned legacy statistics service. This
// header used to say percentiles had no modern equivalent; they do.
// See src/lib/usgs/percentile-snapshot.ts and docs/OBSERVABILITY_AND_UPGRADES.md.
//
// Sites with too short a record simply have no published statistics — that is
// normal and counted separately from real failures.
//
// ONE PARAMETER PER RUN. `?parameter=00060` (default) or `?parameter=00065`
// selects which ladder a pass refreshes. Separate staggered schedules rather
// than one pass over both, and that is required, not stylistic: a single pass
// cannot finish even one parameter inside maxDuration (see the ordering note
// below), so interleaving two would halve the coverage of each. Stage rows
// land in the table but feed no user-facing band until the publication policy
// in percentile-snapshot.ts says otherwise.

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

  // ORDER MATTERS since 00196, because the list no longer fits the budget.
  //
  // This used to be ~290 stations and a pass covered all of them. It is now
  // ~14,300, and at DELAY_MS apart a run reaches roughly 600 before the 270s
  // guard stops it. Unordered, that would be an arbitrary 600 every month —
  // and the sites Eddy actually grades against could go indefinitely without a
  // refresh while the run burned its budget on creeks nobody has opened.
  //
  // Curated first, then biggest watershed first: the rivers people float are
  // large, and the long tail of headwater gauges genuinely does not need a
  // monthly refresh of statistics that describe decades. A full national
  // backfill is a script (scripts/snapshot-usgs-percentiles.ts), not this.
  const { data, error } = await supabase
    .from('gauge_stations')
    .select('usgs_site_id, curated, drainage_area_sqmi')
    .not('usgs_site_id', 'is', null)
    .order('curated', { ascending: false })
    .order('drainage_area_sqmi', { ascending: false, nullsFirst: false });

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
      const written = await snapshotSite(supabase, siteId, parameterCode);
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
    `[SnapshotPercentiles] [${parameterCode}] ${snapshotted} snapshotted, ${withoutStatistics} without statistics, ` +
    `${failed} failed of ${siteIds.length} site(s) (${durationMs}ms)`
  );

  return NextResponse.json({
    ok: true,
    parameter: parameterCode,
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
