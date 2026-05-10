// src/app/api/admin/social/health/route.ts
// GET — surface a one-glance health snapshot of the video render pipeline.
// Lets us notice "videos quietly stopped shipping" without grepping cron logs.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

interface PlatformStats {
  platform: string;
  videoPublished: number;
  imagePublished: number;
  failed: number;
  rendering: number;
  fallbackToImage: number;
  lastSuccessfulVideoAt: string | null;
}

interface HealthResponse {
  windowDays: number;
  generatedAt: string;
  videoPipelineHealthy: boolean;
  hoursSinceLastSuccessfulVideo: number | null;
  byPlatform: PlatformStats[];
  recentFallbackReasons: Array<{ reason: string; count: number; mostRecentAt: string }>;
}

interface SocialPostRow {
  platform: string;
  media_type: string;
  status: string;
  error_message: string | null;
  published_at: string | null;
  created_at: string;
}

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const windowDays = Math.min(
    Math.max(Number(request.nextUrl.searchParams.get('days') || '14'), 1),
    90,
  );
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const supabase = createAdminClient();
  const { data: rowsRaw, error } = await supabase
    .from('social_posts')
    .select('platform, media_type, status, error_message, published_at, created_at')
    .gte('created_at', since);

  if (error) {
    return NextResponse.json({ error: `Query failed: ${error.message}` }, { status: 500 });
  }

  const rows = (rowsRaw || []) as SocialPostRow[];
  const platforms = Array.from(new Set(rows.map((r) => r.platform))).sort();

  const byPlatform: PlatformStats[] = platforms.map((p) => {
    const subset = rows.filter((r) => r.platform === p);
    const videoPublished = subset.filter((r) => r.media_type === 'video' && r.status === 'published').length;
    const imagePublished = subset.filter((r) => r.media_type === 'image' && r.status === 'published').length;
    const failed = subset.filter((r) => r.status === 'failed').length;
    const rendering = subset.filter((r) => r.status === 'rendering').length;
    // Image-published rows that carry an error_message are the silent
    // fallback we now flag in cron/post-social. They look "healthy" by
    // status alone but represent a video that should have shipped.
    const fallbackToImage = subset.filter(
      (r) => r.status === 'published' && r.media_type === 'image' && r.error_message,
    ).length;
    const lastSuccessfulVideoAt = subset
      .filter((r) => r.media_type === 'video' && r.status === 'published' && r.published_at)
      .map((r) => r.published_at as string)
      .sort()
      .pop() || null;

    return {
      platform: p,
      videoPublished,
      imagePublished,
      failed,
      rendering,
      fallbackToImage,
      lastSuccessfulVideoAt,
    };
  });

  const lastVideoTimes = byPlatform
    .map((p) => p.lastSuccessfulVideoAt)
    .filter((t): t is string => Boolean(t));
  const lastVideoAt = lastVideoTimes.sort().pop() || null;
  const hoursSinceLastSuccessfulVideo = lastVideoAt
    ? Math.round(((Date.now() - new Date(lastVideoAt).getTime()) / (1000 * 60 * 60)) * 10) / 10
    : null;

  // 36h covers a missed daily run plus margin. Anything beyond that and the
  // pipeline almost certainly stopped working.
  const videoPipelineHealthy =
    hoursSinceLastSuccessfulVideo !== null && hoursSinceLastSuccessfulVideo <= 36;

  const reasonMap = new Map<string, { count: number; mostRecentAt: string }>();
  for (const r of rows) {
    if (!r.error_message) continue;
    const key = r.error_message.slice(0, 200);
    const prev = reasonMap.get(key);
    if (!prev) {
      reasonMap.set(key, { count: 1, mostRecentAt: r.created_at });
    } else {
      prev.count += 1;
      if (r.created_at > prev.mostRecentAt) prev.mostRecentAt = r.created_at;
    }
  }
  const recentFallbackReasons = Array.from(reasonMap.entries())
    .map(([reason, stats]) => ({ reason, count: stats.count, mostRecentAt: stats.mostRecentAt }))
    .sort((a, b) => (a.mostRecentAt < b.mostRecentAt ? 1 : -1))
    .slice(0, 10);

  const response: HealthResponse = {
    windowDays,
    generatedAt: new Date().toISOString(),
    videoPipelineHealthy,
    hoursSinceLastSuccessfulVideo,
    byPlatform,
    recentFallbackReasons,
  };

  return NextResponse.json(response);
}
