// src/app/api/feedback/[id]/route.ts
// PATCH /api/feedback/[id] - Update feedback status (admin only)

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminIdentity, requireAdminAuth, isValidUUID, invalidIdResponse } from '@/lib/admin-auth';
import { feedbackUpdate, mapFeedbackRow } from '@/lib/feedback/admin';
import { withAdminMutation } from '@/lib/admin/mutation-audit';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

async function handlePATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Admin-only: use the same session and server-side roles as /api/admin/*.
    const authError = await requireAdminAuth(request);
    if (authError) return authError;

    const { id } = await params;
    if (!isValidUUID(id)) return invalidIdResponse();

    const body = await request.json().catch(() => null);
    const parsed = feedbackUpdate(
      body,
      getAdminIdentity(request)?.name ?? 'Owner recovery',
    );
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    // Service-role client: RLS hides feedback rows from the anon client.
    const supabase = createAdminClient();
    const { data, error: updateError } = await supabase
      .from('feedback')
      .update(parsed.update)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (updateError) {
      console.error('Error updating feedback:', updateError);
      return NextResponse.json(
        { error: 'Failed to update feedback' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Feedback not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, feedback: mapFeedbackRow(data) });
  } catch (error) {
    console.error('Error updating feedback:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const PATCH = withAdminMutation(handlePATCH);
