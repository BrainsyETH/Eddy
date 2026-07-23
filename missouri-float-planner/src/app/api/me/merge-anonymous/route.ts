import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermanentUser } from '@/lib/supabase/request';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await requirePermanentUser(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => null) as { anonymousAccessToken?: string } | null;
  const anonymousAccessToken = body?.anonymousAccessToken?.trim();
  if (!anonymousAccessToken) {
    return apiError(400, 'validation_failed', 'anonymousAccessToken is required');
  }

  const admin = createAdminClient();
  const { data: sourceData, error: sourceError } = await admin.auth.getUser(anonymousAccessToken);
  const source = sourceData.user;
  if (sourceError || !source) {
    return apiError(401, 'invalid_token', 'Anonymous session is invalid or expired');
  }
  if (!source.is_anonymous) {
    return apiError(400, 'validation_failed', 'Source session is not anonymous');
  }
  if (source.id === auth.user.id) {
    return NextResponse.json({ ok: true, merged: { stars: 0, plans: 0 } });
  }

  // Both sessions were independently verified. The RPC is service-role only
  // and transactionally unions favorites before moving owned plans.
  const { data, error } = await admin.rpc('merge_anonymous_user_data', {
    p_source_user_id: source.id,
    p_target_user_id: auth.user.id,
  });
  if (error) {
    console.error('[MergeAnonymous] merge failed:', error);
    return apiError(500, 'internal_error', 'Could not merge anonymous data');
  }

  return NextResponse.json({ ok: true, merged: data });
}
