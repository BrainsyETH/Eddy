import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { linkPreviewFile, type LinkPreviewKind } from './link-preview';

/** Pre-rendered artwork needs no database, provider, font or image-host fetch.
 * next.config.mjs explicitly traces these files into the image functions.
 */
export async function linkPreviewResponse(kind: LinkPreviewKind, slug?: string) {
  const bytes = await readFile(join(process.cwd(), 'public/share', linkPreviewFile(kind, slug)));
  return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'image/png' } });
}
