// src/app/api/admin/reports/route.ts
// GET /api/admin/reports - List all community reports for admin moderation

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';
import { getCoordinates, getRiverData } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

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

    const { data: reports, error, count } = await supabase
      .from('community_reports')
      .select(`
        id,
        user_id,
        river_id,
        hazard_id,
        type,
        coordinates,
        river_mile,
        image_url,
        description,
        status,
        verified_by,
        verified_at,
        created_at,
        updated_at,
        gauge_height_ft,
        discharge_cfs,
        access_point_id,
        gauge_station_id,
        submitter_name,
        rivers(id, name, slug),
        river_hazards(id, name),
        access_points(id, name)
      `, { count: 'exact' })
      .order('status', { ascending: true })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Error fetching community reports:', error);
      return NextResponse.json(
        { error: 'Could not fetch community reports' },
        { status: 500 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formatted = (reports || []).map((report: any) => {
      const riverData = getRiverData(report.rivers);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hazardData = report.river_hazards as any;
      const coords = getCoordinates(report.coordinates);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const accessPointData = report.access_points as any;

      return {
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
        gaugeHeightFt: report.gauge_height_ft ? parseFloat(report.gauge_height_ft) : null,
        dischargeCfs: report.discharge_cfs ? parseFloat(report.discharge_cfs) : null,
        accessPointId: report.access_point_id,
        accessPointName: accessPointData?.name || null,
        gaugeStationId: report.gauge_station_id,
        submitterName: report.submitter_name,
      };
    });

    return NextResponse.json({
      reports: formatted,
      total: count ?? formatted.length,
      page,
      limit,
    });
  } catch (error) {
    console.error('Error in admin reports endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

const BULK_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PATCH /api/admin/reports - bulk-update the status of many reports at once.
export async function PATCH(request: NextRequest) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const body = await request.json().catch(() => null);
    const rawIds = body?.ids;
    const status = body?.status;

    if (status !== 'verified' && status !== 'rejected' && status !== 'pending') {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 });
    }
    if (rawIds.length > 200) {
      return NextResponse.json({ error: 'Too many ids (max 200)' }, { status: 400 });
    }
    const ids = rawIds.filter((id: unknown): id is string => typeof id === 'string' && BULK_UUID_RE.test(id));
    if (ids.length === 0) {
      return NextResponse.json({ error: 'No valid ids' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('community_reports')
      .update({
        status,
        verified_at: status === 'verified' ? now : null,
        updated_at: now,
      })
      .in('id', ids);

    if (error) {
      console.error('Error bulk-updating community reports:', error);
      return NextResponse.json({ error: 'Could not update reports' }, { status: 500 });
    }

    return NextResponse.json({ updated: ids.length });
  } catch (error) {
    console.error('Error in admin reports bulk endpoint:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
