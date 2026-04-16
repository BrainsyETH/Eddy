import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDriveTime, geocodeAddress } from '@/lib/mapbox/directions';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { withX402Route } from '@/lib/x402-config';

export const dynamic = 'force-dynamic';

function extractCoords(ap: Record<string, unknown>): [number, number] | null {
  if (ap.driving_lng && ap.driving_lat) {
    return [parseFloat(ap.driving_lng as string), parseFloat(ap.driving_lat as string)];
  }
  const loc = (ap.location_snap as { coordinates?: number[] })?.coordinates
    || (ap.location_orig as { coordinates?: number[] })?.coordinates;
  if (loc && loc.length >= 2) return [loc[0], loc[1]];
  return null;
}

async function _GET(request: NextRequest) {
  try {
    const rateLimitResult = rateLimit(`shuttle:${getClientIp(request)}`, 30, 60 * 1000);
    if (rateLimitResult) return rateLimitResult;

    const { searchParams } = request.nextUrl;
    const putInId = searchParams.get('putInId');
    const takeOutId = searchParams.get('takeOutId');

    if (!putInId || !takeOutId) {
      return NextResponse.json(
        { error: 'Missing required parameters: putInId, takeOutId' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Check drive_time_cache first (shuttle goes take-out → put-in, same as plan route)
    const { data: cached } = await supabase
      .from('drive_time_cache')
      .select('drive_miles, drive_minutes, route_summary')
      .eq('start_access_id', takeOutId)
      .eq('end_access_id', putInId)
      .single();

    if (cached) {
      return NextResponse.json({
        available: true,
        miles: Number(cached.drive_miles),
        minutes: Number(cached.drive_minutes),
        routeSummary: cached.route_summary,
      });
    }

    // Fetch access point data for coordinate extraction
    const { data: points, error: pointsError } = await supabase
      .from('access_points')
      .select('id, driving_lat, driving_lng, directions_override, location_snap, location_orig')
      .in('id', [putInId, takeOutId]);

    if (pointsError || !points || points.length < 2) {
      return NextResponse.json({ error: 'Access points not found' }, { status: 404 });
    }

    const putIn = points.find((p: Record<string, unknown>) => p.id === putInId);
    const takeOut = points.find((p: Record<string, unknown>) => p.id === takeOutId);
    if (!putIn || !takeOut) {
      return NextResponse.json({ error: 'Access points not found' }, { status: 404 });
    }

    // Extract coordinates (same priority as /api/plan route)
    let takeOutCoords: [number, number] | null = null;
    if (takeOut.directions_override) {
      const geocoded = await geocodeAddress(takeOut.directions_override as string);
      if (geocoded) takeOutCoords = geocoded;
    }
    if (!takeOutCoords) takeOutCoords = extractCoords(takeOut);

    let putInCoords: [number, number] | null = null;
    if (putIn.directions_override) {
      const geocoded = await geocodeAddress(putIn.directions_override as string);
      if (geocoded) putInCoords = geocoded;
    }
    if (!putInCoords) putInCoords = extractCoords(putIn);

    if (!takeOutCoords || !putInCoords) {
      return NextResponse.json({ available: false });
    }

    // Shuttle goes take-out → put-in (driver picks up at take-out, drives to put-in)
    let result;
    try {
      result = await getDriveTime(takeOutCoords[0], takeOutCoords[1], putInCoords[0], putInCoords[1]);
    } catch {
      return NextResponse.json({ available: false });
    }

    // Cache the result in drive_time_cache
    await supabase
      .from('drive_time_cache')
      .upsert({
        start_access_id: takeOutId,
        end_access_id: putInId,
        drive_miles: result.miles,
        drive_minutes: result.minutes,
        route_summary: result.routeSummary,
        fetched_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }, {
        onConflict: 'start_access_id,end_access_id',
      });

    return NextResponse.json({
      available: true,
      miles: result.miles,
      minutes: result.minutes,
      routeSummary: result.routeSummary,
    });
  } catch (error) {
    console.error('Shuttle distance error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate shuttle distance' },
      { status: 500 }
    );
  }
}

export const GET = withX402Route(_GET, '$0.01', 'Shuttle distance data');
