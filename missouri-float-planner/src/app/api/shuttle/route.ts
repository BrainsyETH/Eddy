import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDriveTime, geocodeAddress } from '@/lib/mapbox/directions';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { withX402Route } from '@/lib/x402-config';
import { assessShuttlePlausibility } from '@/lib/shuttle-plausibility';
import { resolveFloatEndpoints, endpointFailureStatus } from '@/lib/access-points/endpoint-resolver';
import type { Database } from '@/types/database';

export const dynamic = 'force-dynamic';

/**
 * Exactly the columns this route projects. Named rather than inferred so the
 * resolver hands back the real field types instead of the four it checks.
 */
type ShuttleEndpoint = Pick<
  Database['public']['Tables']['access_points']['Row'],
  | 'id'
  | 'river_id'
  | 'approved'
  | 'is_float_endpoint'
  | 'river_mile_downstream'
  | 'driving_lat'
  | 'driving_lng'
  | 'directions_override'
  | 'location_snap'
  | 'location_orig'
>;

function extractCoords(
  ap: Pick<ShuttleEndpoint, 'driving_lat' | 'driving_lng' | 'location_snap' | 'location_orig'>,
): [number, number] | null {
  if (ap.driving_lng && ap.driving_lat) {
    return [Number(ap.driving_lng), Number(ap.driving_lat)];
  }
  const loc = (ap.location_snap as { coordinates?: number[] })?.coordinates
    || (ap.location_orig as { coordinates?: number[] })?.coordinates;
  if (loc && loc.length >= 2) return [loc[0], loc[1]];
  return null;
}

/** directions_override, geocoded near the point itself, else extractCoords. */
async function drivingCoords(ap: ShuttleEndpoint): Promise<[number, number] | null> {
  if (ap.directions_override) {
    const own = (ap.location_snap as { coordinates?: number[] } | null)?.coordinates
      || (ap.location_orig as { coordinates?: number[] } | null)?.coordinates;
    const geocoded = await geocodeAddress(
      ap.directions_override,
      own && own.length >= 2 ? { lng: own[0], lat: own[1] } : null,
    );
    if (geocoded) return geocoded;
  }
  return extractCoords(ap);
}

async function _GET(request: NextRequest) {
  try {
    const rateLimitResult = await rateLimit(`shuttle:${getClientIp(request)}`, 30, 60 * 1000);
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

    // Both access points up front: coordinates for routing, plus river mile and
    // river id so the plausibility check can compare road miles against river
    // miles on the cached path too. Previously only the planner passed a
    // comparison, so hub shuttle panels missed ratio anomalies (audit F07).
    //
    // Same eligibility rule as /api/plan, through the same resolver. This route
    // previously applied no `approved` filter at all, so an unreviewed — or a
    // non-launch — point could be shuttled to.
    //
    // `riverId: null` because nothing upstream supplies one here; the two points
    // are instead required to agree with each other below.
    const endpoints = await resolveFloatEndpoints<ShuttleEndpoint>(supabase, {
      riverId: null,
      putInId,
      takeOutId,
      columns:
        'id, river_id, river_mile_downstream, driving_lat, driving_lng, directions_override, location_snap, location_orig',
    });

    if (!endpoints.ok) {
      return NextResponse.json(
        { error: endpoints.detail },
        { status: endpointFailureStatus(endpoints.reason) }
      );
    }

    const { putIn, takeOut } = endpoints;

    // A shuttle between two rivers is not a shuttle. This used to be tolerated:
    // the mismatch only nulled `riverMiles` below, and a drive time was returned
    // for the pair anyway.
    if (putIn.river_id !== takeOut.river_id) {
      return NextResponse.json(
        { error: 'Both access points must be on the same river.' },
        { status: 400 }
      );
    }

    // River-mile span between the endpoints — meaningful now that both points are
    // known to be on one river, so this only guards a missing mile marker.
    const putInMile = putIn.river_mile_downstream != null ? Number(putIn.river_mile_downstream) : NaN;
    const takeOutMile = takeOut.river_mile_downstream != null ? Number(takeOut.river_mile_downstream) : NaN;
    const riverMiles =
      Number.isFinite(putInMile) && Number.isFinite(takeOutMile)
        ? Math.abs(takeOutMile - putInMile)
        : null;

    // Check drive_time_cache first (shuttle goes take-out → put-in, same as plan route)
    const { data: cached } = await supabase
      .from('drive_time_cache')
      .select('drive_miles, drive_minutes, route_summary')
      .eq('start_access_id', takeOutId)
      .eq('end_access_id', putInId)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (cached && cached.drive_minutes != null) {
      const plausibility = assessShuttlePlausibility(Number(cached.drive_miles), riverMiles);
      return NextResponse.json({
        available: true,
        miles: Number(cached.drive_miles),
        minutes: Number(cached.drive_minutes),
        routeSummary: cached.route_summary,
        ...plausibility,
      });
    }

    // Extract coordinates (same priority as /api/plan route).
    //
    // The geocode is ANCHORED to the point's own position, as /api/plan's is.
    // It was not here: "Cedar Grove Campground, MO" went to Mapbox with only
    // a soft Ozarks-centre bias, and the web shuttle panel printed 84.74 mi
    // "via US 60, MO 17" for a Pulltite → Cedargrove shuttle Google drives in
    // 30. An unanchored free-text match can land on any same-named place in
    // the state; a rejected one falls back to the coordinates we already had.
    const takeOutCoords = await drivingCoords(takeOut);
    const putInCoords = await drivingCoords(putIn);

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

    // Cache the result in drive_time_cache. Non-fatal, but logged. It used to
    // include route_geometry, a column production never had, so every write
    // was rejected silently (the newest cached row is from 2026-07-02). No
    // client draws the drive line, so the geometry is simply not stored.
    const { error: cacheWriteError } = await supabase
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
    if (cacheWriteError) {
      console.warn('drive_time_cache write failed:', cacheWriteError.message);
    }

    const plausibility = assessShuttlePlausibility(result.miles, riverMiles);
    return NextResponse.json({
      available: true,
      miles: result.miles,
      minutes: result.minutes,
      routeSummary: result.routeSummary,
      ...plausibility,
    });
  } catch (error) {
    console.error('Shuttle distance error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate shuttle distance' },
      { status: 500 }
    );
  }
}

export const GET = withX402Route(_GET, '/api/shuttle');
