// src/lib/social/river-display.ts
//
// One source of truth for river DISPLAY names on social surfaces. Previously the
// same maps were copy-pasted across the OG route (digest / highlight / eddy_says
// / forecast / warning covers) and content-formatter, which is exactly how a
// rename drifts. Two forms:
//   - LONG  ("Current River", "Huzzah Creek") — hero covers + reels
//   - SHORT ("Current", "Huzzah")             — compact grids (digest / forecast)
// (content-formatter keeps its own CASUAL form — "the Current" — for prose.)

export const RIVER_DISPLAY_LONG: Record<string, string> = {
  meramec: 'Meramec River',
  current: 'Current River',
  'eleven-point': 'Eleven Point River',
  'jacks-fork': 'Jacks Fork River',
  niangua: 'Niangua River',
  'big-piney': 'Big Piney River',
  huzzah: 'Huzzah Creek',
  courtois: 'Courtois Creek',
  gasconade: 'Gasconade River',
  black: 'Black River',
  bourbeuse: 'Bourbeuse River',
};

export const RIVER_DISPLAY_SHORT: Record<string, string> = {
  meramec: 'Meramec',
  current: 'Current',
  'eleven-point': 'Eleven Point',
  'jacks-fork': 'Jacks Fork',
  niangua: 'Niangua',
  'big-piney': 'Big Piney',
  huzzah: 'Huzzah',
  courtois: 'Courtois',
  gasconade: 'Gasconade',
  black: 'Black',
  bourbeuse: 'Bourbeuse',
};

/** Title-case a raw slug ("big-piney" → "Big Piney") so an unmapped river
 *  degrades to a readable name instead of a bare lowercase slug ("black"). */
function titleCaseSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Long display name; unmapped slugs degrade to a title-cased "<Name> River". */
export function riverDisplayLong(slug: string): string {
  return RIVER_DISPLAY_LONG[slug] || `${titleCaseSlug(slug)} River`;
}

/** Short display name; unmapped slugs degrade to a title-cased slug. */
export function riverDisplayShort(slug: string): string {
  return RIVER_DISPLAY_SHORT[slug] || titleCaseSlug(slug);
}
