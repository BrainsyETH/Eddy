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
  /** Whether the take-out access point offers camping. */
  takeOutCamping: boolean;
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
  // Descriptions come with trailing ". Access." or similar — trim to a name.
  return desc
    .replace(/\.\s*Access\.?\s*$/i, '')
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
  const byRiver = new Map<string, MileMarker[]>();
  for (const m of markers) {
    if (!m.is_access_point) continue;
    const list = byRiver.get(m.river_id) || [];
    list.push(m);
    byRiver.set(m.river_id, list);
  }

  const sections: Section[] = [];
  const riverIds = Array.from(byRiver.keys()).sort();
  for (const riverId of riverIds) {
    const accesses = (byRiver.get(riverId) || []).slice().sort((a, b) => a.mile - b.mile);
    for (let i = 0; i < accesses.length - 1; i++) {
      const putIn = accesses[i];
      const takeOut = accesses[i + 1];
      const distance = Math.round((takeOut.mile - putIn.mile) * 10) / 10;
      // Skip degenerate sections (same mile marker, or <0.5 mi — likely
      // parallel access points rather than a real float).
      if (distance < 0.5) continue;
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
        takeOutCamping: !!takeOut.is_campground,
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
