'use client';

// src/components/embed/EmbedFooter.tsx
// Shared footer for the embed widgets: deep links back to eddy.guide (all
// UTM-tagged), the partner credit, and the "Powered by Eddy" backlink.
//
// Partner credit precedence: a registered branding (?e=<embedId>, logo +
// linked business name) beats the zero-setup ?partner= text credit.

import Image from 'next/image';
import EmbedPartnerBrand from './EmbedPartnerBrand';
import type { CSSProperties } from 'react';
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
  embedId?: string | null;
}

export default function EmbedFooter({
  origin,
  widget,
  widgetKey,
  isDark,
  links = [],
  partner = '',
  branding = null,
  embedId = null,
}: EmbedFooterProps) {
  const p = embedPalette(isDark);
  const utm = { widget, key: widgetKey, partner: branding?.businessName || embedId || partner || undefined };

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
        '--embed-hover': p.hoverBg,
        '--embed-focus': p.focus,
      } as CSSProperties}
    >
      {(branding?.businessName || partner) && (
        <EmbedPartnerBrand
          businessName={branding ? branding.businessName : partner}
          siteUrl={branding?.siteUrl}
          isDark={isDark}
          compact
        />
      )}
      {links.length > 0 && (
        <nav aria-label="More from Eddy" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {links.map(l => (
            <a
              key={l.label}
              href={eddyDeepLink(origin, l.path, utm)}
              target="_blank"
              rel="noopener noreferrer"
              className="embed-footer-link"
              style={{ display: 'inline-flex', alignItems: 'center', minHeight: 32, padding: '0 4px', margin: '0 -4px', borderRadius: 4, fontSize: 11, color: p.link, textDecoration: 'none', fontWeight: 700 }}
            >
              {l.label} &rarr;
            </a>
          ))}
        </nav>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
        <a
          href={eddyDeepLink(origin, '/', utm)}
          target="_blank"
          rel="noopener noreferrer"
          className="embed-footer-link"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 32, padding: '0 4px', marginRight: -4, borderRadius: 4, fontSize: 10, color: p.textSecondary, textDecoration: 'none' }}
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
