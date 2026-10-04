/** Link artwork is deliberately timeless: recipients can cache it indefinitely.
 * Keep names, route details and instructions in accessible page metadata.
 */
export const LINK_PREVIEW_SIZE = { width: 1200, height: 630 };
export type LinkPreviewKind = 'river' | 'gauge' | 'dam' | 'access' | 'plan';

export function linkPreviewFile(kind: LinkPreviewKind, slug?: string): string {
  if (kind === 'river' && slug === 'current') return 'river-current-v1.png';
  if (kind === 'dam' && slug === 'ameren-bagnell-dam') return 'dam-bagnell-v1.png';
  return `${kind}-v1.png`;
}
