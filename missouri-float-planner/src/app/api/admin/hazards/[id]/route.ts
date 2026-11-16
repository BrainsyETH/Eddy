import { withAdminMutation } from '@/lib/admin/mutation-audit';
// src/app/api/admin/hazards/[id]/route.ts
// GET/PUT/DELETE /api/admin/hazards/[id] - Single river hazard admin operations

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth, isValidUUID, invalidIdResponse } from '@/lib/admin-auth';
import { HAZARD_COLUMNS, formatHazardRow } from '@/lib/admin/hazard-rows';
import { parseHazardBody } from '@/lib/admin/hazards';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await requireAdminAuth(request);
    if (authError) return authError;

    const { id } = await params;
    if (!isValidUUID(id)) return invalidIdResponse();
    const supabase = createAdminClient();

    const { data: hazard, error } = await supabase
      .from('river_hazards')
      .select(HAZARD_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error in GET hazard:', error);
      return NextResponse.json({ error: 'Could not load river hazard' }, { status: 500 });
    }
    if (!hazard) {
      return NextResponse.json({ error: 'River hazard not found' }, { status: 404 });
    }

    return NextResponse.json({ hazard: formatHazardRow(hazard) });
  } catch (error) {
    console.error('Error in GET hazard:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Update a hazard. Besides field edits, the body may carry:
 *  - `confirmCurrent: true` — "still there": record that it was checked today
 *    without changing anything (updated_at is the tool's last-checked time).
 *  - `expectedUpdatedAt` — the version the editor loaded; a mismatch is a 409
 *    so two admins cannot silently overwrite each other.
 */
async function handlePUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await requireAdminAuth(request);
    if (authError) return authError;

    const { id } = await params;
    if (!isValidUUID(id)) return invalidIdResponse();
    const body = await request.json().catch(() => null);
    const parsed = parseHazardBody(body, 'update');
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    if (Object.keys(parsed.write).length === 0 && body?.confirmCurrent !== true) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const supabase = createAdminClient();
    let update = supabase
      .from('river_hazards')
      .update({ ...parsed.write, updated_at: new Date().toISOString() })
      .eq('id', id);
    const expected = typeof body?.expectedUpdatedAt === 'string' ? body.expectedUpdatedAt : null;
    if (expected) update = update.eq('updated_at', expected);

    const { data: updated, error } = await update.select(HAZARD_COLUMNS).maybeSingle();

    if (error) {
      console.error('Error updating hazard:', error);
      return NextResponse.json({ error: 'Could not update river hazard' }, { status: 500 });
    }

    if (!updated) {
      // Nothing matched: either it is gone, or someone saved it first.
      const { data: current } = await supabase
        .from('river_hazards')
        .select(HAZARD_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      if (!current) return NextResponse.json({ error: 'River hazard not found' }, { status: 404 });
      return NextResponse.json(
        {
          error: 'This hazard changed since you opened it. Your edits are kept here.',
          code: 'stale',
          hazard: formatHazardRow(current),
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ hazard: formatHazardRow(updated) });
  } catch (error) {
    console.error('Error in PUT hazard:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function handleDELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await requireAdminAuth(request);
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

export const PUT = withAdminMutation(handlePUT);
export const DELETE = withAdminMutation(handleDELETE);
