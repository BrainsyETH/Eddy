// src/app/api/admin/clips/post/route.ts
// POST — Publish an approved clip_library clip directly to Facebook/Instagram.
//
// Clips are already rendered (clip_url lives on the CDN), so we publish them
// straight through the Meta adapters as a video/Reel — no Remotion render. This
// is the "last mile" that turns an approved clip into a live post.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { FacebookAdapter } from '@/lib/social/facebook-adapter';
import { InstagramAdapter } from '@/lib/social/instagram-adapter';
import { hasMetaCredentials, hasInstagramCredentials } from '@/lib/social/meta-client';
import type { SocialPlatform } from '@/lib/social/types';

export const dynamic = 'force-dynamic';

function getAdapter(platform: SocialPlatform) {
  if (platform === 'facebook' && hasMetaCredentials()) return new FacebookAdapter();
  if (platform === 'instagram' && hasInstagramCredentials()) return new InstagramAdapter();
  return null;
}

function buildCaption(riverName: string, creator: string | null): { caption: string; hashtags: string[] } {
  const riverTag = '#' + riverName.replace(/[^A-Za-z0-9]/g, '');
  const hashtags = [riverTag, '#kayaking', '#canoe', '#float', '#paddling', '#Ozarks', '#Missouri', '#eddyguide'];
  const lines = [`🛶 ${riverName}.`, ''];
  if (creator) lines.push(`🎥 Clip via ${creator}`);
  lines.push('Plan your float trip at eddy.guide', '', hashtags.join(' '));
  return { caption: lines.join('\n'), hashtags };
}

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  const { clipId, platforms } = (body || {}) as { clipId?: string; platforms?: string[] };
  if (!clipId) {
    return NextResponse.json({ error: 'clipId is required' }, { status: 400 });
  }

  const validPlatforms = (platforms && platforms.length ? platforms : ['instagram', 'facebook']).filter(
    (p): p is SocialPlatform => p === 'facebook' || p === 'instagram',
  );
  if (validPlatforms.length === 0) {
    return NextResponse.json({ error: 'At least one platform is required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: clip, error } = await supabase
    .from('clip_library')
    .select('*')
    .eq('id', clipId)
    .single();

  if (error || !clip) {
    return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
  }
  if (clip.brand_check_status !== 'approved') {
    return NextResponse.json(
      { error: `Clip is not approved (brand_check_status=${clip.brand_check_status}) — run brand check first` },
      { status: 400 },
    );
  }
  if (!clip.clip_url) {
    return NextResponse.json({ error: 'Clip has no clip_url' }, { status: 400 });
  }

  // Resolve a human river name for the caption.
  let riverName = clip.river_slug || 'an Ozark river';
  if (clip.river_slug) {
    const { data: river } = await supabase.from('rivers').select('name').eq('slug', clip.river_slug).single();
    if (river?.name) riverName = river.name;
  }
  const { caption, hashtags } = buildCaption(riverName, clip.source_creator);

  const results: Array<{ platform: string; success: boolean; error?: string; postId?: string }> = [];
  const postedRowIds: string[] = [];

  for (const platform of validPlatforms) {
    const adapter = getAdapter(platform);
    if (!adapter) {
      results.push({ platform, success: false, error: `No credentials for ${platform}` });
      continue;
    }

    const { data: record, error: insertError } = await supabase
      .from('social_posts')
      .insert({
        post_type: 'river_highlight',
        platform,
        river_slug: clip.river_slug || null,
        caption,
        video_url: clip.clip_url,
        media_type: 'video',
        hashtags,
        status: 'publishing',
      })
      .select('id')
      .single();

    if (insertError) {
      results.push({ platform, success: false, error: insertError.message });
      continue;
    }

    try {
      const result = await adapter.publishPost({ caption, videoUrl: clip.clip_url, mediaType: 'video' });
      if (result.success) {
        await supabase
          .from('social_posts')
          .update({
            status: 'published',
            platform_post_id: result.platformPostId || null,
            published_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', record.id);
        results.push({ platform, success: true, postId: result.platformPostId });
        postedRowIds.push(record.id);
      } else {
        await supabase
          .from('social_posts')
          .update({ status: 'failed', error_message: result.error || 'Unknown error', updated_at: new Date().toISOString() })
          .eq('id', record.id);
        results.push({ platform, success: false, error: result.error });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      await supabase
        .from('social_posts')
        .update({ status: 'failed', error_message: msg, updated_at: new Date().toISOString() })
        .eq('id', record.id);
      results.push({ platform, success: false, error: msg });
    }
  }

  // Record which posts used this clip.
  if (postedRowIds.length > 0) {
    const used = Array.isArray(clip.used_in_posts) ? clip.used_in_posts : [];
    await supabase
      .from('clip_library')
      .update({ used_in_posts: [...used, ...postedRowIds], updated_at: new Date().toISOString() })
      .eq('id', clipId);
  }

  return NextResponse.json({ ok: results.some((r) => r.success), caption, results });
}
