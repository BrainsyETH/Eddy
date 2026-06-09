// src/app/api/admin/hazards/route.ts
// GET /api/admin/hazards - List all river hazards for admin editing
// POST /api/admin/hazards - Create a new river hazard

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';
import { getCoordinates, getRiverData } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const VALID_HAZARD_TYPES = ['low_water_dam', 'portage', 'strainer', 'rapid', 'private_property', 'waterfall', 'shoal', 'bridge_piling', 'other'];
const VALID_SEVERITY_LEVELS = ['info', 'caution', 'warning', 'danger'];

export async function GET(request: NextRequest) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const supabase = createAdminClient();

    // Pagination params
    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data: hazards, error, count } = await supabase
      .from('river_hazards')
      .select(`
        id,
        river_id,
        name,
        type,
        location,
        river_mile_downstream,
        description,
        severity,
        portage_required,
        portage_side,
        active,
        seasonal_notes,
        min_safe_level,
        max_safe_level,
        created_at,
        updated_at,
        rivers(id, name, slug)
      `, { count: 'exact' })
      .order('name', { ascending: true })
      .range(from, to);

    if (error) {
      console.error('Error fetching hazards:', error);
      return NextResponse.json(
        { error: 'Could not fetch river hazards' },
        { status: 500 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formatted = (hazards || []).map((hazard: any) => {
      const riverData = getRiverData(hazard.rivers);
      const coords = getCoordinates(hazard.location);
      return {
        id: hazard.id,
        riverId: hazard.river_id,
        riverName: riverData?.name || null,
        riverSlug: riverData?.slug || null,
        name: hazard.name,
        type: hazard.type,
        latitude: coords?.lat || null,
        longitude: coords?.lng || null,
        riverMileDownstream: hazard.river_mile_downstream ? parseFloat(hazard.river_mile_downstream) : null,
        description: hazard.description,
        severity: hazard.severity,
        portageRequired: hazard.portage_required,
        portageSide: hazard.portage_side,
        active: hazard.active,
        seasonalNotes: hazard.seasonal_notes,
        minSafeLevel: hazard.min_safe_level ? parseFloat(hazard.min_safe_level) : null,
        maxSafeLevel: hazard.max_safe_level ? parseFloat(hazard.max_safe_level) : null,
        createdAt: hazard.created_at,
        updatedAt: hazard.updated_at,
      };
    });

    return NextResponse.json({
      hazards: formatted,
      total: count ?? formatted.length,
      page,
      limit,
    });
  } catch (error) {
    console.error('Error in admin hazards endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const body = await request.json();
    const {
      name,
      riverId,
      type,
      latitude,
      longitude,
      riverMileDownstream = null,
      description = null,
      severity = null,
      portageRequired = false,
      portageSide = null,
      active = true,
      seasonalNotes = null,
      minSafeLevel = null,
      maxSafeLevel = null,
    } = body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    if (!riverId || typeof riverId !== 'string') {
      return NextResponse.json(
        { error: 'River ID is required' },
        { status: 400 }
      );
    }

    if (!type || typeof type !== 'string') {
      return NextResponse.json(
        { error: 'Type is required' },
        { status: 400 }
      );
    }

    // Validate type against enum
    if (!VALID_HAZARD_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${VALID_HAZARD_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate severity if provided
    if (severity !== null && !VALID_SEVERITY_LEVELS.includes(severity)) {
      return NextResponse.json(
        { error: `Invalid severity. Must be one of: ${VALID_SEVERITY_LEVELS.join(', ')}` },
        { status: 400 }
      );
    }

    // Build insert object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertData: Record<string, any> = {
      name: name.trim(),
      river_id: riverId,
      type,
      description,
      severity,
      portage_required: portageRequired,
      portage_side: portageSide,
      active,
      seasonal_notes: seasonalNotes,
      river_mile_downstream: riverMileDownstream,
      min_safe_level: minSafeLevel,
      max_safe_level: maxSafeLevel,
    };

    // Handle location if lat/lng provided
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      insertData.location = `SRID=4326;POINT(${longitude} ${latitude})`;
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('river_hazards')
      .insert(insertData)
      .select(`
        id,
        river_id,
        name,
        type,
        location,
        river_mile_downstream,
        description,
        severity,
        portage_required,
        portage_side,
        active,
        seasonal_notes,
        min_safe_level,
        max_safe_level,
        created_at,
        updated_at
      `)
      .single();

    if (error) {
      console.error('Error creating hazard:', error);
      return NextResponse.json(
        { error: 'Could not create river hazard' },
        { status: 500 }
      );
    }

    const coords = getCoordinates(data.location);

    return NextResponse.json({
      hazard: {
        id: data.id,
        riverId: data.river_id,
        name: data.name,
        type: data.type,
        latitude: coords?.lat || null,
        longitude: coords?.lng || null,
        riverMileDownstream: data.river_mile_downstream ? parseFloat(data.river_mile_downstream) : null,
        description: data.description,
        severity: data.severity,
        portageRequired: data.portage_required,
        portageSide: data.portage_side,
        active: data.active,
        seasonalNotes: data.seasonal_notes,
        minSafeLevel: data.min_safe_level ? parseFloat(data.min_safe_level) : null,
        maxSafeLevel: data.max_safe_level ? parseFloat(data.max_safe_level) : null,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error in create hazard endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
