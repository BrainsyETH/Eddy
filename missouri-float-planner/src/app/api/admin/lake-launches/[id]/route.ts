// src/app/api/admin/lake-launches/[id]/route.ts
// PATCH /api/admin/lake-launches/[id] — review a launch: methods, amenities,
// agency, fee, the access point it already is, a note, and approval.
//
// Approval is checked here before the database checks it again: a published
// launch has at least one method, at least one source, and coordinates inside
// the world. The access-point link is validated as an existing row so a typo
// cannot publish a launch that claims to be a place it is not.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { invalidIdResponse, isValidUUID, logAdminAction, requireAdminAuth } from '@/lib/admin-auth';
import { LAUNCH_ADMIN_COLUMNS } from '../route';

export const dynamic = 'force-dynamic';

const METHODS = new Set(['trailer', 'hand']);

interface Patch {
  launch_methods?: unknown;
  amenities?: unknown;
  managing_agency?: unknown;
  fee_required?: unknown;
  access_point_id?: unknown;
  review_note?: unknown;
  approved?: unknown;
}

function stringList(value: unknown, field: string, allowed?: Set<string>): string[] | NextResponse {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !v.trim())) {
    return NextResponse.json({ error: `${field} must be a list of non-empty strings` }, { status: 400 });
  }
  const list = [...new Set((value as string[]).map((v) => v.trim()))];
  if (allowed && list.some((v) => !allowed.has(v))) return NextResponse.json({ error: `${field} may only contain ${[...allowed].join(', ')}` }, { status: 400 });
  return list;
}

function databaseError(error: { code?: string }, writing = false) {
  if (writing && error.code === '23505') return NextResponse.json({ error: 'That access point is already linked to another launch.' }, { status: 409 });
  if (writing && error.code === '23503') return NextResponse.json({ error: 'The linked access point no longer exists. Choose another access point.' }, { status: 400 });
  if (writing && error.code === '23514') return NextResponse.json({ error: 'Check the launch methods, source information and coordinates before saving.' }, { status: 400 });
  console.error('[lake-launches] Database request failed:', error.code ?? 'unknown');
  return NextResponse.json({ error: 'Could not save the launch. Please try again.' }, { status: 500 });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;
  const { id } = await params;
  if (!isValidUUID(id)) return invalidIdResponse();
  const body = (await request.json().catch(() => null)) as Patch | null;
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'JSON body required' }, { status: 400 });

  const update: Record<string, unknown> = {};
  if ('launch_methods' in body) {
    const list = stringList(body.launch_methods, 'launch_methods', METHODS);
    if (list instanceof NextResponse) return list;
    update.launch_methods = list;
  }
  if ('amenities' in body) {
    const list = stringList(body.amenities, 'amenities');
    if (list instanceof NextResponse) return list;
    update.amenities = list;
  }
  if ('managing_agency' in body) {
    if (body.managing_agency !== null && (typeof body.managing_agency !== 'string' || body.managing_agency.length > 80)) return NextResponse.json({ error: 'managing_agency must be a short string or null' }, { status: 400 });
    update.managing_agency = typeof body.managing_agency === 'string' && body.managing_agency.trim() ? body.managing_agency.trim() : null;
  }
  if ('fee_required' in body) {
    if (body.fee_required !== null && typeof body.fee_required !== 'boolean') return NextResponse.json({ error: 'fee_required must be true, false or null' }, { status: 400 });
    update.fee_required = body.fee_required;
  }
  if ('review_note' in body) {
    if (body.review_note !== null && (typeof body.review_note !== 'string' || body.review_note.length > 2000)) return NextResponse.json({ error: 'review_note must be up to 2000 characters or null' }, { status: 400 });
    update.review_note = body.review_note;
  }

  const supabase = createAdminClient();

  if ('access_point_id' in body) {
    if (body.access_point_id === null) update.access_point_id = null;
    else {
      if (typeof body.access_point_id !== 'string' || !isValidUUID(body.access_point_id)) return NextResponse.json({ error: 'access_point_id must be a UUID or null' }, { status: 400 });
      const { data: point, error } = await supabase.from('access_points').select('id').eq('id', body.access_point_id).maybeSingle();
      if (error) return databaseError(error);
      if (!point) return NextResponse.json({ error: 'access_point_id names no access point' }, { status: 400 });
      update.access_point_id = body.access_point_id;
    }
  }

  if ('approved' in body) {
    if (typeof body.approved !== 'boolean') return NextResponse.json({ error: 'approved must be a boolean' }, { status: 400 });
    update.approved = body.approved;
    update.approved_at = body.approved ? new Date().toISOString() : null;
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  const { data: current, error: readError } = await supabase.from('lake_launches').select('approved, launch_methods, sources, longitude, latitude').eq('id', id).maybeSingle();
  if (readError) return databaseError(readError);
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Validate the resulting row, including Save on an already approved launch.
  // Sending approved=false and clearing methods together is a valid unpublish.
  if (update.approved === true || (!('approved' in update) && current.approved)) {
    const methods = (update.launch_methods as string[] | undefined) ?? (current.launch_methods as string[]);
    if (!methods.length) return NextResponse.json({ error: 'Set at least one launch method, or unpublish the launch before clearing its methods.' }, { status: 400 });
    if (!Array.isArray(current.sources) || current.sources.length === 0) return NextResponse.json({ error: 'A published launch needs at least one source' }, { status: 400 });
    const longitude = Number(current.longitude), latitude = Number(current.latitude);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return NextResponse.json({ error: 'Coordinates are not valid' }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const { data, error } = await supabase.from('lake_launches').update(update).eq('id', id).select(LAUNCH_ADMIN_COLUMNS).maybeSingle();
  if (error) return databaseError(error, true);
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await logAdminAction({ action: 'approved' in body ? (body.approved ? 'lake_launch_approve' : 'lake_launch_unapprove') : 'lake_launch_update', entityType: 'lake_launch', entityId: id, entityName: String(data.name), details: update });
  return NextResponse.json({ launch: data });
}
