// src/lib/social/post-types.ts
//
// Single source of truth for social post types. Each entry declares how a type
// renders (Remotion composition + input props, and/or OG image) and what the
// admin UI needs to collect. Consumers — getCompositionForPost (video dispatch),
// the OG route, the quick-post route, the cron, and the admin UI — read from
// here so behavior can't drift per surface, and a new type is one entry.
//
// Phase 1 (this file): the PURE parts — composition id, render-props mapping,
// output filename, OG type, and declarative metadata. The DB-querying context
// assembly (buildContext) + a unified executor are later phases.

import type { MediaType } from './types';
import type { ConditionCode } from '@/types/api';
import { calculateFloatTime, DEFAULT_CANOE_SPEEDS } from '@/lib/calculations/floatTime';
import type { WeatherChip } from '@/lib/weather/openweather';

export type PostKind =
  | 'daily_digest'
  | 'river_highlight'
  | 'eddy_says'
  | 'weekly_forecast'
  | 'section_guide'
  | 'favorite_float'
  | 'weekly_trend'
  | 'tip';

/** Post types that have a Remotion video composition (can be dispatched to render). */
export type VideoPostKind = Exclude<PostKind, 'tip'>;

/**
 * Assembled render data — the shape produced by the data builders and consumed
 * by each type's `renderProps`. Superset across all types (each reads its own
 * fields); mirrors the previous getCompositionForPost `data` parameter.
 */
export interface RenderData {
  riverName?: string;
  riverSlug?: string;
  conditionCode?: string;
  gaugeHeightFt?: number | null;
  optimalMin?: number;
  optimalMax?: number;
  quoteText?: string;
  summaryText?: string;
  rivers?: Array<{
    riverName: string;
    conditionCode: string;
    gaugeHeightFt: number | null;
    weather?: WeatherChip | null;
  }>;
  dateLabel?: string;
  globalQuote?: string;
  title?: string;
  /** Weekend Forecast: true when picks are "best available" (rain coming). */
  rainNote?: boolean;
  /** Forecast chip for the Weekly Trend post. */
  weather?: WeatherChip | null;
  // Section guide / route extras
  putInName?: string;
  putInMile?: number;
  takeOutName?: string;
  takeOutMile?: number;
  distanceMi?: number;
  hoursCanoe?: number;
  springs?: Array<{ name: string; mile: number; side: string | null }>;
  // Favorite Float (evergreen, editorial) extras
  /** Guide section's catchy name, shown under the river name (replaces the date). */
  tagline?: string;
  /** Guide "Best for" audience line. */
  bestFor?: string;
  /** Difficulty class label from the guide (e.g. "I–II"). */
  difficulty?: string;
  /** Favorites only: guide section photo (public URL) composited behind the reel. */
  photoUrl?: string;
  // Weekly trend extras
  currentHeightFt?: number | null;
  sevenDayFirstFt?: number | null;
  sevenDayMinFt?: number | null;
  sevenDayMaxFt?: number | null;
  deltaFt?: number;
  direction?: 'rising' | 'falling' | 'flat';
  series?: Array<{ hoursAgo: number; gaugeHeightFt: number | null }>;
}

export interface PostTypeDef {
  id: PostKind;
  /** Human label for the admin UI. */
  label: string;
  /** Extra input the admin UI must collect before posting. */
  needs: 'none' | 'river' | 'content';
  /** Media backends this type supports (drives the admin media toggle). */
  media: MediaType[];
  /** Remotion composition id (video backend), if any. */
  composition?: string;
  /** OG image `type` query value (image backend), if any. */
  ogType?: string;
  /** Build Remotion inputProps from assembled render data. */
  renderProps?: (data: RenderData) => Record<string, unknown>;
  /** Output filename stem (no extension) for the rendered video. */
  outputFilename?: (data: RenderData) => string;
}

// All renders are portrait — both platforms get 1080x1920.
const FORMAT = 'portrait' as const;

/** Long-form date label matching the OG thumbnail timestamp format. */
function defaultDate(): string {
  return new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

const isoDay = () => new Date().toISOString().slice(0, 10);
const slugify = (s: string) => s.toLowerCase().replace(/\s+/g, '-');

/**
 * Estimated canoe float time (hours, 1 decimal) for a distance at a condition.
 * Returns 0 for dangerous water (no time is quoted) — callers must treat 0 as
 * "not floatable" and suppress the stat rather than printing "0 hours".
 * Uses the shared DEFAULT_CANOE_SPEEDS so social matches the planner.
 */
export function canoeHours(distanceMi: number, conditionCode: ConditionCode): number {
  const result = calculateFloatTime(distanceMi, DEFAULT_CANOE_SPEEDS, conditionCode);
  return result ? Math.round((result.minutes / 60) * 10) / 10 : 0;
}

/** Shared section/route inputProps (both use SectionGuideProps + float-time hero). */
function sectionRouteProps(data: RenderData): Record<string, unknown> {
  const distanceMi = data.distanceMi ?? 0;
  const code = (data.conditionCode || 'unknown') as ConditionCode;
  return {
    riverName: data.riverName || 'Unknown River',
    conditionCode: data.conditionCode || 'unknown',
    putInName: data.putInName || 'Put-in',
    putInMile: data.putInMile ?? 0,
    takeOutName: data.takeOutName || 'Take-out',
    takeOutMile: data.takeOutMile ?? 0,
    distanceMi,
    // Float time at TODAY's flow vs the normal "flowing" baseline.
    hoursToday: canoeHours(distanceMi, code),
    hoursTypical: canoeHours(distanceMi, 'flowing'),
    springs: data.springs ?? [],
    dateLabel: data.dateLabel || defaultDate(),
    // Background art behind the route (RouteDraw composites it with a scrim).
    // Favorite + Float-of-the-Day pass the river's cached AI background here so
    // the reel matches its cover; absent → RouteDraw's solid bg.
    photoUrl: data.photoUrl,
    format: FORMAT,
  };
}

export const POST_TYPES: Record<PostKind, PostTypeDef> = {
  river_highlight: {
    id: 'river_highlight',
    label: 'River Highlight',
    needs: 'river',
    media: ['video'],
    composition: 'social-gauge-portrait',
    ogType: 'highlight',
    renderProps: (data) => ({
      riverName: data.riverName || 'Unknown River',
      conditionCode: data.conditionCode || 'unknown',
      gaugeHeightFt: data.gaugeHeightFt ?? 0,
      optimalMin: data.optimalMin ?? 1.5,
      optimalMax: data.optimalMax ?? 4.0,
      quoteText: data.quoteText || data.summaryText || '',
      dateLabel: data.dateLabel || defaultDate(),
      format: FORMAT,
    }),
    outputFilename: (data) => `highlight-${slugify(data.riverName || 'river')}`,
  },

  // "Eddy Says" — reuses the river-highlight reel (social-gauge-portrait) in
  // quote-forward mode: Eddy's local read on a river is the hero instead of the
  // live gauge instrument. Per-river, rotating daily.
  eddy_says: {
    id: 'eddy_says',
    label: 'Eddy Says',
    needs: 'river',
    media: ['video'],
    composition: 'social-gauge-portrait',
    ogType: 'eddy_says',
    renderProps: (data) => ({
      riverName: data.riverName || 'Unknown River',
      conditionCode: data.conditionCode || 'unknown',
      gaugeHeightFt: data.gaugeHeightFt ?? 0,
      optimalMin: data.optimalMin ?? 1.5,
      optimalMax: data.optimalMax ?? 4.0,
      // Lead with Eddy's full read (summary as fallback) — this post IS the quote.
      quoteText: data.quoteText || data.summaryText || '',
      dateLabel: data.dateLabel || defaultDate(),
      eyebrow: 'Eddy Says',
      quoteForward: true,
      format: FORMAT,
    }),
    outputFilename: (data) => `eddy-says-${slugify(data.riverName || 'river')}`,
  },

  daily_digest: {
    id: 'daily_digest',
    label: 'Daily Digest',
    needs: 'none',
    media: ['video'],
    composition: 'social-digest-portrait',
    ogType: 'digest',
    renderProps: (data) => ({
      rivers: data.rivers || [],
      dateLabel: data.dateLabel || defaultDate(),
      globalQuote: data.globalQuote || undefined,
      format: FORMAT,
    }),
    outputFilename: () => `digest-${isoDay()}`,
  },

  weekly_forecast: {
    id: 'weekly_forecast',
    label: 'Weekend Forecast',
    needs: 'none',
    media: ['video'],
    composition: 'social-digest-portrait',
    ogType: 'forecast',
    renderProps: (data) => ({
      rivers: data.rivers || [],
      dateLabel: data.dateLabel || 'This Weekend',
      title: data.title || 'Weekend Forecast',
      rainNote: data.rainNote ?? false,
      // No global quote on forecast — the top-3 list IS the message.
      format: FORMAT,
    }),
    outputFilename: () => `forecast-${isoDay()}`,
  },

  // "Float of the Day" — the animated self-drawing route. The static section
  // card (social-section-portrait) is retired; section_guide now renders the
  // route composition. The OG section image is kept only as the video cover.
  section_guide: {
    id: 'section_guide',
    label: 'Float of the Day',
    needs: 'none',
    media: ['video'],
    composition: 'social-route-portrait',
    ogType: 'section',
    renderProps: sectionRouteProps,
    outputFilename: () => `float-of-day-${isoDay()}`,
  },

  // "Eddy's Favorite Floats" — same self-drawing route reel as Float of the Day,
  // but evergreen (no live float-time delta) and editorial: the eyebrow becomes
  // "Eddy's Favorite Float" and the guide's section name + difficulty ride along
  // as the "why". Source sections come from the river-guide blogs.
  favorite_float: {
    id: 'favorite_float',
    label: "Eddy's Favorite Float",
    needs: 'none',
    media: ['video'],
    composition: 'social-route-portrait',
    ogType: 'favorite',
    renderProps: (data) => ({
      ...sectionRouteProps(data),
      // Evergreen: float time is the typical "flowing" pace (post-context sets
      // conditionCode='flowing'), so hoursToday === hoursTypical and the reel
      // hides the faster/slower delta. Neutral accent + editorial copy below.
      label: "Eddy's Favorite Float",
      tagline: data.tagline,
      difficulty: data.difficulty,
      evergreen: true,
      // Real guide photography behind the route (favorites only); absent → solid bg.
      photoUrl: data.photoUrl,
    }),
    outputFilename: () => `favorite-float-${isoDay()}`,
  },

  weekly_trend: {
    id: 'weekly_trend',
    label: 'Weekly Trend',
    needs: 'none',
    media: ['video'],
    composition: 'social-trend-portrait',
    ogType: 'trend',
    renderProps: (data) => ({
      riverName: data.riverName || 'Unknown River',
      conditionCode: data.conditionCode || 'unknown',
      currentHeightFt: data.currentHeightFt ?? null,
      sevenDayFirstFt: data.sevenDayFirstFt ?? null,
      sevenDayMinFt: data.sevenDayMinFt ?? null,
      sevenDayMaxFt: data.sevenDayMaxFt ?? null,
      deltaFt: data.deltaFt ?? 0,
      direction: data.direction || 'flat',
      series: data.series || [],
      weather: data.weather ?? null,
      dateLabel: data.dateLabel || 'This Week',
      format: FORMAT,
    }),
    outputFilename: () => `trend-${isoDay()}`,
  },

  tip: {
    id: 'tip',
    label: 'Tip / Seasonal Quote',
    needs: 'content',
    media: ['image'],
    ogType: 'tip',
    // image-only; no Remotion composition
  },
};

/** Lookup with a clear error for unknown kinds. */
export function getPostType(kind: string): PostTypeDef | undefined {
  return POST_TYPES[kind as PostKind];
}
