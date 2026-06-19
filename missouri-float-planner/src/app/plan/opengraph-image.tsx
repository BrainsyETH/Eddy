// src/app/plan/opengraph-image.tsx
// OG image for the planner landing (/plan). Shared-plan permalinks
// (/plan/[shortCode]) have their own route-specific card.

import { ImageResponse } from 'next/og';
import { loadFredokaFont, loadEddyAvatar, loadOtterImage, OTTER_URLS } from '@/lib/og/fonts';
import { CardFrame } from '@/lib/og/cardLayout';

export const alt = 'Plan a float trip on Eddy';
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
      <CardFrame eyebrow="Float Planner" title="Plan a Float Trip" avatar={avatar} otter={otter}>
        <span style={{ fontSize: 38, lineHeight: 1.3, color: '#3F3B33', maxWidth: 700 }}>
          Put-in to take-out with live water levels and float-time estimates.
        </span>
      </CardFrame>
    ),
    { ...size, fonts },
  );
}
