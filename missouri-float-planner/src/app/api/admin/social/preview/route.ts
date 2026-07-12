// src/app/api/admin/social/preview/route.ts
// GET /api/admin/social/preview — Dry-run of scheduled posts (no publishing).
// ?skip_time_check=true previews the FULL day (ignores each type's fire
// window and same-day dedup) instead of only what's due in the next 35 min.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { getScheduledPosts } from '@/lib/social/post-scheduler';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  try {
    const skipTimeCheck = request.nextUrl.searchParams.get('skip_time_check') === 'true';
    const result = await getScheduledPosts({ skipTimeCheck });
    return NextResponse.json({
      posts: result.posts,
      diagnostics: result.diagnostics,
      previewTime: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[SocialPreview] Error:', err);
    return NextResponse.json(
      { error: 'Failed to generate preview' },
      { status: 500 }
    );
  }
}
