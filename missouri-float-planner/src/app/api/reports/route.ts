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

    // Build the insert payload
    const insertData: Record<string, unknown> = {
      river_id: riverId,
      type,
      coordinates: `SRID=4326;POINT(${longitude} ${latitude})`,
      image_url: imageUrl || null,
      description: description.trim(),
      status: 'pending',
    };

    if (hazardId) insertData.hazard_id = hazardId;
    if (submitterName) insertData.submitter_name = submitterName.trim();

    // River visual specific fields
    if (type === 'river_visual') {
      if (gaugeHeightFt != null) insertData.gauge_height_ft = gaugeHeightFt;
      if (dischargeCfs != null) insertData.discharge_cfs = dischargeCfs;
      if (accessPointId) insertData.access_point_id = accessPointId;
      if (gaugeStationId) insertData.gauge_station_id = gaugeStationId;
    }

    const { data, error } = await supabase
      .from('community_reports')
      .insert(insertData)
      .select('id')
      .single();

    if (error) {
      console.error('Error creating report:', error);
      return NextResponse.json(
        { error: 'Failed to submit report' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      id: data.id,
      message: 'Report submitted successfully. It will be reviewed by an admin before appearing publicly.',
    });
  } catch (error) {
    console.error('Error in reports endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
