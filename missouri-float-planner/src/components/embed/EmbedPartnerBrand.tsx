'use client';

import { useState, type CSSProperties } from 'react';
import { embedPalette, EMBED_FONTS } from '@/lib/embed/theme';

interface Props {
  businessName?: string | null;
  logoUrl?: string | null;
  siteUrl?: string | null;
  isDark: boolean;
  compact?: boolean;
  showLogoError?: boolean;
}

/** Shared by the builder preview and widgets; logos keep their natural proportions. */
export default function EmbedPartnerBrand({ businessName, logoUrl, siteUrl, isDark, compact = false, showLogoError = false }: Props) {
  const p = embedPalette(isDark);
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const hasLogo = Boolean(logoUrl && failedLogo !== logoUrl);
  if (!businessName && !hasLogo && !showLogoError) return null;
  if (!businessName && !logoUrl) return null;

  const style: CSSProperties = {
    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: compact ? 8 : 12,
    minWidth: 0, width: '100%', color: p.textPrimary, textDecoration: 'none',
    fontFamily: EMBED_FONTS.body, borderRadius: 6,
  };
  const identity = (
    <>
      {logoUrl && failedLogo !== logoUrl && (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
          maxWidth: '100%', padding: compact ? 5 : 8, boxSizing: 'border-box', borderRadius: 8,
          background: '#fff', border: `1px solid ${p.border}` }}>
          {/* External partner logos cannot require a next/image domain allowlist. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={logoUrl} src={logoUrl} alt={businessName ? '' : 'Partner logo'}
            onError={() => setFailedLogo(logoUrl)}
            style={{ display: 'block', width: compact ? 140 : 180, height: compact ? 40 : 64, maxWidth: '100%', objectFit: 'contain' }} />
        </span>
      )}
      {businessName ? (
        <span style={{ flex: '1 1 120px', minWidth: 0, fontSize: compact ? 14 : 16, lineHeight: 1.4,
          fontWeight: 700, overflowWrap: 'anywhere' }}>{businessName}</span>
      ) : null}
      {showLogoError && logoUrl && failedLogo === logoUrl ? (
        <span style={{ fontSize: 12, color: p.textSecondary }}>Partner logo unavailable</span>
      ) : null}
    </>
  );

  // Optional partner backlinks remain separate from Eddy attribution.
  return siteUrl ? (
    <a href={siteUrl} target="_blank" rel="noopener noreferrer nofollow" className="embed-footer-link" style={style}>
      {identity}
    </a>
  ) : <div style={style}>{identity}</div>;
}
