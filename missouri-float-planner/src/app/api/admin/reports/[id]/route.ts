// src/app/api/admin/reports/[id]/route.ts
// GET/PUT/DELETE /api/admin/reports/[id] - Single community report admin operations

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth, isValidUUID, invalidIdResponse } from '@/lib/admin-auth';
import { getCoordinates, getRiverData } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

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

    const { data: report, error } = await supabase
      .from('community_reports')
      .select(`
        *,
        rivers(id, name, slug),
        river_hazards(id, name)
      `)
      .eq('id', id)
      .single();

    if (error || !report) {
      return NextResponse.json(
        { error: 'Community report not found' },
        { status: 404 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const riverData = getRiverData(report.rivers);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hazardData = report.river_hazards as any;
    const coords = getCoordinates(report.coordinates);

    return NextResponse.json({
      report: {
        id: report.id,
        userId: report.user_id,
        riverId: report.river_id,
        riverName: riverData?.name || null,
        riverSlug: riverData?.slug || null,
        hazardId: report.hazard_id,
        hazardName: hazardData?.name || null,
        type: report.type,
        coordinates: coords,
        riverMile: report.river_mile ? parseFloat(report.river_mile) : null,
        imageUrl: report.image_url,
        description: report.description,
        status: report.status,
        verifiedBy: report.verified_by,
        verifiedAt: report.verified_at,
        createdAt: report.created_at,
        updatedAt: report.updated_at,
      },
    });
  } catch (error) {
    console.error('Error in GET report:', error);
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

    // Handle status moderation
    if (body.status !== undefined) {
      const validStatuses = ['pending', 'verified', 'rejected'];
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        );
      }
      updates.status = body.status;

      // When verifying, set verified_at timestamp
      if (body.status === 'verified') {
        updates.verified_at = new Date().toISOString();
      }
    }

    if (body.description !== undefined) updates.description = body.description;

    updates.updated_at = new Date().toISOString();

    if (Object.keys(updates).length === 1) { // only updated_at
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { error } = await supabase
      .from('community_reports')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('Error updating community report:', error);
      return NextResponse.json(
        { error: 'Could not update community report' },
        { status: 500 }
      );
    }

    // Re-fetch to return updated data
    const { data: updated } = await supabase
      .from('community_reports')
      .select(`
        *,
        rivers(id, name, slug),
        river_hazards(id, name)
      `)
      .eq('id', id)
      .single();

    if (!updated) {
      return NextResponse.json({ error: 'Report not found after update' }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const riverData = getRiverData(updated.rivers);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hazardData = updated.river_hazards as any;
    const coords = getCoordinates(updated.coordinates);

    return NextResponse.json({
      report: {
        id: updated.id,
        userId: updated.user_id,
        riverId: updated.river_id,
        riverName: riverData?.name || null,
        riverSlug: riverData?.slug || null,
        hazardId: updated.hazard_id,
        hazardName: hazardData?.name || null,
        type: updated.type,
        coordinates: coords,
        riverMile: updated.river_mile ? parseFloat(updated.river_mile) : null,
        imageUrl: updated.image_url,
        description: updated.description,
        status: updated.status,
        verifiedBy: updated.verified_by,
        verifiedAt: updated.verified_at,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      },
    });
  } catch (error) {
    console.error('Error in PUT report:', error);
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
      .from('community_reports')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting community report:', error);
      return NextResponse.json(
        { error: 'Could not delete community report' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE report:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
