// Reel scheduling logic — determines when to generate video reels vs static images
// Integrates with the existing post scheduler for seamless reel/image mixing

import { hasRenderConfig } from './render-client';

/**
 * Determines if a daily digest post should be a video reel.
 * Reels are generated on Fridays and Sundays (peak planning days).
 */
export function shouldGenerateDigestReel(): boolean {
  if (!hasRenderConfig()) return false;

  const now = new Date();
  const cstOffset = -6; // CST (simplified — DST handled elsewhere in the codebase)
  const cstHour = (now.getUTCHours() + cstOffset + 24) % 24;
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 5=Fri

  // Generate reels on Friday and Sunday mornings
  const isReelDay = dayOfWeek === 0 || dayOfWeek === 5;

  return isReelDay;
}

/**
 * Determines if a river highlight post should be a video reel.
 * One reel per river per week — on the river's scheduled highlight day.
 * The first highlight of the week for each river gets a reel.
 */
export function shouldGenerateHighlightReel(
  riverSlug: string,
  dayOfWeek: number
): boolean {
  if (!hasRenderConfig()) return false;

  // Generate highlight reels on Saturdays (highest engagement day for outdoor content)
  return dayOfWeek === 6;
}

/**
 * Determines if a condition change alert should get a video reel.
 * Only notable transitions get reels to avoid render cost for minor changes.
 */
export function shouldGenerateAlertReel(
  previousCondition: string,
  newCondition: string
): boolean {
  if (!hasRenderConfig()) return false;

  // Only generate reels for dramatic transitions
  const notableTransitions = [
    // Entering optimal — most exciting for floaters
    { to: 'optimal' },
    // Entering dangerous — important safety alert
    { to: 'dangerous' },
    // Leaving dangerous — flood warning lifted
    { from: 'dangerous' },
  ];

  return notableTransitions.some(
    (t) =>
      (!t.from || t.from === previousCondition) &&
      (!t.to || t.to === newCondition)
  );
}

/**
 * Get reel-specific hashtags to append to the post caption.
 */
export function getReelHashtags(platform: 'instagram' | 'facebook'): string[] {
  if (platform === 'facebook') return []; // FB penalizes hashtags

  return [
    '#reels',
    '#missourifloattrip',
    '#ozarks',
    '#kayaking',
    '#floattrip',
    '#riverlife',
    '#outdoors',
  ];
}
