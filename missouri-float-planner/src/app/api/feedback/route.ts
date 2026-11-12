// src/app/api/feedback/route.ts
// POST /api/feedback - Submit user feedback
// GET /api/feedback - List feedback (admin only)

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import {
  FEEDBACK_TYPES,
  type CreateFeedbackRequest,
  type FeedbackResponse,
  type Feedback,
  type FeedbackListResponse,
} from '@/types/api';
import {
  FEEDBACK_STATUSES,
  feedbackReplyFrom,
  mapFeedbackRow,
  REPORTED_PHOTO_TYPE,
} from '@/lib/feedback/admin';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 10 feedback submissions per IP per 15 minutes
    const rateLimitResult = await rateLimit(`feedback:${getClientIp(request)}`, 10, 15 * 60 * 1000, { failClosed: true });
    if (rateLimitResult) return rateLimitResult;

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

    // Length validation to prevent abuse
    if (message.length > 5000) {
      return NextResponse.json(
        { success: false, error: 'Message is too long (max 5000 characters)' } as FeedbackResponse,
        { status: 400 }
      );
    }

    if (userName && userName.length > 200) {
      return NextResponse.json(
        { success: false, error: 'Name is too long (max 200 characters)' } as FeedbackResponse,
        { status: 400 }
      );
    }

    if (userEmail.length > 320) {
      return NextResponse.json(
        { success: false, error: 'Email is too long' } as FeedbackResponse,
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

    // Must stay in step with the CHECK constraint (migration 00208). The test
    // suite compares this shared contract with the latest constraint so a new
    // client type cannot turn into a production 500 again.
    if (!FEEDBACK_TYPES.includes(feedbackType)) {
      return NextResponse.json(
        { success: false, error: 'Invalid feedback type' } as FeedbackResponse,
        { status: 400 }
      );
    }

    // All clients submit through this rate-limited, validated route.
    // Using the anon client here made INSERT ... RETURNING fail its SELECT RLS
    // policy even after the insert itself was accepted.
    const supabase = createAdminClient();

    // Insert feedback
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: insertError } = await (supabase.from as any)('feedback')
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
    // Admin-only: enforce the shared-secret bearer token (same model as /api/admin/*).
    const authError = await requireAdminAuth(request);
    if (authError) return authError;

    // Service-role client: RLS hides feedback rows from the anon client.
    const supabase = createAdminClient();

    // Get query params
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    // Bounded: an unbounded limit would let one request read the whole table.
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);

    // Build query
    let query = supabase
      .from('feedback')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && (FEEDBACK_STATUSES as readonly string[]).includes(status)) {
      query = query.eq('status', status);
    }

    const type = searchParams.get('type');
    if (type) {
      if (!(FEEDBACK_TYPES as readonly string[]).includes(type)) {
        return NextResponse.json({ error: 'Invalid feedback type' }, { status: 400 });
      }
      query = query.eq('feedback_type', type);
    }

    // The admin inbox pins pending reported photos above the list; this keeps
    // them from being listed (and paged) a second time underneath.
    if (searchParams.get('pinned') === 'photos') {
      query = query.or(`status.neq.pending,feedback_type.neq.${REPORTED_PHOTO_TYPE}`);
    }

    const { data, count, error: fetchError } = await query;

    if (fetchError) {
      console.error('Error fetching feedback:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch feedback' },
        { status: 500 }
      );
    }

    const feedback: Feedback[] = (data || []).map(mapFeedbackRow);

    return NextResponse.json({
      feedback,
      total: count || 0,
      replyFrom: feedbackReplyFrom(),
    } as FeedbackListResponse);
  } catch (error) {
    console.error('Error fetching feedback:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
