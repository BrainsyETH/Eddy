// src/app/api/admin/social/preview/route.ts
// GET /api/admin/social/preview — Dry-run of scheduled posts (no publishing).
// ?skip_time_check=true previews the FULL day (ignores each type's fire
// window and same-day dedup) instead of only what's due in the next 35 min.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildPostContext } from '@/lib/social/post-context';
import { POST_TYPES, type PostKind } from '@/lib/social/post-types';
import { getScheduledPosts } from '@/lib/social/post-scheduler';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  try {
    const skipTimeCheck = request.nextUrl.searchParams.get('skip_time_check') === 'true';
    const result = await getScheduledPosts({ skipTimeCheck });
    const supabase = createAdminClient();
    const { data: custom } = await supabase.from('social_custom_content').select('*').eq('active', true);
    const contexts = new Map<string, Awaited<ReturnType<typeof buildPostContext>>>();
    const posts = [];
    for (const post of result.posts) {
      if (!(post.postType in POST_TYPES)) { posts.push(post); continue; }
      const key = `${post.postType}:${post.riverSlug ?? ''}`;
      if (!contexts.has(key)) contexts.set(key, await buildPostContext(supabase, { postType: post.postType as PostKind, riverSlug: post.riverSlug ?? undefined }));
      const ctx = contexts.get(key);
      if (!ctx) continue;
      posts.push({ ...post, ...ctx.caption(post.platform, custom ?? []), imageUrl: ctx.imageUrl(post.platform) });
    }
    return NextResponse.json({
      posts,
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
