import { IMAGE_REMOTE_PATTERNS } from '../../shared/image-remote-patterns.mjs';
import type { GuideHero } from '@/types/blog';

/** Use the same allowlist as Next; render other URLs directly. */
export function optimizeBlogImage(src: string): boolean {
  if (src.startsWith('/') && !src.startsWith('//')) return true;
  try {
    const url = new URL(src);
    if (url.username || url.password) return false;
    return IMAGE_REMOTE_PATTERNS.some(pattern => {
      const host = pattern.hostname.startsWith('**.')
        ? url.hostname.endsWith(pattern.hostname.slice(2)) && url.hostname !== pattern.hostname.slice(3)
        : url.hostname === pattern.hostname;
      const path = !pattern.pathname || (pattern.pathname.endsWith('**')
        ? url.pathname.startsWith(pattern.pathname.slice(0, -2)) : url.pathname === pattern.pathname);
      return host && path && url.protocol === `${pattern.protocol}:` && url.port === (pattern.port ?? '');
    });
  } catch { return false; }
}

/** A credit belongs to one exact image, never merely to its river. */
export function guidePhotoCredit(hero: GuideHero) {
  return hero.photo_credit?.image_url === hero.photo_url ? hero.photo_credit : undefined;
}
