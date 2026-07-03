// src/app/api/cron/sync-nps/route.ts
// POST /api/cron/sync-nps - Weekly NPS data sync
// Called by Vercel Cron weekly (Sundays at 3am CT)

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncNPSData } from '@/lib/nps/sync';
import { getActiveParkCodes } from '@/lib/rivers/context';

// Force dynamic rendering (cron endpoint)
export const dynamic = 'force-dynamic';

async function runSync(request: NextRequest) {
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

    // Run full NPS sync for every park unit that manages an active river
    // (rivers.park_code — e.g. 'ozar' for Current/Jacks Fork).
    const parkCodesFromDb = await getActiveParkCodes();
    const parkCodes = parkCodesFromDb.length > 0 ? parkCodesFromDb : ['ozar'];
    const result = await syncNPSData(supabase, parkCodes);

    // Link NPS campgrounds to Jacks Fork access points (e.g. Blue Spring)
    // so "NPS Campground Info" appears without running a separate SQL script.
    let jacksForkLinksUpdated = 0;
    try {
      const { data: count, error } = await supabase.rpc('link_jacks_fork_nps_campgrounds');
      if (!error && typeof count === 'number') jacksForkLinksUpdated = count;
    } catch {
      // RPC may not exist in older DBs; non-fatal
    }

    const durationMs = Date.now() - startTime;

    // Log the sync run
    await supabase.from('nps_sync_log').insert({
      sync_type: 'full',
      park_code: parkCodes.join(','),
      campgrounds_synced: result.campgroundsSynced,
      campgrounds_matched: result.campgroundsMatched,
      places_synced: result.placesSynced,
      pois_created: result.poisCreated,
      errors: result.errors,
      error_details: result.errorDetails.length > 0
        ? result.errorDetails.join('\n')
        : null,
      duration_ms: durationMs,
    });

    console.log(
      `NPS sync complete: ${result.campgroundsSynced} campgrounds, ` +
      `${result.campgroundsMatched} matched to access points, ` +
      `${result.placesSynced} places, ` +
      `${result.poisCreated} POIs created, ${result.errors} errors ` +
      `(${durationMs}ms)`
    );

    return NextResponse.json({
      message: 'NPS sync complete',
      ...result,
      jacksForkLinksUpdated,
      durationMs,
    });
  } catch (error) {
    console.error('Error in NPS sync cron:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Vercel Cron invokes routes via GET; POST kept for manual triggering.
export async function GET(request: NextRequest) {
  return runSync(request);
}

export async function POST(request: NextRequest) {
  return runSync(request);
}
