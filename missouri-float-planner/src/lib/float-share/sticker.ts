// src/lib/float-share/sticker.ts
// The mood sticker a float share image draws, read from the same PNGs the app
// bundles: build-eddy-icons.py writes each mood to public/icons, and the
// icon parity test holds them to the app's pixels. The standard otter is the
// app's assets/otter/standard.png, copied to public/share and held to it by
// float-share.test.ts. next.config.ts traces both folders into the route.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FloatMood } from '@shared/float-recap';

/** Mood → sticker, matching eddy-ios/src/components/Otter.tsx FLOAT_MOODS. */
export const FLOAT_MOOD_STICKERS: Record<FloatMood, string> = {
  'made-it': 'icons/eddy-celebrate.png',
  'good-float': 'icons/eddy-thumbs-up.png',
  'quick-dip': 'icons/eddy-laugh.png',
  'lazy-river': 'icons/eddy-campfire-chill.png',
  'big-water': 'icons/eddy-high-water-alert.png',
  rain: 'icons/eddy-safety-first.png',
  chilly: 'icons/eddy-campfire-chill.png',
  scrape: 'icons/eddy-thinking.png',
  'speed-run': 'icons/eddy-paddle-ready.png',
};
export const STANDARD_OTTER = 'share/otter-standard.png';

const cache = new Map<string, string>();

/** A data URL for Satori; null mood is the standard otter. */
export async function stickerDataUrl(mood: FloatMood | null): Promise<string> {
  const file = mood ? FLOAT_MOOD_STICKERS[mood] : STANDARD_OTTER;
  let url = cache.get(file);
  if (!url) {
    const bytes = await readFile(join(process.cwd(), 'public', file));
    url = `data:image/png;base64,${bytes.toString('base64')}`;
    cache.set(file, url);
  }
  return url;
}
