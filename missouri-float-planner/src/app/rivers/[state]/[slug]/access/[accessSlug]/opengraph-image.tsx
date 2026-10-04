import { linkPreviewResponse } from '@/lib/og/link-preview-response';

export const alt = 'Eddy river access illustration. Open the link for access details.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 86400;

export default async function Image() {
  return linkPreviewResponse('access');
}
