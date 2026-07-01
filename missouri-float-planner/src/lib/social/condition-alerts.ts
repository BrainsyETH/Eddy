// src/lib/social/condition-alerts.ts
// Detects notable condition changes and publishes immediate social alerts.
//
// Two single-river alert kinds share one pipeline:
//   - 'warning'  — river crossed INTO elevated water (high / dangerous)
//   - 'recovery' — river dropped back OUT of elevated water into a floatable
//                  state (the "all-clear" the warning caption promises)
// Plus a batched STORM DIGEST: when several rivers cross into elevated water in
// the same cron pass, the cron posts ONE "rivers rising" digest instead of a
// barrage (see publishStormDigest + the caller in update-gauges).

import { createAdminClient } from '@/lib/supabase/admin';
import { FacebookAdapter } from './facebook-adapter';
import { InstagramAdapter } from './instagram-adapter';
import { hasMetaCredentials, hasInstagramCredentials } from './meta-client';
import {
  formatConditionChangeCaption,
  formatStormDigestCaption,
  getRiverName,
} from './content-formatter';
import { warningCopy, recoveryCopy, FOLLOW_CTA, formatRise } from '@shared/condition-copy';
import { getOrCreateConfig } from './config-helpers';
import { triggerVideoRender } from './video-renderer';
import type { SocialPlatform, PlatformAdapter } from './types';

const LOG_PREFIX = '[ConditionAlert]';

// Condition-change alerts are SAFETY WARNINGS. They fire when a river crosses
// from any non-elevated state (flowing/good/low/too_low) INTO elevated water
// (high or dangerous), and on escalation into 'dangerous' from anything (e.g.
// high→dangerous). Crossing only happens once because the gauge cron rewrites
// last_condition_code each step. We skip alerts from 'unknown' (a first-ever
// reading) to avoid spurious warnings on gauge initialization.
const ELEVATED = new Set(['high', 'dangerous']);
// "Back to floatable" targets for the all-clear (not low/too_low — those aren't
// a celebration, just a drought).
const FLOATABLE = new Set(['flowing', 'good']);

type AlertKind = 'warning' | 'recovery';

function isNotableTransition(oldCondition: string, newCondition: string): boolean {
  if (oldCondition === 'unknown') return false;     // don't alert on a first-ever reading
  if (!ELEVATED.has(newCondition)) return false;    // only warn when crossing INTO elevated water
  if (newCondition === 'high') return !ELEVATED.has(oldCondition); // safe → high
  return oldCondition !== 'dangerous';              // → dangerous from anything (incl. high→dangerous)
}

function isRecoveryTransition(oldCondition: string, newCondition: string): boolean {
  return ELEVATED.has(oldCondition) && FLOATABLE.has(newCondition);
}

/** True when the river crossed INTO elevated water — exported so the gauge cron
 *  can COUNT crossings in a pass and decide single-alerts vs a storm digest. */
export function isElevatedCrossing(oldCondition: string, newCondition: string): boolean {
  return isNotableTransition(oldCondition, newCondition);
}

function classifyTransition(oldCondition: string, newCondition: string): AlertKind | null {
  if (isNotableTransition(oldCondition, newCondition)) return 'warning';
  if (isRecoveryTransition(oldCondition, newCondition)) return 'recovery';
  return null;
}

function getAdapter(platform: SocialPlatform): PlatformAdapter | null {
  if (platform === 'facebook' && hasMetaCredentials()) return new FacebookAdapter();
  if (platform === 'instagram' && hasInstagramCredentials()) return new InstagramAdapter();
  return null;
}

/**
 * Recently-posted guard. Keyed on (post_type, river, new_condition) within a
 * window so a flip-flop across DIFFERENT conditions still alerts, but the same
 * transition isn't spammed. Storm digests pass river=null (global window).
 */
async function hasRecentPost(
  postType: string,
  riverSlug: string | null,
  newCondition: string | null,
  windowHours: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
  let q = supabase
    .from('social_posts')
    .select('id')
    .eq('post_type', postType)
    .gte('created_at', cutoff)
    .in('status', ['pending', 'publishing', 'rendering', 'published']);
  if (riverSlug) q = q.eq('river_slug', riverSlug);
  if (newCondition) q = q.eq('metadata->>new_condition', newCondition);
  const { data } = await q.limit(1);
  return (data && data.length > 0) || false;
}

interface GaugeContext {
  optimalMin: number;
  optimalMax: number;
  levelHigh?: number;
  levelDangerous?: number;
  /** "up 2.4 ft in 6h" (or "down …"), null when flat / no history. */
  riseText: string | null;
}

/** Load the primary gauge's thresholds + a plain-language 6h rise phrase. */
async function loadGaugeContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  riverSlug: string,
  currentFt: number | null,
): Promise<GaugeContext> {
  let optimalMin = 1.5;
  let optimalMax = 4.0;
  let levelHigh: number | undefined;
  let levelDangerous: number | undefined;
  let gaugeStationId: string | null = null;

  const { data: gauge } = await supabase
    .from('river_gauges')
    .select('level_optimal_min, level_optimal_max, level_high, level_dangerous, gauge_station_id')
    .eq('river_id', riverSlug)
    .eq('is_primary', true)
    .maybeSingle();
  if (gauge) {
    optimalMin = gauge.level_optimal_min ?? optimalMin;
    optimalMax = gauge.level_optimal_max ?? optimalMax;
    levelHigh = gauge.level_high ?? undefined;
    levelDangerous = gauge.level_dangerous ?? undefined;
    gaugeStationId = gauge.gauge_station_id ?? null;
  }

  let riseText: string | null = null;
  if (gaugeStationId && currentFt != null) {
    // Nearest reading in a 5–9h-ago window → a clean ~6h delta.
    const sixAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const nineAgo = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();
    const { data: past } = await supabase
      .from('gauge_readings')
      .select('gauge_height_ft, reading_timestamp')
      .eq('gauge_station_id', gaugeStationId)
      .lte('reading_timestamp', sixAgo)
      .gte('reading_timestamp', nineAgo)
      .order('reading_timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (past?.gauge_height_ft != null) {
      riseText = formatRise(currentFt - past.gauge_height_ft, 6);
    }
  }

  return { optimalMin, optimalMax, levelHigh, levelDangerous, riseText };
}

/** A cached AI cover-art URL by key ('danger' or a river slug), for the reel. */
async function loadBackgroundUrl(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  key: string,
): Promise<string | undefined> {
  const { data } = await supabase.from('og_backgrounds').select('url').eq('key', key).maybeSingle();
  return data?.url || undefined;
}

/**
 * Called from gauge cron after detecting a condition change. Classifies the
 * transition (warning / recovery / neither), respects cooldown, and publishes.
 */
export async function publishConditionChangeAlert(params: {
  riverSlug: string;
  oldCondition: string;
  newCondition: string;
  gaugeHeightFt: number | null;
}): Promise<{ published: number; skipped: boolean; reason?: string }> {
  const { riverSlug, oldCondition, newCondition, gaugeHeightFt } = params;

  const kind = classifyTransition(oldCondition, newCondition);
  if (!kind) return { published: 0, skipped: true, reason: 'not_notable' };

  const supabase = createAdminClient();
  const postType = kind === 'recovery' ? 'condition_recovery' : 'condition_change';

  const recent = await hasRecentPost(postType, riverSlug, newCondition, 4, supabase);
  if (recent) {
    console.log(`${LOG_PREFIX} Skipping ${riverSlug}: ${kind} ${newCondition} already posted in 4h window`);
    return { published: 0, skipped: true, reason: 'cooldown' };
  }

  const { data: config, error: configError } = await getOrCreateConfig(supabase);
  if (configError || !config) {
    console.error(`${LOG_PREFIX} Config load failed: ${configError}`);
    return { published: 0, skipped: true, reason: 'config_error' };
  }
  if (!config.posting_enabled) {
    console.log(`${LOG_PREFIX} Posting disabled — skipping ${kind} alert`);
    return { published: 0, skipped: true, reason: 'posting_disabled' };
  }

  const asVideo = config.video_features?.condition_alerts_as_video === true;
  const baseUrl = 'https://eddy.guide';
  const platforms: SocialPlatform[] = ['facebook', 'instagram'];

  const ctx = await loadGaugeContext(supabase, riverSlug, gaugeHeightFt);
  // Warning covers/reels use the generic 'danger' art; recovery uses the
  // river's own art (a calm, on-brand backdrop).
  const backgroundUrl = await loadBackgroundUrl(supabase, kind === 'recovery' ? riverSlug : 'danger');

  const metadata = {
    kind,
    old_condition: oldCondition,
    new_condition: newCondition,
    gauge_height_ft: gaugeHeightFt,
    rise_text: ctx.riseText,
  };

  const shared = {
    supabase, baseUrl, platforms, postType, kind,
    riverSlug, oldCondition, newCondition, gaugeHeightFt,
    ctx, backgroundUrl, metadata,
  };

  return asVideo ? publishAsVideo(shared) : publishAsImage(shared);
}

type PublishParams = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  baseUrl: string;
  platforms: SocialPlatform[];
  postType: string;
  kind: AlertKind;
  riverSlug: string;
  oldCondition: string;
  newCondition: string;
  gaugeHeightFt: number | null;
  ctx: GaugeContext;
  backgroundUrl?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: Record<string, any>;
};

/** Build the pinned OG cover URL for a single-river alert. */
function coverUrl(p: PublishParams, platform: SocialPlatform): string {
  const { baseUrl, riverSlug, oldCondition, newCondition, gaugeHeightFt, kind, ctx } = p;
  const parts = [
    `type=warning`,
    `river=${riverSlug}`,
    `from=${oldCondition}`,
    `to=${newCondition}`,
    gaugeHeightFt != null ? `ft=${gaugeHeightFt}` : '',
    kind === 'recovery' ? `kind=recovery` : '',
    ctx.riseText ? `rise=${encodeURIComponent(ctx.riseText)}` : '',
    `platform=${platform}`,
  ].filter(Boolean);
  return `${baseUrl}/api/og/social?${parts.join('&')}`;
}

// ─── Image path (default) ────────────────────────────────────────
async function publishAsImage(p: PublishParams): Promise<{ published: number; skipped: boolean; reason?: string }> {
  const { supabase, postType, kind, riverSlug, oldCondition, newCondition, gaugeHeightFt, ctx, metadata } = p;
  let published = 0;

  for (const platform of p.platforms) {
    const adapter = getAdapter(platform);
    if (!adapter) continue;

    const { caption, hashtags } = formatConditionChangeCaption({
      riverSlug, oldCondition, newCondition, gaugeHeightFt, platform,
      kind, riseText: ctx.riseText,
    });
    const imageUrl = coverUrl(p, platform);

    const { data: record, error: insertError } = await supabase
      .from('social_posts')
      .insert({
        post_type: postType,
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
        await supabase.from('social_posts').update({
          status: 'published',
          platform_post_id: result.platformPostId || null,
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', record.id);
        published++;
        console.log(`${LOG_PREFIX} Published ${platform} ${kind}: ${riverSlug} ${oldCondition}→${newCondition}`);
      } else {
        await supabase.from('social_posts').update({
          status: 'failed',
          error_message: result.error || 'Unknown error',
          updated_at: new Date().toISOString(),
        }).eq('id', record.id);
        console.error(`${LOG_PREFIX} Failed ${platform} ${kind}: ${result.error}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      await supabase.from('social_posts').update({
        status: 'failed', error_message: msg, updated_at: new Date().toISOString(),
      }).eq('id', record.id);
      console.error(`${LOG_PREFIX} Error publishing ${platform} ${kind}:`, msg);
    }
  }

  return { published, skipped: false };
}

/**
 * Video path — inserts one 'rendering' row per platform, then dispatches a
 * single GH Actions render (social-gauge-portrait) that calls back into
 * /api/admin/social/video-callback. Warning reels run in warningMode; recovery
 * reels in the calm "all-clear" mode. The OG cover is still the pinned thumbnail.
 */
async function publishAsVideo(p: PublishParams): Promise<{ published: number; skipped: boolean; reason?: string }> {
  const { supabase, postType, kind, riverSlug, oldCondition, newCondition, gaugeHeightFt, ctx, backgroundUrl, metadata } = p;
  const riverName = getRiverName(riverSlug);
  const postIds: string[] = [];

  for (const platform of p.platforms) {
    const adapter = getAdapter(platform);
    if (!adapter) continue;

    const { caption, hashtags } = formatConditionChangeCaption({
      riverSlug, oldCondition, newCondition, gaugeHeightFt, platform,
      kind, riseText: ctx.riseText,
    });
    const imageUrl = coverUrl(p, platform);

    const { data: record, error: insertError } = await supabase
      .from('social_posts')
      .insert({
        post_type: postType,
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

  if (postIds.length === 0) return { published: 0, skipped: true, reason: 'no_credentials' };

  const quoteText = (kind === 'recovery' ? recoveryCopy : warningCopy)(newCondition, riverName).quote;
  const dateLabel = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const dispatched = await triggerVideoRender({
    postIds: postIds.join(','),
    compositionId: 'social-gauge-portrait',
    inputProps: {
      riverName,
      conditionCode: newCondition,
      previousCondition: oldCondition,
      warningMode: kind === 'warning',
      recovery: kind === 'recovery',
      gaugeHeightFt: gaugeHeightFt ?? 0,
      optimalMin: ctx.optimalMin,
      optimalMax: ctx.optimalMax,
      levelHigh: ctx.levelHigh,
      levelDangerous: ctx.levelDangerous,
      riseText: ctx.riseText ?? undefined,
      backgroundUrl,
      followCta: FOLLOW_CTA,
      quoteText,
      dateLabel,
      format: 'portrait',
    },
    outputFilename: `condition-${kind}-${riverSlug}-${newCondition}-${Date.now()}`,
  });

  if (!dispatched) {
    for (const id of postIds) {
      await supabase.from('social_posts').update({
        status: 'failed',
        error_message: 'GH Actions dispatch failed — render not triggered',
        updated_at: new Date().toISOString(),
      }).eq('id', id);
    }
    return { published: 0, skipped: true, reason: 'dispatch_failed' };
  }

  console.log(`${LOG_PREFIX} ${kind} reel dispatched for ${riverSlug}: ${oldCondition}→${newCondition} (${postIds.length} platform(s))`);
  return { published: 0, skipped: false, reason: 'rendering' };
}

/**
 * STORM DIGEST — one image post for MANY rivers rising in the same cron pass,
 * instead of a barrage of individual warnings (cheaper + more shareable). Called
 * by the gauge cron when >= STORM_THRESHOLD rivers cross into elevated water.
 */
export async function publishStormDigest(
  changes: Array<{ riverSlug: string; newCondition: string }>,
): Promise<{ published: number; skipped: boolean; reason?: string }> {
  if (changes.length === 0) return { published: 0, skipped: true, reason: 'empty' };

  const supabase = createAdminClient();

  // One storm digest per 2h window (global) so a long rain event doesn't spam.
  const recent = await hasRecentPost('storm_digest', null, null, 2, supabase);
  if (recent) return { published: 0, skipped: true, reason: 'cooldown' };

  const { data: config } = await getOrCreateConfig(supabase);
  if (!config?.posting_enabled) return { published: 0, skipped: true, reason: 'posting_disabled' };

  const baseUrl = 'https://eddy.guide';
  const platforms: SocialPlatform[] = ['facebook', 'instagram'];
  const riversParam = encodeURIComponent(
    changes.map((c) => `${c.riverSlug}:${c.newCondition}`).join(','),
  );
  const metadata = { kind: 'storm', rivers: changes.map((c) => c.riverSlug), count: changes.length };

  let published = 0;
  for (const platform of platforms) {
    const adapter = getAdapter(platform);
    if (!adapter) continue;

    const { caption, hashtags } = formatStormDigestCaption(changes);
    const imageUrl = `${baseUrl}/api/og/social?type=storm&rivers=${riversParam}&platform=${platform}`;

    const { data: record, error: insertError } = await supabase
      .from('social_posts')
      .insert({
        post_type: 'storm_digest',
        platform,
        river_slug: null,
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
      console.error(`${LOG_PREFIX} Storm insert error for ${platform}:`, insertError.message);
      continue;
    }

    try {
      const result = await adapter.publishPost({ caption, imageUrl });
      if (result.success) {
        await supabase.from('social_posts').update({
          status: 'published',
          platform_post_id: result.platformPostId || null,
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', record.id);
        published++;
        console.log(`${LOG_PREFIX} Published ${platform} storm digest (${changes.length} rivers)`);
      } else {
        await supabase.from('social_posts').update({
          status: 'failed', error_message: result.error || 'Unknown error', updated_at: new Date().toISOString(),
        }).eq('id', record.id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      await supabase.from('social_posts').update({
        status: 'failed', error_message: msg, updated_at: new Date().toISOString(),
      }).eq('id', record.id);
      console.error(`${LOG_PREFIX} Error publishing ${platform} storm digest:`, msg);
    }
  }

  return { published, skipped: false };
}
