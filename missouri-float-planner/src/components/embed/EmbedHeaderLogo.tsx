'use client';

import Image from 'next/image';
import { useState, type CSSProperties } from 'react';
import type { EmbedBranding } from '@/lib/embed/branding';

interface Props {
  branding: EmbedBranding | null;
  fallbackSrc: string;
  fallbackSize: number;
}

/** Partner identity occupies the header; Eddy remains the missing/broken-image fallback. */
export default function EmbedHeaderLogo({ branding, fallbackSrc, fallbackSize }: Props) {
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const logoUrl = branding?.logoUrl;
  if (!logoUrl || failedLogo === logoUrl) {
    return <Image src={fallbackSrc} alt="Eddy" width={fallbackSize} height={fallbackSize}
      style={{ width: fallbackSize, height: fallbackSize, objectFit: 'contain', flexShrink: 0 }} />;
  }

  const style: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, maxWidth: '28%', padding: 4, boxSizing: 'border-box',
    background: '#fff', borderRadius: 6,
  };
  const logo = (
    // Partner logos can live on any domain; contain preserves the complete mark.
    // eslint-disable-next-line @next/next/no-img-element
    <img key={logoUrl} src={logoUrl} alt={branding?.businessName || 'Company logo'}
      onError={() => setFailedLogo(logoUrl)}
      style={{ display: 'block', width: 120, maxWidth: '100%', height: 40, objectFit: 'contain' }} />
  );

  return branding?.siteUrl ? (
    <a href={branding.siteUrl} target="_blank" rel="noopener noreferrer nofollow" style={style}>
      {logo}
    </a>
  ) : <span style={style}>{logo}</span>;
}
