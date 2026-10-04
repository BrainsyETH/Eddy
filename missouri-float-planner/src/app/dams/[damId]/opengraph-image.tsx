import { linkPreviewResponse } from '@/lib/og/link-preview-response';

export const alt = 'Archival dam scenery or an Eddy illustration, not current releases.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 86400;

export default async function Image({ params }: { params: Promise<{ damId: string }> }) {
  return linkPreviewResponse('dam', (await params).damId);
}
