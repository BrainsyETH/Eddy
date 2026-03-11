// src/data/section-highlights.ts
// Per-section highlights — what you'll see between access points
// Keys are "{putInName}|{takeOutName}" for matching

export interface SectionHighlight {
  riverSlug: string;
  putInName: string;
  takeOutName: string;
  highlights: string[];
  description: string;
  crowdLevel: 'low' | 'moderate' | 'high';
  sceneryRating: 1 | 2 | 3 | 4 | 5;
  tip?: string;
}

export const SECTION_HIGHLIGHTS: SectionHighlight[] = [
  // === CURRENT RIVER ===
  {
    riverSlug: 'current',
    putInName: 'Montauk State Park',
    takeOutName: 'Cedar Grove',
    highlights: ['Montauk Spring', 'Upper Current headwaters', 'Trout water'],
    description: 'The very headwaters of the Current — cold, clear, and scenic. Popular trout fishing section.',
    crowdLevel: 'moderate',
    sceneryRating: 4,
    tip: 'The upper Current can be shallow in summer; best with higher water levels.',
  },
  {
    riverSlug: 'current',
    putInName: 'Cedar Grove',
    takeOutName: 'Akers Ferry',
    highlights: ['Welch Spring', 'Hospital ruins', 'Upper Current bluffs'],
    description: 'Welch Spring and the haunting hospital ruins make this one of the most interesting stretches.',
    crowdLevel: 'high',
    sceneryRating: 5,
    tip: 'Stop at Welch Spring to explore the ruins — it\'s a short walk from the river.',
  },
  {
    riverSlug: 'current',
    putInName: 'Akers Ferry',
    takeOutName: 'Pulltite Spring',
    highlights: ['Cave Spring', 'Pulltite Spring', 'Towering bluffs'],
    description: 'Missouri\'s most popular float — Cave Spring alone makes it worth the trip.',
    crowdLevel: 'high',
    sceneryRating: 5,
    tip: 'Bring a flashlight for Cave Spring. Start early on weekdays to beat crowds.',
  },
  {
    riverSlug: 'current',
    putInName: 'Pulltite Spring',
    takeOutName: 'Round Spring',
    highlights: ['Round Spring', 'Deep forest', 'Gravel bar camping'],
    description: 'Longer stretch through deep forest with fewer crowds. Great for overnight trips.',
    crowdLevel: 'moderate',
    sceneryRating: 4,
  },
  {
    riverSlug: 'current',
    putInName: 'Round Spring',
    takeOutName: 'Two Rivers',
    highlights: ['Big Spring', 'Deep pools', 'Wider river'],
    description: 'The lower Current is wider, deeper, and more forgiving. Handles low water well.',
    crowdLevel: 'moderate',
    sceneryRating: 4,
    tip: 'Big Spring is one of the largest springs in the US — worth a stop.',
  },

  // === JACKS FORK ===
  {
    riverSlug: 'jacks-fork',
    putInName: 'Alley Spring',
    takeOutName: 'Eminence',
    highlights: ['Alley Spring', 'Alley Mill', 'Narrow intimate river'],
    description: 'The iconic Alley Mill start, flowing through narrow Ozark forest to Eminence.',
    crowdLevel: 'high',
    sceneryRating: 5,
    tip: 'Visit the Alley Mill before launching — most photographed spot in the Ozarks.',
  },

  // === ELEVEN POINT ===
  {
    riverSlug: 'eleven-point',
    putInName: 'Greer Spring',
    takeOutName: 'Turners Mill',
    highlights: ['Greer Spring', 'Wild & Scenic designation', 'Old-growth forest'],
    description: 'Fed by the 2nd largest spring in Missouri. Remote, quiet, and stunning.',
    crowdLevel: 'low',
    sceneryRating: 5,
  },
  {
    riverSlug: 'eleven-point',
    putInName: 'Turners Mill',
    takeOutName: 'Riverton',
    highlights: ['Limestone bluffs', 'Forested corridors', 'Wildlife viewing'],
    description: 'The most floated section of the Eleven Point. Still rarely crowded.',
    crowdLevel: 'low',
    sceneryRating: 4,
    tip: 'Hufstedlers Canoe Rental is the main outfitter for this stretch.',
  },

  // === MERAMEC ===
  {
    riverSlug: 'meramec',
    putInName: 'Meramec State Park',
    takeOutName: 'Sullivan',
    highlights: ['Meramec State Park', 'Fisher Cave', 'Wide gentle river'],
    description: 'The most accessible Ozark float for St. Louis. Wide, calm, beginner-friendly.',
    crowdLevel: 'high',
    sceneryRating: 3,
    tip: 'Combine with a state park visit — camping, caves, trails.',
  },
];

/**
 * Find highlights for a specific section (fuzzy match by names containing keywords)
 */
export function findSectionHighlight(riverSlug: string, putInName: string, takeOutName: string): SectionHighlight | undefined {
  return SECTION_HIGHLIGHTS.find(
    s => s.riverSlug === riverSlug &&
    putInName.toLowerCase().includes(s.putInName.toLowerCase().split(' ')[0]) &&
    takeOutName.toLowerCase().includes(s.takeOutName.toLowerCase().split(' ')[0])
  );
}

/**
 * Get all highlights for a river
 */
export function getRiverHighlights(riverSlug: string): SectionHighlight[] {
  return SECTION_HIGHLIGHTS.filter(s => s.riverSlug === riverSlug);
}
