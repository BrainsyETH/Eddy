// src/lib/services/npsCampground.ts
// Parsing helpers for nps_campgrounds JSON columns. `images` and `fees` are
// stored as jsonb *scalar strings* (the value is array text), which supabase
// returns as a JS string — so they must be JSON-parsed before use. The river
// services API route previously checked Array.isArray() directly and silently
// dropped every NPS campground photo; these helpers fix that everywhere.

export interface NpsImage {
  url: string;
  altText?: string;
  title?: string;
  caption?: string;
  credit?: string;
}

/** Unwrap up to two layers of JSON-string encoding, returning the parsed value
 *  (or null if it isn't valid JSON / is absent). */
export function parseJsonish<T>(value: unknown): T | null {
  let v: unknown = value;
  for (let i = 0; i < 2 && typeof v === 'string'; i++) {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  return (v ?? null) as T | null;
}

export function parseNpsImages(raw: unknown): NpsImage[] {
  const imgs = parseJsonish<NpsImage[]>(raw);
  return Array.isArray(imgs)
    ? imgs.filter((i): i is NpsImage => !!i && typeof i.url === 'string' && i.url.length > 0)
    : [];
}

// NPS image arrays frequently lead with a campsite *map*; prefer a real photo.
const isMapImage = (i: NpsImage) => /\bmap\b/i.test(`${i.altText ?? ''} ${i.title ?? ''}`);

export function npsHeroImage(raw: unknown): { url: string; alt: string } | null {
  const imgs = parseNpsImages(raw);
  if (imgs.length === 0) return null;
  const pick = imgs.find((i) => !isMapImage(i)) ?? imgs[0];
  return { url: pick.url, alt: pick.altText || pick.title || '' };
}

export function npsFeeLabel(raw: unknown): string | null {
  const fees = parseJsonish<Array<{ cost?: string | number }>>(raw);
  if (!Array.isArray(fees)) return null;
  const costs = fees
    .map((f) => (typeof f.cost === 'string' ? parseFloat(f.cost) : f.cost))
    .filter((n): n is number => typeof n === 'number' && !Number.isNaN(n) && n > 0);
  if (costs.length === 0) return null;
  const min = Math.min(...costs);
  return `from $${Number.isInteger(min) ? min : min.toFixed(2)}/night`;
}

export function npsSiteLabel(total: number | null, reservable: number | null): string | null {
  if (!total) return null;
  return reservable ? `${total} sites · ${reservable} reservable` : `${total} sites`;
}
