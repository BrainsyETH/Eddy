// eddy-ios/src/float/floatPhotos.ts
// Put a float's access-point photos in the image disk cache while there is
// signal, so Float tools can show them at the take-out with none. Called when
// a float starts and when a trip map is downloaded. Best effort: a photo that
// does not arrive falls back to the Eddy place mark, which needs nothing.

import { Image } from 'expo-image';
import type { MapAccessPoint } from '@eddy/types';
import { scenicUri } from '@/components/ScenicImage';
import { stretchPhotoUris } from '@/lib/floatPhotos';
import { readRiver } from '@/lib/riverCache';
import { warn } from '@/lib/monitoring';

export async function prefetchStretchPhotos(input: {
  /** The river's access points with their photos; read from the cache when absent. */
  points?: readonly MapAccessPoint[] | null;
  riverSlug: string;
  takeOutId: string;
  fromId?: string | null;
  fromMile?: number | null;
}): Promise<void> {
  try {
    const points = input.points ?? (await readRiver(input.riverSlug))?.payload.accessPoints ?? [];
    const uris = stretchPhotoUris(points, input.takeOutId, input.fromId, input.fromMile).map((uri) => scenicUri(uri));
    if (uris.length > 0) await Image.prefetch(uris, 'disk');
  } catch (error) {
    warn('float', 'could not save access photos for offline', error);
  }
}
