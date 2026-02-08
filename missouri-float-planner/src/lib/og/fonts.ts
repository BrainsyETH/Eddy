// src/lib/og/fonts.ts
// Font loading utility for OG images using Satori
// Fetches fonts from Google Fonts CDN at runtime, Fredoka loaded locally

import { readFileSync } from 'fs';
import { join } from 'path';

// Cache fonts in memory to avoid re-fetching
let cachedFonts: Array<{
  name: string;
  data: ArrayBuffer;
  weight: 400 | 500 | 600 | 700;
  style: 'normal';
}> | null = null;

export async function loadOGFonts() {
  // Return cached fonts if available
  if (cachedFonts) {
    return cachedFonts;
  }

  // Fetch fonts from Google Fonts CDN
  // These URLs are stable and serve TTF files
  const fontUrls = {
    spaceGroteskBold: 'https://fonts.gstatic.com/s/spacegrotesk/v16/V8mDoQDjQSkFtoMM3T6r8E7mPb54C_k3HqUtEw.ttf',
    spaceGroteskSemiBold: 'https://fonts.gstatic.com/s/spacegrotesk/v16/V8mDoQDjQSkFtoMM3T6r8E7mPbF4DPk3HqUtEw.ttf',
    interRegular: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.ttf',
    interMedium: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fAZ9hjp-Ek-_EeA.ttf',
  };

  try {
    // Load Fredoka locally (bundled in the project to avoid network issues during build)
    const fredokaPath = join(process.cwd(), 'src/app/fonts/Fredoka-Variable.ttf');
    const fredokaBuffer = readFileSync(fredokaPath);
    const fredoka = fredokaBuffer.buffer.slice(
      fredokaBuffer.byteOffset,
      fredokaBuffer.byteOffset + fredokaBuffer.byteLength
    );

    const [spaceGroteskBold, spaceGroteskSemiBold, interRegular, interMedium] =
      await Promise.all([
        fetch(fontUrls.spaceGroteskBold).then((res) => res.arrayBuffer()),
        fetch(fontUrls.spaceGroteskSemiBold).then((res) => res.arrayBuffer()),
        fetch(fontUrls.interRegular).then((res) => res.arrayBuffer()),
        fetch(fontUrls.interMedium).then((res) => res.arrayBuffer()),
      ]);

    cachedFonts = [
      {
        name: 'Space Grotesk',
        data: spaceGroteskBold,
        weight: 700 as const,
        style: 'normal' as const,
      },
      {
        name: 'Space Grotesk',
        data: spaceGroteskSemiBold,
        weight: 600 as const,
        style: 'normal' as const,
      },
      {
        name: 'Inter',
        data: interRegular,
        weight: 400 as const,
        style: 'normal' as const,
      },
      {
        name: 'Inter',
        data: interMedium,
        weight: 500 as const,
        style: 'normal' as const,
      },
      {
        name: 'Fredoka',
        data: fredoka,
        weight: 600 as const,
        style: 'normal' as const,
      },
    ];

    return cachedFonts;
  } catch (error) {
    console.error('Failed to load OG fonts:', error);
    // Return empty array - OG images will use system fonts as fallback
    return [];
  }
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
