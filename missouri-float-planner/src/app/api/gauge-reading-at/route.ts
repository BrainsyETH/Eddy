// src/app/api/gauge-reading-at/route.ts
// GET /api/gauge-reading-at?gaugeStationId=<uuid>&at=<iso>
// Returns the USGS gauge reading nearest a given instant, used to backfill a
// River Visual photo's stage/flow from when the photo was taken (EXIF), so a
// historical photo is bucketed by the level at capture time.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { isValidUUID } from '@/lib/admin-auth';
import { fetchUsgsReadingAt } from '@/lib/flow-providers/usgs-historical';

export const dynamic = 'force-dynamic';

const MAX_AGE_MS = 40 * 365 * 24 * 60 * 60 * 1000; // ~40 years of USGS record

export async function GET(request: NextRequest) {
  try {
    // Light rate limit — each call may hit USGS.
    const limited = await rateLimit(`reading-at:${getClientIp(request)}`, 30, 15 * 60 * 1000);
    if (limited) return limited;

    const { searchParams } = new URL(request.url);
    const gaugeStationId = searchParams.get('gaugeStationId');
    const at = searchParams.get('at');

    if (!gaugeStationId || !isValidUUID(gaugeStationId)) {
      return NextResponse.json({ error: 'Invalid gaugeStationId' }, { status: 400 });
    }
    if (!at) {
      return NextResponse.json({ error: 'Missing at' }, { status: 400 });
    }

    const when = new Date(at);
    if (isNaN(when.getTime())) {
      return NextResponse.json({ error: 'Invalid at timestamp' }, { status: 400 });
    }
    const now = Date.now();
    // Allow a little future skew for clock differences, but reject real futures
    // and implausibly old dates.
    if (when.getTime() > now + 60 * 60 * 1000 || when.getTime() < now - MAX_AGE_MS) {
      return NextResponse.json({ error: 'at is out of range' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: station } = await supabase
      .from('gauge_stations')
      .select('usgs_site_id')
      .eq('id', gaugeStationId)
      .maybeSingle();

    if (!station?.usgs_site_id) {
      return NextResponse.json({ error: 'Gauge station not found' }, { status: 404 });
    }

    const reading = await fetchUsgsReadingAt(station.usgs_site_id, when);
    if (!reading) {
      return NextResponse.json({ found: false });
    }

    return NextResponse.json({
      found: true,
      gaugeHeightFt: reading.gaugeHeightFt,
      dischargeCfs: reading.dischargeCfs,
      observedAt: reading.observedAt,
      source: reading.source,
    });
  } catch (error) {
    console.error('Error in gauge-reading-at endpoint:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
