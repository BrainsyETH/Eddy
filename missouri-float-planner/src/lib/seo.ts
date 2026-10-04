import type { Metadata } from 'next';

export function publicPageMetadata(title: string, description: string, path: string): Metadata {
  return {
    title, description,
    alternates: { canonical: path },
    openGraph: { type: 'website', siteName: 'Eddy', title, description, url: path },
    twitter: { card: 'summary_large_image', title, description },
  };
}

/** Public ownership doesn't establish whether access is free. Unknown stays omitted. */
export function accessFeeSchema(feeRequired: boolean | null | undefined) {
  return typeof feeRequired === 'boolean' ? { isAccessibleForFree: !feeRequired } : {};
}
