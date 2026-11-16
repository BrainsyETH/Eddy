// src/app/blog/[slug]/opengraph-image.tsx
// Dynamic OG image for blog posts (River Guides + general Guides) — Field
// Notebook card: Eddy logo, category kicker, and the post title.

import { ImageResponse } from 'next/og';
import { loadFredokaFont, loadEddyAvatar } from '@/lib/og/fonts';
import { CardFrame } from '@/lib/og/cardLayout';
import { GENERIC_GUIDE_CARD, guideCard } from '@/lib/og/guide-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

/** The card shows the post title, so its alt text names it. next.config.mjs
 * rewrites the bare image URLs already cached in chats to this `preview` id.
 * The page's metadata calls this too, so a failed lookup costs only the
 * title in the alt text, never the page. */
export async function generateImageMetadata({ params }: Props) {
  const card = await guideCard((await params).slug).catch(() => null);
  const alt = card ? `Eddy guide title card: ${card.title}` : 'Eddy guide title card';
  return [{ id: 'preview', alt, size, contentType }];
}

export default async function Image({ params }: Props) {
  // A failed lookup throws here on purpose: see guideCard.
  const { title, eyebrow } = (await guideCard((await params).slug)) ?? GENERIC_GUIDE_CARD;

  const fonts = loadFredokaFont();
  const avatar = await loadEddyAvatar().catch(() => null);

  return new ImageResponse(
    (
      <CardFrame
        eyebrow={eyebrow}
        title={title}
        avatar={avatar}
      />
    ),
    { ...size, fonts },
  );
}
