// src/components/embed/v2/EmbedCredit.tsx
// The bottom row of every card/full widget: at most one deep link, the
// partner's credit when they have one, and the "Powered by Eddy" backlink.
// Every link out carries the embed UTM set (src/lib/embed/branding.ts) so the
// program is attributable per widget, per river, per partner.
//
// The old footers carried three links and a second otter. A sidebar widget
// earns one call to action; the rest is the host's page.

import { eddyDeepLink } from '@/lib/embed/branding';
import type { EmbedBrandingRecord } from '@/lib/embed/cards';
import { EDDY_IMAGES } from '@/constants';

export interface EmbedCreditLink {
  label: string;
  path: string;
}

export default function EmbedCredit({
  origin,
  widget,
  widgetKey,
  links,
  partner,
  branding,
  embedId,
}: {
  origin: string;
  widget: string;
  widgetKey: string;
  links: EmbedCreditLink[];
  partner?: string;
  branding?: EmbedBrandingRecord | null;
  embedId?: string | null;
}) {
  const utm = { widget, key: widgetKey, partner: branding?.businessName || embedId || partner || undefined };
  const creditName = branding?.businessName || partner || null;
  return (
    <footer className="ew-credit">
      <nav aria-label="More from Eddy" className="ew-credit-links">
        {links.map((link) => (
          <a key={link.path} href={eddyDeepLink(origin, link.path, utm)} target="_blank" rel="noopener noreferrer" className="ew-link">
            {link.label} →
          </a>
        ))}
      </nav>
      <div className="ew-credit-right">
        {creditName && (
          branding?.siteUrl ? (
            <a href={branding.siteUrl} target="_blank" rel="noopener noreferrer nofollow" className="ew-credit-partner">
              {creditName}
            </a>
          ) : (
            <span className="ew-credit-partner">{creditName}</span>
          )
        )}
        <a href={eddyDeepLink(origin, '/', utm)} target="_blank" rel="noopener noreferrer" className="ew-powered">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={EDDY_IMAGES.favicon} alt="" width={14} height={14} style={{ width: 14, height: 14, borderRadius: '50%' }} />
          Powered by Eddy
        </a>
      </div>
    </footer>
  );
}
