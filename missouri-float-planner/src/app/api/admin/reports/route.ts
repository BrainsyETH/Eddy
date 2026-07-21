// src/app/api/admin/reports/route.ts
// GET /api/admin/reports - List all community reports for admin moderation
//
// Community photos are quarantined in a private bucket until verification
// (audit F15): pending rows carry image_path and no image_url, so this route
// serves moderators short-lived signed URLs for preview, publishes objects to
// the public bucket on verify, and deletes stored copies on reject.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';
import { getCoordinates, getRiverData } from '@/lib/api-utils';
import { QUARANTINE_BUCKET } from '@/lib/uploads/visual-moderation';
import { applyMediaTransitions } from '@/lib/uploads/apply-media-transitions';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const SIGNED_PREVIEW_TTL_SECONDS = 60 * 60; // 1 hour — admin preview only

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
        image_path,
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

    // Quarantined (not yet published) photos have image_path and no
    // image_url. Batch-sign them so moderators can preview the private
    // objects; a signing failure just means no preview, never a 500.
    const signedByPath = new Map<string, string>();
    const pendingPaths = (reports || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((r: any) => r.image_path && !r.image_url)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => r.image_path as string);
    if (pendingPaths.length > 0) {
      const { data: signed, error: signError } = await supabase.storage
        .from(QUARANTINE_BUCKET)
        .createSignedUrls(pendingPaths, SIGNED_PREVIEW_TTL_SECONDS);
      if (signError) {
        logger.warn('Could not sign quarantined report images', { error: String(signError) });
      }
      for (const entry of signed || []) {
        if (entry.path && entry.signedUrl) signedByPath.set(entry.path, entry.signedUrl);
      }
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
        // Published URL when live; signed quarantine preview while pending.
        imageUrl: report.image_url ?? (report.image_path ? signedByPath.get(report.image_path) ?? null : null),
        imagePath: report.image_path,
        imagePublished: Boolean(report.image_url),
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

    // Snapshot media state BEFORE the status write so storage transitions
    // (publish on verify, takedown on reject) see the pre-change shape.
    const { data: mediaRows, error: mediaError } = await supabase
      .from('community_reports')
      .select('id, image_path, image_url')
      .in('id', ids);
    if (mediaError) {
      console.error('Error loading reports for moderation:', mediaError);
      return NextResponse.json({ error: 'Could not update reports' }, { status: 500 });
    }

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

    const media = await applyMediaTransitions(supabase, status, mediaRows || []);

    return NextResponse.json({ updated: ids.length, ...media });
  } catch (error) {
    console.error('Error in admin reports bulk endpoint:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
