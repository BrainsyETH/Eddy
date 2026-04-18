// src/lib/social/condition-alerts.ts
// Detects notable condition changes and publishes immediate social alerts

import { createAdminClient } from '@/lib/supabase/admin';
import { FacebookAdapter } from './facebook-adapter';
import { InstagramAdapter } from './instagram-adapter';
import { hasMetaCredentials, hasInstagramCredentials } from './meta-client';
import { formatConditionChangeCaption, getRiverName } from './content-formatter';
import { getOrCreateConfig } from './config-helpers';
import { triggerVideoRender } from './video-renderer';
import type { SocialPlatform, PlatformAdapter } from './types';

const LOG_PREFIX = '[ConditionAlert]';

// Human-readable labels for the rendered Reel. Mirrors SHORT_CONDITION_LABELS
// in content-formatter.ts but we re-declare here to keep the import surface
// small.
const CONDITION_LABEL: Record<string, string> = {
  flowing: 'flowing',
  good: 'good',
  low: 'low',
  too_low: 'too low',
  high: 'high',
  dangerous: 'dangerous',
  unknown: 'unknown',
};

// Notable transitions worth posting about
const NOTABLE_NEW_CONDITIONS = ['flowing', 'dangerous', 'high'];

function isNotableTransition(oldCondition: string, newCondition: string): boolean {
  // Any → flowing, dangerous, or high
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
 * Check if a condition-change alert was posted recently for this river +
 * new-condition pair (4h cooldown). Keying on the new condition lets a
 * flip-flop (dangerous→good→dangerous within 4h) still post the second
 * transition instead of being silenced by the first.
 *
 * Matches on `metadata->>'new_condition'` — set by publishConditionChangeAlert.
 */
async function hasRecentAlert(
  riverSlug: string,
  newCondition: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<boolean> {
  const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('social_posts')
    .select('id')
    .eq('post_type', 'condition_change')
    .eq('river_slug', riverSlug)
    .eq('metadata->>new_condition', newCondition)
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

  // Check cooldown — keyed on (river, newCondition) so a flip-flop can still alert
  const recent = await hasRecentAlert(riverSlug, newCondition, supabase);
  if (recent) {
    console.log(`${LOG_PREFIX} Skipping ${riverSlug}: ${newCondition} alert already posted in 4h window`);
    return { published: 0, skipped: true, reason: 'cooldown' };
  }

  // Load full config (posting_enabled + video_features flag)
  const { data: config, error: configError } = await getOrCreateConfig(supabase);
  if (configError || !config) {
    console.error(`${LOG_PREFIX} Config load failed: ${configError}`);
    return { published: 0, skipped: true, reason: 'config_error' };
  }

  if (!config.posting_enabled) {
    console.log(`${LOG_PREFIX} Posting disabled — skipping condition change alert`);
    return { published: 0, skipped: true, reason: 'posting_disabled' };
  }

  const asVideo = config.video_features?.condition_alerts_as_video === true;
  const baseUrl = 'https://eddy.guide';
  const platforms: SocialPlatform[] = ['facebook', 'instagram'];

  const metadata = {
    old_condition: oldCondition,
    new_condition: newCondition,
    gauge_height_ft: gaugeHeightFt,
  };

  if (asVideo) {
    return publishAsVideo({
      supabase, baseUrl, platforms,
      riverSlug, oldCondition, newCondition, gaugeHeightFt,
      metadata,
    });
  }

  // ─── Image path (default) ────────────────────────────────────────
  let published = 0;

  for (const platform of platforms) {
    const adapter = getAdapter(platform);
    if (!adapter) continue;

    const { caption, hashtags } = formatConditionChangeCaption({
      riverSlug,
      oldCondition,
      newCondition,
      gaugeHeightFt,
      platform,
    });

    const imageUrl = `${baseUrl}/api/og/social?type=highlight&river=${riverSlug}&platform=${platform}`;

    const { data: record, error: insertError } = await supabase
      .from('social_posts')
      .insert({
        post_type: 'condition_change',
        platform,
        river_slug: riverSlug,
        caption,
        image_url: imageUrl,
        hashtags,
        eddy_update_id: null,
        status: 'publishing',
        metadata,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error(`${LOG_PREFIX} Insert error for ${platform}:`, insertError.message);
      continue;
    }

    try {
      const result = await adapter.publishPost({ caption, imageUrl });

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

/**
 * Video path for condition-change alerts. Inserts one DB row per platform
 * in status='rendering', then dispatches a single GH Actions workflow that
 * renders the reel and calls back into /api/admin/social/video-callback —
 * the existing pipeline handles the rest (audio gate → Vercel Blob → publish).
 *
 * Reuses the `social-gauge-portrait` composition with the new condition as
 * the primary state and a synthesized quote describing the transition.
 */
async function publishAsVideo(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  baseUrl: string;
  platforms: SocialPlatform[];
  riverSlug: string;
  oldCondition: string;
  newCondition: string;
  gaugeHeightFt: number | null;
  metadata: { old_condition: string; new_condition: string; gauge_height_ft: number | null };
}): Promise<{ published: number; skipped: boolean; reason?: string }> {
  const { supabase, baseUrl, platforms, riverSlug, oldCondition, newCondition, gaugeHeightFt, metadata } = params;

  const riverName = getRiverName(riverSlug);
  const postIds: string[] = [];

  for (const platform of platforms) {
    const adapter = getAdapter(platform);
    if (!adapter) continue;

    const { caption, hashtags } = formatConditionChangeCaption({
      riverSlug,
      oldCondition,
      newCondition,
      gaugeHeightFt,
      platform,
    });

    const imageUrl = `${baseUrl}/api/og/social?type=highlight&river=${riverSlug}&platform=${platform}`;

    const { data: record, error: insertError } = await supabase
      .from('social_posts')
      .insert({
        post_type: 'condition_change',
        platform,
        river_slug: riverSlug,
        caption,
        image_url: imageUrl,
        media_type: 'video',
        hashtags,
        eddy_update_id: null,
        status: 'rendering',
        metadata,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error(`${LOG_PREFIX} Insert error for ${platform}:`, insertError.message);
      continue;
    }
    postIds.push(record.id);
  }

  if (postIds.length === 0) {
    return { published: 0, skipped: true, reason: 'no_credentials' };
  }

  // Pull optimal range for the river to drive the gauge bar
  let optimalMin = 1.5;
  let optimalMax = 4.0;
  const { data: gauge } = await supabase
    .from('river_gauges')
    .select('level_optimal_min, level_optimal_max')
    .eq('river_id', riverSlug)
    .eq('is_primary', true)
    .maybeSingle();
  if (gauge) {
    optimalMin = gauge.level_optimal_min ?? optimalMin;
    optimalMax = gauge.level_optimal_max ?? optimalMax;
  }

  const oldLabel = CONDITION_LABEL[oldCondition] ?? oldCondition;
  const newLabel = CONDITION_LABEL[newCondition] ?? newCondition;
  const quoteText = `Now ${newLabel} — up from ${oldLabel}. Check the full report.`;
  const dateLabel = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const dispatched = await triggerVideoRender({
    postIds: postIds.join(','),
    compositionId: 'social-gauge-portrait',
    inputProps: {
      riverName,
      conditionCode: newCondition,
      gaugeHeightFt: gaugeHeightFt ?? 0,
      optimalMin,
      optimalMax,
      quoteText,
      dateLabel,
      format: 'portrait',
    },
    outputFilename: `condition-change-${riverSlug}-${newCondition}-${Date.now()}`,
  });

  if (!dispatched) {
    // Mark all rendering rows failed so the reaper doesn't delete them
    // before a human can investigate.
    for (const id of postIds) {
      await supabase
        .from('social_posts')
        .update({
          status: 'failed',
          error_message: 'GH Actions dispatch failed — render not triggered',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
    }
    return { published: 0, skipped: true, reason: 'dispatch_failed' };
  }

  console.log(`${LOG_PREFIX} Video alert render dispatched for ${riverSlug}: ${oldCondition}→${newCondition} (${postIds.length} platform(s))`);
  return { published: 0, skipped: false, reason: 'rendering' };
}
