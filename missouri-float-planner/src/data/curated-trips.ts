// src/data/curated-trips.ts
// Curated float trip recommendations — inspired by missouriscenicrivers.com's "Best Float Trips"
// These are opinionated picks with insider tips, used on the homepage and /guides/best-floats

export interface CuratedTrip {
  id: string;
  title: string;
  riverSlug: string;
  riverName: string;
  putInName: string;
  takeOutName: string;
  distanceMiles: number;
  estimatedHours: string; // e.g. "5-7" for a range
  difficulty: 'easy' | 'moderate' | 'intermediate';
  category: TripCategory;
  tagline: string; // One-liner for cards (e.g. "Missouri's most popular float")
  description: string; // Full paragraph for the guide page
  highlights: string[]; // What you'll see (springs, caves, bluffs)
  tips: string[]; // Insider advice
  bestFor: string[]; // e.g. ["families", "beginners", "photography"]
  crowdLevel: 'low' | 'moderate' | 'high';
  bestMonths: string; // e.g. "May - September"
  featured: boolean; // Show on homepage
}

export type TripCategory =
  | 'best-overall'
  | 'best-beginner'
  | 'best-scenic'
  | 'best-multi-day'
  | 'avoid-crowds'
  | 'best-day-trip'
  | 'hidden-gem';

export const TRIP_CATEGORIES: Record<TripCategory, { label: string; description: string }> = {
  'best-overall': { label: 'Best Overall', description: 'Top-rated floats that deliver the full Ozark experience' },
  'best-beginner': { label: 'Best for Beginners', description: 'Easy, forgiving sections perfect for first-timers' },
  'best-scenic': { label: 'Most Scenic', description: 'The most beautiful stretches with springs, caves, and bluffs' },
  'best-multi-day': { label: 'Best Multi-Day', description: 'Overnight trips with backcountry camping' },
  'avoid-crowds': { label: 'Fewer Crowds', description: 'Lesser-known sections for a quieter float' },
  'best-day-trip': { label: 'Best Day Trip', description: 'Perfect length for a single day on the water' },
  'hidden-gem': { label: 'Hidden Gems', description: 'Under-the-radar rivers and sections worth discovering' },
};

export const CURATED_TRIPS: CuratedTrip[] = [
  // === CURRENT RIVER ===
  {
    id: 'akers-to-pulltite',
    title: 'Akers Ferry to Pulltite Spring',
    riverSlug: 'current',
    riverName: 'Current River',
    putInName: 'Akers Ferry',
    takeOutName: 'Pulltite Spring',
    distanceMiles: 10,
    estimatedHours: '5-7',
    difficulty: 'easy',
    category: 'best-overall',
    tagline: 'Missouri\'s most popular float — and for good reason',
    description:
      'The classic Ozark float. This 10-mile stretch on the Current River is the most popular single-day float in the Missouri Scenic Rivers region. You\'ll pass Cave Spring (bring a flashlight!), towering bluffs, and crystal-clear spring-fed water. Allow 5-7 hours depending on how often you stop to explore. Best started early on weekdays to beat the crowds.',
    highlights: ['Cave Spring', 'Pulltite Spring', 'Limestone bluffs', 'Spring-fed swimming holes'],
    tips: [
      'Start early (before 9 AM) to get ahead of the crowds',
      'Bring a flashlight to explore Cave Spring',
      'Rent from the outfitter at your take-out so your car is waiting',
      'Avoid Saturdays between Memorial Day and Labor Day if you don\'t like crowds',
    ],
    bestFor: ['families', 'first-timers', 'photography'],
    crowdLevel: 'high',
    bestMonths: 'May - September',
    featured: true,
  },
  {
    id: 'cedar-grove-to-akers',
    title: 'Cedar Grove to Akers Ferry',
    riverSlug: 'current',
    riverName: 'Current River',
    putInName: 'Cedar Grove',
    takeOutName: 'Akers Ferry',
    distanceMiles: 8,
    estimatedHours: '4-6',
    difficulty: 'easy',
    category: 'best-scenic',
    tagline: 'Welch Spring and the old hospital ruins await',
    description:
      'This upper Current River stretch features Welch Spring — one of the largest springs in Missouri — and the haunting ruins of a historic hospital built into the bluff. At 8 miles it\'s a manageable day float with plenty of scenic stops. The water is clear and cold from headwater springs.',
    highlights: ['Welch Spring', 'Hospital ruins', 'Welch Spring Branch', 'Upper Current bluffs'],
    tips: [
      'Stop at Welch Spring to explore the hospital ruins — it\'s a short walk from the river',
      'The upper Current can be shallow in late summer; check gauge levels',
      'Jadwin Canoe Rental is the best outfitter for this stretch',
    ],
    bestFor: ['history buffs', 'photography', 'nature lovers'],
    crowdLevel: 'high',
    bestMonths: 'April - September',
    featured: false,
  },
  {
    id: 'pulltite-to-round-spring',
    title: 'Pulltite Spring to Round Spring',
    riverSlug: 'current',
    riverName: 'Current River',
    putInName: 'Pulltite Spring',
    takeOutName: 'Round Spring',
    distanceMiles: 14,
    estimatedHours: '6-9',
    difficulty: 'moderate',
    category: 'best-multi-day',
    tagline: 'A longer float through the heart of the Ozarks',
    description:
      'This stretch is ideal for those wanting a longer day or an easy overnight trip. You\'ll float through deep Ozark forest with fewer crowds than the sections above. Round Spring campground at the take-out has facilities and makes a great base camp.',
    highlights: ['Round Spring', 'Deep forest sections', 'Gravel bar camping', 'Quiet stretches'],
    tips: [
      'This is a long day float — start early or plan an overnight on a gravel bar',
      'Round Spring has a designated campground with facilities',
      'Carrs Canoe Rental is the go-to outfitter for this section',
    ],
    bestFor: ['experienced floaters', 'campers', 'solitude seekers'],
    crowdLevel: 'moderate',
    bestMonths: 'May - September',
    featured: false,
  },

  // === ELEVEN POINT RIVER ===
  {
    id: 'greer-to-riverton',
    title: 'Greer Spring to Riverton',
    riverSlug: 'eleven-point',
    riverName: 'Eleven Point River',
    putInName: 'Greer Spring',
    takeOutName: 'Riverton',
    distanceMiles: 20,
    estimatedHours: '8-12',
    difficulty: 'moderate',
    category: 'avoid-crowds',
    tagline: 'The quiet alternative — fewer people, stunning scenery',
    description:
      'The Eleven Point River is a federally designated Wild & Scenic River and significantly less crowded than the Current. The 20-mile Greer Spring to Riverton stretch is the premier float, but it\'s a long day. Consider the shorter Turners Mill to Riverton (15 mi) or Whitten to Riverton (8 mi) alternatives. Greer Spring is the second-largest spring in Missouri.',
    highlights: ['Greer Spring', 'Wild & Scenic designation', 'Old-growth forest', 'Limestone bluffs'],
    tips: [
      'For a full day, Turners Mill to Riverton (15 miles) is the sweet spot',
      'For a half day, Whitten to Riverton is 8 miles and very manageable',
      'Hufstedlers Canoe Rental is the main outfitter on the Eleven Point',
      'This river rarely gets crowded even on weekends',
    ],
    bestFor: ['solitude seekers', 'kayakers', 'nature lovers'],
    crowdLevel: 'low',
    bestMonths: 'April - October',
    featured: true,
  },

  // === JACKS FORK ===
  {
    id: 'alley-spring-to-eminence',
    title: 'Alley Spring to Eminence',
    riverSlug: 'jacks-fork',
    riverName: 'Jacks Fork',
    putInName: 'Alley Spring',
    takeOutName: 'Eminence',
    distanceMiles: 6,
    estimatedHours: '3-4',
    difficulty: 'easy',
    category: 'best-day-trip',
    tagline: 'A short, sweet float past the iconic Alley Mill',
    description:
      'This 6-mile stretch is one of the most popular short floats in the Ozarks. Start at the famous Alley Spring (home to the iconic red Alley Mill) and float to Eminence. It\'s an easy 3-4 hour trip that\'s perfect for beginners, families, and tubers. The Jacks Fork is narrower and more intimate than the Current River.',
    highlights: ['Alley Spring', 'Alley Mill (historic red mill)', 'Narrow, intimate river', 'Eminence town access'],
    tips: [
      'Visit the Alley Mill before you launch — it\'s one of the most photographed spots in Missouri',
      'This is the busiest section of the Jacks Fork; go on a weekday for fewer crowds',
      'The Jacks Fork needs more water than the Current — check levels',
    ],
    bestFor: ['families', 'beginners', 'tubers', 'short trips'],
    crowdLevel: 'high',
    bestMonths: 'May - August',
    featured: true,
  },

  // === MERAMEC RIVER ===
  {
    id: 'meramec-state-park-float',
    title: 'Meramec State Park Area',
    riverSlug: 'meramec',
    riverName: 'Meramec River',
    putInName: 'Meramec State Park',
    takeOutName: 'Below Meramec State Park',
    distanceMiles: 7,
    estimatedHours: '3-5',
    difficulty: 'easy',
    category: 'best-beginner',
    tagline: 'The closest Ozark float to St. Louis',
    description:
      'The Meramec River through and below Meramec State Park is the most accessible Ozark float for the St. Louis metro area. The lower Meramec is wider and calmer, making it ideal for beginners and tubers. Meramec State Park itself offers camping, caves, and hiking to extend your trip. The upper Meramec above the park is more challenging with some Class I-II rapids.',
    highlights: ['Meramec State Park', 'Fisher Cave', 'Wide, gentle sections', 'Easy access from St. Louis'],
    tips: [
      'This is the go-to river for St. Louis area floaters',
      'The lower Meramec below the park is calmer and better for beginners',
      'The upper Meramec has some rapids — fun but bring some experience',
      'Combine your float with a state park visit (camping, caves, trails)',
    ],
    bestFor: ['beginners', 'St. Louis residents', 'families', 'tubers'],
    crowdLevel: 'high',
    bestMonths: 'May - September',
    featured: false,
  },

  // === HUZZAH CREEK ===
  {
    id: 'huzzah-creek-float',
    title: 'Huzzah Creek Float',
    riverSlug: 'huzzah',
    riverName: 'Huzzah Creek',
    putInName: 'Upper Huzzah',
    takeOutName: 'Confluence',
    distanceMiles: 8,
    estimatedHours: '4-6',
    difficulty: 'moderate',
    category: 'hidden-gem',
    tagline: 'A hidden Ozark gem with crystal-clear water',
    description:
      'Huzzah Creek is a beautiful, spring-fed creek that feeds into the Courtois. It\'s smaller and more intimate than the bigger rivers, with crystal-clear water and a true backcountry feel. The creek needs decent water levels to float, so check conditions — but when it\'s running, it\'s one of the prettiest floats in the Ozarks.',
    highlights: ['Crystal-clear spring-fed water', 'Intimate creek setting', 'Ozark backcountry feel', 'Scenic bluffs'],
    tips: [
      'Check water levels before you go — Huzzah needs more water than larger rivers',
      'Best after recent rain when levels are up',
      'Smaller boats (kayaks, canoes) work best on this narrow creek',
      'Less commercial infrastructure — come prepared',
    ],
    bestFor: ['kayakers', 'experienced paddlers', 'nature lovers'],
    crowdLevel: 'low',
    bestMonths: 'April - June',
    featured: false,
  },

  // === COURTOIS CREEK ===
  {
    id: 'courtois-creek-float',
    title: 'Courtois Creek Float',
    riverSlug: 'courtois',
    riverName: 'Courtois Creek',
    putInName: 'Upper Courtois',
    takeOutName: 'Huzzah Confluence',
    distanceMiles: 10,
    estimatedHours: '5-7',
    difficulty: 'moderate',
    category: 'hidden-gem',
    tagline: 'Another Ozark gem — fewer people, big scenery',
    description:
      'Courtois Creek (pronounced "coat-away" locally) is a scenic tributary of the Huzzah known for its clear water and intimate, forested setting. Like Huzzah Creek, it\'s dependent on water levels but rewards those who time it right with a peaceful, uncrowded float through stunning Ozark scenery.',
    highlights: ['Clear spring-fed water', 'Forested corridor', 'Scenic bluffs', 'Quiet, uncrowded'],
    tips: [
      'Locals pronounce it "coat-away" — now you\'re in the know',
      'Very level-dependent; best after spring rains or wet periods',
      'Pairs well with Huzzah Creek for a multi-day adventure',
    ],
    bestFor: ['kayakers', 'adventure seekers', 'solitude seekers'],
    crowdLevel: 'low',
    bestMonths: 'April - June',
    featured: false,
  },
];

/** Get trips marked as featured (for homepage) */
export function getFeaturedTrips(): CuratedTrip[] {
  return CURATED_TRIPS.filter(t => t.featured);
}

/** Get trips by category */
export function getTripsByCategory(category: TripCategory): CuratedTrip[] {
  return CURATED_TRIPS.filter(t => t.category === category);
}

/** Get all trips for a specific river */
export function getTripsByRiver(riverSlug: string): CuratedTrip[] {
  return CURATED_TRIPS.filter(t => t.riverSlug === riverSlug);
}
