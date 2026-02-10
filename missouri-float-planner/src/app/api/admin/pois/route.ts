// src/app/api/admin/pois/route.ts
// GET /api/admin/pois - List all POIs for admin editing
// POST /api/admin/pois - Create a new POI

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

const VALID_POI_TYPES = ['spring', 'cave', 'historical_site', 'scenic_viewpoint', 'waterfall', 'geological', 'campground', 'other'];

export async function GET(request: NextRequest) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const supabase = createAdminClient();

    const { data: pois, error } = await supabase
      .from('points_of_interest')
      .select(`
        id,
        river_id,
        name,
        slug,
        description,
        body_text,
        type,
        source,
        nps_id,
        nps_url,
        latitude,
        longitude,
        river_mile,
        images,
        amenities,
        active,
        is_on_water,
        created_at,
        rivers(id, name, slug)
      `)
      .order('name', { ascending: true })
      .limit(5000);

    if (error) {
      console.error('Error fetching POIs:', error);
      return NextResponse.json(
        { error: 'Could not fetch points of interest' },
        { status: 500 }
      );
    }

    const getRiverData = (rivers: unknown): { id?: string; name?: string; slug?: string } | null => {
      if (!rivers || typeof rivers !== 'object') return null;
      return rivers as { id?: string; name?: string; slug?: string };
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formatted = (pois || []).map((poi: any) => {
      const riverData = getRiverData(poi.rivers);
      return {
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
      };
    });

    return NextResponse.json({ pois: formatted });
  } catch (error) {
    console.error('Error in admin POIs endpoint:', error);
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
      latitude,
      longitude,
      type = 'other',
      description = null,
      active = true,
      isOnWater = true,
    } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return NextResponse.json(
        { error: 'Valid latitude and longitude are required' },
        { status: 400 }
      );
    }

    if (latitude < 35.9 || latitude > 40.7 || longitude < -96.5 || longitude > -88.9) {
      return NextResponse.json(
        { error: 'Coordinates must be within Missouri bounds' },
        { status: 400 }
      );
    }

    if (!VALID_POI_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${VALID_POI_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('points_of_interest')
      .insert({
        name: name.trim(),
        slug,
        river_id: riverId || null,
        latitude,
        longitude,
        location: `SRID=4326;POINT(${longitude} ${latitude})`,
        type,
        source: 'manual',
        description,
        active,
        is_on_water: isOnWater,
      })
      .select('id, name, slug, river_id, latitude, longitude, type, source, description, active, is_on_water, created_at')
      .single();

    if (error) {
      console.error('Error creating POI:', error);
      return NextResponse.json(
        { error: 'Could not create point of interest' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      poi: {
        id: data.id,
        riverId: data.river_id,
        name: data.name,
        slug: data.slug,
        description: data.description,
        type: data.type,
        source: data.source,
        latitude: data.latitude,
        longitude: data.longitude,
        active: data.active,
        isOnWater: data.is_on_water,
        createdAt: data.created_at,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error in create POI endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
