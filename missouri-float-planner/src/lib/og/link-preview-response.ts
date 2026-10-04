import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { linkPreviewAsset, type LinkPreviewKind } from './link-preview';

/** Pre-rendered artwork needs no database, provider, font or image-host fetch.
 * next.config.mjs explicitly traces these files into the image functions.
 */
export async function linkPreviewResponse(kind: LinkPreviewKind, slug?: string) {
  const asset = linkPreviewAsset(kind, slug);
  const bytes = await readFile(join(process.cwd(), 'public/share', asset.file));
  return new Response(new Uint8Array(bytes), { headers: {
    'Content-Type': asset.contentType,
    // Route URLs can select new artwork later; do not mark them immutable.
    'Cache-Control': 'public, max-age=86400, s-maxage=86400',
  } });
}
