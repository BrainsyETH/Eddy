import { RIVER_PHOTOS, RIVER_PHOTO_CREDITS } from '@eddy/conditions/river-photos';
import type { RiverListItem } from '@eddy/types';

export interface RiverHeaderPhoto {
  url: string;
  credit: { text: string; url: string } | null;
}

/** The existing editorial selection, never whichever access loaded first. */
export function riverHeaderPhoto(river: Pick<RiverListItem, 'slug' | 'photoUrl' | 'photoCredit'> | null): RiverHeaderPhoto | null {
  if (!river) return null;
  const url = river.photoUrl ?? RIVER_PHOTOS[river.slug];
  if (!url || !/^https:\/\//i.test(url)) return null;
  return { url, credit: river.photoCredit ?? (url === RIVER_PHOTOS[river.slug] ? RIVER_PHOTO_CREDITS[river.slug] ?? null : null) };
}

/** The large title must clear the native bar before the compact title appears. */
export function riverTitleCollapsed(titleBottom: number | null, offsetY: number, topInset: number): boolean {
  return titleBottom !== null && Number.isFinite(titleBottom) && Number.isFinite(offsetY)
    && Number.isFinite(topInset) && offsetY + topInset >= titleBottom;
}

// White text over even an all-white photo exceeds 4.5:1 at this opacity.
export const RIVER_TITLE_SHADE = 0.64;
