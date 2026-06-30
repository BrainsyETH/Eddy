// src/app/api/feedback/[id]/route.ts
// PATCH /api/feedback/[id] - Update feedback status (admin only)

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth, isValidUUID, invalidIdResponse } from '@/lib/admin-auth';
import type { UpdateFeedbackRequest } from '@/types/api';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Admin-only: enforce the shared-secret bearer token (same model as /api/admin/*).
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const { id } = await params;
    if (!isValidUUID(id)) return invalidIdResponse();

    const body = await request.json() as UpdateFeedbackRequest;

    // Service-role client: RLS hides feedback rows from the anon client.
    const supabase = createAdminClient();

    // Validate status if provided
    const validStatuses = ['pending', 'reviewed', 'resolved', 'dismissed'];
    if (body.status && !validStatuses.includes(body.status)) {
      return NextResponse.json(
        { error: 'Invalid status' },
        { status: 400 }
      );
    }

    // Build update object
    const updates: Record<string, unknown> = {};
    if (body.status) {
      updates.status = body.status;
      updates.reviewed_at = new Date().toISOString();
      updates.reviewed_by = 'admin'; // Could be enhanced with actual user tracking
    }
    if (body.adminNotes !== undefined) {
      updates.admin_notes = body.adminNotes;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No updates provided' },
        { status: 400 }
      );
    }

    // Update feedback
    const { data, error: updateError } = await supabase
      .from('feedback')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

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

    return NextResponse.json({
      success: true,
      feedback: {
        id: data.id,
        feedbackType: data.feedback_type,
        userName: data.user_name,
        userEmail: data.user_email,
        message: data.message,
        imageUrl: data.image_url,
        contextType: data.context_type,
        contextId: data.context_id,
        contextName: data.context_name,
        contextData: data.context_data,
        status: data.status,
        adminNotes: data.admin_notes,
        reviewedBy: data.reviewed_by,
        reviewedAt: data.reviewed_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    });
  } catch (error) {
    console.error('Error updating feedback:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
