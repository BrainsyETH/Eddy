import { linkPreviewResponse } from '@/lib/og/link-preview-response';
import { linkPreviewImageMetadata } from '@/lib/og/link-preview';

export const revalidate = 86400;

type Props = { params: Promise<{ slug: string }> };

export async function generateImageMetadata({ params }: Props) {
  return linkPreviewImageMetadata('river', (await params).slug);
}

export default async function Image({ params }: Props) {
  return linkPreviewResponse('river', (await params).slug);
}
