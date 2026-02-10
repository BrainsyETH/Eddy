// src/app/api/cron/sync-usfs/route.ts
// POST /api/cron/sync-usfs - Weekly USFS/RIDB data sync
// Fetches campgrounds and recreation facilities from Recreation.gov
// near Missouri rivers and syncs to access_points table.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncUSFSData } from '@/lib/usfs/sync';

// Force dynamic rendering (cron endpoint)
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error('CRON_SECRET not configured');
      return NextResponse.json(
        { error: 'Cron secret not configured' },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const supabase = createAdminClient();
    const startTime = Date.now();

    // Run full USFS sync
    const result = await syncUSFSData(supabase);

    const durationMs = Date.now() - startTime;

    // Log the sync run
    await supabase.from('usfs_sync_log').insert({
      sync_type: 'full',
      facilities_fetched: result.facilitiesFetched,
      facilities_filtered: result.facilitiesFiltered,
      campgrounds_synced: result.campgroundsSynced,
      campgrounds_matched: result.campgroundsMatched,
      access_points_created: result.accessPointsCreated,
      access_points_updated: result.accessPointsUpdated,
      errors: result.errors,
      error_details: result.errorDetails.length > 0
        ? result.errorDetails.join('\n')
        : null,
      duration_ms: durationMs,
    });

    console.log(
      `USFS sync complete: ${result.facilitiesFetched} fetched, ` +
      `${result.facilitiesFiltered} USFS-filtered, ` +
      `${result.campgroundsSynced} campgrounds synced, ` +
      `${result.campgroundsMatched} matched to existing, ` +
      `${result.accessPointsCreated} new access points, ` +
      `${result.errors} errors (${durationMs}ms)`
    );

    return NextResponse.json({
      message: 'USFS sync complete',
      ...result,
      durationMs,
    });
  } catch (error) {
    console.error('Error in USFS sync cron:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
