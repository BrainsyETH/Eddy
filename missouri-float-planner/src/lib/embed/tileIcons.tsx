// src/lib/embed/tileIcons.tsx
// Icon source-of-truth for the embed "bubble" stat tiles.
//
// Each tile resolves to a brand icon hosted in Vercel Blob (/detail-icons) as
// soon as its URL is filled in below; until the final filenames are confirmed
// it falls back to a self-contained inline glyph. The fallback deliberately
// avoids any icon-library import: these tiles render inside third-party
// iframes, so the markup must stay dependency-light and offline-safe.

import type { CSSProperties } from 'react';

export type EmbedTileIconKey = 'gauge' | 'flow' | 'optimal' | 'weather';

// Same bucket/folder that already backs the access-point cards
// (road-icon.png, parking-icon.png, …). See src/components/plan/FloatPlanCard.tsx.
export const DETAIL_ICONS_BASE =
  'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/detail-icons';

// TODO(icons): drop the confirmed /detail-icons filenames in here and every
// tile switches from the placeholder glyph to the real brand art — one line
// each, no other change required. e.g.
//   gauge: `${DETAIL_ICONS_BASE}/gauge-icon.png`,
export const EMBED_TILE_ICON_URL: Record<EmbedTileIconKey, string | null> = {
  gauge: null,
  flow: null,
  optimal: null,
  weather: null,
};

// Hand-authored placeholder glyphs (white stroke, sized for the 22px badge) so
// the tiles look intentional before the real icons land.
function Glyph({ icon }: { icon: EmbedTileIconKey }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (icon) {
    case 'gauge': // dial + needle
      return (
        <svg {...common}>
          <path d="M4 15a8 8 0 0 1 16 0" />
          <path d="M12 15l4-4.5" />
        </svg>
      );
    case 'flow': // stacked waves
      return (
        <svg {...common}>
          <path d="M2 8c2.2-2.2 4.4-2.2 6.6 0s4.4 2.2 6.6 0 4.4-2.2 6.6 0" />
          <path d="M2 15c2.2-2.2 4.4-2.2 6.6 0s4.4 2.2 6.6 0 4.4-2.2 6.6 0" />
        </svg>
      );
    case 'optimal': // target
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3.5" />
        </svg>
      );
    case 'weather': // sun
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.3 1.3M17.1 17.1l1.3 1.3M18.4 5.6l-1.3 1.3M6.9 17.1l-1.3 1.3" />
        </svg>
      );
  }
}

/**
 * Renders a tile's icon: the hosted brand asset when its URL is set, otherwise
 * the inline placeholder glyph. Color is inherited (`currentColor`), so the
 * badge sets the glyph color via CSS `color`.
 */
export function TileIcon({ icon, size = 14 }: { icon: EmbedTileIconKey; size?: number }) {
  const url = EMBED_TILE_ICON_URL[icon];
  if (url) {
    const imgStyle: CSSProperties = { width: size, height: size, objectFit: 'contain', display: 'block' };
    // Brand icons live on the Vercel Blob CDN (arbitrary host) and this markup
    // ships inside third-party iframes, so a plain <img> is correct here.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} style={imgStyle} />;
  }
  return <Glyph icon={icon} />;
}
