// src/lib/og/river-card.tsx
// A river page's link image: the committed river artwork with the river's own
// name, and its state, drawn on. The name is the one thing printed; readings
// and conditions stay out so a cached card cannot go stale
// (docs/SHARING_PREVIEWS.md).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { createPublicCatalogClient } from '@/lib/supabase/public-read';
import { stateName } from '@/lib/navigation/states';
import { loadFredokaFont } from './fonts';
import { LINK_PREVIEW_SIZE, RIVER_NAME_LAYOUT, linkPreviewAsset } from './link-preview';

export interface RiverCard {
  name: string;
  /** Display name of the river's state; null when the name already says it. */
  state: string | null;
}

const MAX_NAME_LENGTH = 44;
const NAME_SIZE = { max: 116, oneLineMin: 66, wrapped: 84 };
/** Measured: the catalog's widest name per character ("Lake Taneycomo") is
 * 0.53 em in Fredoka SemiBold. A wider name than this allows wraps, and fits. */
const EM_PER_CHARACTER = 0.54;

const CREAM = '#f7f3e9';
const TEAL = '#123f46';

/**
 * The river's card, or null when no river has this slug.
 *
 * Read through the cacheable catalog client and throw on a failed lookup, for
 * the reasons in guide-card.ts: the image route is ISR, where Next refuses a
 * no-store fetch and supabase-js reports the refusal as `error`.
 */
export async function riverCard(slug: string): Promise<RiverCard | null> {
  const { data: river, error } = await createPublicCatalogClient()
    .from('rivers')
    .select('name, state')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error(`River card lookup failed for "${slug}": ${error.message}`);
  if (!river?.name) return null;

  const name = river.name.length > MAX_NAME_LENGTH
    ? `${river.name.slice(0, MAX_NAME_LENGTH - 1).trim()}…`
    : river.name;
  const state = river.state ? stateName(river.state) : null;
  // "Spring River (Missouri)" needs no "MISSOURI" above it.
  return { name, state: state && !name.includes(state) ? state : null };
}

/** The largest size that keeps the name on one line, else a size that wraps well. */
export function riverNameSize(name: string, width: number): number {
  const oneLine = Math.floor(width / (EM_PER_CHARACTER * name.length));
  return oneLine >= NAME_SIZE.oneLineMin ? Math.min(NAME_SIZE.max, oneLine) : NAME_SIZE.wrapped;
}

/** The name on a transparent canvas, positioned above the artwork's wordmark. */
async function nameLayer(card: RiverCard, photo: boolean): Promise<Buffer> {
  const { inset, wordmark, gap } = RIVER_NAME_LAYOUT;
  const width = photo ? RIVER_NAME_LAYOUT.width.photo : RIVER_NAME_LAYOUT.width.illustration;
  const response = new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%', position: 'relative' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            position: 'absolute',
            left: inset,
            top: inset,
            bottom: inset + wordmark + gap,
            width,
          }}
        >
          {card.state && (
            <span
              style={{
                fontFamily: 'Fredoka',
                fontWeight: 600,
                fontSize: 26,
                letterSpacing: 5,
                textTransform: 'uppercase',
                color: photo ? '#bfe3df' : '#337e84',
              }}
            >
              {card.state}
            </span>
          )}
          <span
            style={{
              fontFamily: 'Fredoka',
              fontWeight: 600,
              fontSize: riverNameSize(card.name, width),
              lineHeight: 1.02,
              letterSpacing: -2,
              marginTop: 8,
              color: photo ? CREAM : TEAL,
            }}
          >
            {card.name}
          </span>
        </div>
      </div>
    ),
    { ...LINK_PREVIEW_SIZE, fonts: loadFredokaFont() },
  );
  return Buffer.from(await response.arrayBuffer());
}

/**
 * The finished image. The artwork is a committed file and the font is
 * embedded, so the only request-time dependency is the name itself.
 */
export async function riverCardResponse(slug: string, card: RiverCard): Promise<Response> {
  const asset = linkPreviewAsset('river', slug);
  const photo = asset.contentType === 'image/jpeg';
  const [artwork, name] = await Promise.all([
    readFile(join(process.cwd(), 'public/share', asset.nameFile!)),
    nameLayer(card, photo),
  ]);
  const composed = sharp(artwork).composite([{ input: name }]);
  const bytes = await (photo
    ? composed.jpeg({ quality: 85, mozjpeg: true })
    : composed.png({ palette: true, quality: 90 })).toBuffer();
  return new Response(new Uint8Array(bytes), { headers: {
    'Content-Type': asset.contentType,
    // Route URLs can select new artwork later; do not mark them immutable.
    'Cache-Control': 'public, max-age=86400, s-maxage=86400',
  } });
}
