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
import { FOLLOW_CTA } from '@shared/condition-copy';

export type PostKind =
  | 'daily_digest'
  | 'river_highlight'
  | 'weekly_forecast'
  | 'section_guide'
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
  // Float Pick evergreen-fallback extras (sourced from the river-guide blogs)
  /** True when the Float Pick fell back to an evergreen favorite (no floatable
   *  river today) — switches the route reel to editorial mode. */
  evergreen?: boolean;
  /** Guide section's catchy name, shown under the river name (replaces the date). */
  tagline?: string;
  /** Guide "Best for" audience line. */
  bestFor?: string;
  /** Difficulty class label from the guide (e.g. "I–II"). */
  difficulty?: string;
  /** Evergreen only: guide section photo (public URL) composited behind the reel. */
  photoUrl?: string;
  // Weekly trend extras
  currentHeightFt?: number | null;
  sevenDayFirstFt?: number | null;
  sevenDayMinFt?: number | null;
  sevenDayMaxFt?: number | null;
  deltaFt?: number;
  direction?: 'rising' | 'falling' | 'flat';
  series?: Array<{ hoursAgo: number; gaugeHeightFt: number | null }>;
  /** Full-bleed AI background art URL (matches the reel's OG cover). */
  backgroundUrl?: string;
  /** Growth CTA line rendered under the reel's main CTA. */
  followCta?: string;
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
    followCta: FOLLOW_CTA,
    dateLabel: data.dateLabel || defaultDate(),
    // Background art behind the route (RouteDraw composites it with a scrim).
    // Favorite + Float-of-the-Day pass the river's cached AI background here so
    // the reel matches its cover; absent → RouteDraw's solid bg.
    photoUrl: data.photoUrl,
    format: FORMAT,
  };
}

export const POST_TYPES: Record<PostKind, PostTypeDef> = {
  // The daily per-river report — "Eddy Says" branding over the gauge-forward
  // layout, with Eddy's quote as the payoff. (Merged: the separate quote-forward
  // eddy_says type is retired; this single format carries both jobs.)
  river_highlight: {
    id: 'river_highlight',
    label: 'Eddy Says Report',
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
      eyebrow: 'Eddy Says',
      backgroundUrl: data.backgroundUrl,
      followCta: FOLLOW_CTA,
      format: FORMAT,
    }),
    outputFilename: (data) => `highlight-${slugify(data.riverName || 'river')}`,
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
      followCta: FOLLOW_CTA,
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
      followCta: FOLLOW_CTA,
      format: FORMAT,
    }),
    outputFilename: () => `forecast-${isoDay()}`,
  },

  // "Float Pick" — the animated self-drawing route reel. Live-first: the weekly
  // pick is a condition-aware section when any river is floatable; when none is,
  // post-context falls back to an evergreen favorite from the river-guide blogs
  // (data.evergreen=true → editorial mode: no live float-time delta, tagline +
  // difficulty as the "why", guide photo behind the route). One slot, always
  // publishable. (Merged: the separate favorite_float type is retired.)
  section_guide: {
    id: 'section_guide',
    label: 'Float Pick',
    needs: 'none',
    media: ['video'],
    composition: 'social-route-portrait',
    ogType: 'section',
    renderProps: (data) =>
      data.evergreen
        ? {
            ...sectionRouteProps(data),
            // Evergreen: float time is the typical "flowing" pace (post-context
            // sets conditionCode='flowing'), so hoursToday === hoursTypical and
            // the reel hides the faster/slower delta.
            label: 'Float Pick',
            tagline: data.tagline,
            difficulty: data.difficulty,
            evergreen: true,
          }
        : {
            ...sectionRouteProps(data),
            label: 'Float Pick',
          },
    outputFilename: () => `float-pick-${isoDay()}`,
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
      followCta: FOLLOW_CTA,
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
