import { linkPreviewResponse } from '@/lib/og/link-preview-response';
import { linkPreviewImageMetadata } from '@/lib/og/link-preview';

export const revalidate = 86400;

type Props = { params: Promise<{ damId: string }> };

export async function generateImageMetadata({ params }: Props) {
  return linkPreviewImageMetadata('dam', (await params).damId);
}

export default async function Image({ params }: Props) {
  return linkPreviewResponse('dam', (await params).damId);
}
