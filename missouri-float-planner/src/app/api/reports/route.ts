// src/app/api/reports/route.ts
// POST /api/reports - Public endpoint for submitting community reports
// Supports all report types including river_visual with gauge data

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { isValidUUID } from '@/lib/admin-auth';
import {
  isValidEarthCoordinate,
  REPORT_CORRIDOR_MAX_DISTANCE_METERS,
  validateReportCorridor,
} from '@/lib/reports/location';

export const dynamic = 'force-dynamic';

const VALID_TYPES = ['hazard', 'water_level', 'debris', 'river_visual'] as const;
const MAX_DESCRIPTION_LEN = 2000;
const MAX_SUBMITTER_NAME_LEN = 100;
const MAX_IMAGE_URL_LEN = 1000;

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 report submissions per IP per 15 minutes
    const rateLimitResult = await rateLimit(`reports:${getClientIp(request)}`, 5, 15 * 60 * 1000);
    if (rateLimitResult) return rateLimitResult;

    const body = await request.json();

    const {
      riverId,
      hazardId,
      type,
      latitude,
      longitude,
      imageUrl,
      description,
      gaugeHeightFt,
      dischargeCfs,
      accessPointId,
      gaugeStationId,
      submitterName,
      capturedAt,
      readingSource,
    } = body;

    // Validate required fields
    if (!riverId || !type || latitude == null || longitude == null) {
      return NextResponse.json(
        { error: 'Missing required fields: riverId, type, latitude, longitude' },
        { status: 400 }
      );
    }

    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid report type. Must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // All referenced IDs must be well-formed UUIDs. Catching these here returns a
    // clean 400 instead of leaking a Postgres FK-violation through the 500 path.
    if (!isValidUUID(String(riverId))) {
      return NextResponse.json({ error: 'Invalid riverId' }, { status: 400 });
    }
    for (const [field, value] of Object.entries({ hazardId, accessPointId, gaugeStationId })) {
      if (value != null && !isValidUUID(String(value))) {
        return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 });
      }
    }

    // First validate real Earth coordinates. State and region support comes
    // from the selected river's stored geometry below, never a hardcoded box.
    if (!isValidEarthCoordinate(latitude, longitude)) {
      return NextResponse.json(
        { error: 'Coordinates must be valid latitude and longitude values' },
        { status: 400 }
      );
    }

    // All report types require a description, capped to a sane length.
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return NextResponse.json(
        { error: 'Description is required' },
        { status: 400 }
      );
    }
    if (description.length > MAX_DESCRIPTION_LEN) {
      return NextResponse.json(
        { error: `Description is too long (max ${MAX_DESCRIPTION_LEN} characters)` },
        { status: 400 }
      );
    }

    // submitterName is optional but must be a short string when present.
    if (submitterName != null && (typeof submitterName !== 'string' || submitterName.length > MAX_SUBMITTER_NAME_LEN)) {
      return NextResponse.json(
        { error: `Name is too long (max ${MAX_SUBMITTER_NAME_LEN} characters)` },
        { status: 400 }
      );
    }

    // imageUrl, when present, must be a bounded https URL.
    if (imageUrl != null) {
      if (typeof imageUrl !== 'string' || imageUrl.length > MAX_IMAGE_URL_LEN || !/^https:\/\//i.test(imageUrl)) {
        return NextResponse.json(
          { error: 'imageUrl must be an https URL' },
          { status: 400 }
        );
      }
    }

    // River visual requires an image.
    if (type === 'river_visual' && !imageUrl) {
      return NextResponse.json(
        { error: 'River visual reports require an image' },
        { status: 400 }
      );
    }

    // Gauge readings, when present, must be finite numbers in a sane range.
    const inRange = (v: unknown, min: number, max: number) =>
      typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
    if (gaugeHeightFt != null && !inRange(gaugeHeightFt, -100, 100)) {
      return NextResponse.json({ error: 'Invalid gaugeHeightFt' }, { status: 400 });
    }
    if (dischargeCfs != null && !inRange(dischargeCfs, 0, 1_000_000)) {
      return NextResponse.json({ error: 'Invalid dischargeCfs' }, { status: 400 });
    }

    // capturedAt (EXIF capture time), when present, must be a valid, non-future
    // ISO timestamp within the plausible USGS record.
    let capturedAtIso: string | null = null;
    if (capturedAt != null) {
      const d = new Date(capturedAt);
      const now = Date.now();
      if (
        isNaN(d.getTime()) ||
        d.getTime() > now + 60 * 60 * 1000 ||
        d.getTime() < now - 40 * 365 * 24 * 60 * 60 * 1000
      ) {
        return NextResponse.json({ error: 'Invalid capturedAt' }, { status: 400 });
      }
      capturedAtIso = d.toISOString();
    }
    if (readingSource != null && !['live', 'historical', 'manual'].includes(readingSource)) {
      return NextResponse.json({ error: 'Invalid readingSource' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Reports are safety-relevant and must be anchored to the river they name.
    // The existing PostGIS helper only returns active rivers, so this also
    // rejects unknown/inactive river IDs without relying on a state whitelist.
    const corridor = await validateReportCorridor(
      (args) => supabase.rpc('find_nearest_river', args) as unknown as Promise<{ data: unknown; error: unknown }>,
      String(riverId),
      latitude,
      longitude
    );
    if (!corridor.ok) {
      if (corridor.reason === 'unavailable') {
        console.error('[Reports] River corridor validation unavailable');
        return NextResponse.json(
          { error: 'Unable to validate report location. Please try again.' },
          { status: 503 }
        );
      }
      return NextResponse.json(
        {
          error: `Location must be within ${REPORT_CORRIDOR_MAX_DISTANCE_METERS / 1000} km of the selected river`,
        },
        { status: 400 }
      );
    }

    // Optional references must belong to the same river. UUID format and
    // foreign keys alone do not prevent linking a valid access, gauge, or
    // hazard from a different river.
    if (accessPointId) {
      const { data: accessPoint, error: accessError } = await supabase
        .from('access_points')
        .select('river_id, approved')
        .eq('id', accessPointId)
        .maybeSingle();
      if (accessError) {
        return NextResponse.json({ error: 'Unable to validate access point' }, { status: 503 });
      }
      if (!accessPoint || accessPoint.river_id !== riverId || !accessPoint.approved) {
        return NextResponse.json({ error: 'accessPointId does not belong to the selected river' }, { status: 400 });
      }
    }
    if (hazardId) {
      const { data: hazard, error: hazardError } = await supabase
        .from('river_hazards')
        .select('river_id')
        .eq('id', hazardId)
        .maybeSingle();
      if (hazardError) {
        return NextResponse.json({ error: 'Unable to validate hazard' }, { status: 503 });
      }
      if (!hazard || hazard.river_id !== riverId) {
        return NextResponse.json({ error: 'hazardId does not belong to the selected river' }, { status: 400 });
      }
    }
    if (gaugeStationId) {
      const { data: gaugeLink, error: gaugeError } = await supabase
        .from('river_gauges')
        .select('river_id')
        .eq('river_id', riverId)
        .eq('gauge_station_id', gaugeStationId)
        .maybeSingle();
      if (gaugeError) {
        return NextResponse.json({ error: 'Unable to validate gauge station' }, { status: 503 });
      }
      if (!gaugeLink) {
        return NextResponse.json({ error: 'gaugeStationId does not belong to the selected river' }, { status: 400 });
      }
    }

    // Build the base insert payload (without coordinates — added below)
    const baseData: Record<string, unknown> = {
      river_id: riverId,
      type,
      image_url: imageUrl || null,
      description: description.trim(),
      status: 'pending',
    };

    if (hazardId) baseData.hazard_id = hazardId;
    if (submitterName) baseData.submitter_name = submitterName.trim();

    // River visual specific fields
    if (type === 'river_visual') {
      if (gaugeHeightFt != null) baseData.gauge_height_ft = gaugeHeightFt;
      if (dischargeCfs != null) baseData.discharge_cfs = dischargeCfs;
      if (accessPointId) baseData.access_point_id = accessPointId;
      if (gaugeStationId) baseData.gauge_station_id = gaugeStationId;
      if (capturedAtIso) baseData.captured_at = capturedAtIso;
      if (readingSource) baseData.reading_source = readingSource;
    }

    // Try inserting with different geometry formats
    // PostgREST geometry parsing varies by version — try EWKT first, then WKT
    const geometryFormats = [
      `SRID=4326;POINT(${longitude} ${latitude})`,
      `POINT(${longitude} ${latitude})`,
    ];

    let lastError: { message: string; details?: string; code?: string } | null = null;

    for (const geomValue of geometryFormats) {
      const { data, error } = await supabase
        .from('community_reports')
        .insert({ ...baseData, coordinates: geomValue })
        .select('id')
        .single();

      if (!error && data) {
        return NextResponse.json({
          success: true,
          id: data.id,
          message: 'Report submitted successfully. It will be reviewed by an admin before appearing publicly.',
        });
      }

      lastError = error;

      // Only retry if the error is geometry-related
      if (!error?.message?.includes('pattern') && !error?.message?.includes('geometry') && !error?.message?.includes('parse')) {
        break;
      }
    }

    console.error('Error creating report:', lastError?.message, lastError?.details, lastError?.code);
    return NextResponse.json(
      { error: 'Failed to submit report. Please try again.' },
      { status: 500 }
    );
  } catch (error) {
    console.error('Error in reports endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
