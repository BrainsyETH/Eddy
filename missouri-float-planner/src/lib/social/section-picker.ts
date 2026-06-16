// src/lib/social/section-picker.ts
// Build a deterministic rotation of put-in → take-out section pairs from the
// repo's mile-markers JSON. One section per week, rotating across rivers so
// the feed stays varied.

import mileMarkers from '../../../floatmissouri_mile_markers.json';

interface MileMarker {
  river_id: string;
  mile: number;
  description: string;
  feature_type: string | null;
  is_access_point: boolean;
  is_campground: boolean;
  has_spring: boolean;
  side: string | null;
}

/** A spring on the float, between the put-in and take-out. */
export interface RouteSpring {
  /** Cleaned name, e.g. "Welch Spring". */
  name: string;
  /** River mile (downstream). */
  mile: number;
  /** Bank the spring enters on, if known. */
  side: string | null;
}

export interface Section {
  /** Slug used in eddy_updates / river_gauges (e.g. "current", "jacks-fork"). */
  riverSlug: string;
  /** Display name (e.g. "Current River"). */
  riverName: string;
  putInName: string;
  putInMile: number;
  takeOutName: string;
  takeOutMile: number;
  /** Distance in miles. */
  distanceMi: number;
  /** Rough float time in hours (2 mph canoe default). */
  hoursCanoe: number;
  /** Raw access-point descriptions (for caption detail). */
  putInDescription: string;
  takeOutDescription: string;
  /** Whether the put-in access point offers camping. */
  putInCamping: boolean;
  /** Whether the take-out access point offers camping. */
  takeOutCamping: boolean;
  /** Springs located on the run (between put-in and take-out). */
  springs: RouteSpring[];
}

/** Mile-markers use "-river" / "-creek" suffixes; eddy_updates don't. */
function normalizeSlug(markerId: string): string {
  return markerId
    .replace(/-river$/, '')
    .replace(/-creek$/, '')
    .replace(/-fork$/, '');
}

function titleize(slug: string): string {
  // "current-river" → "Current River"; "big-piney-river" → "Big Piney River"
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function cleanDescription(desc: string): string {
  // Mile-marker descriptions can be a whole paragraph ("Onondaga State Park,
  // Hwy. H bridge. Public access upstream from bridge on west. Onondaga Cave,
  // ..."). Keep just the name: the first clause up to a comma or sentence
  // period, protecting common abbreviations (Hwy., Rd., St.) so we don't split
  // on their dots. The full text still lives in putInDescription/takeOutDescription.
  let t = (desc || '').trim().replace(/\s+/g, ' ');
  const ABBR = ['Hwy', 'Hwys', 'Rd', 'Mt', 'St', 'Co', 'Jct', 'No', 'Ft', 'Rte', 'Cr'];
  for (const a of ABBR) t = t.replace(new RegExp(`\\b${a}\\.`, 'g'), `${a}__D__`);
  const name = (t.match(/^([^,.]+)/)?.[1] ?? t).replace(/__D__/g, '.').trim();
  return name || desc.trim();
}

/** Spring descriptions read like "Welch Spring enters on the left." — keep the
 *  name, drop the "enters on …" clause and trailing punctuation. */
function cleanSpringName(desc: string): string {
  return desc
    .replace(/\s+enters?\b.*$/i, '')
    .replace(/\s+(on|enters?)\s+(the\s+)?(left|right)\b.*$/i, '')
    .replace(/\.?\s*$/, '')
    .trim();
}

let cachedSections: Section[] | null = null;

/**
 * Build (and cache) the full list of consecutive access-point pairs across
 * every river. Order is: sort rivers alphabetically, within each river sort
 * access points by mile ascending, pair consecutive points.
 */
export function listAllSections(): Section[] {
  if (cachedSections) return cachedSections;

  const markers = mileMarkers as MileMarker[];
  const accessByRiver = new Map<string, MileMarker[]>();
  const springsByRiver = new Map<string, MileMarker[]>();
  for (const m of markers) {
    if (m.is_access_point) {
      const list = accessByRiver.get(m.river_id) || [];
      list.push(m);
      accessByRiver.set(m.river_id, list);
    }
    if (m.feature_type === 'spring' || m.has_spring) {
      const list = springsByRiver.get(m.river_id) || [];
      list.push(m);
      springsByRiver.set(m.river_id, list);
    }
  }

  const sections: Section[] = [];
  const riverIds = Array.from(accessByRiver.keys()).sort();
  for (const riverId of riverIds) {
    const accesses = (accessByRiver.get(riverId) || []).slice().sort((a, b) => a.mile - b.mile);
    const riverSprings = (springsByRiver.get(riverId) || []).slice().sort((a, b) => a.mile - b.mile);
    for (let i = 0; i < accesses.length - 1; i++) {
      const putIn = accesses[i];
      const takeOut = accesses[i + 1];
      const distance = Math.round((takeOut.mile - putIn.mile) * 10) / 10;
      // Skip degenerate sections (same mile marker, or <0.5 mi — likely
      // parallel access points rather than a real float).
      if (distance < 0.5) continue;
      // Springs strictly between the two access points — the ones you actually
      // pass on this float.
      const springs: RouteSpring[] = riverSprings
        .filter((s) => s.mile > putIn.mile && s.mile < takeOut.mile)
        .map((s) => ({ name: cleanSpringName(s.description), mile: s.mile, side: s.side }));
      sections.push({
        riverSlug: normalizeSlug(riverId),
        riverName: titleize(riverId.replace(/-river$/, ' River').replace(/-creek$/, ' Creek').replace(/-fork$/, ' Fork')),
        putInName: cleanDescription(putIn.description),
        putInMile: putIn.mile,
        takeOutName: cleanDescription(takeOut.description),
        takeOutMile: takeOut.mile,
        distanceMi: distance,
        hoursCanoe: Math.round((distance / 2) * 10) / 10,
        putInDescription: putIn.description,
        takeOutDescription: takeOut.description,
        putInCamping: !!putIn.is_campground,
        takeOutCamping: !!takeOut.is_campground,
        springs,
      });
    }
  }

  cachedSections = sections;
  return sections;
}

/**
 * Day-since-1970 index. "Float of the Day" rotates the section daily and
 * deterministically (same answer all day, no DB pointer needed).
 */
function dayIndex(date = new Date()): number {
  return Math.floor(date.getTime() / (24 * 60 * 60 * 1000));
}

/**
 * Pick the section to feature for the given date. Rotates through the full
 * list; always the same answer for the same day.
 */
export function pickSectionForDate(date = new Date()): Section | null {
  const all = listAllSections();
  if (all.length === 0) return null;
  const idx = dayIndex(date) % all.length;
  return all[idx];
}

/**
 * Restrict the rotation to a subset of river slugs (eddy_updates slugs, not
 * mile-marker river_ids) and, optionally, to a distance window. Used by the
 * Float of the Day, which only features floatable rivers on 5-9 mi sections.
 */
export function pickSectionForRivers(
  riverSlugs: string[],
  opts: { minMi?: number; maxMi?: number } = {},
  date = new Date(),
): Section | null {
  const { minMi = 0, maxMi = Infinity } = opts;
  const subset = listAllSections().filter(
    (s) => riverSlugs.includes(s.riverSlug) && s.distanceMi >= minMi && s.distanceMi <= maxMi,
  );
  if (subset.length === 0) return null;
  const idx = dayIndex(date) % subset.length;
  return subset[idx];
}
