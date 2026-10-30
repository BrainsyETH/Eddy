'use client';

// src/components/embed/v2/EmbedBrandMark.tsx
// The one mascot slot in a widget: a partner's logo when they registered one
// (linked to their site), otherwise Eddy in the mood the live condition calls
// for. Client-side only for the broken-logo fallback — a partner's hosted
// image can 404 years after they pasted the snippet, and the widget must not
// show a broken-image glyph where its host's brand belongs.

import { useState } from 'react';
import type { EmbedBrandingRecord } from '@/lib/embed/cards';

export default function EmbedBrandMark({
  branding,
  eddySrc,
  size = 36,
}: {
  branding: EmbedBrandingRecord | null;
  /** The condition-mood otter (or the favicon for a dam). */
  eddySrc: string;
  size?: number;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const logoUrl = branding?.logoUrl;

  if (!logoUrl || failed === logoUrl) {
    // Brand art lives on the Vercel Blob CDN and this markup ships inside
    // third-party iframes, so a plain <img> is correct here.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={eddySrc} alt="" width={size} height={size} className="ew-mascot" style={{ width: size, height: size }} />;
  }

  const logo = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={logoUrl}
      src={logoUrl}
      alt={branding?.businessName || 'Partner logo'}
      onError={() => setFailed(logoUrl)}
      style={{ display: 'block', width: 120, maxWidth: '100%', height: 40, objectFit: 'contain' }}
    />
  );
  return branding?.siteUrl ? (
    <a href={branding.siteUrl} target="_blank" rel="noopener noreferrer nofollow" className="ew-partner-logo">
      {logo}
    </a>
  ) : (
    <span className="ew-partner-logo">{logo}</span>
  );
}
