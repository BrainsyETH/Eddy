'use client';

// src/components/embed/EmbedFooter.tsx
// Shared footer for the embed widgets: deep links back to eddy.guide (all
// UTM-tagged), the partner credit, and the "Powered by Eddy" backlink.
//
// Partner credit precedence: a registered branding (?e=<embedId>, logo +
// linked business name) beats the zero-setup ?partner= text credit.

import Image from 'next/image';
import { eddyDeepLink, type EmbedBranding } from '@/lib/embed/branding';
import { embedPalette, EMBED_FONTS } from '@/lib/embed/theme';

const EDDY_LOGO = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png';

export interface EmbedFooterLink {
  label: string;
  path: string;
}

interface EmbedFooterProps {
  origin: string;
  /** Widget type for utm_medium (e.g. 'widget', 'services'). */
  widget: string;
  /** River slug / embed id for utm_campaign. */
  widgetKey: string;
  isDark: boolean;
  links?: EmbedFooterLink[];
  partner?: string;
  branding?: EmbedBranding | null;
}

export default function EmbedFooter({
  origin,
  widget,
  widgetKey,
  isDark,
  links = [],
  partner = '',
  branding = null,
}: EmbedFooterProps) {
  const p = embedPalette(isDark);
  const utm = { widget, key: widgetKey, partner: branding?.businessName || partner || undefined };

  const credit = branding?.businessName ? (
    branding.siteUrl ? (
      <a
        href={branding.siteUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: p.textSecondary, textDecoration: 'none', fontWeight: 600 }}
      >
        {branding.logoUrl && (
          // Partner logos live on arbitrary domains — next/image needs an
          // allowlist, so use a plain img and degrade silently.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt="" width={14} height={14} style={{ width: 14, height: 14, objectFit: 'contain', borderRadius: 3 }} />
        )}
        via {branding.businessName}
      </a>
    ) : (
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: p.textSecondary, fontWeight: 600 }}>
        {branding.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt="" width={14} height={14} style={{ width: 14, height: 14, objectFit: 'contain', borderRadius: 3 }} />
        )}
        via {branding.businessName}
      </span>
    )
  ) : partner ? (
    <span style={{ fontSize: 10, color: p.textSecondary, fontWeight: 500 }}>via {partner}</span>
  ) : null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: links.length > 0 ? 'space-between' : 'flex-end',
        gap: 8,
        flexWrap: 'wrap',
        borderTop: `1px solid ${p.border}`,
        paddingTop: 8,
        marginTop: 2,
        fontFamily: EMBED_FONTS.body,
      }}
    >
      {links.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {links.map(l => (
            <a
              key={l.label}
              href={eddyDeepLink(origin, l.path, utm)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11, color: p.link, textDecoration: 'none', fontWeight: 600 }}
            >
              {l.label} &rarr;
            </a>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
        {credit}
        <a
          href={eddyDeepLink(origin, '/', utm)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: p.textSecondary, textDecoration: 'none' }}
        >
          <Image
            src={EDDY_LOGO}
            alt="Eddy"
            width={16}
            height={16}
            style={{ width: 14, height: 14, objectFit: 'contain', borderRadius: '50%' }}
          />
          Powered by Eddy
        </a>
      </div>
    </div>
  );
}
