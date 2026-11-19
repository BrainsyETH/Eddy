import type { SocialVideoPlacement } from '../../../shared/social-brand';
import type { SocialPlatform } from './types';

export const META_PLATFORMS = ['instagram', 'facebook'] as const;
export type FloatPickChoice = 'regular' | 'story' | 'both';
export type FloatPickPlacements = Partial<Record<typeof META_PLATFORMS[number], FloatPickChoice>>;

export function validFloatPickPlacements(value: unknown): value is FloatPickPlacements {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.entries(value).every(([key, choice]) => (key === 'facebook' || key === 'instagram') &&
      (choice === 'regular' || choice === 'story' || choice === 'both'));
}

export function floatPickDestinations(platforms: SocialPlatform[], choices: FloatPickPlacements = {}) {
  const destinations: { platform: SocialPlatform; placement: SocialVideoPlacement }[] = [];
  for (const platform of new Set(platforms)) {
    const choice = platform === 'tiktok' ? 'regular' : choices[platform] ?? 'regular';
    if (choice !== 'story') destinations.push({ platform, placement: 'reel' });
    if (choice !== 'regular') destinations.push({ platform, placement: 'story' });
  }
  return destinations;
}

export function isFloatPickStory(request: unknown): boolean {
  return !!request && typeof request === 'object' && 'compositionId' in request &&
    request.compositionId === 'social-route-portrait' && 'inputProps' in request &&
    !!request.inputProps && typeof request.inputProps === 'object' && 'placement' in request.inputProps &&
    request.inputProps.placement === 'story';
}

export function destinationLabel(platform: string, story: boolean, floatPick: boolean) {
  if (platform === 'instagram') return story ? 'Instagram Story' : floatPick ? 'Instagram Reel' : 'Instagram';
  if (platform === 'facebook') return story ? 'Facebook Story' : floatPick ? 'Facebook Page video' : 'Facebook';
  return platform === 'tiktok' ? 'TikTok' : platform;
}
