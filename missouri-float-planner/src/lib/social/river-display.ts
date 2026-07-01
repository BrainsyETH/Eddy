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
};

/** Long display name, falling back to the raw slug. */
export function riverDisplayLong(slug: string): string {
  return RIVER_DISPLAY_LONG[slug] || slug;
}

/** Short display name, falling back to the raw slug. */
export function riverDisplayShort(slug: string): string {
  return RIVER_DISPLAY_SHORT[slug] || slug;
}
