import type { Metadata } from 'next';

export function publicPageMetadata(title: string, description: string, path: string, shareImage?: string): Metadata {
  return {
    title, description,
    alternates: { canonical: path },
    // Nested metadata is replaced, not merged. Routes without their own
    // file-based image need explicit fallbacks when overriding openGraph.
    openGraph: {
      type: 'website', siteName: 'Eddy', title, description, url: path,
      ...(shareImage ? { images: [{ url: shareImage, width: 1200, height: 630, alt: 'Eddy — live river conditions, water levels, and float trip plans' }] } : {}),
    },
    twitter: { card: 'summary_large_image', title, description, ...(shareImage ? { images: [shareImage] } : {}) },
  };
}

/** Public ownership doesn't establish whether access is free. Unknown stays omitted. */
export function accessFeeSchema(feeRequired: boolean | null | undefined) {
  return typeof feeRequired === 'boolean' ? { isAccessibleForFree: !feeRequired } : {};
}
