// src/app/api/admin/social/preview/route.ts
// GET /api/admin/social/preview — Dry-run of scheduled posts (no publishing)

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { getScheduledPosts } from '@/lib/social/post-scheduler';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  try {
    const result = await getScheduledPosts();
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
