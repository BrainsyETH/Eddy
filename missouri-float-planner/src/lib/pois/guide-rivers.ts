// src/lib/pois/guide-rivers.ts
// Which database river each mile-by-mile guide id belongs to.
//
// ── A TABLE, BECAUSE THE RULE THAT LOOKED LIKE ONE IS NOT ─────────────────
//
// `floatmissouri_mile_markers.json` keys rivers as `current-river`,
// `jacks-fork-river`, `bryant-creek`, `north-fork`. Database slugs are
// `current`, `jacks-fork`, `bryant-creek`, `north-fork-white`. The obvious
// reading is "the guide adds a -river/-creek/-fork suffix the slugs do not
// have", and `src/lib/social/section-picker.ts` encoded exactly that:
//
//     markerId.replace(/-river$/, '').replace(/-creek$/, '').replace(/-fork$/, '')
//
// It is wrong three separate ways, all of them silent:
//
//   • `bryant-creek` → `bryant`. The database slug IS `bryant-creek`, suffix
//     and all, so the river matches nothing and its markers vanish.
//   • `north-fork` → `north`. The slug is `north-fork-white`. Same outcome, on
//     a river carrying eight of the guide's spring mentions.
//   • `big-river` → `big` AND `big-creek` → `big`. Two different rivers
//     COLLAPSE ONTO ONE KEY, so Big Creek's markers are served as Big River's.
//
// A suffix rule cannot express any of that, because the relationship it is
// modelling is not morphological — it is just two naming conventions that
// mostly rhyme. Hence a table, where an id nobody has mapped is a lookup miss a
// caller can report rather than a plausible wrong answer.
//
// Ids deliberately ABSENT have no river in the database, and there is nothing
// to map them to: the Missouri itself, Little Niangua, Beaver Creek, Big Creek,
// Indian Creek, Big Sugar, Little Sugar, Mineral Fork, Pomme de Terre, Sac and
// Osage Fork. `guideRiverSlug` returns null for each, which is the true answer.

const GUIDE_RIVER_SLUGS: Readonly<Record<string, string>> = {
  'big-piney-river': 'big-piney',
  'big-river': 'big-river',
  'black-river': 'black',
  'bourbeuse-river': 'bourbeuse',
  'bryant-creek': 'bryant-creek',
  'courtois-river': 'courtois',
  'current-river': 'current',
  'eleven-point-river': 'eleven-point',
  'elk-river': 'elk',
  'gasconade-river': 'gasconade',
  'huzzah-river': 'huzzah',
  'jacks-fork-river': 'jacks-fork',
  'james-river': 'james',
  'meramec-river': 'meramec',
  'niangua-river': 'niangua',
  'north-fork': 'north-fork-white',
  'st-francis-river': 'st-francis',
};

/** The database slug for a guide river id, or null when Eddy has no such river. */
export function guideRiverSlug(guideId: string): string | null {
  return GUIDE_RIVER_SLUGS[guideId] ?? null;
}

/** Every guide id that maps to a river, for callers that iterate. */
export function mappedGuideIds(): string[] {
  return Object.keys(GUIDE_RIVER_SLUGS);
}
