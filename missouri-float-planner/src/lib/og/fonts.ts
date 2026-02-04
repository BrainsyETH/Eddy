// src/lib/og/fonts.ts
// Font loading utility for OG images using Satori
// Fetches fonts from Google Fonts CDN at runtime

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

// Load condition-specific otter image for Float Plan cards
export async function loadConditionOtter(
  condition: string
): Promise<string> {
  const otterUrls: Record<string, string> = {
    optimal:
      'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png',
    low: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png',
    very_low:
      'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_yellow.png',
    high: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_red.png',
    too_low:
      'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20with%20a%20flag.png',
    dangerous:
      'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_red.png',
    unknown:
      'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png',
  };

  const url =
    otterUrls[condition] ||
    'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png';

  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  return `data:image/png;base64,${base64}`;
}
