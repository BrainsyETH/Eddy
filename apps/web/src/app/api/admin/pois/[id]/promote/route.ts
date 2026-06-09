// src/app/api/admin/pois/[id]/promote/route.ts
// POST /api/admin/pois/[id]/promote — Promote a POI to an access point
// Creates a new access_point from the POI data, then deactivates the POI.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const { id } = await params;
    const supabase = createAdminClient();

    // Fetch the POI
    const { data: poi, error: fetchError } = await supabase
      .from('points_of_interest')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !poi) {
      return NextResponse.json(
        { error: 'Point of interest not found' },
        { status: 404 }
      );
    }

    // Build access point from POI data
    const slug = poi.slug || poi.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const accessPointData: Record<string, unknown> = {
      river_id: poi.river_id,
      name: poi.name,
      slug,
      description: poi.description,
      type: 'campground',
      types: ['campground'],
      is_public: true,
      ownership: 'public',
      managing_agency: poi.managing_agency || 'USFS',
      approved: false, // Needs separate approval
    };

    // Location
    if (poi.latitude && poi.longitude) {
      accessPointData.location_orig = `SRID=4326;POINT(${poi.longitude} ${poi.latitude})`;
    }

    // RIDB data
    if (poi.ridb_facility_id) {
      accessPointData.ridb_facility_id = poi.ridb_facility_id;
    }
    if (poi.ridb_data) {
      accessPointData.ridb_data = typeof poi.ridb_data === 'string'
        ? poi.ridb_data
        : JSON.stringify(poi.ridb_data);
    }

    // Fee info
    if (poi.fee_description) {
      accessPointData.fee_required = true;
      accessPointData.fee_notes = poi.fee_description;
    }

    // Reservation URL
    if (poi.reservation_url) {
      accessPointData.official_site_url = poi.reservation_url;
    }

    // Insert the access point
    const { data: newAP, error: insertError } = await supabase
      .from('access_points')
      .insert(accessPointData)
      .select('id, name, slug')
      .single();

    if (insertError) {
      console.error('Error promoting POI to access point:', insertError);
      return NextResponse.json(
        { error: `Failed to create access point: ${insertError.message}` },
        { status: 500 }
      );
    }

    // Try to snap the access point to the river line
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.rpc as any)('snap_access_point_by_slug', { p_slug: slug });
    } catch {
      // snap RPC may not exist — non-fatal
    }

    // Deactivate the POI (keep for reference, but hide from public)
    await supabase
      .from('points_of_interest')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    return NextResponse.json({
      message: 'POI promoted to access point',
      accessPoint: {
        id: newAP.id,
        name: newAP.name,
        slug: newAP.slug,
      },
      poiDeactivated: true,
    });
  } catch (error) {
    console.error('Error in promote POI endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
