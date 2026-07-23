import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import { requireUser } from '@/lib/supabase/request';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get('limit')) || 50, 1), 100);
  const before = request.nextUrl.searchParams.get('before');
  const { data: stars, error: starError } = await auth.supabase
    .from('starred_rivers')
    .select('river_id')
    .eq('user_id', auth.user.id);
  if (starError) return apiError(500, 'internal_error', 'Could not load favorites');
  const riverIds = (stars || []).map((row) => row.river_id);
  if (riverIds.length === 0) return NextResponse.json({ events: [], nextCursor: null });

  let query = auth.supabase
    .from('river_condition_events')
    .select('id, river_id, old_condition_code, new_condition_code, kind, reading_value, reading_unit, reading_at, detected_at')
    .in('river_id', riverIds)
    .order('detected_at', { ascending: false })
    .limit(limit + 1);
  if (before) query = query.lt('detected_at', before);
  const { data, error } = await query;
  if (error) return apiError(500, 'internal_error', 'Could not load alert feed');
  const rows = data || [];
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return NextResponse.json({
    events: page.map((row) => ({
      id: row.id,
      riverId: row.river_id,
      oldConditionCode: row.old_condition_code,
      newConditionCode: row.new_condition_code,
      kind: row.kind,
      readingValue: row.reading_value,
      readingUnit: row.reading_unit,
      readingAt: row.reading_at,
      detectedAt: row.detected_at,
    })),
    nextCursor: hasMore ? page.at(-1)?.detected_at ?? null : null,
  });
}
