// src/app/api/admin/social/quick-post/route.ts
// POST — Quick-post any registered post type with auto-generated caption + media.
// All assembly (render data, caption, image) is unified in buildPostContext;
// this route just decides image vs video and inserts/dispatches/publishes.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth, logAdminAction } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdapter } from '@/lib/social/adapters';
import type { SocialPlatform, SocialCustomContent } from '@/lib/social/types';
import { triggerVideoRender, getCompositionForPost } from '@/lib/social/video-renderer';
import { buildPostContext, type PostContext } from '@/lib/social/post-context';
import type { PostKind, VideoPostKind } from '@/lib/social/post-types';

export const dynamic = 'force-dynamic';

const BASE_URL = 'https://eddy.guide';

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { type, riverSlug, contentId, platforms } = body as {
    type: 'digest' | 'highlight' | 'tip' | 'weekly_forecast' | 'section_guide' | 'weekly_trend';
    riverSlug?: string;
    contentId?: string;
    platforms: string[];
  };

  if (type === 'weekly_trend') return NextResponse.json({ error: 'Weekly Trend is retired. Generate an Eddy’s Read for a river instead.' }, { status: 410 });

  if (!type) {
    return NextResponse.json({ error: 'type is required' }, { status: 400 });
  }

  // TikTok is video-only (draft / inbox upload), so allow it for the video reel
  // types but never for the image-only `tip` path — its adapter rejects images.
  const tiktokAllowed = type !== 'tip';
  const validPlatforms = (platforms || []).filter(
    (p): p is SocialPlatform =>
      p === 'facebook' || p === 'instagram' || (p === 'tiktok' && tiktokAllowed)
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
      : type; // weekly_forecast | section_guide | weekly_trend

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
  const renderRequest = getCompositionForPost(kind, ctx.renderData);
  for (const platform of [...new Set(platforms)]) {
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
        auto_publish: false,
        render_request: renderRequest,
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

  const { compositionId, inputProps, outputFilename } = renderRequest;
  const success = await triggerVideoRender({ postIds: postIds.join(','), compositionId, inputProps, outputFilename }).catch(() => false);

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
  return NextResponse.json({ rendering: postIds.length, reviewRequired: true, warnings: insertErrors });
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

  return NextResponse.json({ results, reviewRequired: true });
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
        status: 'review',
        auto_publish: false,
      })
      .select('id')
      .single();

    if (insertError) {
      results.push({ platform, success: false, error: insertError.message });
      continue;
    }

    results.push({ platform, success: true, postId: record.id });

  }

  return results;
}
