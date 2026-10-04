/** Link artwork is deliberately timeless: recipients can cache it indefinitely.
 * Keep names, route details and instructions in accessible page metadata.
 */
export const LINK_PREVIEW_SIZE = { width: 1200, height: 630 };
export type LinkPreviewKind = 'river' | 'gauge' | 'dam' | 'access' | 'plan';

interface LinkPreviewAsset {
  file: string;
  alt: string;
  contentType: 'image/png' | 'image/jpeg';
  sourcePhoto?: string;
}

const illustrations: Record<LinkPreviewKind, LinkPreviewAsset> = {
  river: { file: 'river-v1.png', contentType: 'image/png', alt: 'Eddy illustration of a river.' },
  gauge: { file: 'gauge-v1.png', contentType: 'image/png', alt: 'Eddy illustration of checking a river gauge.' },
  dam: { file: 'dam-v1.png', contentType: 'image/png', alt: 'Eddy illustration of a dam.' },
  access: { file: 'access-v1.png', contentType: 'image/png', alt: 'Eddy illustration of a boat ramp.' },
  plan: { file: 'plan-v1.png', contentType: 'image/png', alt: 'Eddy illustration of planning a float route.' },
};

/** Curated archival photos only. File, caption and source always travel together. */
export const LINK_PREVIEW_PHOTOS: Partial<Record<LinkPreviewKind, Record<string, LinkPreviewAsset>>> = {
  river: {
    current: { file: 'river-current-v2.jpg', contentType: 'image/jpeg', sourcePhoto: 'current.jpg',
      alt: 'Archival photograph of a red canoe beside the Current River, not current conditions.' },
  },
  dam: {
    'ameren-bagnell-dam': { file: 'dam-bagnell-v2.jpg', contentType: 'image/jpeg', sourcePhoto: 'bagnell.jpg',
      alt: 'Archival aerial photograph of Bagnell Dam, not current releases.' },
  },
};

export function linkPreviewAsset(kind: LinkPreviewKind, slug?: string): LinkPreviewAsset {
  const photos = LINK_PREVIEW_PHOTOS[kind];
  return (slug && photos && Object.hasOwn(photos, slug) ? photos[slug] : undefined) ?? illustrations[kind];
}

export function linkPreviewFile(kind: LinkPreviewKind, slug?: string): string {
  return linkPreviewAsset(kind, slug).file;
}

export function linkPreviewImageMetadata(kind: LinkPreviewKind, slug?: string) {
  const { alt, contentType } = linkPreviewAsset(kind, slug);
  return [{ id: 'preview', alt, contentType, size: LINK_PREVIEW_SIZE }];
}
