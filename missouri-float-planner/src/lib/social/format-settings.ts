// One settings shape for every scheduled social format:
//   { days, time, destinations }
//
// Stored per format in social_config.formats. Until a format has a valid
// saved entry, its settings are derived from the legacy keys the admin still
// edits (media_schedule, weekly_forecast / section_guide time_cst,
// digest_time_cst, section_guide.placements). An admin save writes each
// format's settings, changing only the fields whose legacy source it edited
// (formatsOnSave); a later phase moves the admin to editing this shape directly.
//
// The scheduler, Quick Post and the config route read settings only through
// resolveFormatSettings.

import { STORY_PLATFORMS, destinationKey, expandDestinations, savedPlacementChoices, type Destination, type PlacementChoices } from './placements';
import { supportsStory } from './post-types';
import type { DayMediaMap, MediaType, SocialConfig, SocialPlatform } from './types';
import { WEEKEND_READ_TIME } from './weekend-read';

/** Formats the scheduler posts on its own. Weekly Trend is retired. */
export const SCHEDULED_FORMATS = ['river_highlight', 'daily_digest', 'weekly_forecast', 'section_guide'] as const;
export type ScheduledFormat = typeof SCHEDULED_FORMATS[number];

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const PLATFORMS: readonly SocialPlatform[] = ['instagram', 'facebook', 'tiktok'];
const DEFAULT_TIME: Record<ScheduledFormat, string> = {
  river_highlight: WEEKEND_READ_TIME,
  daily_digest: '14:00',
  weekly_forecast: '22:00',
  section_guide: '17:00',
};

export interface FormatSettings {
  /** Per weekday: 'video', 'image' or null (does not post that day). */
  days: DayMediaMap;
  /** "HH:MM" in social_config.timezone (Central by default). */
  time: string;
  /** Where each post goes. Filtered at run time to connected platforms. */
  destinations: Destination[];
}

export type FormatsConfig = Partial<Record<ScheduledFormat, FormatSettings>>;

type ConfigLike = Partial<Pick<SocialConfig, 'media_schedule' | 'digest_time_cst' | 'weekly_forecast' | 'section_guide'>> & {
  formats?: unknown;
};

/** Platforms a format can post to at all. The Daily Report is an image carousel, which TikTok's connector can't take. */
export function formatPlatforms(kind: ScheduledFormat): SocialPlatform[] {
  return kind === 'daily_digest' ? ['instagram', 'facebook'] : [...PLATFORMS];
}

function validTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validDays(value: unknown): value is DayMediaMap {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.entries(value).every(([day, media]) => (DAYS as readonly string[]).includes(day) &&
      (media === null || media === 'video' || media === 'image'));
}

/**
 * Each destination must be one the format and platform can deliver, listed
 * once. A Story needs a per-destination layout and a platform with Stories
 * (Instagram, Facebook); TikTok takes regular video only. A duplicate pair
 * would save two delivery rows for the same video.
 */
function validDestinations(kind: ScheduledFormat, value: unknown): value is Destination[] {
  if (!Array.isArray(value)) return false;
  const allowed = formatPlatforms(kind);
  const story = supportsStory(kind);
  const seen = new Set<string>();
  return value.every(d => {
    if (!d || typeof d !== 'object') return false;
    const { platform, placement } = d as Destination;
    if (!allowed.includes(platform)) return false;
    if (placement !== undefined && placement !== 'reel' && placement !== 'story') return false;
    if (placement !== undefined && !story) return false;
    if (placement === 'story' && !(STORY_PLATFORMS as readonly string[]).includes(platform)) return false;
    const key = destinationKey(d as Destination);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function validFormatSettings(kind: ScheduledFormat, value: unknown): value is FormatSettings {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return validDays(v.days) && validTime(v.time) && validDestinations(kind, v.destinations);
}

/** Settings as the legacy keys describe them. */
export function legacyFormatSettings(config: ConfigLike, kind: ScheduledFormat): FormatSettings {
  const days = config.media_schedule?.[kind];
  const time = kind === 'daily_digest' ? config.digest_time_cst
    : kind === 'river_highlight' ? WEEKEND_READ_TIME
    : config[kind]?.time_cst;
  const choices = supportsStory(kind) ? savedPlacementChoices(config, kind) : undefined;
  return {
    days: validDays(days) ? { ...days } : {},
    time: validTime(time) ? time : DEFAULT_TIME[kind],
    destinations: expandDestinations(formatPlatforms(kind), choices, supportsStory(kind)),
  };
}

/** The settings a format runs with: its saved entry when valid, otherwise the legacy keys. */
export function resolveFormatSettings(config: ConfigLike, kind: ScheduledFormat): FormatSettings {
  const saved = config.formats && typeof config.formats === 'object'
    ? (config.formats as Record<string, unknown>)[kind] : undefined;
  return validFormatSettings(kind, saved) ? saved : legacyFormatSettings(config, kind);
}

/** Every scheduled format's settings derived from the legacy keys. */
export function formatsFromLegacy(config: ConfigLike): FormatsConfig {
  return Object.fromEntries(SCHEDULED_FORMATS.map(kind => [kind, legacyFormatSettings(config, kind)])) as FormatsConfig;
}

// Stable comparison for small JSON values (key order ignored).
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * The formats an admin save writes. Each field of a format (days, time,
 * destinations) keeps the value the format runs with now, saved or derived,
 * unless this save changed the legacy field it comes from: the media grid
 * row, the format's time, or Float Pick's placements. Saving an unrelated
 * setting therefore never rewrites a saved schedule.
 */
export function formatsOnSave(before: ConfigLike, after: ConfigLike): FormatsConfig {
  return Object.fromEntries(SCHEDULED_FORMATS.map(kind => {
    const current = resolveFormatSettings(before, kind);
    const was = legacyFormatSettings(before, kind);
    const next = legacyFormatSettings(after, kind);
    const field = <K extends keyof FormatSettings>(key: K): FormatSettings[K] =>
      canonical(was[key]) === canonical(next[key]) ? current[key] : next[key];
    return [kind, { days: field('days'), time: field('time'), destinations: field('destinations') }];
  })) as FormatsConfig;
}

/** The media cell for a weekday (0 = Sunday), or null when the format is off that day. */
export function mediaForDay(settings: FormatSettings, dayOfWeek: number): MediaType | null {
  const key = (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[dayOfWeek] ?? 'sun';
  const media = settings.days[key];
  return media === 'video' || media === 'image' ? media : null;
}

/** Reel/Story choices per platform, as Quick Post applies them to the platforms picked for one batch. */
export function placementChoicesFrom(destinations: Destination[]): PlacementChoices {
  const choices: PlacementChoices = {};
  for (const platform of ['instagram', 'facebook'] as const) {
    const placements = new Set(destinations.filter(d => d.platform === platform).map(d => d.placement));
    if (placements.has('story')) choices[platform] = placements.has('reel') ? 'both' : 'story';
  }
  return choices;
}
