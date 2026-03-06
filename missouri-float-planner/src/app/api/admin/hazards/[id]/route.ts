// src/app/api/admin/hazards/[id]/route.ts
// GET/PUT/DELETE /api/admin/hazards/[id] - Single river hazard CRUD

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth, isValidUUID, invalidIdResponse } from '@/lib/admin-auth';
import { getCoordinates } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const VALID_HAZARD_TYPES = ['low_water_dam', 'portage', 'strainer', 'rapid', 'private_property', 'waterfall', 'shoal', 'bridge_piling', 'other'];
const VALID_SEVERITY_LEVELS = ['info', 'caution', 'warning', 'danger'];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const { id } = await params;
    if (!isValidUUID(id)) return invalidIdResponse();
    const supabase = createAdminClient();

    const { data: hazard, error } = await supabase
      .from('river_hazards')
      .select('*, rivers(id, name, slug)')
      .eq('id', id)
      .single();

    if (error || !hazard) {
      return NextResponse.json(
        { error: 'River hazard not found' },
        { status: 404 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const riverData = hazard.rivers as any;
    const coords = getCoordinates(hazard.location);

    return NextResponse.json({
      hazard: {
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
      },
    });
  } catch (error) {
    console.error('Error in GET hazard:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const { id } = await params;
    if (!isValidUUID(id)) return invalidIdResponse();
    const body = await request.json();
    const supabase = createAdminClient();

    // Build update object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length === 0) {
        return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
      }
      updates.name = body.name.trim();
    }

    if (body.type !== undefined) {
      if (!VALID_HAZARD_TYPES.includes(body.type)) {
        return NextResponse.json(
          { error: `Invalid type. Must be one of: ${VALID_HAZARD_TYPES.join(', ')}` },
          { status: 400 }
        );
      }
      updates.type = body.type;
    }

    if (body.severity !== undefined) {
      if (body.severity !== null && !VALID_SEVERITY_LEVELS.includes(body.severity)) {
        return NextResponse.json(
          { error: `Invalid severity. Must be one of: ${VALID_SEVERITY_LEVELS.join(', ')}` },
          { status: 400 }
        );
      }
      updates.severity = body.severity;
    }

    if (body.riverId !== undefined) updates.river_id = body.riverId || null;
    if (body.description !== undefined) updates.description = body.description;
    if (body.portageRequired !== undefined) updates.portage_required = body.portageRequired;
    if (body.portageSide !== undefined) updates.portage_side = body.portageSide;
    if (body.active !== undefined) updates.active = body.active;
    if (body.seasonalNotes !== undefined) updates.seasonal_notes = body.seasonalNotes;
    if (body.riverMileDownstream !== undefined) updates.river_mile_downstream = body.riverMileDownstream;

    // Parse numeric values for safe levels
    if (body.minSafeLevel !== undefined) {
      updates.min_safe_level = body.minSafeLevel !== null ? parseFloat(body.minSafeLevel) : null;
    }
    if (body.maxSafeLevel !== undefined) {
      updates.max_safe_level = body.maxSafeLevel !== null ? parseFloat(body.maxSafeLevel) : null;
    }

    // Handle coordinate updates
    if (body.latitude !== undefined && body.longitude !== undefined) {
      const lat = body.latitude;
      const lng = body.longitude;

      if (typeof lat !== 'number' || typeof lng !== 'number') {
        return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
      }

      updates.location = `SRID=4326;POINT(${lng} ${lat})`;
    }

    updates.updated_at = new Date().toISOString();

    if (Object.keys(updates).length === 1) { // only updated_at
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { error } = await supabase
      .from('river_hazards')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('Error updating hazard:', error);
      return NextResponse.json(
        { error: 'Could not update river hazard' },
        { status: 500 }
      );
    }

    // Re-fetch to return updated data
    const { data: updated } = await supabase
      .from('river_hazards')
      .select('*, rivers(id, name, slug)')
      .eq('id', id)
      .single();

    if (!updated) {
      return NextResponse.json({ error: 'Hazard not found after update' }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const riverData = updated.rivers as any;
    const coords = getCoordinates(updated.location);

    return NextResponse.json({
      hazard: {
        id: updated.id,
        riverId: updated.river_id,
        riverName: riverData?.name || null,
        riverSlug: riverData?.slug || null,
        name: updated.name,
        type: updated.type,
        latitude: coords?.lat || null,
        longitude: coords?.lng || null,
        riverMileDownstream: updated.river_mile_downstream ? parseFloat(updated.river_mile_downstream) : null,
        description: updated.description,
        severity: updated.severity,
        portageRequired: updated.portage_required,
        portageSide: updated.portage_side,
        active: updated.active,
        seasonalNotes: updated.seasonal_notes,
        minSafeLevel: updated.min_safe_level ? parseFloat(updated.min_safe_level) : null,
        maxSafeLevel: updated.max_safe_level ? parseFloat(updated.max_safe_level) : null,
      },
    });
  } catch (error) {
    console.error('Error in PUT hazard:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const { id } = await params;
    if (!isValidUUID(id)) return invalidIdResponse();
    const supabase = createAdminClient();

    const { error } = await supabase
      .from('river_hazards')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting hazard:', error);
      return NextResponse.json(
        { error: 'Could not delete river hazard' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE hazard:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
