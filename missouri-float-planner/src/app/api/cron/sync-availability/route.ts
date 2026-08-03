// src/app/api/cron/sync-availability/route.ts
// GET/POST /api/cron/sync-availability?source=... — nightly availability refresh.
//
// One source per invocation, so each provider gets its own schedule and its own
// failure domain: a UseDirect outage must not eat the federal sync's time
// budget. The `?source=` shape follows the precedent already in vercel.json
// (`/api/cron/update-gauges?highFrequency=1`).
//
// Scheduled off-peak, away from the morning reservation-release rush on both
// systems — see vercel.json.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { pruneOldNights, syncSource } from '@/lib/camping/sync';
import type { CampingSource } from '@/lib/camping/types';

export const dynamic = 'force-dynamic';

const SOURCES: CampingSource[] = ['recreation_gov', 'mo_state_parks'];

function isSource(value: string | null): value is CampingSource {
  return value !== null && (SOURCES as string[]).includes(value);
}

async function runSync(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error('CRON_SECRET not configured');
      return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 });
    }
    if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requested = request.nextUrl.searchParams.get('source');
    if (!isSource(requested)) {
      return NextResponse.json(
        { error: `source must be one of: ${SOURCES.join(', ')}` },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const result = await syncSource(supabase, requested);

    // Pruning is idempotent and costs one statement; run it on whichever
    // source happens to go first rather than standing up a third cron.
    const pruned = await pruneOldNights(supabase);

    await supabase.from('campsite_sync_log').insert({
      source: result.source,
      facilities_synced: result.facilitiesSynced,
      facilities_failed: result.facilitiesFailed,
      nights_written: result.nightsWritten,
      requests_made: result.requestsMade,
      duration_ms: result.durationMs,
      error_details: result.errors.length > 0 ? result.errors.join('\n') : null,
    });

    console.log(
      `Availability sync [${result.source}] for ${result.window}: ` +
        `${result.facilitiesSynced} synced, ${result.facilitiesFailed} failed, ` +
        `${result.facilitiesRemaining} deferred to next run, ` +
        `${result.nightsWritten} nights written, ${result.requestsMade} requests ` +
        `(${result.durationMs}ms, pruned ${pruned})`,
    );

    return NextResponse.json({ message: 'Availability sync complete', ...result, pruned });
  } catch (error) {
    console.error('Error in availability sync cron:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Vercel Cron invokes routes via GET; POST kept for manual triggering.
export async function GET(request: NextRequest) {
  return runSync(request);
}

export async function POST(request: NextRequest) {
  return runSync(request);
}
