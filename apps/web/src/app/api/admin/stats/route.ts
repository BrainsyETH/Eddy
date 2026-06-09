// src/app/api/admin/stats/route.ts
// GET /api/admin/stats - Dashboard statistics for the admin panel

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const supabase = createAdminClient();

    // Run all count queries in parallel
    const [
      feedbackResult,
      pendingFeedbackResult,
      accessPointsResult,
      unapprovedApResult,
      riversResult,
      blogPostsResult,
      publishedPostsResult,
      gaugeStationsResult,
      poisResult,
    ] = await Promise.all([
      supabase.from('feedback').select('id', { count: 'exact', head: true }),
      supabase.from('feedback').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('access_points').select('id', { count: 'exact', head: true }),
      supabase.from('access_points').select('id', { count: 'exact', head: true }).eq('approved', false),
      supabase.from('rivers').select('id', { count: 'exact', head: true }),
      supabase.from('blog_posts').select('id', { count: 'exact', head: true }),
      supabase.from('blog_posts').select('id', { count: 'exact', head: true }).eq('status', 'published'),
      supabase.from('gauge_stations').select('id', { count: 'exact', head: true }),
      supabase.from('points_of_interest').select('id', { count: 'exact', head: true }),
    ]);

    // Get latest gauge reading timestamp
    const { data: latestGauge } = await supabase
      .from('gauge_readings')
      .select('reading_timestamp')
      .order('reading_timestamp', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      stats: {
        totalFeedback: feedbackResult.count ?? 0,
        pendingFeedback: pendingFeedbackResult.count ?? 0,
        totalAccessPoints: accessPointsResult.count ?? 0,
        unapprovedAccessPoints: unapprovedApResult.count ?? 0,
        totalRivers: riversResult.count ?? 0,
        totalBlogPosts: blogPostsResult.count ?? 0,
        publishedBlogPosts: publishedPostsResult.count ?? 0,
        totalGaugeStations: gaugeStationsResult.count ?? 0,
        totalPOIs: poisResult.count ?? 0,
        lastGaugeUpdate: latestGauge?.reading_timestamp ?? null,
      },
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
