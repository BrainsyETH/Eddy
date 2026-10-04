// Compatibility endpoint for old planner links. Never bake live conditions
// into an image that can remain in a chat indefinitely.
import { linkPreviewResponse } from '@/lib/og/link-preview-response';

export const revalidate = 86400;

export async function GET() {
  return linkPreviewResponse('plan');
}
