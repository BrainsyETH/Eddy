// shared/camping-rivers.ts
//
// Camping along a river: the order campgrounds come in once a river is picked,
// the mile each one sits at, and how that river is running now. Shared so the
// web Camping hub and, later, the iOS Camping screen sort and word these the
// same way.
//
// ── One ruler ──────────────────────────────────────────────────────────────
// A river mile here is the access-point ruler (access_points
// .river_mile_downstream): the number the river page prints beside each
// access. It belongs to ONE river, the one the campground's access point is on;
// a campground listed under a second river has no mile there. Miles from other
// tables are on other rulers and must not be mixed in
// (docs/RIVER_MILE_SCALES_REVIEW_2026-09-02.md). Ordering only compares miles
// on the same river, which every ruler gets right.
//
// ── "Now", not "for your stay" ─────────────────────────────────────────────
// The condition is the river's current reading. A stay can be weeks out, so a
// surface showing it says "now" beside it and never ties it to the dates.
//
// Pure TypeScript, relative imports only, so Metro, tsx and Next can all
// consume it.

import { STALE_READING_HOURS } from './reading-staleness';

/** The parts of a camping place this module reads; CampingPlace satisfies it. */
export interface CampingRiverPlace {
  name: string;
  accessDestination: { riverSlug: string; riverMile?: number | null } | null;
}

/** A place's mile on `riverSlug`, or null when it is not measured on that river. */
export function campingRiverMile(place: CampingRiverPlace, riverSlug: string): number | null {
  const at = place.accessDestination;
  if (!at || at.riverSlug !== riverSlug) return null;
  return typeof at.riverMile === 'number' && Number.isFinite(at.riverMile) ? at.riverMile : null;
}

/**
 * Upstream to downstream along one river. Places without a mile on that river
 * follow, by name: their position is unknown, not "last".
 */
export function orderCampingAlongRiver<T>(
  rows: readonly T[],
  riverSlug: string,
  place: (row: T) => CampingRiverPlace,
): T[] {
  return rows
    .map((row) => ({ row, mile: campingRiverMile(place(row), riverSlug), name: place(row).name }))
    .sort((a, b) =>
      a.mile !== null && b.mile !== null
        ? a.mile - b.mile || a.name.localeCompare(b.name)
        : a.mile !== null
          ? -1
          : b.mile !== null
            ? 1
            : a.name.localeCompare(b.name))
    .map((entry) => entry.row);
}

/** Enough measured places for "upstream to downstream" to describe the list. */
export function campingRiverOrdered(places: readonly CampingRiverPlace[], riverSlug: string): boolean {
  return places.filter((place) => campingRiverMile(place, riverSlug) !== null).length >= 2;
}

/** "Mile 26", rounded like the river page's access list. */
export function campingMileLabel(mile: number): string {
  return `Mile ${Math.round(mile)}`;
}

/** The parts of a rivers-list entry this module reads; RiverListItem satisfies it. */
export interface CampingRiverSource {
  slug: string;
  name: string;
  path: string;
  currentCondition: {
    code: string;
    readingAgeHours?: number | null;
    trend?: { label: string } | null;
  } | null;
}

export interface CampingRiverNow {
  slug: string;
  name: string;
  /** The river's own page. */
  path: string;
  /** Null when there is no rating to show: unrated, unknown or an old reading. */
  condition: { code: string; trend: string | null } | null;
}

/** A river as the camping surfaces show it, or null when the river is not listed. */
export function campingRiverNow(
  rivers: readonly CampingRiverSource[] | null | undefined,
  slug: string,
): CampingRiverNow | null {
  const river = rivers?.find((candidate) => candidate.slug === slug);
  if (!river) return null;
  const reading = river.currentCondition;
  const age = reading?.readingAgeHours;
  const current = reading
    && reading.code !== 'unknown'
    && (age == null || (Number.isFinite(age) && age <= STALE_READING_HOURS));
  return {
    slug: river.slug,
    name: river.name,
    path: river.path,
    condition: current ? { code: reading.code, trend: reading.trend?.label ?? null } : null,
  };
}
