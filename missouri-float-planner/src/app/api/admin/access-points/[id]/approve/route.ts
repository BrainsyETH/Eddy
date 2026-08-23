// src/app/api/admin/access-points/[id]/approve/route.ts
// POST /api/admin/access-points/[id]/approve - Approve an access point for public visibility
// DELETE /api/admin/access-points/[id]/approve - Unapprove an access point

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

    // ── Approval must answer the second question too ──────────────────────
    //
    // `is_float_endpoint` is opt-in (DEFAULT false, 20260823190713). Approving
    // a record without setting it produced a point that is drawn on the map,
    // has a public page, and is silently absent from both planner pickers —
    // the quiet half of the opt-in trade, and the half nobody reports.
    //
    // So the answer is required rather than defaulted here. The admin UI
    // pre-fills it from the point's roles (defaultFloatEndpoint in
    // src/lib/access-points/launch-roles.ts) and shows the result next to the
    // approve control, so the operator is confirming something visible rather
    // than being asked a question mid-click — this repo does not permit a
    // blocking dialog (scripts/admin/no-blocking-dialogs.test.ts).
    const body = (await request.json().catch(() => ({}))) as { isFloatEndpoint?: unknown };

    if (typeof body.isFloatEndpoint !== 'boolean') {
      return NextResponse.json(
        {
          error:
            'isFloatEndpoint (boolean) is required when approving: say whether this point may be chosen as a put-in or take-out.',
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('access_points')
      .update({
        approved: true,
        approved_at: new Date().toISOString(),
        is_float_endpoint: body.isFloatEndpoint,
      })
      .eq('id', id)
      .select('id, name, approved, is_float_endpoint')
      .single();

    if (error) {
      console.error('Error approving access point:', error);
      return NextResponse.json(
        { error: 'Could not approve access point' },
        { status: 500 }
      );
    }

    console.log(`Access point approved: ${data.name} (${data.id})`);

    return NextResponse.json({
      success: true,
      accessPoint: data,
      message: 'Access point is now visible in the public app',
    });
  } catch (error) {
    console.error('Error in approve endpoint:', error);
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

    const { data, error } = await supabase
      .from('access_points')
      .update({
        approved: false,
        approved_at: null,
      })
      .eq('id', id)
      .select('id, name, approved')
      .single();

    if (error) {
      console.error('Error unapproving access point:', error);
      return NextResponse.json(
        { error: 'Could not unapprove access point' },
        { status: 500 }
      );
    }

    console.log(`Access point unapproved: ${data.name} (${data.id})`);

    return NextResponse.json({
      success: true,
      accessPoint: data,
      message: 'Access point is now hidden from the public app',
    });
  } catch (error) {
    console.error('Error in unapprove endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
