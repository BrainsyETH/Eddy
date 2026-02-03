// src/lib/og/fonts.ts
// Font loading utility for OG images using Satori

export async function loadOGFonts() {
  const [spaceGroteskBold, spaceGroteskSemiBold, interRegular, interMedium] =
    await Promise.all([
      fetch(
        new URL('../../app/fonts/SpaceGrotesk-Bold.ttf', import.meta.url)
      ).then((res) => res.arrayBuffer()),
      fetch(
        new URL('../../app/fonts/SpaceGrotesk-SemiBold.ttf', import.meta.url)
      ).then((res) => res.arrayBuffer()),
      fetch(
        new URL('../../app/fonts/Inter-Regular.ttf', import.meta.url)
      ).then((res) => res.arrayBuffer()),
      fetch(
        new URL('../../app/fonts/Inter-Medium.ttf', import.meta.url)
      ).then((res) => res.arrayBuffer()),
    ]);

  return [
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
