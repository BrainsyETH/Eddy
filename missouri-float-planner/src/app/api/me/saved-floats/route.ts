import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermanentUser } from '@/lib/supabase/request';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requirePermanentUser(request);
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await auth.supabase
    .from('float_plans')
    .select('id, short_code, river_id, start_access_id, end_access_id, vessel_type_id, distance_miles, estimated_float_minutes, created_at')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return apiError(500, 'internal_error', 'Could not load saved floats');
  return NextResponse.json({
    savedFloats: (data || []).map((row) => ({
      id: row.id,
      shortCode: row.short_code,
      riverId: row.river_id,
      startAccessId: row.start_access_id,
      endAccessId: row.end_access_id,
      vesselTypeId: row.vessel_type_id,
      distanceMiles: row.distance_miles,
      estimatedFloatMinutes: row.estimated_float_minutes,
      createdAt: row.created_at,
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermanentUser(request);
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return apiError(400, 'validation_failed', 'A float plan is required');

  // Reuse the canonical planner snapshot validation/save path, then claim the
  // newly-created anonymous row with the already-verified permanent account.
  const response = await fetch(new URL('/api/plan/save', request.nextUrl.origin), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': request.headers.get('x-forwarded-for') || '' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || !result.shortCode) {
    return NextResponse.json(result, { status: response.status });
  }
  const admin = createAdminClient();
  const { error } = await admin.from('float_plans').update({ user_id: auth.user.id })
    .eq('short_code', result.shortCode).is('user_id', null);
  if (error) return apiError(500, 'internal_error', 'Could not attach saved float to account');
  return NextResponse.json(result);
}
