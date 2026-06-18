// src/lib/social/clip-poster.ts
// Shared logic for publishing an already-rendered clip_library clip to FB/IG.
// Used by the admin "post clip" button and the twice-daily post-clip cron.

import { FacebookAdapter } from './facebook-adapter';
import { InstagramAdapter } from './instagram-adapter';
import { hasMetaCredentials, hasInstagramCredentials } from './meta-client';
import type { SocialPlatform } from './types';

export interface ClipRow {
  id: string;
  clip_url: string | null;
  river_slug: string | null;
  source_creator: string | null;
  brand_check_status: string;
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

export function buildClipCaption(riverName: string, creator: string | null): { caption: string; hashtags: string[] } {
  const riverTag = '#' + riverName.replace(/[^A-Za-z0-9]/g, '');
  const hashtags = [riverTag, '#kayaking', '#canoe', '#float', '#paddling', '#Ozarks', '#Missouri', '#eddyguide'];
  const lines = [`🛶 ${riverName}.`, ''];
  if (creator) lines.push(`🎥 Clip via ${creator}`);
  lines.push('Plan your float trip at eddy.guide', '', hashtags.join(' '));
  return { caption: lines.join('\n'), hashtags };
}

// Publish one approved clip to the given platforms. Records social_posts rows
// and appends them to clip.used_in_posts. Caller ensures the clip is approved.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function publishClip(supabase: any, clip: ClipRow, platforms: SocialPlatform[]): Promise<ClipPostResult> {
  let riverName = clip.river_slug || 'an Ozark river';
  if (clip.river_slug) {
    const { data: river } = await supabase.from('rivers').select('name').eq('slug', clip.river_slug).single();
    if (river?.name) riverName = river.name;
  }
  const { caption, hashtags } = buildClipCaption(riverName, clip.source_creator);

  const results: ClipPostResult['results'] = [];
  const postedRowIds: string[] = [];

  for (const platform of platforms) {
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
      const result = await adapter.publishPost({ caption, videoUrl: clip.clip_url || undefined, mediaType: 'video' });
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
