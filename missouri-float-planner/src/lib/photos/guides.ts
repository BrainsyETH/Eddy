import catalog from '../../data/guide-photos.json';
import type { GuideHero } from '../../types/blog';

export const guidePhotos = catalog;
export type GuidePhoto = (typeof guidePhotos)[number];
interface GuideIdentity {
  slug: string;
  river_slug?: string | null;
}

export function isGuidePlaceholder(src: string | null | undefined): boolean {
  if (!src) return true;
  try {
    const url = new URL(src);
    return url.hostname === 'q5skne5bn5nbyxfw.public.blob.vercel-storage.com'
      && decodeURIComponent(url.pathname) === '/Eddy_Otter/Eddy the otter in a cool canoe.png';
  } catch { return false; }
}

function reviewedPhoto(post: GuideIdentity) {
  return guidePhotos.find(photo => photo.postSlug === post.slug && photo.riverSlug === post.river_slug);
}

function canReplace(src: string | null | undefined, photo: GuidePhoto) {
  return isGuidePlaceholder(src) || src === photo.originalUrl || src === photo.imageUrl
    || src === photo.cardUrl || photo.replaces.includes(src ?? '');
}

/** Exact published guides only. A later editor's image always wins. */
export function guideCover(post: GuideIdentity & { featured_image_url?: string | null }) {
  const photo = reviewedPhoto(post);
  if (photo && canReplace(post.featured_image_url, photo)) {
    return { src: photo.cardUrl, alt: photo.alt, photo };
  }
  return { src: post.featured_image_url || null, alt: undefined, photo: undefined };
}

/** The card and hero resolve independently, preserving editorial overrides. */
export function resolveGuideHero(post: GuideIdentity, hero: GuideHero): GuideHero {
  const photo = reviewedPhoto(post);
  if (!photo || !canReplace(hero.photo_url, photo)) return hero;
  return {
    ...hero,
    photo_url: photo.imageUrl,
    photo_alt: photo.alt,
    photo_caption: photo.caption,
    photo_credit: {
      image_url: photo.imageUrl,
      author: photo.author,
      source_url: photo.sourceUrl,
      license: photo.license,
      license_url: photo.licenseUrl,
      changes: photo.changes,
    },
  };
}

/** Native clients need an absolute URL; local images are already size-bounded. */
export function publicGuideImage(src: string | null): string | null {
  return src?.startsWith('/images/river-guides/') ? `https://eddy.guide${src}` : src;
}
