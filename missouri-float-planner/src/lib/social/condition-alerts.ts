// src/lib/social/condition-alerts.ts
// Detects notable condition changes and publishes immediate social alerts

import { createAdminClient } from '@/lib/supabase/admin';
import { FacebookAdapter } from './facebook-adapter';
import { InstagramAdapter } from './instagram-adapter';
import { hasMetaCredentials, hasInstagramCredentials } from './meta-client';
import { formatConditionChangeCaption } from './content-formatter';
import type { SocialPlatform, PlatformAdapter, MediaType } from './types';
import { shouldGenerateAlertReel, getReelHashtags } from '@/lib/video/reel-scheduler';
import { generateConditionAlertReel } from '@/lib/video/reel-generator';

const LOG_PREFIX = '[ConditionAlert]';

// Notable transitions worth posting about
const NOTABLE_NEW_CONDITIONS = ['optimal', 'dangerous', 'high'];

function isNotableTransition(oldCondition: string, newCondition: string): boolean {
  // Any → optimal, dangerous, or high
  if (NOTABLE_NEW_CONDITIONS.includes(newCondition)) return true;
  // dangerous → anything else (flood warning lifted)
  if (oldCondition === 'dangerous' && newCondition !== 'dangerous') return true;
  return false;
}

function getAdapter(platform: SocialPlatform): PlatformAdapter | null {
  if (platform === 'facebook' && hasMetaCredentials()) return new FacebookAdapter();
  if (platform === 'instagram' && hasInstagramCredentials()) return new InstagramAdapter();
  return null;
}

/**
 * Check if a condition change alert was posted recently for this river (4h cooldown).
 */
async function hasRecentAlert(
  riverSlug: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<boolean> {
  const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('social_posts')
    .select('id')
    .eq('post_type', 'condition_change')
    .eq('river_slug', riverSlug)
    .gte('created_at', cutoff)
    .in('status', ['pending', 'publishing', 'published'])
    .limit(1);
  return (data && data.length > 0) || false;
}

/**
 * Called from gauge cron after detecting a condition change.
 * Checks if it's notable, respects cooldown, and publishes immediately.
 */
export async function publishConditionChangeAlert(params: {
  riverSlug: string;
  oldCondition: string;
  newCondition: string;
  gaugeHeightFt: number | null;
}): Promise<{ published: number; skipped: boolean; reason?: string }> {
  const { riverSlug, oldCondition, newCondition, gaugeHeightFt } = params;

  if (!isNotableTransition(oldCondition, newCondition)) {
    return { published: 0, skipped: true, reason: 'not_notable' };
  }

  const supabase = createAdminClient();

  // Check cooldown
  const recent = await hasRecentAlert(riverSlug, supabase);
  if (recent) {
    console.log(`${LOG_PREFIX} Skipping ${riverSlug}: condition change alert in 4h cooldown`);
    return { published: 0, skipped: true, reason: 'cooldown' };
  }

  // Check if posting is enabled
  const { data: config } = await supabase
    .from('social_config')
    .select('posting_enabled')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!config?.posting_enabled) {
    console.log(`${LOG_PREFIX} Posting disabled — skipping condition change alert`);
    return { published: 0, skipped: true, reason: 'posting_disabled' };
  }

  const baseUrl = 'https://eddy.guide';
  const platforms: SocialPlatform[] = ['facebook', 'instagram'];
  let published = 0;

  // Check if this alert should get a video reel
  const isReel = shouldGenerateAlertReel(oldCondition, newCondition);
  let alertVideoUrl: string | null = null;
  if (isReel) {
    console.log(`${LOG_PREFIX} Generating condition alert reel for ${riverSlug}...`);
    alertVideoUrl = await generateConditionAlertReel(
      riverSlug,
      oldCondition as Parameters<typeof generateConditionAlertReel>[1],
      newCondition as Parameters<typeof generateConditionAlertReel>[2]
    );
    if (alertVideoUrl) {
      console.log(`${LOG_PREFIX} Alert reel rendered: ${alertVideoUrl}`);
    } else {
      console.log(`${LOG_PREFIX} Alert reel generation failed, falling back to image`);
    }
  }

  const mediaType: MediaType = alertVideoUrl ? 'video' : 'image';

  for (const platform of platforms) {
    const adapter = getAdapter(platform);
    if (!adapter) continue;

    const { caption, hashtags: baseHashtags } = formatConditionChangeCaption({
      riverSlug,
      oldCondition,
      newCondition,
      gaugeHeightFt,
      platform,
    });

    const hashtags = alertVideoUrl
      ? [...baseHashtags, ...getReelHashtags(platform)]
      : baseHashtags;

    const imageUrl = `${baseUrl}/api/og/social?type=highlight&river=${riverSlug}&platform=${platform}`;

    // Insert record
    const { data: record, error: insertError } = await supabase
      .from('social_posts')
      .insert({
        post_type: 'condition_change',
        platform,
        river_slug: riverSlug,
        caption,
        image_url: imageUrl,
        video_url: alertVideoUrl,
        media_type: mediaType,
        hashtags,
        eddy_update_id: null,
        status: 'publishing',
      })
      .select('id')
      .single();

    if (insertError) {
      console.error(`${LOG_PREFIX} Insert error for ${platform}:`, insertError.message);
      continue;
    }

    try {
      const result = await adapter.publishPost({
        caption,
        imageUrl,
        videoUrl: alertVideoUrl || undefined,
        mediaType,
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

        published++;
        console.log(`${LOG_PREFIX} Published ${platform} alert: ${riverSlug} ${oldCondition}→${newCondition}`);
      } else {
        await supabase
          .from('social_posts')
          .update({
            status: 'failed',
            error_message: result.error || 'Unknown error',
            updated_at: new Date().toISOString(),
          })
          .eq('id', record.id);

        console.error(`${LOG_PREFIX} Failed ${platform} alert: ${result.error}`);
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
      console.error(`${LOG_PREFIX} Error publishing ${platform} alert:`, msg);
    }
  }

  return { published, skipped: false };
}
