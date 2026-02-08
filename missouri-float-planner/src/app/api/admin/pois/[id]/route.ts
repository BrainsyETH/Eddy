// src/app/api/admin/pois/[id]/route.ts
// GET/PUT/DELETE /api/admin/pois/[id] - Single POI CRUD

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

const VALID_POI_TYPES = ['spring', 'cave', 'historical_site', 'scenic_viewpoint', 'waterfall', 'geological', 'other'];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const { id } = await params;
    const supabase = createAdminClient();

    const { data: poi, error } = await supabase
      .from('points_of_interest')
      .select('*, rivers(id, name, slug)')
      .eq('id', id)
      .single();

    if (error || !poi) {
      return NextResponse.json(
        { error: 'Point of interest not found' },
        { status: 404 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const riverData = poi.rivers as any;

    return NextResponse.json({
      poi: {
        id: poi.id,
        riverId: poi.river_id,
        riverName: riverData?.name || null,
        name: poi.name,
        slug: poi.slug,
        description: poi.description,
        bodyText: poi.body_text,
        type: poi.type,
        source: poi.source,
        npsId: poi.nps_id,
        npsUrl: poi.nps_url,
        latitude: poi.latitude,
        longitude: poi.longitude,
        riverMile: poi.river_mile,
        images: typeof poi.images === 'string' ? JSON.parse(poi.images) : (poi.images || []),
        amenities: poi.amenities || [],
        active: poi.active,
        isOnWater: poi.is_on_water,
        createdAt: poi.created_at,
      },
    });
  } catch (error) {
    console.error('Error in GET POI:', error);
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
      updates.slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    if (body.type !== undefined) {
      if (!VALID_POI_TYPES.includes(body.type)) {
        return NextResponse.json(
          { error: `Invalid type. Must be one of: ${VALID_POI_TYPES.join(', ')}` },
          { status: 400 }
        );
      }
      updates.type = body.type;
    }

    if (body.riverId !== undefined) updates.river_id = body.riverId || null;
    if (body.description !== undefined) updates.description = body.description;
    if (body.bodyText !== undefined) updates.body_text = body.bodyText;
    if (body.active !== undefined) updates.active = body.active;
    if (body.isOnWater !== undefined) updates.is_on_water = body.isOnWater;
    if (body.images !== undefined) updates.images = JSON.stringify(body.images);
    if (body.amenities !== undefined) updates.amenities = body.amenities;
    if (body.npsUrl !== undefined) updates.nps_url = body.npsUrl;
    if (body.riverMile !== undefined) updates.river_mile = body.riverMile;

    // Handle coordinate updates
    if (body.latitude !== undefined && body.longitude !== undefined) {
      const lat = body.latitude;
      const lng = body.longitude;

      if (typeof lat !== 'number' || typeof lng !== 'number') {
        return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
      }

      if (lat < 35.9 || lat > 40.7 || lng < -96.5 || lng > -88.9) {
        return NextResponse.json({ error: 'Coordinates must be within Missouri bounds' }, { status: 400 });
      }

      updates.latitude = lat;
      updates.longitude = lng;
      updates.location = `SRID=4326;POINT(${lng} ${lat})`;
    }

    updates.updated_at = new Date().toISOString();

    if (Object.keys(updates).length === 1) { // only updated_at
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { error } = await supabase
      .from('points_of_interest')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('Error updating POI:', error);
      return NextResponse.json(
        { error: 'Could not update point of interest' },
        { status: 500 }
      );
    }

    // Re-fetch to return updated data
    const { data: updated } = await supabase
      .from('points_of_interest')
      .select('*, rivers(id, name, slug)')
      .eq('id', id)
      .single();

    if (!updated) {
      return NextResponse.json({ error: 'POI not found after update' }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const riverData = updated.rivers as any;

    return NextResponse.json({
      poi: {
        id: updated.id,
        riverId: updated.river_id,
        riverName: riverData?.name || null,
        name: updated.name,
        slug: updated.slug,
        description: updated.description,
        bodyText: updated.body_text,
        type: updated.type,
        source: updated.source,
        latitude: updated.latitude,
        longitude: updated.longitude,
        riverMile: updated.river_mile,
        images: typeof updated.images === 'string' ? JSON.parse(updated.images) : (updated.images || []),
        amenities: updated.amenities || [],
        active: updated.active,
        isOnWater: updated.is_on_water,
      },
    });
  } catch (error) {
    console.error('Error in PUT POI:', error);
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
    const supabase = createAdminClient();

    const { error } = await supabase
      .from('points_of_interest')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting POI:', error);
      return NextResponse.json(
        { error: 'Could not delete point of interest' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE POI:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
