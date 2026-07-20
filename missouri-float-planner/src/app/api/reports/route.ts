// src/app/api/reports/route.ts
// POST /api/reports - Public endpoint for submitting community reports
// Supports all report types including river_visual with gauge data

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { isValidUUID } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

const VALID_TYPES = ['hazard', 'water_level', 'debris', 'river_visual'] as const;
const MAX_DESCRIPTION_LEN = 2000;
const MAX_SUBMITTER_NAME_LEN = 100;
const MAX_IMAGE_URL_LEN = 1000;

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 report submissions per IP per 15 minutes
    const rateLimitResult = await rateLimit(`reports:${getClientIp(request)}`, 5, 15 * 60 * 1000, { failClosed: true });
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

    // Coordinates must be real numbers within Missouri bounds (with buffer).
    if (typeof latitude !== 'number' || typeof longitude !== 'number' ||
        !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json(
        { error: 'Coordinates must be numbers' },
        { status: 400 }
      );
    }
    if (latitude < 35 || latitude > 41 || longitude < -97 || longitude > -88) {
      return NextResponse.json(
        { error: 'Coordinates must be within Missouri' },
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

    const supabase = createAdminClient();

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
