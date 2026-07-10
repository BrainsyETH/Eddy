// src/lib/social/clip-poster.ts
// Shared logic for publishing an already-rendered clip_library clip to FB/IG.
// Used by the admin "post clip" button and the twice-daily post-clip cron.

import { FacebookAdapter } from './facebook-adapter';
import { InstagramAdapter } from './instagram-adapter';
import { hasMetaCredentials, hasInstagramCredentials } from './meta-client';
import { generateCaption } from './caption-generator';
import type { SocialPlatform, HookStyle } from './types';

/** Subset of the brand_check_result JSONB (written by brand-check-clip.yml) we read here. */
export interface BrandCheckResult {
  /** 1-2 sentence description of the footage, captured by the Claude vision pass. */
  scene_description?: string | null;
  scene_tags?: string[] | null;
  [key: string]: unknown;
}

export interface ClipRow {
  id: string;
  clip_url: string | null;
  river_slug: string | null;
  source_creator: string | null;
  brand_check_status: string;
  brand_check_result: BrandCheckResult | null;
  used_in_posts: string[] | null;
}

export interface ClipPostResult {
  ok: boolean;
  caption: string;
  results: Array<{ platform: string; success: boolean; error?: string; postId?: string }>;
}

function getAdapter(platform: SocialPlatform) {
  if (platform === 'facebook' && hasMetaCredentials()) return new FacebookAdapter();
  if (platform === 'instagram' && hasInstagramCredentials()) return new InstagramAdapter();
  return null;
}

// Tier 1 = a known Eddy river (river name + targeted hashtag + "plan your float
// trip" CTA pointing at a real guide page). Tier 2 = good paddling content with
// no known river (generic "Ozark paddling" header + softer CTA + no river/Missouri
// hashtag, since the clip may be out of state). Pass a null/empty riverName for
// Tier 2.
export function buildClipCaption(riverName: string | null, creator: string | null): { caption: string; hashtags: string[] } {
  const hasRiver = !!(riverName && riverName.trim());
  if (!hasRiver) {
    const hashtags = ['#kayaking', '#canoe', '#float', '#paddling', '#Ozarks', '#eddyguide'];
    const lines = ['🛶 Ozark paddling.', ''];
    if (creator) lines.push(`🎥 Clip via ${creator}`);
    lines.push('Find your next float at eddy.guide', '', hashtags.join(' '));
    return { caption: lines.join('\n'), hashtags };
  }
  const riverTag = '#' + riverName!.replace(/[^A-Za-z0-9]/g, '');
  const hashtags = [riverTag, '#kayaking', '#canoe', '#float', '#paddling', '#Ozarks', '#Missouri', '#eddyguide'];
  const lines = [`🛶 ${riverName}.`, ''];
  if (creator) lines.push(`🎥 Clip via ${creator}`);
  lines.push('Plan your float trip at eddy.guide', '', hashtags.join(' '));
  return { caption: lines.join('\n'), hashtags };
}

// Reposted clips carry NO live gauge/condition data, so the 'stat' and
// 'urgency' styles (which lean on numbers and time-sensitive scarcity) would
// only invite fabrication. Restrict clip captions to the styles that stay
// honest without live data.
const HOOK_STYLES: HookStyle[] = ['question', 'story'];

// Compose the caption + hashtags for a clip. Prefers an AI-written caption
// (knowledgeable-local tone, deduped against recent posts) when ANTHROPIC_API_KEY
// is configured, and falls back to the deterministic buildClipCaption template
// when the key is absent or the model returns nothing usable. The returned
// caption has the hashtags appended inline (matching how the templated caption
// is posted) and is guaranteed to carry the eddy.guide CTA.
async function composeClipCaption(
  riverName: string | null,
  creator: string | null,
  sceneDescription: string | null,
): Promise<{ caption: string; hashtags: string[] }> {
  const fallback = buildClipCaption(riverName, creator);
  if (!process.env.ANTHROPIC_API_KEY) return fallback;

  try {
    const hasRiver = !!(riverName && riverName.trim());
    const hookStyle = HOOK_STYLES[Math.floor(Math.random() * HOOK_STYLES.length)];
    const generated = await generateCaption({
      contentType: 'engagement',
      hookStyle,
      // Tier 2 (no known Eddy river) → frame it as general Ozark paddling.
      riverName: hasRiver ? riverName! : 'Ozarks',
      // Tier 2 clips have no confirmed river, so their location isn't confirmed
      // to be in Missouri — suppress Missouri/place-specific claims + hashtags.
      allowLocationHashtags: hasRiver,
      // scene_description (from the brand-check vision pass) grounds the caption
      // in what the footage actually shows, not just the river name. Null for
      // backlog clips checked before this field existed → caption stays river-only.
      clipMetadata: {
        sourceCreator: creator || undefined,
        description: sceneDescription || undefined,
      },
    });

    let caption = (generated.caption || '').trim();
    if (caption.length < 20) return fallback; // model returned nothing usable

    // The prompt asks for an eddy.guide CTA; ensure one is present regardless.
    if (!/eddy\.guide/i.test(caption)) {
      caption += `\n\n${hasRiver ? 'Plan your float trip' : 'Find your next float'} at eddy.guide`;
    }

    // Post the hashtags inline, the same way the templated caption does. Skip if
    // the model already wove tags into the body, to avoid duplicating them.
    const hashtags = generated.hashtags.length ? generated.hashtags : fallback.hashtags;
    if (!/#\w/.test(caption) && hashtags.length) {
      caption += `\n\n${hashtags.join(' ')}`;
    }

    return { caption, hashtags };
  } catch (err) {
    console.error('[clip-poster] AI caption failed, using template:', err);
    return fallback;
  }
}

// Publish one approved clip to the given platforms. Records social_posts rows
// and appends them to clip.used_in_posts. Caller ensures the clip is approved.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function publishClip(supabase: any, clip: ClipRow, platforms: SocialPlatform[]): Promise<ClipPostResult> {
  // Tier 2 clips have no river_slug → riverName stays null and composeClipCaption
  // produces the generic (no-river) caption.
  let riverName: string | null = null;
  if (clip.river_slug) {
    const { data: river } = await supabase.from('rivers').select('name').eq('slug', clip.river_slug).single();
    riverName = river?.name || clip.river_slug;
  }
  const sceneDescription = clip.brand_check_result?.scene_description?.trim() || null;
  const { caption, hashtags } = await composeClipCaption(riverName, clip.source_creator, sceneDescription);

  const results: ClipPostResult['results'] = [];
  const postedRowIds: string[] = [];

  for (const platform of platforms) {
    const adapter = getAdapter(platform);
    if (!adapter) {
      results.push({ platform, success: false, error: `No credentials for ${platform}` });
      continue;
    }

    // Idempotency guard: never re-post the same clip video to a platform that
    // already has a live (published) or in-flight (publishing) row for it. The
    // post-clip cron runs on a serverless timeout, and Reel publishing can take
    // minutes — if a prior run committed the Reel to Meta but was killed before
    // recording used_in_posts, this stops the next run from double-posting it.
    // A 'failed' row is intentionally NOT matched, so a genuine failure can retry.
    if (clip.clip_url) {
      const { data: existing } = await supabase
        .from('social_posts')
        .select('id, status')
        .eq('platform', platform)
        .eq('video_url', clip.clip_url)
        .in('status', ['publishing', 'published'])
        .limit(1);
      if (existing && existing.length > 0) {
        results.push({
          platform,
          success: false,
          error: `Already ${existing[0].status} on ${platform} for this clip — skipping to avoid a duplicate`,
        });
        continue;
      }
    }

    // Branded cover so the Reel's grid thumbnail isn't the black first video
    // frame (clips have no OG cover otherwise). Per-platform for the right size.
    const coverUrl =
      `https://eddy.guide/api/og/social?type=clip&platform=${platform}` +
      (clip.river_slug ? `&river=${encodeURIComponent(clip.river_slug)}` : '') +
      (clip.source_creator ? `&creator=${encodeURIComponent(clip.source_creator)}` : '');

    const { data: record, error: insertError } = await supabase
      .from('social_posts')
      .insert({
        post_type: 'river_highlight',
        platform,
        river_slug: clip.river_slug || null,
        caption,
        video_url: clip.clip_url,
        image_url: coverUrl,
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
      const result = await adapter.publishPost({ caption, videoUrl: clip.clip_url || undefined, coverUrl, mediaType: 'video' });
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

  if (postedRowIds.length > 0) {
    const used = Array.isArray(clip.used_in_posts) ? clip.used_in_posts : [];
    await supabase
      .from('clip_library')
      .update({ used_in_posts: [...used, ...postedRowIds], updated_at: new Date().toISOString() })
      .eq('id', clip.id);
  }

  return { ok: results.some((r) => r.success), caption, results };
}
