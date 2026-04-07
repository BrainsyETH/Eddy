// src/app/api/admin/social/quick-post/route.ts
// POST — Quick-post a digest, river highlight, or tip with auto-generated caption + image

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth, logAdminAction } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { FacebookAdapter } from '@/lib/social/facebook-adapter';
import { InstagramAdapter } from '@/lib/social/instagram-adapter';
import { hasMetaCredentials, hasInstagramCredentials } from '@/lib/social/meta-client';
import {
  formatDailyDigestCaption,
  formatRiverHighlightCaption,
} from '@/lib/social/content-formatter';
import type { SocialPlatform, SocialCustomContent } from '@/lib/social/types';
import { triggerVideoRender, getCompositionForPost } from '@/lib/social/video-renderer';

export const dynamic = 'force-dynamic';

const BASE_URL = 'https://eddy.guide';

/** Truncate text to ~200 chars for video teaser (full text goes in caption) */
function truncateForVideo(text: string | null): string {
  if (!text) return '';
  if (text.length <= 200) return text;
  const truncated = text.slice(0, 200);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 140 ? truncated.slice(0, lastSpace) : truncated) + '...';
}

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

  const { type, riverSlug, contentId, platforms, asVideo } = body as {
    type: 'digest' | 'highlight' | 'tip';
    riverSlug?: string;
    contentId?: string;
    platforms: string[];
    asVideo?: boolean;
  };

  if (!type) {
    return NextResponse.json({ error: 'type is required (digest, highlight, tip)' }, { status: 400 });
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
    // Video rendering path — dispatch to GitHub Actions
    if (asVideo && (type === 'digest' || type === 'highlight')) {
      if (type === 'highlight' && !riverSlug) {
        return NextResponse.json({ error: 'riverSlug is required for highlight posts' }, { status: 400 });
      }
      return await dispatchVideoRender(supabase, validPlatforms, customContent, type, riverSlug);
    }

    if (type === 'digest') {
      return await postDigest(supabase, validPlatforms, customContent);
    } else if (type === 'highlight') {
      if (!riverSlug) {
        return NextResponse.json({ error: 'riverSlug is required for highlight posts' }, { status: 400 });
      }
      return await postHighlight(supabase, validPlatforms, customContent, riverSlug);
    } else if (type === 'tip') {
      if (!contentId) {
        return NextResponse.json({ error: 'contentId is required for tip posts' }, { status: 400 });
      }
      return await postTip(supabase, validPlatforms, contentId);
    } else {
      return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// --- Video Dispatch ---

async function dispatchVideoRender(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  platforms: SocialPlatform[],
  customContent: SocialCustomContent[],
  type: 'digest' | 'highlight',
  riverSlug?: string
) {
  // Build caption (same as image posts) and render data
  let renderData: Record<string, unknown> = {};
  const postType = type === 'digest' ? 'daily_digest' : 'river_highlight';
  let dispatched = 0;

  if (type === 'digest') {
    const { data: updates } = await supabase
      .from('eddy_updates')
      .select('river_slug, condition_code, gauge_height_ft, quote_text, summary_text')
      .neq('river_slug', 'global')
      .is('section_slug', null)
      .gt('expires_at', new Date().toISOString())
      .order('generated_at', { ascending: false });

    const seen = new Set<string>();
    const rivers = (updates || [])
      .filter((u: { river_slug: string }) => {
        if (seen.has(u.river_slug)) return false;
        seen.add(u.river_slug);
        return true;
      })
      .map((u: { river_slug: string; condition_code: string; gauge_height_ft: number | null }) => ({
        riverName: u.river_slug.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        conditionCode: u.condition_code,
        gaugeHeightFt: u.gauge_height_ft,
      }));

    renderData = {
      rivers,
      dateLabel: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    };
  } else if (type === 'highlight' && riverSlug) {
    const { data: update } = await supabase
      .from('eddy_updates')
      .select('river_slug, condition_code, gauge_height_ft, quote_text, summary_text')
      .eq('river_slug', riverSlug)
      .is('section_slug', null)
      .gt('expires_at', new Date().toISOString())
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!update) {
      return NextResponse.json({ error: `No current update found for ${riverSlug}` }, { status: 404 });
    }

    renderData = {
      riverName: update.river_slug.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      conditionCode: update.condition_code,
      gaugeHeightFt: update.gauge_height_ft,
      quoteText: truncateForVideo(update.quote_text),
      summaryText: truncateForVideo(update.summary_text),
    };
  }

  for (const platform of platforms) {
    // Clear today's records for this type/platform
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    await supabase
      .from('social_posts')
      .delete()
      .eq('post_type', postType)
      .eq('platform', platform)
      .gte('created_at', todayStart.toISOString());

    // Build caption
    let caption = '';
    let hashtags: string[] = [];
    if (type === 'digest') {
      const { data: globalUpdate } = await supabase
        .from('eddy_updates')
        .select('quote_text')
        .eq('river_slug', 'global')
        .is('section_slug', null)
        .gt('expires_at', new Date().toISOString())
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: allUpdates } = await supabase
        .from('eddy_updates')
        .select('river_slug, condition_code, gauge_height_ft, quote_text, summary_text')
        .neq('river_slug', 'global')
        .is('section_slug', null)
        .gt('expires_at', new Date().toISOString())
        .order('generated_at', { ascending: false });

      const seen2 = new Set<string>();
      const deduped = (allUpdates || []).filter((u: { river_slug: string }) => {
        if (seen2.has(u.river_slug)) return false;
        seen2.add(u.river_slug);
        return true;
      });

      const formatted = formatDailyDigestCaption(deduped, globalUpdate?.quote_text || null, customContent, platform);
      caption = formatted.caption;
      hashtags = formatted.hashtags;
    } else if (type === 'highlight' && riverSlug) {
      const { data: update } = await supabase
        .from('eddy_updates')
        .select('*')
        .eq('river_slug', riverSlug)
        .is('section_slug', null)
        .gt('expires_at', new Date().toISOString())
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (update) {
        const formatted = formatRiverHighlightCaption(update, customContent, platform);
        caption = formatted.caption;
        hashtags = formatted.hashtags;
      }
    }

    const imageUrl = type === 'digest'
      ? `${BASE_URL}/api/og/social?type=digest&platform=${platform}`
      : `${BASE_URL}/api/og/social?type=highlight&river=${riverSlug}&platform=${platform}`;

    // Insert rendering record
    const { data: record, error: insertError } = await supabase
      .from('social_posts')
      .insert({
        post_type: postType,
        platform,
        river_slug: riverSlug || null,
        caption,
        image_url: imageUrl,
        media_type: 'video',
        hashtags,
        status: 'rendering',
      })
      .select('id')
      .single();

    if (insertError) continue;

    // Dispatch to GitHub Actions
    const { compositionId, inputProps, outputFilename } = getCompositionForPost(
      postType as 'daily_digest' | 'river_highlight',
      renderData as Parameters<typeof getCompositionForPost>[1],
      platform as 'instagram' | 'facebook'
    );

    const success = await triggerVideoRender({
      postId: record.id,
      compositionId,
      inputProps,
      outputFilename,
    });

    if (success) {
      dispatched++;
    } else {
      // Fallback: update to image and let the cron retry pick it up
      await supabase
        .from('social_posts')
        .update({ media_type: 'image', status: 'failed', error_message: 'GH Actions dispatch failed' })
        .eq('id', record.id);
    }
  }

  logAdminAction({
    action: `quick_post_video_${type}`,
    entityType: 'social_post',
    details: { type, riverSlug, platforms, dispatched },
  });

  return NextResponse.json({ rendering: dispatched });
}

// --- Digest ---

async function postDigest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  platforms: SocialPlatform[],
  customContent: SocialCustomContent[]
) {
  // Fetch latest eddy updates
  const { data: updates } = await supabase
    .from('eddy_updates')
    .select('id, river_slug, condition_code, gauge_height_ft, quote_text, summary_text')
    .neq('river_slug', 'global')
    .is('section_slug', null)
    .gt('expires_at', new Date().toISOString())
    .order('generated_at', { ascending: false });

  // Deduplicate by river
  const seen = new Set<string>();
  const deduped = (updates || []).filter((u: { river_slug: string }) => {
    if (seen.has(u.river_slug)) return false;
    seen.add(u.river_slug);
    return true;
  });

  // Fetch global summary
  const { data: globalUpdate } = await supabase
    .from('eddy_updates')
    .select('summary_text')
    .eq('river_slug', 'global')
    .is('section_slug', null)
    .gt('expires_at', new Date().toISOString())
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const results = await publishToPlatforms(supabase, platforms, (platform) => {
    const { caption, hashtags } = formatDailyDigestCaption(
      deduped,
      globalUpdate?.summary_text || null,
      customContent,
      platform
    );
    const imageUrl = `${BASE_URL}/api/og/social?type=digest&platform=${platform}`;
    return { caption, imageUrl, hashtags, postType: 'daily_digest' as const, riverSlug: null };
  });

  logAdminAction({
    action: 'quick_post_digest',
    entityType: 'social_post',
    details: { platforms, results: results.map(r => ({ platform: r.platform, success: r.success })) },
  });

  return NextResponse.json({ results });
}

// --- Highlight ---

async function postHighlight(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  platforms: SocialPlatform[],
  customContent: SocialCustomContent[],
  riverSlug: string
) {
  const { data: update } = await supabase
    .from('eddy_updates')
    .select('id, river_slug, condition_code, gauge_height_ft, quote_text, summary_text')
    .eq('river_slug', riverSlug)
    .is('section_slug', null)
    .gt('expires_at', new Date().toISOString())
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!update) {
    return NextResponse.json({ error: `No current update found for ${riverSlug}` }, { status: 404 });
  }

  const results = await publishToPlatforms(supabase, platforms, (platform) => {
    const { caption, hashtags } = formatRiverHighlightCaption(update, customContent, platform);
    const imageUrl = `${BASE_URL}/api/og/social?type=highlight&river=${riverSlug}&platform=${platform}`;
    return { caption, imageUrl, hashtags, postType: 'river_highlight' as const, riverSlug };
  });

  logAdminAction({
    action: 'quick_post_highlight',
    entityType: 'social_post',
    details: { riverSlug, platforms, results: results.map(r => ({ platform: r.platform, success: r.success })) },
  });

  return NextResponse.json({ results });
}

// --- Tip ---

async function postTip(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  platforms: SocialPlatform[],
  contentId: string
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
    details: { contentId, platforms, results: results.map(r => ({ platform: r.platform, success: r.success })) },
  });

  return NextResponse.json({ results });
}

// --- Shared publish helper ---

type PostBuilder = (platform: SocialPlatform) => {
  caption: string;
  imageUrl: string;
  hashtags: string[];
  postType: 'daily_digest' | 'river_highlight' | 'manual';
  riverSlug: string | null;
};

async function publishToPlatforms(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  platforms: SocialPlatform[],
  buildPost: PostBuilder
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

    // Insert record
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
      const result = await adapter.publishPost({
        caption: post.caption,
        imageUrl: post.imageUrl,
      });

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
          .update({
            status: 'failed',
            error_message: result.error || 'Unknown error',
            updated_at: new Date().toISOString(),
          })
          .eq('id', record.id);

        results.push({ platform, success: false, error: result.error });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      await supabase
        .from('social_posts')
        .update({
          status: 'failed',
          error_message: msg,
          updated_at: new Date().toISOString(),
        })
        .eq('id', record.id);

      results.push({ platform, success: false, error: msg });
    }
  }

  return results;
}
