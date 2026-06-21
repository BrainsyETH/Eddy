// src/app/api/admin/clips/route.ts
// GET — List clips from clip_library with optional filters

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// A social_posts row resolved from a clip's used_in_posts, or a tombstone for an
// id that no longer exists (an orphaned reference).
interface PostRef {
  id: string;
  status: string;
  platform: string;
  platform_post_id: string | null;
  published_at: string | null;
  error_message: string | null;
}
type ResolvedPost = PostRef | { id: string; missing: true };
type PostState = 'unposted' | 'published' | 'posting' | 'failed' | 'orphaned';

interface ClipRecord {
  id: string;
  used_in_posts: string[] | null;
  [key: string]: unknown;
}

// Collapse a clip's resolved posts into one state + summary for the UI.
function derivePostState(posts: ResolvedPost[]): {
  post_state: PostState;
  posts: ResolvedPost[];
  last_posted_at: string | null;
  posted_platforms: string[];
} {
  if (posts.length === 0) {
    return { post_state: 'unposted', posts, last_posted_at: null, posted_platforms: [] };
  }
  const real = posts.filter((p): p is PostRef => !('missing' in p));
  const published = real.filter((p) => p.status === 'published');
  const posting = real.filter((p) => p.status === 'publishing' || p.status === 'posting');
  const failed = real.filter((p) => p.status === 'failed');

  let post_state: PostState;
  if (published.length > 0) post_state = 'published';
  else if (posting.length > 0) post_state = 'posting';
  else if (failed.length > 0) post_state = 'failed';
  else if (real.length === 0) post_state = 'orphaned'; // referenced posts all gone
  else post_state = 'posting';

  const publishedDates = published
    .map((p) => p.published_at)
    .filter((d): d is string => !!d)
    .sort();
  const last_posted_at = publishedDates.length ? publishedDates[publishedDates.length - 1] : null;
  const posted_platforms = Array.from(new Set(published.map((p) => p.platform)));

  return { post_state, posts, last_posted_at, posted_platforms };
}

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const riverSlug = searchParams.get('river_slug');
  const brandStatus = searchParams.get('brand_status');
  const contentType = searchParams.get('content_type');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  const supabase = createAdminClient();

  let query = supabase
    .from('clip_library')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (riverSlug) query = query.eq('river_slug', riverSlug);
  if (brandStatus) query = query.eq('brand_check_status', brandStatus);
  if (contentType) query = query.eq('content_type', contentType);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const clips = (data || []) as ClipRecord[];

  // Resolve used_in_posts → real social_posts state so the library can show
  // whether a clip actually posted (not just "approved"), surface failures, and
  // flag orphaned references. The only clip→post link is used_in_posts;
  // social_posts has no clip_id.
  const postIds = Array.from(new Set(clips.flatMap((c) => c.used_in_posts || [])));

  const postsById = new Map<string, PostRef>();
  if (postIds.length > 0) {
    const { data: posts } = await supabase
      .from('social_posts')
      .select('id, status, platform, platform_post_id, published_at, error_message')
      .in('id', postIds);
    for (const p of (posts || []) as PostRef[]) postsById.set(p.id, p);
  }

  const enriched = clips.map((c) => {
    const ids = c.used_in_posts || [];
    const resolved: ResolvedPost[] = ids.map((id) => postsById.get(id) || { id, missing: true });
    return { ...c, ...derivePostState(resolved) };
  });

  return NextResponse.json({ clips: enriched, total: count });
}

const ALLOWED_STATUSES = ['pending', 'approved', 'rejected', 'review', 'failed'];

// PATCH — manual management of a clip: override the brand-check verdict
// (approve/reject), fix a wrong/null river, or edit metadata. Body: { id, ... }.
// updated_at is maintained by the DB trigger.
export async function PATCH(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  if (!body || typeof body.id !== 'string') {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.brand_check_status !== undefined) {
    if (!ALLOWED_STATUSES.includes(body.brand_check_status)) {
      return NextResponse.json(
        { error: `brand_check_status must be one of ${ALLOWED_STATUSES.join(', ')}` },
        { status: 400 },
      );
    }
    updates.brand_check_status = body.brand_check_status;
  }
  if (body.river_slug !== undefined) updates.river_slug = body.river_slug || null;
  if (body.content_type !== undefined) updates.content_type = body.content_type || null;
  if (body.tone !== undefined) updates.tone = body.tone || null;
  if (Array.isArray(body.content_tags)) updates.content_tags = body.content_tags;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('clip_library')
    .update(updates)
    .eq('id', body.id)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ clip: data });
}
