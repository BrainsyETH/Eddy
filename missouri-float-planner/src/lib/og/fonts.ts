// src/lib/og/fonts.ts
// Font loading utility for OG images using Satori
// Fonts are embedded as base64 to avoid all bundler/file-system issues:
// Fredoka SemiBold (display) + Geist Mono Bold (instrument numerals).

import { FREDOKA_SEMIBOLD_BASE64 } from './fredoka-font-data';
import { GEIST_MONO_BOLD_BASE64 } from './geist-mono-font-data';

export type OGFont = {
  name: string;
  data: ArrayBuffer;
  weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  style: 'normal';
};

// Decode each embedded base64 font once, then cache it
const fontCache = new Map<string, ArrayBuffer>();

function decodeFont(key: string, base64: string): ArrayBuffer {
  let cached = fontCache.get(key);
  if (!cached) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    cached = bytes.buffer;
    fontCache.set(key, cached);
  }
  return cached;
}

export function loadFredokaFont(): OGFont[] {
  return [
    {
      name: 'Fredoka',
      data: decodeFont('fredoka', FREDOKA_SEMIBOLD_BASE64),
      weight: 600 as const,
      style: 'normal' as const,
    },
  ];
}

/** Fredoka + Geist Mono — for covers that render instrument numerals (the
 *  warning/storm alert family). Mono glyphs cover ASCII + ▲▼→·°. */
export function loadOgFonts(): OGFont[] {
  return [
    ...loadFredokaFont(),
    {
      name: 'Geist Mono',
      data: decodeFont('geist-mono', GEIST_MONO_BOLD_BASE64),
      weight: 700 as const,
      style: 'normal' as const,
    },
  ];
}

// Load Eddy avatar as base64 for use in ImageResponse
export async function loadEddyAvatar(): Promise<string> {
  const response = await fetch(
    'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png',
    { signal: AbortSignal.timeout(3000) }
  );
  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  return `data:image/png;base64,${base64}`;
}

// Otter image URLs by key
export const OTTER_URLS = {
  standard: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter.png',
  green: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png',
  red: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_red.png',
  yellow: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_yellow.png',
  flag: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20with%20a%20flag.png',
  flood: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_flood.png',
  canoe: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20cool%20canoe.png',
} as const;

// Load condition-specific otter image for Float Plan cards
export async function loadConditionOtter(
  condition: string
): Promise<string> {
  const otterUrls: Record<string, string> = {
    flowing: OTTER_URLS.green,
    good: OTTER_URLS.green,
    low: OTTER_URLS.yellow,
    high: OTTER_URLS.red,
    too_low: OTTER_URLS.flag,
    dangerous: OTTER_URLS.red,
    unknown: OTTER_URLS.green,
  };

  const url = otterUrls[condition] || OTTER_URLS.green;

  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  return `data:image/png;base64,${base64}`;
}

// Load any otter image as base64 by URL
export async function loadOtterImage(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  return `data:image/png;base64,${base64}`;
}

// Fetch any image URL and inline it as a base64 data URI for Satori/ImageResponse
// (which can't reliably lazy-load remote images). 3s timeout; throws on a bad
// response so callers can try/catch and degrade gracefully (e.g. drop the photo).
export async function loadImageAsDataUri(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error(`Image fetch failed: ${response.status}`);
  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const contentType = response.headers.get('content-type') || 'image/png';
  return `data:${contentType};base64,${base64}`;
}
