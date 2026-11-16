// src/lib/social/cover-plan.ts
//
// The editorial rules for social covers (the Reel thumbnail Instagram shows in
// the profile grid). Pure: no I/O, no React — the OG route renders what this
// decides, post-context pins the choices into the cover URL, and the tests
// check the rules directly.
//
// A cover's job is to earn the tap: one grounded headline, one strong visual,
// river + location, small Eddy branding. Distance, conditions, access details
// and the plan link belong in the Reel and the caption.
//
// Three treatments (docs/social-design-system.md, "Covers"):
//   photo         a public-domain photo of the actual river — Float Picks, forecast
//   illustration  Eddy's otter on a brand ground — guides, reads, digests, and
//                 any photo cover whose river has no catalogued photo
//   conditions    the dark severity surface with one big observation — alerts
//
// Headlines only say what Eddy's data supports: real access names, a spring the
// route really passes, the guide's own section name, or the observed condition.
// Never "perfect", "best", or an inferred time of day.

import catalog from '../../data/social-cover-photos.json';
import { riverDisplayCasual } from './river-display';

// ─── Photos ─────────────────────────────────────────────────────────────────

export type TextZone = 'upper' | 'lower';

/** A catalogued cover photo. Being in the catalog IS the suitability flag:
 *  public domain, the named river, scenic water (no ramps, signs or lots), and
 *  a crop that holds the headline in `textZone`. */
export interface CoverPhoto {
  id: string;
  riverSlug: string;
  /** What the photo shows ("Buffalo River at Steel Creek"). */
  title: string;
  /** Bounded-width JPEG on upload.wikimedia.org. */
  url: string;
  /** The Commons file page — license and provenance of record. */
  sourceUrl: string;
  author: string;
  license: string;
  /** Where the photo leaves quiet room for the headline. */
  textZone: TextZone;
}

export const COVER_PHOTOS = catalog as CoverPhoto[];

export function coverPhotosFor(riverSlug: string | null | undefined): CoverPhoto[] {
  return riverSlug ? COVER_PHOTOS.filter((photo) => photo.riverSlug === riverSlug) : [];
}

/** Satori decodes PNG and JPEG only; anything else (WebP, HTML error pages)
 *  must fall back to the illustration rather than fail the cover. */
export function isRenderableImageType(contentType: string | null | undefined): boolean {
  return /^image\/(png|jpe?g)\b/i.test(contentType ?? '');
}

// ─── Art (what fills the cover), pinned in the URL as `art=` ─────────────────

export const ILLUSTRATION_VARIANTS = 3;

export type CoverArt =
  | { kind: 'photo'; photo: CoverPhoto }
  | { kind: 'eddy'; variant: number };

export function artParam(art: CoverArt): string {
  return art.kind === 'photo' ? `photo.${art.photo.id}` : `eddy.${art.variant}`;
}

/** Resolve a pinned `art=` value. A photo id must still be in the catalog AND
 *  belong to the cover's river; anything else is null (caller re-derives). */
export function parseArtParam(raw: string | null | undefined, riverSlug?: string | null): CoverArt | null {
  if (!raw) return null;
  const eddy = /^eddy\.(\d+)$/.exec(raw);
  if (eddy) return { kind: 'eddy', variant: Number(eddy[1]) % ILLUSTRATION_VARIANTS };
  const photo = /^photo\.([a-z0-9-]+)$/.exec(raw);
  if (!photo) return null;
  const found = COVER_PHOTOS.find((p) => p.id === photo[1]);
  if (!found || (riverSlug && found.riverSlug !== riverSlug)) return null;
  return { kind: 'photo', photo: found };
}

/**
 * Choose a photo cover's art. A catalogued photo not used in the recent grid
 * wins; when every photo for the river was used recently, the one used longest
 * ago is reused (a good photo again beats a weak one). A river with no
 * catalogued photo gets the illustration. Deterministic for a given seed.
 *
 * `recentArt` is newest first (readCoverHistory).
 */
export function chooseCoverArt(
  riverSlug: string | null | undefined,
  recentArt: string[],
  seed: number,
  photos: CoverPhoto[] = coverPhotosFor(riverSlug),
): CoverArt {
  if (photos.length === 0) return illustrationArt(seed, recentArt);
  const photo = leastRecent(photos, (p) => `photo.${p.id}`, recentArt, seed);
  return { kind: 'photo', photo };
}

/** An illustration composition: one not in the recent grid, else the one used
 *  longest ago — so the fallback never stacks the same scene side by side. */
export function illustrationArt(seed: number, recentArt: string[] = []): CoverArt {
  const variants = Array.from({ length: ILLUSTRATION_VARIANTS }, (_, i) => i);
  return { kind: 'eddy', variant: leastRecent(variants, (v) => `eddy.${v}`, recentArt, seed) };
}

/** Unused-in-the-recent-grid first (seeded pick among them); otherwise the
 *  option whose latest use is oldest. `recentArt` is newest first. */
function leastRecent<T>(options: T[], key: (option: T) => string, recentArt: string[], seed: number): T {
  const unused = options.filter((option) => !recentArt.includes(key(option)));
  if (unused.length > 0) return unused[positive(seed) % unused.length];
  const lastUse = (option: T) => recentArt.indexOf(key(option));
  return options.reduce((a, b) => (lastUse(b) > lastUse(a) ? b : a));
}

function positive(n: number): number {
  return Number.isFinite(n) ? Math.abs(Math.trunc(n)) : 0;
}

// ─── History (best effort) ──────────────────────────────────────────────────

export interface CoverHistoryRow {
  post_type: string | null;
  river_slug: string | null;
  image_url: string | null;
}

export interface CoverHistory {
  /** River of the most recent Float Pick (section_guide); other post types —
   *  a warning about the same river — do not count. */
  previousFloatPickRiver: string | null;
  /** `art=` values of recent covers, newest first. Old URLs without one are
   *  simply absent. */
  recentArt: string[];
}

export const EMPTY_HISTORY: CoverHistory = { previousFloatPickRiver: null, recentArt: [] };

/** Read the recent grid from social_posts rows (newest first). Never throws:
 *  a malformed URL or a legacy row only means less history, never a blocked
 *  post. */
export function readCoverHistory(rows: CoverHistoryRow[] | null | undefined): CoverHistory {
  if (!Array.isArray(rows)) return EMPTY_HISTORY;
  const floatPick = rows.find((row) => row?.post_type === 'section_guide' && row.river_slug);
  const recentArt: string[] = [];
  for (const row of rows) {
    const art = coverArtFromUrl(row?.image_url);
    if (art) recentArt.push(art);
  }
  return { previousFloatPickRiver: floatPick?.river_slug ?? null, recentArt };
}

function coverArtFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const art = new URL(url).searchParams.get('art');
    return art && /^(photo\.[a-z0-9-]+|eddy\.\d+)$/.test(art) ? art : null;
  } catch {
    return null;
  }
}

// ─── Type geometry shared with the renderer ─────────────────────────────────

/** Fixed sizes: every cover's headline is the same size, so the grid reads as
 *  one publication. Square (Facebook) covers scale by 0.84. */
export const COVER_TYPE = {
  headline: 104,
  headlineLineHeight: 1.0,
  subline: 40,
  eyebrow: 28,
  observation: 230,
  maxHeadlineLines: 3,
} as const;

/** Headline text width on the 1080-wide canvas (inside the 72px inset). */
export const HEADLINE_WIDTH = 1080 - 2 * 72;

/** Profile-grid tile width in points on a ~390pt-wide phone (3 columns). The
 *  3:4 tile shows the full 1080 width, so canvas px scale by this / 1080. */
export const GRID_TILE_PT = 128;

/** Approximate advance widths for Fredoka SemiBold, as a fraction of the font
 *  size. Deliberately a little generous so "fits" errs toward fewer lines. */
function charWidth(ch: string): number {
  if (ch === ' ') return 0.24;
  if (/[il.,'’:;|!]/.test(ch)) return 0.27;
  if (/[fjrt()\-–—/]/.test(ch)) return 0.38;
  if (/[mwMW]/.test(ch)) return 0.82;
  if (/[A-Z0-9&]/.test(ch)) return 0.64;
  return 0.54;
}

export function textWidth(text: string, px: number): number {
  let w = 0;
  for (const ch of text) w += charWidth(ch) * px;
  return w;
}

/** Greedy word wrap at `px` within `width`. A single word wider than the line
 *  counts as its own (overflowing) line. */
export function wrapLines(text: string, px: number, width: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, px) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function headlineFits(text: string): boolean {
  const lines = wrapLines(text, COVER_TYPE.headline, HEADLINE_WIDTH);
  return (
    lines.length > 0 &&
    lines.length <= COVER_TYPE.maxHeadlineLines &&
    lines.every((line) => textWidth(line, COVER_TYPE.headline) <= HEADLINE_WIDTH)
  );
}

// ─── Headlines ──────────────────────────────────────────────────────────────

export type HeadlineKind = 'endpoints' | 'spring' | 'tagline' | 'river';

export interface FloatPickFacts {
  riverSlug: string;
  putInName: string;
  takeOutName: string;
  putInMile: number;
  takeOutMile: number;
  springs?: Array<{ name: string; mile: number }>;
  /** The river guide's own section name (evergreen picks only). */
  tagline?: string | null;
}

/** Guidebook spring miles disagree with access-point miles by up to ~2 mi in
 *  places (Powder Mill: 58.7 vs 60.73 — see route-scene.ts), so a spring only
 *  headlines the cover when it sits this far inside BOTH endpoints. */
export const SPRING_HEADLINE_MARGIN_MI = 2;

/** Access names for a headline: drop parentheticals and a trailing facility
 *  word ("Hwy 97 Access" → "Hwy 97", "Gooseneck Campground" → "Gooseneck"),
 *  which still name the same place. */
export function headlinePlaceName(name: string): string {
  return (name || '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+(access(\s+point)?|campground|recreation\s+area)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function capitalizeFirst(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** "Float the Current" — always true, always fits. */
export function riverHeadline(riverSlug: string): string {
  return `Float ${riverDisplayCasual(riverSlug)}`;
}

/**
 * The Float Pick headline: the first of four grounded patterns that fits the
 * fixed headline size —
 *   1. "Big Tree to Gooseneck"        the real endpoints
 *   2. "Past Welch Spring"            a spring well inside the route
 *   3. the guide's section name       evergreen picks
 *   4. "Float the Current"            always
 */
export function floatPickHeadline(facts: FloatPickFacts): { text: string; kind: HeadlineKind } {
  const from = headlinePlaceName(facts.putInName);
  const to = headlinePlaceName(facts.takeOutName);
  if (from && to && from.toLowerCase() !== to.toLowerCase()) {
    const text = `${from} to ${to}`;
    if (headlineFits(text)) return { text, kind: 'endpoints' };
  }

  const lo = Math.min(facts.putInMile, facts.takeOutMile) + SPRING_HEADLINE_MARGIN_MI;
  const hi = Math.max(facts.putInMile, facts.takeOutMile) - SPRING_HEADLINE_MARGIN_MI;
  for (const spring of facts.springs ?? []) {
    const name = (spring.name || '').trim();
    if (!name || !(spring.mile >= lo && spring.mile <= hi)) continue;
    const text = `Past ${name}`;
    if (headlineFits(text)) return { text, kind: 'spring' };
  }

  const tagline = (facts.tagline || '').trim();
  if (tagline && wordCount(tagline) >= 2 && headlineFits(tagline)) {
    return { text: capitalizeFirst(tagline), kind: 'tagline' };
  }

  return { text: riverHeadline(facts.riverSlug), kind: 'river' };
}

/** The endpoints as a subline ("Spring Creek → Buffalo Point"), only when
 *  the headline isn't already the endpoints and it stays short enough to read. */
export function endpointsSubline(facts: FloatPickFacts, headlineKind: HeadlineKind): string | undefined {
  if (headlineKind === 'endpoints') return undefined;
  const text = `${headlinePlaceName(facts.putInName)} → ${headlinePlaceName(facts.takeOutName)}`;
  return text.length <= 36 ? text : undefined;
}

/**
 * The conditions headline, from the observed transition the alert carries.
 *   to dangerous            "The Caddo is at flood level"
 *   to high, from dangerous "The Caddo is coming down"
 *   to high                 "The Caddo is running high"
 *   recovery                "The Caddo is floatable again" / "…is dropping back"
 */
export function conditionHeadline(input: {
  riverSlug: string;
  to: string;
  from?: string | null;
  recovery?: boolean;
}): string {
  const name = capitalizeFirst(riverDisplayCasual(input.riverSlug));
  if (input.recovery) {
    return input.to === 'flowing' || input.to === 'good' ? `${name} is floatable again` : `${name} is dropping back`;
  }
  if (input.to === 'dangerous') return `${name} is at flood level`;
  if (input.to === 'high') return input.from === 'dangerous' ? `${name} is coming down` : `${name} is running high`;
  return `Check ${riverDisplayCasual(input.riverSlug)} before you go`;
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Tip/announcement headline: the snippet's first sentence when it is short
 *  enough to headline; otherwise a plain label for what it is. */
export function noteHeadline(text: string, contentType: string | null | undefined): string {
  const first = (text || '').trim().split(/(?<=[.!?])\s+/)[0]?.replace(/[.!]+$/, '') ?? '';
  if (first && wordCount(first) >= 2 && wordCount(first) <= 7 && headlineFits(first)) return first;
  if (contentType === 'tip') return 'A float tip from Eddy';
  if (contentType === 'seasonal') return 'A seasonal note from Eddy';
  if (contentType === 'promo') return 'News from Eddy';
  return 'A note from Eddy';
}

// ─── Readability + provenance notes (admin preview, response header) ────────

/** Plain-language notes a reviewer sees beside the grid preview. Advisory:
 *  nothing here blocks a post. */
export function coverNotes(input: {
  headline: string;
  art?: CoverArt | null;
  fallback?: 'no-catalogued-photo' | 'photo-unavailable' | null;
}): string[] {
  const notes: string[] = [];
  const words = wordCount(input.headline);
  if (words < 3 || words > 7) notes.push(`Headline is ${words} word${words === 1 ? '' : 's'} (guideline 3–7)`);
  const lines = wrapLines(input.headline, COVER_TYPE.headline, HEADLINE_WIDTH).length;
  if (lines > COVER_TYPE.maxHeadlineLines) notes.push(`Headline wraps to ${lines} lines`);
  const gridPt = Math.round(COVER_TYPE.headline * (GRID_TILE_PT / 1080) * 10) / 10;
  notes.push(`Headline renders ~${gridPt}pt in the profile grid`);
  if (input.fallback === 'no-catalogued-photo') notes.push('Illustration: no catalogued public-domain photo for this river');
  if (input.fallback === 'photo-unavailable') notes.push('Illustration: the catalogued photo could not be loaded');
  if (input.art?.kind === 'photo') notes.push(`Photo: ${input.art.photo.title} — ${input.art.photo.author} (${input.art.photo.license})`);
  return notes;
}

/** The caption credit line for a photo cover. Public domain needs no credit,
 *  but Eddy names the photographer and source anyway. */
export function photoCreditLine(art: CoverArt | null | undefined): string | null {
  if (!art || art.kind !== 'photo') return null;
  return `📷 Cover photo: ${art.photo.author} (public domain, via Wikimedia Commons)`;
}

/** Append the photo credit to a caption, once. */
export function withPhotoCredit(caption: string, art: CoverArt | null | undefined): string {
  const line = photoCreditLine(art);
  if (!line || caption.includes(line)) return caption;
  return `${caption.trimEnd()}\n\n${line}`;
}
