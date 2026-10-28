// eddy-ios/src/lib/floatPhotos.ts
// Which access-point photos a float will want with no signal: the take-out's
// and those of every access along the stretch, the ones Float tools shows in
// its Take-out card and Ahead rows. Pure, so the web suite tests it; the
// prefetch itself is src/float/floatPhotos.ts.

import type { MapAccessPoint } from '@eddy/types';

/** Accesses a little outside the stretch still appear once GPS refines the start. */
const MARGIN_MILES = 0.5;
/** Bounds the download on a long stretch; one photo each, the first. */
const MAX_PHOTOS = 24;

/**
 * The first photo of the take-out and of each access between the start and
 * the take-out (published miles, with a small margin), take-out first. With
 * no known start, everything upstream of the take-out qualifies.
 */
export function stretchPhotoUris(
  points: readonly MapAccessPoint[],
  takeOutId: string,
  fromId?: string | null,
  fromMile?: number | null,
): string[] {
  const takeOut = points.find((point) => point.id === takeOutId);
  if (!takeOut || !Number.isFinite(takeOut.riverMile)) return [];
  const start = fromId ? points.find((point) => point.id === fromId)?.riverMile : fromMile;
  const low = start != null && Number.isFinite(start) ? start - MARGIN_MILES : -Infinity;
  const high = takeOut.riverMile + MARGIN_MILES;
  const along = points
    .filter((point) => point.id !== takeOutId && Number.isFinite(point.riverMile) && point.riverMile >= low && point.riverMile <= high)
    .sort((a, b) => a.riverMile - b.riverMile);
  const uris = [takeOut, ...along].map((point) => point.imageUrls?.[0]).filter((uri): uri is string => typeof uri === 'string' && uri.length > 0);
  return [...new Set(uris)].slice(0, MAX_PHOTOS);
}
