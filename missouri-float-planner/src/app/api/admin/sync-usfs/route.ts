// src/app/api/admin/sync-usfs/route.ts
// POST /api/admin/sync-usfs — Trigger USFS/RIDB sync from admin UI
// Supports ?dryRun=true to preview without writing to DB

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncUSFSData } from '@/lib/usfs/sync';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  try {
    const url = new URL(request.url);
    const dryRun = url.searchParams.get('dryRun') === 'true';

    const supabase = createAdminClient();
    const startTime = Date.now();

    const result = await syncUSFSData(supabase, { dryRun });

    const durationMs = Date.now() - startTime;

    // Log non-dry-run syncs
    if (!dryRun) {
      await supabase.from('usfs_sync_log').insert({
        sync_type: 'admin',
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
    }

    return NextResponse.json({
      message: dryRun ? 'USFS dry run complete' : 'USFS sync complete',
      dryRun,
      durationMs,
      ...result,
    });
  } catch (error) {
    console.error('Error in admin USFS sync:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
