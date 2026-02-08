// src/lib/og/fonts.ts
// Font loading utility for OG images using Satori
// Fetches fonts from Google Fonts CDN at runtime, Fredoka loaded locally

import { readFileSync } from 'fs';
import { join } from 'path';

// Cache Fredoka font in memory
let cachedFredoka: ArrayBuffer | null = null;

// Load only the Fredoka brand font (local file, no network calls)
// All other text in OG images uses system-ui which Satori provides by default
export function loadFredokaFont(): Array<{
  name: string;
  data: ArrayBuffer;
  weight: number;
  style: 'normal';
}> {
  if (!cachedFredoka) {
    const fredokaPath = join(process.cwd(), 'src/app/fonts/Fredoka-Variable.ttf');
    const fredokaBuffer = readFileSync(fredokaPath);
    cachedFredoka = fredokaBuffer.buffer.slice(
      fredokaBuffer.byteOffset,
      fredokaBuffer.byteOffset + fredokaBuffer.byteLength
    );
  }

  return [
    {
      name: 'Fredoka',
      data: cachedFredoka,
      weight: 600,
      style: 'normal' as const,
    },
  ];
}

// Load Eddy avatar as base64 for use in ImageResponse
export async function loadEddyAvatar(): Promise<string> {
  const response = await fetch(
    'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png'
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
    optimal: OTTER_URLS.green,
    low: OTTER_URLS.green,
    very_low: OTTER_URLS.yellow,
    high: OTTER_URLS.red,
    too_low: OTTER_URLS.flag,
    dangerous: OTTER_URLS.red,
    unknown: OTTER_URLS.green,
  };

  const url = otterUrls[condition] || OTTER_URLS.green;

  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  return `data:image/png;base64,${base64}`;
}

// Load any otter image as base64 by URL
export async function loadOtterImage(url: string): Promise<string> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  return `data:image/png;base64,${base64}`;
}
