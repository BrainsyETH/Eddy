// src/app/api/cron/sync-nps/route.ts
// POST /api/cron/sync-nps - Weekly NPS data sync
// Called by Vercel Cron weekly (Sundays at 3am CT)

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncNPSData } from '@/lib/nps/sync';

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

    // Run full NPS sync
    const result = await syncNPSData(supabase);

    const durationMs = Date.now() - startTime;

    // Log the sync run
    await supabase.from('nps_sync_log').insert({
      sync_type: 'full',
      park_code: 'ozar',
      campgrounds_synced: result.campgroundsSynced,
      places_synced: result.placesSynced,
      campgrounds_matched: result.campgroundsMatched,
      pois_created: result.poisCreated,
      errors: result.errors,
      error_details: result.errorDetails.length > 0
        ? result.errorDetails.join('\n')
        : null,
      duration_ms: durationMs,
    });

    console.log(
      `NPS sync complete: ${result.campgroundsSynced} campgrounds, ` +
      `${result.placesSynced} places, ${result.campgroundsMatched} matched, ` +
      `${result.poisCreated} POIs created, ${result.errors} errors ` +
      `(${durationMs}ms)`
    );

    return NextResponse.json({
      message: 'NPS sync complete',
      ...result,
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
