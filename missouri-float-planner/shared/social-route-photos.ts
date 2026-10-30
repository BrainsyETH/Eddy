import type { SocialRoutePoint } from './social-route-journey';
import { ROUTE_CONTENT_WIDTH } from './social-route-layout';

export const ROUTE_PHOTO_HEIGHT = 320;
export const ROUTE_PHOTO_CARD_HEIGHT = 464;
export const ROUTE_PHOTO_ZOOM = 1.04;

export type PhotoSize = { width: number; height: number };

/** Ignore common resize/encoding parameters, retaining image-identifying queries. */
export function routePhotoIdentity(src: string): string {
  const url = new URL(src, 'https://local.invalid');
  if (url.pathname === '/_next/image' && url.searchParams.has('url')) {
    return routePhotoIdentity(url.searchParams.get('url')!);
  }
  for (const key of ['w', 'width', 'h', 'height', 'q', 'quality', 'fit', 'crop', 'auto', 'format', 'fm']) {
    url.searchParams.delete(key);
  }
  url.hash = '';
  url.searchParams.sort();
  return url.toString();
}

/** Enough source pixels for object-fit:cover, including the final zoom. */
export function usableRoutePhoto(size: PhotoSize, width = ROUTE_CONTENT_WIDTH): boolean {
  return Number.isFinite(size.width) && Number.isFinite(size.height) &&
    size.width >= width * ROUTE_PHOTO_ZOOM &&
    size.height >= ROUTE_PHOTO_HEIGHT * ROUTE_PHOTO_ZOOM;
}

/** Decode before choosing holds; a failed preflight still gets a compact thumbnail attempt. */
export async function resolveRoutePhotos(
  points: ReadonlyArray<SocialRoutePoint>,
  backdrop: string | undefined,
  readSize: (src: string) => Promise<PhotoSize>,
  width = ROUTE_CONTENT_WIDTH,
): Promise<SocialRoutePoint[]> {
  const sizes = new Map<string, Promise<PhotoSize | null>>();
  return Promise.all(points.map(async (point) => {
    const compact = { ...point, photoReveal: false };
    delete compact.photoRenderWidth;
    const src = point.photoUrl;
    if (!src) return compact;
    try {
      // Omit a duplicated backdrop entirely, including the compact thumbnail.
      if (backdrop && routePhotoIdentity(src) === routePhotoIdentity(backdrop)) {
        return { ...compact, photoUrl: undefined, photoCredit: undefined };
      }
      if (point.kind === 'put_in' || point.kind === 'take_out' || point.kind === 'hazard' ||
        !Number.isFinite(point.progress) || point.progress <= 0.015 || point.progress >= 0.985) return compact;
      if (!sizes.has(src)) sizes.set(src, Promise.resolve().then(() => readSize(src)).catch(() => null));
      const size = await sizes.get(src)!;
      if (!size) return compact;
      // Keep a good existing place photo on wider exports without upscaling it.
      // Only the image receives side matting; title and card use the destination width.
      if (!usableRoutePhoto(size)) return compact;
      return { ...compact, photoReveal: true, photoRenderWidth: Math.min(width, size.width / ROUTE_PHOTO_ZOOM) };
    } catch {
      return compact;
    }
  }));
}
