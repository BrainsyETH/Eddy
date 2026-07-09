// scripts/data/buffalo-float-points.ts
//
// Authoritative Buffalo National River access-point ordering + distances,
// transcribed from the NPS float-distance matrix and float guide (2026-07).
//
// The Buffalo is a single linear channel, so the NPS matrix is really a
// cumulative-distance table: the distance between ANY two access points equals
// the difference of their cumulative miles. We therefore store just one number
// per point (`milesFromBoxley`) and derive every segment distance by
// subtraction. Float time follows the NPS guidance on the sheet: ~2 mph, i.e.
// hours ≈ distance / 2 (varies with breaks, paddling, and river level).
//
// Coordinates are intentionally NOT here. Access-point lat/lon must come from an
// authoritative source (NPS/RIDB) and be map-verified before going public —
// hand-entered coordinates are exactly what the ingestion gates forbid. This
// file is the coordinate-independent backbone: ordering, mileage, and the
// float-segment distances used to calibrate float times.
//
// Source conflicts were resolved in favor of the internally-consistent matrix
// (the narrative prose has a few typos):
//   • North Maumee → South Maumee: matrix 0.5 mi (narrative's "11.4" is a typo;
//     its "Maumee North to Buffalo Point 11.4" matches the matrix's 11.2).
//   • Tyler Bend → Grinders Ferry: matrix 1.1 mi (narrative 1.4).
//   • Boxley → Ponca: matrix 6.0 (narrative 6.1); Ponca → Steel Creek: 2.7 (narrative 2.6).

export type BuffaloFloatPoint = {
  name: string;
  slug: string;
  /**
   * Cumulative river miles downstream from Boxley Bridge (the matrix origin).
   * Dixon Forge sits ~15 mi ABOVE Boxley, hence negative. Distance between any
   * two points = |a.milesFromBoxley − b.milesFromBoxley|.
   */
  milesFromBoxley: number;
  type: 'access' | 'put_in' | 'take_out';
  notes?: string;
};

// Ordered upstream → downstream.
export const BUFFALO_FLOAT_POINTS: BuffaloFloatPoint[] = [
  { name: 'Dixon Forge',    slug: 'dixon-forge',    milesFromBoxley: -15.0, type: 'access', notes: 'Hailstone put-in — solid Class III, experienced paddlers only, cold-season flows.' },
  { name: 'Boxley',         slug: 'boxley',         milesFromBoxley: 0.0,   type: 'access' },
  { name: 'Ponca',          slug: 'ponca',          milesFromBoxley: 6.0,   type: 'access' },
  { name: 'Steel Creek',    slug: 'steel-creek',    milesFromBoxley: 8.7,   type: 'access' },
  { name: 'Kyles Landing',  slug: 'kyles-landing',  milesFromBoxley: 16.7,  type: 'access' },
  { name: 'Erbie',          slug: 'erbie',          milesFromBoxley: 22.3,  type: 'access' },
  { name: 'Ozark',          slug: 'ozark',          milesFromBoxley: 27.8,  type: 'access' },
  { name: 'Pruitt',         slug: 'pruitt',         milesFromBoxley: 29.9,  type: 'access' },
  { name: 'Hasty',          slug: 'hasty',          milesFromBoxley: 36.7,  type: 'access' },
  { name: 'Carver',         slug: 'carver',         milesFromBoxley: 40.9,  type: 'access' },
  { name: 'Mt. Hersey',     slug: 'mt-hersey',      milesFromBoxley: 47.7,  type: 'access' },
  { name: 'Woolum',         slug: 'woolum',         milesFromBoxley: 56.3,  type: 'access' },
  { name: 'Baker Ford',     slug: 'baker-ford',     milesFromBoxley: 67.2,  type: 'access' },
  { name: 'Tyler Bend',     slug: 'tyler-bend',     milesFromBoxley: 71.5,  type: 'access' },
  { name: 'Grinders Ferry', slug: 'grinders-ferry', milesFromBoxley: 72.6,  type: 'access' },
  { name: 'Gilbert',        slug: 'gilbert',        milesFromBoxley: 76.9,  type: 'access' },
  { name: 'North Maumee',   slug: 'north-maumee',   milesFromBoxley: 88.5,  type: 'access' },
  { name: 'South Maumee',   slug: 'south-maumee',   milesFromBoxley: 89.0,  type: 'access' },
  { name: 'Spring Creek',   slug: 'spring-creek',   milesFromBoxley: 93.7,  type: 'access' },
  { name: 'Dillards Ferry', slug: 'dillards-ferry', milesFromBoxley: 98.3,  type: 'access' },
  { name: 'Buffalo Point',  slug: 'buffalo-point',  milesFromBoxley: 99.7,  type: 'access', notes: 'Launch road closed — steep carry up the gravel bar. Consider Dillards Ferry (1.5 mi upstream) instead.' },
  { name: 'Rush',           slug: 'rush',           milesFromBoxley: 107.2, type: 'access' },
  { name: 'Buffalo City',   slug: 'buffalo-city',   milesFromBoxley: 131.4, type: 'take_out', notes: 'White River confluence — take-out only.' },
];

/** River miles between two points (linear channel → difference of cumulative miles). */
export function segmentMiles(a: BuffaloFloatPoint, b: BuffaloFloatPoint): number {
  return Math.round(Math.abs(a.milesFromBoxley - b.milesFromBoxley) * 10) / 10;
}

/** Approximate float hours at the NPS ~2 mph guidance. */
export function floatHours(miles: number): number {
  return Math.round((miles / 2) * 10) / 10;
}
