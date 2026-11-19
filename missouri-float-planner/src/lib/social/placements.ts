// Where a video goes on each platform: a regular post (Instagram Reel,
// Facebook Page video, TikTok) and/or a Story. Any format whose composition
// lays itself out per destination (`destinationLayout` in post-types.ts) can
// offer Stories; the others share one render and post as regular videos.
//
// Saved choices live in social_config per format (today only Float Pick,
// `section_guide.placements`). Missing choices mean "regular only", so
// older schedules keep posting as they did.

import type { SocialVideoPlacement } from '../../../shared/social-brand';
import type { SocialPlatform } from './types';

/** Platforms that offer a Story placement. TikTok always posts regular. */
export const STORY_PLATFORMS = ['instagram', 'facebook'] as const;
export type StoryPlatform = typeof STORY_PLATFORMS[number];
export type PlacementChoice = 'regular' | 'story' | 'both';
export type PlacementChoices = Partial<Record<StoryPlatform, PlacementChoice>>;

export interface Destination {
  platform: SocialPlatform;
  /** Set only for formats with per-destination layouts. */
  placement?: SocialVideoPlacement;
}

/** One delivery: a platform and its placement. A missing placement is the regular post. */
export function destinationKey(destination: Destination): string {
  return `${destination.platform}:${destination.placement ?? 'reel'}`;
}

export function validPlacementChoices(value: unknown): value is PlacementChoices {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.entries(value).every(([key, choice]) => (STORY_PLATFORMS as readonly string[]).includes(key) &&
      (choice === 'regular' || choice === 'story' || choice === 'both'));
}

/**
 * Expand selected platforms into destinations. With `storyLayout` false the
 * choices are ignored and each platform gets one regular post with no
 * placement, which keeps shared renders shared.
 */
export function expandDestinations(platforms: SocialPlatform[], choices: PlacementChoices = {}, storyLayout = true): Destination[] {
  const unique = [...new Set(platforms)];
  if (!storyLayout) return unique.map(platform => ({ platform }));
  const destinations: Destination[] = [];
  for (const platform of unique) {
    const choice = platform === 'tiktok' ? 'regular' : choices[platform] ?? 'regular';
    if (choice !== 'story') destinations.push({ platform, placement: 'reel' });
    if (choice !== 'regular') destinations.push({ platform, placement: 'story' });
  }
  return destinations;
}

/** The placement a saved render request was laid out for, if it has one. */
export function renderPlacement(request: unknown): SocialVideoPlacement | undefined {
  if (!request || typeof request !== 'object' || !('inputProps' in request)) return undefined;
  const props = request.inputProps;
  if (!props || typeof props !== 'object' || !('placement' in props)) return undefined;
  return props.placement === 'story' || props.placement === 'reel' ? props.placement : undefined;
}

/** A saved render request laid out as a Story (no caption, no cover). */
export function isStoryRender(request: unknown): boolean {
  return renderPlacement(request) === 'story';
}

/**
 * Human label for a destination. `placement` undefined means the format has
 * no per-destination layout, so the bare platform name is enough.
 */
export function destinationLabel(platform: string, placement?: SocialVideoPlacement) {
  if (platform === 'instagram') return placement === 'story' ? 'Instagram Story' : placement ? 'Instagram Reel' : 'Instagram';
  if (platform === 'facebook') return placement === 'story' ? 'Facebook Story' : placement ? 'Facebook Page video' : 'Facebook';
  return platform === 'tiktok' ? 'TikTok' : platform;
}

/** The saved placement choices for a format, from its social_config entry. */
export function savedPlacementChoices(config: object, kind: string): PlacementChoices | undefined {
  const entry = (config as Record<string, unknown>)[kind];
  if (!entry || typeof entry !== 'object' || !('placements' in entry)) return undefined;
  return validPlacementChoices(entry.placements) ? entry.placements : undefined;
}
