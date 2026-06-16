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
import { calculateFloatTime, type VesselSpeeds } from '@/lib/calculations/floatTime';

export type PostKind =
  | 'daily_digest'
  | 'river_highlight'
  | 'weekly_forecast'
  | 'section_guide'
  | 'route_draw'
  | 'weekly_trend'
  | 'branded_loop'
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
  rivers?: Array<{ riverName: string; conditionCode: string; gaugeHeightFt: number | null }>;
  dateLabel?: string;
  globalQuote?: string;
  title?: string;
  // Section guide / route extras
  putInName?: string;
  putInMile?: number;
  takeOutName?: string;
  takeOutMile?: number;
  distanceMi?: number;
  hoursCanoe?: number;
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

// Canonical canoe speed profile for float-time estimates in social graphics.
// calculateFloatTime scales these by condition (high water faster, low slower),
// which is what makes the "today vs usual" delta meaningful.
const DEFAULT_CANOE_SPEEDS: VesselSpeeds = {
  speedLowWater: 2.0,
  speedNormal: 2.5,
  speedHighWater: 3.5,
};

/** Estimated canoe float time (hours, 1 decimal) for a distance at a condition. */
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
    dateLabel: data.dateLabel || defaultDate(),
    format: FORMAT,
  };
}

export const POST_TYPES: Record<PostKind, PostTypeDef> = {
  river_highlight: {
    id: 'river_highlight',
    label: 'River Highlight',
    needs: 'river',
    media: ['image', 'video'],
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

  daily_digest: {
    id: 'daily_digest',
    label: 'Daily Digest',
    needs: 'none',
    media: ['image', 'video'],
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
    media: ['image', 'video'],
    composition: 'social-digest-portrait',
    ogType: 'forecast',
    renderProps: (data) => ({
      rivers: data.rivers || [],
      dateLabel: data.dateLabel || 'This Weekend',
      title: data.title || 'Weekend Forecast',
      // No global quote on forecast — the top-3 list IS the message.
      format: FORMAT,
    }),
    outputFilename: () => `forecast-${isoDay()}`,
  },

  section_guide: {
    id: 'section_guide',
    label: 'Section Guide',
    needs: 'none',
    media: ['image', 'video'],
    composition: 'social-section-portrait',
    ogType: 'section',
    renderProps: sectionRouteProps,
    outputFilename: () => `section-${isoDay()}`,
  },

  route_draw: {
    id: 'route_draw',
    label: 'Route (animated)',
    needs: 'none',
    media: ['video'],
    composition: 'social-route-portrait',
    // No OG image — route is video-only.
    renderProps: sectionRouteProps,
    outputFilename: () => `route-${isoDay()}`,
  },

  weekly_trend: {
    id: 'weekly_trend',
    label: 'Weekly Trend',
    needs: 'none',
    media: ['image', 'video'],
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
      dateLabel: data.dateLabel || 'This Week',
      format: FORMAT,
    }),
    outputFilename: () => `trend-${isoDay()}`,
  },

  branded_loop: {
    id: 'branded_loop',
    label: 'Branded Loop',
    needs: 'river',
    media: ['video'],
    composition: 'social-branded-loop',
    renderProps: (data) => ({
      riverName: data.riverName || 'Unknown River',
      conditionCode: data.conditionCode || 'unknown',
      summaryText: data.summaryText || data.quoteText || '',
    }),
    outputFilename: (data) => `loop-${slugify(data.riverName || 'river')}`,
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
