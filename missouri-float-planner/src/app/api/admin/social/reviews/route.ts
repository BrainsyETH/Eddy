// src/app/api/admin/social/reviews/route.ts
// GET recent weekly performance reviews (Analytics tab). Read-only — the rows
// are written by the weekly-review cron (see src/lib/social/weekly-review.ts).

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '8', 10);

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('social_weekly_reviews')
    .select('week_start, week_end, review_data, content_mix, top_performers, learnings, bias_guidance, created_at')
    .order('week_start', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ reviews: data || [] }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    },
  });
}
