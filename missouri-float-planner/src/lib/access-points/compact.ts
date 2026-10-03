import type { AccessPoint } from '@/types/api';

/** iOS lists fetch campground detail on selection. Keep pin identity and its hero. */
export function compactAccessPoint(point: AccessPoint): AccessPoint {
  const { npsCampground, ...summary } = point;
  return {
    ...summary,
    imageUrls: point.imageUrls?.length ? point.imageUrls : npsCampground?.images?.slice(0, 1).map((image) => image.url) ?? [],
    types: npsCampground && !point.types?.includes('campground')
      ? [...(point.types ?? [point.type]), 'campground'] : point.types,
  };
}
