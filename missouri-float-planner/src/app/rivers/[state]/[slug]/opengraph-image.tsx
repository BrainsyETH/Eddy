import { linkPreviewResponse } from '@/lib/og/link-preview-response';
import { LINK_PREVIEW_SIZE, linkPreviewAsset, linkPreviewImageMetadata } from '@/lib/og/link-preview';
import { riverCard, riverCardResponse } from '@/lib/og/river-card';

export const revalidate = 86400;

type Props = { params: Promise<{ slug: string }> };

/** The page's metadata calls this too, so a failed lookup costs only the name
 * in the alt text, never the page. */
export async function generateImageMetadata({ params }: Props) {
  const { slug } = await params;
  const card = await riverCard(slug).catch(() => undefined);
  if (card === null) return linkPreviewImageMetadata('river');
  const { alt, contentType } = linkPreviewAsset('river', slug);
  return [{ id: 'preview', alt: card ? `${card.name}. ${alt}` : alt, contentType, size: LINK_PREVIEW_SIZE }];
}

export default async function Image({ params }: Props) {
  const { slug } = await params;
  // A failed lookup throws on purpose: see riverCard. Only a slug with no
  // river gets the unnamed illustration.
  const card = await riverCard(slug);
  return card ? riverCardResponse(slug, card) : linkPreviewResponse('river');
}
