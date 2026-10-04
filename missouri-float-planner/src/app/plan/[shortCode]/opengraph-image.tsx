import { linkPreviewResponse } from '@/lib/og/link-preview-response';

export const alt = 'Eddy planning a float with a schematic route, not a navigational map.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 86400;

export default async function Image() {
  return linkPreviewResponse('plan');
}
