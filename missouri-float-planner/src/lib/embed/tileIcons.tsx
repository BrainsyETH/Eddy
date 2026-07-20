// src/lib/embed/tileIcons.tsx
// Icon rendering for the embed "bubble" stat tiles.
//
// Live tiles (gauge, flow) show the Eddy mood otter for the current condition;
// the optimal-range tile shows the green "good to go" flag; the weather tile
// shows a standard weather glyph tinted with a global brand token. Otter + flag
// art are hosted in Vercel Blob and passed in as URLs by the widget pages; the
// weather glyph is self-contained inline SVG (these tiles render inside
// third-party iframes, so the markup stays dependency-light and offline-safe).

import type { CSSProperties } from 'react';

export type EmbedTileIconKey = 'gauge' | 'flow' | 'optimal' | 'weather';

// Same bucket/folder that backs the access-point cards (road-icon.png, …).
export const DETAIL_ICONS_BASE =
  'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/detail-icons';

/** Green "good to go" flag shown on the optimal-range tile. */
export const FLAG_GREEN_ICON = `${DETAIL_ICONS_BASE}/flag_green.png`;

// Standard weather glyph (sun behind a cloud). Inherits its color from the
// parent via `currentColor` so the tile can tint it with a global brand token.
function WeatherGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2v2" />
      <path d="m4.9 4.9 1.4 1.4" />
      <path d="M20 12h2" />
      <path d="m17.7 6.3 1.4-1.4" />
      <path d="M15.9 12.6a4 4 0 1 0-5.9-4.1" />
      <path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z" />
    </svg>
  );
}

/**
 * Renders a tile's badge content: the hosted brand image (mood otter / green
 * flag) when a URL is given, otherwise the inline, brand-tinted weather glyph.
 */
export function TileBadgeIcon({
  imageUrl,
  isWeather = false,
  weatherColor = 'var(--color-accent-500)',
  size = 15,
}: {
  imageUrl?: string;
  isWeather?: boolean;
  weatherColor?: string;
  size?: number;
}) {
  if (imageUrl) {
    const imgStyle: CSSProperties = { width: size, height: size, objectFit: 'contain', display: 'block' };
    // Brand art lives on the Vercel Blob CDN and this markup ships inside
    // third-party iframes, so a plain <img> is correct here.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt="" width={size} height={size} style={imgStyle} />;
  }
  if (isWeather) {
    return (
      <span style={{ display: 'inline-flex', color: weatherColor }}>
        <WeatherGlyph size={Math.round(size * 0.72)} />
      </span>
    );
  }
  return null;
}
