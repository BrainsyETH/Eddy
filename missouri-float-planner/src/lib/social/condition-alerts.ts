// src/lib/social/condition-alerts.ts
// Detects notable condition changes and publishes immediate social alerts.
//
// Two single-river alert kinds share one pipeline:
//   - 'warning'  — river crossed INTO elevated water (high / dangerous)
//   - 'recovery' — river dropped back OUT of elevated water into a floatable
//                  state (the "all-clear" the warning caption promises)
// Plus a batched STORM DIGEST: publishElevatedCrossings watches a rolling window
// and, once enough rivers have gone elevated (this pass + recent passes), posts
// ONE "rivers rising" digest and suppresses individual reels for the rest of the
// window — so a multi-hour storm produces one post, not a barrage. Multiple
// gauges on the same river collapse to a single most-severe entry.

import { createAdminClient } from '@/lib/supabase/admin';
import { FacebookAdapter } from './facebook-adapter';
import { InstagramAdapter } from './instagram-adapter';
import { hasMetaCredentials, hasInstagramCredentials } from './meta-client';
import {
  formatConditionChangeCaption,
  formatStormDigestCaption,
  getRiverName,
} from './content-formatter';
import { warningCopy, recoveryCopy, FOLLOW_CTA, formatRise, resolveTrend, type TrendDir } from '@shared/condition-copy';
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

type AlertKind = 'warning' | 'recovery' | 'easing';

function isNotableTransition(oldCondition: string, newCondition: string): boolean {
  if (oldCondition === 'unknown') return false;     // don't alert on a first-ever reading
  if (!ELEVATED.has(newCondition)) return false;    // only warn when crossing INTO elevated water
  if (newCondition === 'high') return !ELEVATED.has(oldCondition); // safe → high
  return oldCondition !== 'dangerous';              // → dangerous from anything (incl. high→dangerous)
}

function isRecoveryTransition(oldCondition: string, newCondition: string): boolean {
  return ELEVATED.has(oldCondition) && FLOATABLE.has(newCondition);
}

// De-escalation while STILL elevated: a river dropping from dangerous back to
// high. It's neither a crossing INTO elevated water (so it stays out of the
// storm-digest batching) nor an all-clear (high isn't floatable) — it gets its
// own "coming down, but still running high" notice so the dangerous alert's
// story has a follow-up instead of going silent until the full all-clear.
function isEasingTransition(oldCondition: string, newCondition: string): boolean {
  return oldCondition === 'dangerous' && newCondition === 'high';
}

/** True when the river crossed INTO elevated water — exported so the gauge cron
 *  can COUNT crossings in a pass and decide single-alerts vs a storm digest. */
export function isElevatedCrossing(oldCondition: string, newCondition: string): boolean {
  return isNotableTransition(oldCondition, newCondition);
}

function classifyTransition(oldCondition: string, newCondition: string): AlertKind | null {
  if (oldCondition === 'unknown') return null; // don't alert on a first-ever reading
  if (isNotableTransition(oldCondition, newCondition)) return 'warning';
  if (isEasingTransition(oldCondition, newCondition)) return 'easing';
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
  /** Signed 6h gauge delta (now − 6h ago), null when no history — drives trend. */
  riseDeltaFt: number | null;
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
  let riseDeltaFt: number | null = null;
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
      riseDeltaFt = currentFt - past.gauge_height_ft;
      riseText = formatRise(riseDeltaFt, 6);
    }
  }

  return { optimalMin, optimalMax, levelHigh, levelDangerous, riseText, riseDeltaFt };
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
  const postType =
    kind === 'recovery' ? 'condition_recovery' : kind === 'easing' ? 'condition_easing' : 'condition_change';

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
  // Trend for trend-aware copy: a river receding from dangerous into high is
  // FALLING and must not read as "risen into high water" (the 6h delta is the
  // primary signal; the condition-change direction is the fallback).
  const trend: TrendDir = resolveTrend(ctx.riseDeltaFt, oldCondition, newCondition);
  // Warning covers/reels use the generic 'danger' art; recovery uses the
  // river's own art (a calm, on-brand backdrop).
  const backgroundUrl = await loadBackgroundUrl(supabase, kind === 'recovery' ? riverSlug : 'danger');

  const metadata = {
    kind,
    old_condition: oldCondition,
    new_condition: newCondition,
    gauge_height_ft: gaugeHeightFt,
    rise_text: ctx.riseText,
    trend,
  };

  const shared = {
    supabase, baseUrl, platforms, postType, kind,
    riverSlug, oldCondition, newCondition, gaugeHeightFt,
    ctx, backgroundUrl, metadata, trend,
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
  trend: TrendDir;
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
      kind: kind === 'recovery' ? 'recovery' : 'warning', riseText: ctx.riseText, trend: p.trend,
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
      kind: kind === 'recovery' ? 'recovery' : 'warning', riseText: ctx.riseText, trend: p.trend,
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

  const quoteText = kind === 'recovery'
    ? recoveryCopy(newCondition, riverName).quote
    : warningCopy(newCondition, riverName, p.trend).quote;
  const dateLabel = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const dispatched = await triggerVideoRender({
    postIds: postIds.join(','),
    compositionId: 'social-gauge-portrait',
    inputProps: {
      riverName,
      conditionCode: newCondition,
      previousCondition: oldCondition,
      warningMode: kind === 'warning' || kind === 'easing',
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

// ─── Storm batching (rolling window) ─────────────────────────────
// A storm raises rivers over HOURS, so batching only within a single cron pass
// let a drip of individual reels through (each pass saw < threshold crossings).
// Instead we look back over a rolling window: as soon as the running total of
// rivers that have gone elevated reaches STORM_THRESHOLD, collapse into ONE
// digest and suppress individual reels for the rest of the window — the digest
// already tells people "rivers are rising, check conditions."
const STORM_THRESHOLD = 2;                 // rivers elevated within the window → digest
const STORM_WINDOW_HOURS = 2;              // rolling look-back (matches digest cooldown)
const ELEVATED_SEVERITY: Record<string, number> = { high: 1, dangerous: 2 };

/** Most-severe-per-river dedup: a river with two gauges crossing (high + later
 *  dangerous) collapses to a single entry so it never double-posts. */
function dedupeBySeverity<T extends { riverSlug: string; newCondition: string }>(items: T[]): T[] {
  const bySlug = new Map<string, T>();
  for (const it of items) {
    const prev = bySlug.get(it.riverSlug);
    if (!prev || (ELEVATED_SEVERITY[it.newCondition] ?? 0) > (ELEVATED_SEVERITY[prev.newCondition] ?? 0)) {
      bySlug.set(it.riverSlug, it);
    }
  }
  return Array.from(bySlug.values());
}

/** Count DISTINCT rivers that posted an individual warning in the window — the
 *  running tally of a storm building across cron passes (fb+ig collapse to one). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function countRecentWarningRivers(supabase: any, windowHours: number): Promise<number> {
  const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('social_posts')
    .select('river_slug')
    .eq('post_type', 'condition_change')
    .gte('created_at', cutoff)
    .in('status', ['pending', 'publishing', 'rendering', 'published']);
  if (!data) return 0;
  return new Set(data.map((r: { river_slug: string | null }) => r.river_slug).filter(Boolean)).size;
}

/** All rivers currently sitting in elevated water (most-severe per river), read
 *  from the gauge condition codes the cron just wrote — so the digest represents
 *  the WHOLE storm, not only the rivers that happened to cross this pass. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadElevatedRivers(supabase: any): Promise<Array<{ riverSlug: string; newCondition: string }>> {
  const { data } = await supabase
    .from('river_gauges')
    .select('river_id, last_condition_code')
    .eq('is_primary', true) // one condition per river — mirror the primary-gauge rule in update-gauges
    .in('last_condition_code', Array.from(ELEVATED));
  if (!data) return [];
  return dedupeBySeverity(
    data
      .filter((g: { river_id: string | null }) => g.river_id)
      .map((g: { river_id: string; last_condition_code: string }) => ({
        riverSlug: g.river_id,
        newCondition: g.last_condition_code,
      })),
  );
}

/**
 * Orchestrates elevated-crossing alerts for one cron pass. Dedupes per river,
 * then decides between ONE storm digest and individual warning reels using a
 * rolling window so a multi-hour storm produces a single digest instead of a
 * barrage. Returns which path was taken (for cron logging).
 */
export async function publishElevatedCrossings(
  transitions: Array<{
    riverSlug: string;
    oldCondition: string;
    newCondition: string;
    gaugeHeightFt: number | null;
  }>,
): Promise<{ mode: 'storm' | 'individual' | 'suppressed' | 'none'; published: number }> {
  const unique = dedupeBySeverity(transitions);
  if (unique.length === 0) return { mode: 'none', published: 0 };

  const supabase = createAdminClient();

  // A digest posted within the window already announced this storm — suppress
  // the new individual reels (the digest points people at live conditions).
  if (await hasRecentPost('storm_digest', null, null, STORM_WINDOW_HOURS, supabase)) {
    console.log(`${LOG_PREFIX} Storm digest active — suppressing ${unique.length} individual warning(s): ${unique.map((u) => u.riverSlug).join(', ')}`);
    return { mode: 'suppressed', published: 0 };
  }

  // Running storm tally = rivers crossing this pass + rivers already warned in
  // the window. At/over threshold → one digest covering ALL elevated rivers.
  const recentRivers = await countRecentWarningRivers(supabase, STORM_WINDOW_HOURS);
  if (unique.length + recentRivers >= STORM_THRESHOLD) {
    const elevated = await loadElevatedRivers(supabase);
    const digestRivers = elevated.length > 0 ? elevated : unique.map((u) => ({ riverSlug: u.riverSlug, newCondition: u.newCondition }));
    const digest = await publishStormDigest(digestRivers);
    if (digest.published > 0) return { mode: 'storm', published: digest.published };
    // Digest cooldown means one just posted → still suppress (don't fall back to
    // a barrage of individual reels, which is exactly what we're avoiding).
    if (digest.skipped && digest.reason === 'cooldown') return { mode: 'suppressed', published: 0 };
    // Any other skip (posting disabled / no credentials) → nothing to do.
    return { mode: 'suppressed', published: 0 };
  }

  // Below threshold: an isolated crossing still deserves a timely warning.
  let published = 0;
  for (const c of unique) {
    try {
      const r = await publishConditionChangeAlert(c);
      published += r.published;
    } catch (err) {
      console.error(`${LOG_PREFIX} Individual warning error for ${c.riverSlug}:`, err);
    }
  }
  return { mode: 'individual', published };
}

/**
 * STORM DIGEST — one image post for MANY rivers rising in a storm, instead of a
 * barrage of individual warnings (cheaper + more shareable). Called by
 * publishElevatedCrossings when >= STORM_THRESHOLD rivers are elevated.
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
