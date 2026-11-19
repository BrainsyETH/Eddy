import { withAdminMutation } from '@/lib/admin/mutation-audit';

import { dispatchDailyReport } from '@/lib/social/daily-report-dispatch';
// src/app/api/admin/social/quick-post/route.ts
// POST — Quick-post any registered post type with auto-generated caption + media.
// All assembly (render data, caption, image) is unified in buildPostContext;
// this route just decides image vs video and inserts/dispatches/publishes.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth, logAdminAction } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdapter } from '@/lib/social/adapters';
import type { SocialPlatform, SocialCustomContent } from '@/lib/social/types';
import { dispatchVideos } from '@/lib/social/dispatch-videos';
import { expandDestinations, validPlacementChoices, type PlacementChoices } from '@/lib/social/placements';
import { SCHEDULED_FORMATS, placementChoicesFrom, resolveFormatSettings, type ScheduledFormat } from '@/lib/social/format-settings';
import { getOrCreateConfig } from '@/lib/social/config-helpers';
import { buildPostContext } from '@/lib/social/post-context';
import { supportsStory, type PostKind } from '@/lib/social/post-types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BASE_URL = 'https://eddy.guide';

async function handlePOST(request: NextRequest) {
  const authError = await requireAdminAuth(request);
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
  const tiktokAllowed = type !== 'tip' && type !== 'digest';
  const validPlatforms = (platforms || []).filter(
    (p): p is SocialPlatform =>
      p === 'facebook' || p === 'instagram' || (p === 'tiktok' && tiktokAllowed)
  );
  if (validPlatforms.length === 0) {
    return NextResponse.json({ error: 'At least one platform is required' }, { status: 400 });
  }

  if (body.placements !== undefined && (!supportsStory(type) || !validPlacementChoices(body.placements))) {
    return NextResponse.json({ error: 'Invalid placements for this format' }, { status: 400 });
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
      return await postTip(request, supabase, validPlatforms, contentId);
    }

    // Map the admin "type" to a canonical PostKind.
    const kind: Exclude<PostKind, 'tip'> =
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

    if (kind === 'daily_digest') {
      if (!ctx.carousel) throw new Error('Daily Report has no widget snapshots');
      const result = await dispatchDailyReport(ctx.carousel, validPlatforms, false);
      return NextResponse.json({ ...result, reviewRequired: true }, { status: result.rendering ? 200 : 502 });
    }

    // A one-off override wins; otherwise the format's saved placements apply.
    const storyLayout = supportsStory(kind);
    let placements: PlacementChoices | undefined = body.placements;
    if (storyLayout && placements === undefined && (SCHEDULED_FORMATS as readonly string[]).includes(kind)) {
      const config = await getOrCreateConfig(supabase);
      if (!config.data) throw new Error(config.error ?? 'Could not load saved placements');
      placements = placementChoicesFrom(resolveFormatSettings(config.data, kind as ScheduledFormat).destinations);
    }
    const destinations = expandDestinations(validPlatforms, placements, storyLayout);
    const posts = destinations.map(destination => ({
      ...destination, ...ctx.caption(destination.platform, customContent),
      riverSlug: ctx.riverSlug, imageUrl: ctx.imageUrl(destination.platform),
    }));
    const result = await dispatchVideos(supabase, kind, ctx.renderData, posts, false);
    logAdminAction({ request, action: `quick_post_${kind}`, entityType: 'social_post',
      details: { destinations, dispatched: result.rendering } });
    return NextResponse.json({ ...result, reviewRequired: true, ...(!result.rendering && { error: 'Video render could not start.' }) },
      { status: result.rendering ? 200 : 502 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// --- Tip (custom content, image-only) ---

async function postTip(
  request: NextRequest,
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

  logAdminAction({ request,
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
        format: post.postType,
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

export const POST = withAdminMutation(handlePOST);
