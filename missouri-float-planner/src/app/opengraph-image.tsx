// src/app/opengraph-image.tsx
// Homepage OG image — Field Notebook brand card.

import { ImageResponse } from 'next/og';
import { loadFredokaFont, loadEddyAvatar, loadOtterImage, OTTER_URLS } from '@/lib/og/fonts';
import { CardFrame } from '@/lib/og/cardLayout';

export const alt = 'Eddy — live river conditions, water levels, and float trip plans';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export const revalidate = 86400;

export default async function Image() {
  const fonts = loadFredokaFont();
  const [avatar, otter] = await Promise.all([
    loadEddyAvatar().catch(() => null),
    loadOtterImage(OTTER_URLS.canoe).catch(() => null),
  ]);

  return new ImageResponse(
    (
      <CardFrame eyebrow="Ozark Float Trips" title="Eddy" avatar={avatar} otter={otter}>
        <span style={{ fontSize: 38, lineHeight: 1.3, color: '#3F3B33', maxWidth: 720 }}>
          Get live conditions, water levels, and float trip plans.
        </span>
      </CardFrame>
    ),
    { ...size, fonts },
  );
}
