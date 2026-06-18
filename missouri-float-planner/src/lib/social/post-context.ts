// src/lib/social/post-context.ts
//
// Single assembler for social posts. Given a post type (+ optional river /
// eddy_update id), it fetches live conditions ONCE and returns everything the
// downstream surfaces need:
//   - renderData  → Remotion inputProps (via POST_TYPES[kind].renderProps)
//   - caption()   → per-platform caption (the right content-formatter)
//   - imageUrl()  → OG share image / video cover
//
// This replaces the duplicated assembly that previously lived in three places
// (quick-post helpers, the cron's buildRenderData, and the scheduler), which is
// what let them drift (route_draw missing, digest caption source mismatch, etc).

import type { SocialPlatform, SocialCustomContent } from './types';
import type { PostKind, RenderData } from './post-types';
import { overlayLiveConditions } from './live-conditions';
import { pickSectionForRivers } from './section-picker';
import { pickFavoriteFloat } from './favorite-floats';
import { pickNotableTrend } from './trend-picker';
import { hasRainComing, weatherChip } from '@/lib/weather/openweather';
import { WEEKEND_FLOATABLE, WEEKEND_SEVERITY } from '@shared/condition-system';
import {
  formatDailyDigestCaption,
  formatRiverHighlightCaption,
  formatWeeklyForecastCaption,
  formatSectionGuideCaption,
  formatFavoriteFloatCaption,
  formatWeeklyTrendCaption,
} from './content-formatter';

const BASE_URL = 'https://eddy.guide';

/** Truncate text to ~200 chars for a video teaser (full text goes in caption). */
export function truncateForVideo(text: string | null): string {
  if (!text) return '';
  if (text.length <= 200) return text;
  const truncated = text.slice(0, 200);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 140 ? truncated.slice(0, lastSpace) : truncated) + '...';
}

const titleize = (slug: string) =>
  slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const longDate = () =>
  new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

const og = (type: string, platform: SocialPlatform, extra = '') =>
  `${BASE_URL}/api/og/social?type=${type}&platform=${platform}${extra}`;

export interface PostContext {
  postType: PostKind;
  /** Composition input props (consumed by POST_TYPES[kind].renderProps). */
  renderData: RenderData;
  riverSlug: string | null;
  /** Per-platform caption + hashtags. */
  caption: (platform: SocialPlatform, custom: SocialCustomContent[]) => { caption: string; hashtags: string[] };
  /** OG image (image post) / video cover thumbnail. */
  imageUrl: (platform: SocialPlatform) => string;
}

interface BuildOpts {
  postType: PostKind;
  riverSlug?: string;
  eddyUpdateId?: string;
}

/**
 * Assemble a PostContext. Returns null when there's nothing to post (e.g. no
 * floatable rivers for the forecast, no notable trend), so callers return a
 * clean 404 instead of inserting an empty record.
 */
export async function buildPostContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  opts: BuildOpts,
): Promise<PostContext | null> {
  const { postType } = opts;
  const nowIso = new Date().toISOString();

  // --- Multi-river types: fetch + dedupe + overlay live conditions once ---
  async function freshRivers() {
    const { data: updates } = await supabase
      .from('eddy_updates')
      .select('id, river_slug, condition_code, gauge_height_ft, quote_text, summary_text, weather')
      .neq('river_slug', 'global')
      .is('section_slug', null)
      .gt('expires_at', nowIso)
      .order('generated_at', { ascending: false });
    const seen = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dedupedRaw = ((updates || []) as any[]).filter((u) => {
      if (seen.has(u.river_slug)) return false;
      seen.add(u.river_slug);
      return true;
    });
    return overlayLiveConditions(supabase, dedupedRaw);
  }

  if (postType === 'daily_digest') {
    const deduped = await freshRivers();
    const { data: globalUpdate } = await supabase
      .from('eddy_updates')
      .select('summary_text')
      .eq('river_slug', 'global')
      .is('section_slug', null)
      .gt('expires_at', nowIso)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const globalSummary: string | null = globalUpdate?.summary_text || null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rivers = (deduped as any[]).map((u) => ({
      riverName: titleize(u.river_slug),
      conditionCode: u.condition_code,
      gaugeHeightFt: u.gauge_height_ft,
    }));
    return {
      postType,
      riverSlug: null,
      renderData: { rivers, dateLabel: longDate(), globalQuote: globalSummary || undefined },
      caption: (platform, custom) => formatDailyDigestCaption(deduped, globalSummary, custom, platform),
      imageUrl: (platform) => og('digest', platform),
    };
  }

  if (postType === 'weekly_forecast') {
    const deduped = await freshRivers();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const floatable = (deduped as any[])
      .filter((u) => WEEKEND_FLOATABLE.has(u.condition_code))
      .sort((a, b) => (WEEKEND_SEVERITY[a.condition_code] ?? 99) - (WEEKEND_SEVERITY[b.condition_code] ?? 99));
    if (floatable.length === 0) return null;
    // Prefer rivers with no rain coming; if every floatable river has rain in
    // the forecast, fall back to the best available and flag it with a note.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dry = floatable.filter((u: any) => !hasRainComing(u.weather));
    const usingFallback = dry.length === 0;
    const topRivers = (usingFallback ? floatable : dry).slice(0, 3);
    return {
      postType,
      riverSlug: null,
      renderData: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rivers: topRivers.map((u: any) => ({
          riverName: titleize(u.river_slug),
          conditionCode: u.condition_code,
          gaugeHeightFt: u.gauge_height_ft,
          weather: weatherChip(u.weather),
        })),
        dateLabel: 'This Weekend',
        title: 'Weekend Forecast',
        rainNote: usingFallback,
      },
      caption: (platform, custom) => formatWeeklyForecastCaption(topRivers, custom, platform, usingFallback),
      imageUrl: (platform) => og('forecast', platform),
    };
  }

  if (postType === 'section_guide') {
    const deduped = await freshRivers();
    // Float of the Day: only ideal-floatable rivers (flowing / good — never
    // too_low/low/high/dangerous), on a 5-9 mi section. Skip the post if none.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const floatable = (deduped as any[]).filter(
      (u) => u.condition_code === 'flowing' || u.condition_code === 'good',
    );
    const section = await pickSectionForRivers(
      supabase,
      floatable.map((u) => u.river_slug as string),
      { minMi: 5, maxMi: 9 },
    );
    if (!section) return null;
    const latest = floatable.find((u) => u.river_slug === section.riverSlug);
    const conditionCode = latest?.condition_code || 'flowing';
    // Cover image carries the exact section + condition so it renders the SAME
    // float as the reel (instead of re-picking), and so the URL is unique per
    // section — Meta caches OG images by URL, and a shared URL served a stale
    // cover from a previous post.
    const coverParams =
      `&river=${section.riverSlug}` +
      `&putInMile=${section.putInMile}` +
      `&takeOutMile=${section.takeOutMile}` +
      `&condition=${conditionCode}`;
    return {
      postType,
      riverSlug: section.riverSlug,
      renderData: { ...section, conditionCode, dateLabel: longDate() },
      caption: (platform, custom) => formatSectionGuideCaption({ ...section, conditionCode }, custom, platform),
      // route is video-only; reuse the section thumbnail as the cover.
      imageUrl: (platform) => og('section', platform, coverParams),
    };
  }

  if (postType === 'favorite_float') {
    // Evergreen, editorial — a curated section from the river-guide blogs. No
    // live-conditions overlay; rotates deterministically by day.
    const fav = await pickFavoriteFloat(supabase);
    if (!fav) return null;
    // Bake the exact endpoints into the cover URL so the poster renders the SAME
    // float as the reel (and the unique URL defeats Meta's by-URL OG cache).
    const coverParams =
      `&river=${fav.riverSlug}` +
      `&fromSlug=${encodeURIComponent(fav.fromSlug)}` +
      `&toSlug=${encodeURIComponent(fav.toSlug)}`;
    return {
      postType,
      riverSlug: fav.riverSlug,
      renderData: {
        ...fav,
        // 'flowing' is the evergreen baseline: it makes hoursToday === hoursTypical
        // in the shared route props, so the reel shows typical pace with no delta.
        conditionCode: 'flowing',
        dateLabel: longDate(),
      },
      caption: (platform, custom) => formatFavoriteFloatCaption(fav, custom, platform),
      imageUrl: (platform) => og('favorite', platform, coverParams),
    };
  }

  if (postType === 'weekly_trend') {
    const deduped = await freshRivers();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slugs = (deduped as any[]).map((u) => u.river_slug as string);
    const trend = await pickNotableTrend(supabase, { restrictTo: slugs });
    if (!trend) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const latest = (deduped as any[]).find((u) => u.river_slug === trend.riverSlug);
    const conditionCode = latest?.condition_code || 'unknown';
    const weather = weatherChip(latest?.weather);
    return {
      postType,
      riverSlug: trend.riverSlug,
      renderData: { ...trend, conditionCode, weather, dateLabel: 'This Week' },
      caption: (platform, custom) =>
        formatWeeklyTrendCaption({ ...trend, weather: latest?.weather ?? null }, custom, platform),
      imageUrl: (platform) => og('trend', platform),
    };
  }

  if (postType === 'river_highlight') {
    // Fetch by explicit eddy_update id (cron) or latest for a river (quick-post).
    let query = supabase
      .from('eddy_updates')
      .select('id, river_slug, condition_code, gauge_height_ft, quote_text, summary_text')
      .is('section_slug', null);
    query = opts.eddyUpdateId
      ? query.eq('id', opts.eddyUpdateId)
      : query.eq('river_slug', opts.riverSlug).gt('expires_at', nowIso)
          .order('generated_at', { ascending: false }).limit(1);
    const { data: rawUpdate } = await query.maybeSingle();
    if (!rawUpdate) return null;
    const [update] = await overlayLiveConditions(supabase, [rawUpdate]);

    // Optimal band for the gauge composition.
    let optimalMin = 1.5;
    let optimalMax = 4.0;
    const { data: gauge } = await supabase
      .from('river_gauges')
      .select('level_optimal_min, level_optimal_max')
      .eq('river_id', update.river_slug)
      .eq('is_primary', true)
      .maybeSingle();
    if (gauge) {
      optimalMin = gauge.level_optimal_min ?? optimalMin;
      optimalMax = gauge.level_optimal_max ?? optimalMax;
    }

    return {
      postType,
      riverSlug: update.river_slug,
      renderData: {
        riverName: titleize(update.river_slug),
        conditionCode: update.condition_code,
        gaugeHeightFt: update.gauge_height_ft,
        optimalMin,
        optimalMax,
        quoteText: truncateForVideo(update.quote_text ?? null),
        summaryText: truncateForVideo(update.summary_text ?? null),
      },
      caption: (platform, custom) => formatRiverHighlightCaption(update, custom, platform),
      imageUrl: (platform) => og('highlight', platform, `&river=${update.river_slug}`),
    };
  }

  return null;
}
