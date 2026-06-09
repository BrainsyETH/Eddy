// src/app/api/reports/route.ts
// POST /api/reports - Public endpoint for submitting community reports
// Supports all report types including river_visual with gauge data

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const VALID_TYPES = ['hazard', 'water_level', 'debris', 'river_visual'] as const;

export async function POST(request: NextRequest) {
  try {
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

    // River visual requires an image
    if (type === 'river_visual' && !imageUrl) {
      return NextResponse.json(
        { error: 'River visual reports require an image' },
        { status: 400 }
      );
    }

    // All report types require a description
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return NextResponse.json(
        { error: 'Description is required' },
        { status: 400 }
      );
    }

    // Basic coordinate validation (Missouri bounds with buffer)
    if (latitude < 35 || latitude > 41 || longitude < -97 || longitude > -88) {
      return NextResponse.json(
        { error: 'Coordinates must be within Missouri' },
        { status: 400 }
      );
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
      { error: `Failed to submit report: ${lastError?.message || 'Unknown error'}` },
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
