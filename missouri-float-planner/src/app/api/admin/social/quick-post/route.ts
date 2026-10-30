// src/app/api/admin/social/quick-post/route.ts
// POST — Quick-post any registered post type with auto-generated caption + media.
// All assembly (render data, caption, image) is unified in buildPostContext;
// this route just decides image vs video and inserts/dispatches/publishes.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth, logAdminAction } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdapter } from '@/lib/social/adapters';
import type { SocialPlatform, SocialCustomContent } from '@/lib/social/types';
import { triggerVideoRender, getCompositionForPost, shareTerrainMap } from '@/lib/social/video-renderer';
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

// --- Video: save drafts, then render each distinct destination layout ---

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
  const groups = new Map<string, { request: ReturnType<typeof getCompositionForPost>; ids: string[]; platforms: SocialPlatform[] }>();
  for (const platform of [...new Set(platforms)]) {
    const renderRequest = getCompositionForPost(kind, ctx.renderData, platform);
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
    const key = renderRequest.outputFilename;
    const group = groups.get(key) ?? { request: renderRequest, ids: [], platforms: [] };
    group.ids.push(record.id);
    group.platforms.push(platform);
    groups.set(key, group);
  }

  if (postIds.length === 0) {
    return NextResponse.json(
      { error: insertErrors.length > 0 ? `No records created — ${insertErrors.join('; ')}` : 'No records created' },
      { status: 500 },
    );
  }

  // Saved drafts keep the provider-free request; only the dispatches share the
  // prepared snapshot, so a later rerender fetches a fresh map of its own.
  const dispatches = [...groups.values()];
  const requests = await shareTerrainMap(dispatches.map(group => group.request));
  let rendering = 0;
  for (const [index, group] of dispatches.entries()) {
    const success = await triggerVideoRender({ ...requests[index], postIds: group.ids.join(',') }).catch(() => false);
    if (success) {
      rendering += group.ids.length;
      continue;
    }
    const reason = 'GH Actions dispatch failed — check GH_ACTIONS_TOKEN and render-social-video.yml.';
    for (const id of group.ids) {
      await supabase.from('social_posts').update({ status: 'failed', error_message: reason }).eq('id', id);
    }
    insertErrors.push(`${group.platforms.join(', ')}: ${reason}`);
  }

  logAdminAction({
    action: `quick_post_${kind}`,
    entityType: 'social_post',
    details: { platforms, dispatched: rendering },
  });
  if (!rendering) {
    return NextResponse.json({ error: 'GH Actions workflow dispatch failed — check GH_ACTIONS_TOKEN and workflow file', warnings: insertErrors }, { status: 502 });
  }
  return NextResponse.json({ rendering, reviewRequired: true, warnings: insertErrors });
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

  const results = await createDraftsForPlatforms(supabase, platforms, () => ({
    caption,
    imageUrl,
    hashtags: [],
    postType: 'manual' as const,
    riverSlug: null,
  }));

  logAdminAction({
    action: 'quick_post_tip',
    entityType: 'social_post',
    details: { contentId, platforms, results: results.map((r) => ({ platform: r.platform, status: r.status })) },
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

async function createDraftsForPlatforms(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  platforms: SocialPlatform[],
  buildPost: PostBuilder,
) {
  const results: Array<{ platform: string; status: 'review' | 'failed'; error?: string; postId?: string }> = [];

  for (const platform of platforms) {
    const adapter = getAdapter(platform);
    if (!adapter) {
      results.push({ platform, status: 'failed', error: `No credentials for ${platform}` });
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
      results.push({ platform, status: 'failed', error: insertError.message });
      continue;
    }

    results.push({ platform, status: 'review', postId: record.id });

  }

  return results;
}
