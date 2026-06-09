// src/app/api/cron/fetch-insights/route.ts
// GET — Daily cron to fetch Meta API engagement metrics for published posts.

import { NextRequest, NextResponse } from 'next/server';
import { fetchAllPendingInsights } from '@/lib/social/insights-fetcher';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Verify cron secret
  const auth = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = await fetchAllPendingInsights();
    return NextResponse.json({
      ok: true,
      ...results,
    });
  } catch (error) {
    console.error('[Cron/FetchInsights] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch insights' },
      { status: 500 },
    );
  }
}
