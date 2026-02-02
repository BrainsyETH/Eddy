// src/app/api/feedback/route.ts
// POST /api/feedback - Submit user feedback
// GET /api/feedback - List feedback (admin only)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { CreateFeedbackRequest, FeedbackResponse, Feedback, FeedbackListResponse } from '@/types/api';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as CreateFeedbackRequest;

    const { feedbackType, userName, userEmail, message, imageUrl, context } = body;

    // Validation
    if (!userEmail?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Email is required' } as FeedbackResponse,
        { status: 400 }
      );
    }

    if (!message?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Message is required' } as FeedbackResponse,
        { status: 400 }
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail.trim())) {
      return NextResponse.json(
        { success: false, error: 'Invalid email address' } as FeedbackResponse,
        { status: 400 }
      );
    }

    const validTypes = ['inaccurate_data', 'missing_access_point', 'suggestion', 'bug_report', 'other'];
    if (!validTypes.includes(feedbackType)) {
      return NextResponse.json(
        { success: false, error: 'Invalid feedback type' } as FeedbackResponse,
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Insert feedback
    const { data, error: insertError } = await supabase
      .from('feedback')
      .insert({
        feedback_type: feedbackType,
        user_name: userName?.trim() || null,
        user_email: userEmail.trim(),
        message: message.trim(),
        image_url: imageUrl || null,
        context_type: context?.type || null,
        context_id: context?.id || null,
        context_name: context?.name || null,
        context_data: context?.data || null,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Error inserting feedback:', insertError);
      return NextResponse.json(
        { success: false, error: 'Failed to submit feedback' } as FeedbackResponse,
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      id: data.id,
    } as FeedbackResponse);
  } catch (error) {
    console.error('Error submitting feedback:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' } as FeedbackResponse,
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check admin status using the is_admin function
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: isAdmin, error: authError } = await (supabase.rpc as any)('is_admin');

    if (authError || !isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get query params
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Build query
    let query = supabase
      .from('feedback')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && ['pending', 'reviewed', 'resolved', 'dismissed'].includes(status)) {
      query = query.eq('status', status);
    }

    const { data, count, error: fetchError } = await query;

    if (fetchError) {
      console.error('Error fetching feedback:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch feedback' },
        { status: 500 }
      );
    }

    // Transform to API format
    const feedback: Feedback[] = (data || []).map((row) => ({
      id: row.id,
      feedbackType: row.feedback_type,
      userName: row.user_name,
      userEmail: row.user_email,
      message: row.message,
      imageUrl: row.image_url,
      contextType: row.context_type,
      contextId: row.context_id,
      contextName: row.context_name,
      contextData: row.context_data,
      status: row.status,
      adminNotes: row.admin_notes,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return NextResponse.json({
      feedback,
      total: count || 0,
    } as FeedbackListResponse);
  } catch (error) {
    console.error('Error fetching feedback:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
