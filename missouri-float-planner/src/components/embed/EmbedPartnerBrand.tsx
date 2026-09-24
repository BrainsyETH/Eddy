'use client';

import { useState, type CSSProperties } from 'react';
import { embedPalette, EMBED_FONTS } from '@/lib/embed/theme';

interface Props {
  businessName?: string | null;
  logoUrl?: string | null;
  siteUrl?: string | null;
  isDark: boolean;
}

/** Shared by the builder preview and widgets; logos keep their natural proportions. */
export default function EmbedPartnerBrand({ businessName, logoUrl, siteUrl, isDark }: Props) {
  const p = embedPalette(isDark);
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  if (!businessName && !logoUrl) return null;

  const style: CSSProperties = {
    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12,
    minWidth: 0, width: '100%', color: p.textPrimary, textDecoration: 'none',
    fontFamily: EMBED_FONTS.body, borderRadius: 6,
  };
  const identity = (
    <>
      {logoUrl && failedLogo !== logoUrl && (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
          maxWidth: '100%', padding: 8, boxSizing: 'border-box', borderRadius: 8,
          background: '#fff', border: `1px solid ${p.border}` }}>
          {/* External partner logos cannot require a next/image domain allowlist. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={logoUrl} src={logoUrl} alt={businessName ? '' : 'Partner logo'}
            onError={() => setFailedLogo(logoUrl)}
            style={{ display: 'block', width: 180, height: 64, maxWidth: '100%', objectFit: 'contain' }} />
        </span>
      )}
      {businessName ? (
        <span style={{ flex: '1 1 120px', minWidth: 0, fontSize: 16, lineHeight: 1.4,
          fontWeight: 700, overflowWrap: 'anywhere' }}>{businessName}</span>
      ) : failedLogo === logoUrl ? (
        <span style={{ fontSize: 12, color: p.textSecondary }}>Partner logo unavailable</span>
      ) : null}
    </>
  );

  // Keep existing registered backlinks working; new setups only ask for identity.
  return siteUrl ? (
    <a href={siteUrl} target="_blank" rel="noopener noreferrer" className="embed-footer-link" style={style}>
      {identity}
    </a>
  ) : <div style={style}>{identity}</div>;
}
