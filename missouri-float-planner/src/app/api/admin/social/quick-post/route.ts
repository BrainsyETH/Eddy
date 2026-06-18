// src/app/api/admin/social/quick-post/route.ts
// POST — Quick-post any registered post type with auto-generated caption + media.
// All assembly (render data, caption, image) is unified in buildPostContext;
// this route just decides image vs video and inserts/dispatches/publishes.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth, logAdminAction } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { FacebookAdapter } from '@/lib/social/facebook-adapter';
import { InstagramAdapter } from '@/lib/social/instagram-adapter';
import { hasMetaCredentials, hasInstagramCredentials } from '@/lib/social/meta-client';
import type { SocialPlatform, SocialCustomContent } from '@/lib/social/types';
import { triggerVideoRender, getCompositionForPost } from '@/lib/social/video-renderer';
import { buildPostContext, type PostContext } from '@/lib/social/post-context';
import type { PostKind, VideoPostKind } from '@/lib/social/post-types';

export const dynamic = 'force-dynamic';

const BASE_URL = 'https://eddy.guide';

function getAdapter(platform: SocialPlatform) {
  if (platform === 'facebook' && hasMetaCredentials()) return new FacebookAdapter();
  if (platform === 'instagram' && hasInstagramCredentials()) return new InstagramAdapter();
  return null;
}

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { type, riverSlug, contentId, platforms } = body as {
    type: 'digest' | 'highlight' | 'tip' | 'weekly_forecast' | 'section_guide' | 'favorite_float' | 'weekly_trend';
    riverSlug?: string;
    contentId?: string;
    platforms: string[];
  };

  if (!type) {
    return NextResponse.json({ error: 'type is required' }, { status: 400 });
  }

  const validPlatforms = (platforms || []).filter(
    (p): p is SocialPlatform => p === 'facebook' || p === 'instagram'
  );
  if (validPlatforms.length === 0) {
    return NextResponse.json({ error: 'At least one platform is required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Load custom content for caption formatting
  const { data: customContentRows } = await supabase
    .from('social_custom_content')
    .select('*')
    .eq('active', true);
  const customContent = (customContentRows || []) as SocialCustomContent[];

  try {
    // Tip is content-driven (not eddy_updates) — handled separately.
    if (type === 'tip') {
      if (!contentId) {
        return NextResponse.json({ error: 'contentId is required for tip posts' }, { status: 400 });
      }
      return await postTip(supabase, validPlatforms, contentId);
    }

    if (type === 'highlight' && !riverSlug) {
      return NextResponse.json({ error: 'riverSlug is required for highlight posts' }, { status: 400 });
    }

    // Map the admin "type" to a canonical PostKind.
    const kind: VideoPostKind =
      type === 'digest' ? 'daily_digest'
      : type === 'highlight' ? 'river_highlight'
      : type; // weekly_forecast | section_guide | favorite_float | weekly_trend

    const ctx = await buildPostContext(supabase, { postType: kind, riverSlug });
    if (!ctx) {
      return NextResponse.json(
        { error: `Nothing to post for ${kind} — no fresh river data / floatable rivers / notable trend right now.` },
        { status: 404 },
      );
    }

    // All non-tip formats are video-only.
    return await dispatchVideo(supabase, kind, ctx, validPlatforms, customContent);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// --- Video: insert rendering rows + dispatch ONE GH Actions render ---

async function dispatchVideo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  kind: VideoPostKind,
  ctx: PostContext,
  platforms: SocialPlatform[],
  customContent: SocialCustomContent[],
) {
  const postIds: string[] = [];
  const insertErrors: string[] = [];
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  for (const platform of platforms) {
    // Manual action — clear today's rows so the dedup index won't block.
    await supabase
      .from('social_posts')
      .delete()
      .eq('post_type', kind)
      .eq('platform', platform)
      .gte('created_at', todayStart.toISOString());

    const { caption, hashtags } = ctx.caption(platform, customContent);
    const { data: record, error: insertError } = await supabase
      .from('social_posts')
      .insert({
        post_type: kind,
        platform,
        river_slug: ctx.riverSlug,
        caption,
        image_url: ctx.imageUrl(platform),
        media_type: 'video',
        hashtags,
        status: 'rendering',
      })
      .select('id')
      .single();

    if (insertError) {
      insertErrors.push(`${platform}: ${insertError.message}`);
      continue;
    }
    postIds.push(record.id);
  }

  if (postIds.length === 0) {
    return NextResponse.json(
      { error: insertErrors.length > 0 ? `No records created — ${insertErrors.join('; ')}` : 'No records created' },
      { status: 500 },
    );
  }

  const { compositionId, inputProps, outputFilename } = getCompositionForPost(kind, ctx.renderData);
  const success = await triggerVideoRender({ postIds: postIds.join(','), compositionId, inputProps, outputFilename });

  if (!success) {
    const reason = 'GH Actions dispatch returned non-204 — check GH_ACTIONS_TOKEN scope/expiry and that workflow render-social-video.yml exists on the configured ref.';
    for (const id of postIds) {
      await supabase.from('social_posts').update({ status: 'failed', error_message: reason }).eq('id', id);
    }
    logAdminAction({
      action: `quick_post_${kind}`,
      entityType: 'social_post',
      details: { platforms, dispatched: 0, reason: 'gh_actions_dispatch_failed' },
    });
    return NextResponse.json(
      { error: 'GH Actions workflow dispatch failed — check GH_ACTIONS_TOKEN and workflow file' },
      { status: 502 },
    );
  }

  logAdminAction({
    action: `quick_post_${kind}`,
    entityType: 'social_post',
    details: { platforms, dispatched: postIds.length },
  });
  return NextResponse.json({ rendering: postIds.length });
}

// --- Tip (custom content, image-only) ---

async function postTip(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  platforms: SocialPlatform[],
  contentId: string,
) {
  const { data: content } = await supabase
    .from('social_custom_content')
    .select('*')
    .eq('id', contentId)
    .single();

  if (!content) {
    return NextResponse.json({ error: 'Content not found' }, { status: 404 });
  }

  const caption = `${content.text}\n\neddy.guide`;
  const imageUrl = `${BASE_URL}/api/og/social?type=tip&id=${contentId}`;

  const results = await publishToPlatforms(supabase, platforms, () => ({
    caption,
    imageUrl,
    hashtags: [],
    postType: 'manual' as const,
    riverSlug: null,
  }));

  logAdminAction({
    action: 'quick_post_tip',
    entityType: 'social_post',
    details: { contentId, platforms, results: results.map((r) => ({ platform: r.platform, success: r.success })) },
  });

  return NextResponse.json({ results });
}

// --- Shared publish helper ---

type PostBuilder = (platform: SocialPlatform) => {
  caption: string;
  imageUrl: string;
  hashtags: string[];
  postType: PostKind | 'manual';
  riverSlug: string | null;
};

async function publishToPlatforms(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  platforms: SocialPlatform[],
  buildPost: PostBuilder,
) {
  const results: Array<{ platform: string; success: boolean; error?: string; postId?: string }> = [];

  for (const platform of platforms) {
    const adapter = getAdapter(platform);
    if (!adapter) {
      results.push({ platform, success: false, error: `No credentials for ${platform}` });
      continue;
    }

    const post = buildPost(platform);

    // Admin quick-post is an intentional manual action — clear ALL existing
    // records for this post type/platform today so the dedup index won't block it.
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    await supabase
      .from('social_posts')
      .delete()
      .eq('post_type', post.postType)
      .eq('platform', platform)
      .gte('created_at', todayStart.toISOString());

    const { data: record, error: insertError } = await supabase
      .from('social_posts')
      .insert({
        post_type: post.postType,
        platform,
        river_slug: post.riverSlug,
        caption: post.caption,
        image_url: post.imageUrl,
        media_type: 'image',
        hashtags: post.hashtags,
        status: 'publishing',
      })
      .select('id')
      .single();

    if (insertError) {
      results.push({ platform, success: false, error: insertError.message });
      continue;
    }

    try {
      const result = await adapter.publishPost({ caption: post.caption, imageUrl: post.imageUrl });

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

  return results;
}
