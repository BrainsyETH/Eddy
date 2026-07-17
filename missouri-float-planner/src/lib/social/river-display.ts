// src/lib/social/river-display.ts
//
// One source of truth for river DISPLAY names on social surfaces. Previously the
// same maps were copy-pasted across the OG route (digest / highlight / eddy_says
// / forecast / warning covers) and content-formatter, which is exactly how a
// rename drifts. Two forms:
//   - LONG  ("Current River", "Huzzah Creek") — hero covers + reels
//   - SHORT ("Current", "Huzzah")             — compact grids (digest / forecast)
// (content-formatter keeps its own CASUAL form — "the Current" — for prose.)
//
// These maps mirror rivers.name and must cover EVERY postable slug: a slug that
// missed the map used to fall back to `<TitleCase> River`, which turned
// "big-river" into "Big River River" on a live reel (the name already ends in
// "River"). The fallback below no longer double-appends, but the maps remain
// the source of correct punctuation ("St. Francis") and short forms.

export const RIVER_DISPLAY_LONG: Record<string, string> = {
  'big-piney': 'Big Piney River',
  'big-river': 'Big River',
  black: 'Black River',
  bourbeuse: 'Bourbeuse River',
  'bryant-creek': 'Bryant Creek',
  buffalo: 'Buffalo National River',
  'caddo-river': 'Caddo River',
  courtois: 'Courtois Creek',
  'crooked-creek': 'Crooked Creek',
  current: 'Current River',
  'eleven-point': 'Eleven Point River',
  elk: 'Elk River',
  gasconade: 'Gasconade River',
  huzzah: 'Huzzah Creek',
  'jacks-fork': 'Jacks Fork River',
  james: 'James River',
  'kings-river': 'Kings River',
  meramec: 'Meramec River',
  mulberry: 'Mulberry River',
  niangua: 'Niangua River',
  'north-fork-white': 'North Fork River',
  'spring-river': 'Spring River',
  'spring-river-mo': 'Spring River (Missouri)',
  'st-francis': 'St. Francis River',
  'war-eagle-creek': 'War Eagle Creek',
};

export const RIVER_DISPLAY_SHORT: Record<string, string> = {
  'big-piney': 'Big Piney',
  // "Big River" keeps its suffix — "River" is part of the proper name, so the
  // short form can't drop it the way "Current River" → "Current" does.
  'big-river': 'Big River',
  black: 'Black',
  bourbeuse: 'Bourbeuse',
  'bryant-creek': 'Bryant Creek',
  buffalo: 'Buffalo',
  'caddo-river': 'Caddo',
  courtois: 'Courtois',
  'crooked-creek': 'Crooked Creek',
  current: 'Current',
  'eleven-point': 'Eleven Point',
  elk: 'Elk',
  gasconade: 'Gasconade',
  huzzah: 'Huzzah',
  'jacks-fork': 'Jacks Fork',
  james: 'James',
  'kings-river': 'Kings',
  meramec: 'Meramec',
  mulberry: 'Mulberry',
  niangua: 'Niangua',
  'north-fork-white': 'North Fork',
  'spring-river': 'Spring River',
  'spring-river-mo': 'Spring River (MO)',
  'st-francis': 'St. Francis',
  'war-eagle-creek': 'War Eagle',
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

/** Names that already end in a waterway word must not get " River" appended —
 *  that's how "big-river" became "Big River River" on a published reel. */
const WATERWAY_SUFFIX = /(river|creek|fork|branch|bayou)$/i;

/** Long display name; unmapped slugs degrade to a title-cased "<Name> River"
 *  (or just the title-cased name when it already ends in a waterway word). */
export function riverDisplayLong(slug: string): string {
  const mapped = RIVER_DISPLAY_LONG[slug];
  if (mapped) return mapped;
  const titled = titleCaseSlug(slug);
  return WATERWAY_SUFFIX.test(titled) ? titled : `${titled} River`;
}

/** Short display name; unmapped slugs degrade to a title-cased slug. */
export function riverDisplayShort(slug: string): string {
  return RIVER_DISPLAY_SHORT[slug] || titleCaseSlug(slug);
}
