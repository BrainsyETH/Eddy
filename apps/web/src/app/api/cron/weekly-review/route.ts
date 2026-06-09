// src/app/api/cron/weekly-review/route.ts
// GET — Weekly cron (Sunday night) for performance analysis and editorial guidance.

import { NextRequest, NextResponse } from 'next/server';
import { runWeeklyReview } from '@/lib/social/weekly-review';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Verify cron secret
  const auth = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const review = await runWeeklyReview();
    return NextResponse.json({
      ok: true,
      weekStart: review.weekStart,
      weekEnd: review.weekEnd,
      totalPosts: review.totalPosts,
      topPerformers: review.topPerformers.length,
      biasGuidance: review.biasGuidance,
    });
  } catch (error) {
    console.error('[Cron/WeeklyReview] Error:', error);
    return NextResponse.json(
      { error: 'Failed to run weekly review' },
      { status: 500 },
    );
  }
}
