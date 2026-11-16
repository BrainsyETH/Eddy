import type { Metadata } from 'next';
import { linkPreviewAsset, type LinkPreviewKind } from '@/lib/og/link-preview';

/** A link-preview image a page names explicitly. Alt text describes this image. */
export interface ShareImage {
  url: string;
  alt: string;
}

/**
 * The page's own route segment ships opengraph-image and twitter-image files.
 * Next serves those over any config image in the same segment, so the helper
 * leaves `images` out. sharing-previews.test.ts checks both files exist.
 */
export const ROUTE_SHARE_IMAGE = 'route-files' as const;

/** The root layout's title template. Exported so tests can measure rendered titles. */
export const TITLE_TEMPLATE = '%s | Eddy';

/** A page title as the browser and search results receive it. */
export function renderedTitle(title: string): string {
  return TITLE_TEMPLATE.replace('%s', title);
}

const SITE_IMAGE: ShareImage = {
  url: '/opengraph-image',
  alt: 'Eddy — live river conditions, water levels, and float trip plans',
};

function illustration(kind: LinkPreviewKind): ShareImage {
  const asset = linkPreviewAsset(kind);
  return { url: `/share/${asset.file}`, alt: asset.alt };
}

/** Known-good images for pages without artwork of their own. */
export const SHARE_IMAGES = {
  site: SITE_IMAGE,
  river: illustration('river'),
  gauge: illustration('gauge'),
  plan: illustration('plan'),
} as const satisfies Record<string, ShareImage>;

/**
 * Open Graph and Twitter metadata for a public page.
 *
 * Nested metadata is replaced, not merged: a page that sets only a title and
 * description inherits the root's whole openGraph object, including its
 * homepage og:url. Every public page goes through here so that cannot happen,
 * and the image is required so no page unfurls without one.
 */
export function publicPageMetadata(
  title: string,
  description: string,
  path: string,
  image: ShareImage | typeof ROUTE_SHARE_IMAGE,
): Metadata {
  const explicit = image === ROUTE_SHARE_IMAGE ? null : image;
  return {
    title, description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website', siteName: 'Eddy', title, description, url: path,
      ...(explicit ? { images: [{ url: explicit.url, width: 1200, height: 630, alt: explicit.alt }] } : {}),
    },
    twitter: {
      card: 'summary_large_image', title, description,
      ...(explicit ? { images: [{ url: explicit.url, alt: explicit.alt }] } : {}),
    },
  };
}

/** Public ownership doesn't establish whether access is free. Unknown stays omitted. */
export function accessFeeSchema(feeRequired: boolean | null | undefined) {
  return typeof feeRequired === 'boolean' ? { isAccessibleForFree: !feeRequired } : {};
}
