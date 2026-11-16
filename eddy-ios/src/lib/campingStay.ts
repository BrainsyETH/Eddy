import { nextCampingDate, type CampsiteStay, type CampingStayResult } from '@eddy/conditions/camping-stay';
import { currentPolicyStay } from '@eddy/conditions/camping-policy';
import type { CampsiteNightState } from '@eddy/types';
import { campsiteTags, SITE_FILTERS, type SiteFilter } from '../components/map-sheet/siteList';

export { nextCampingDate, stayNights } from '@eddy/conditions/camping-stay';
export type { CampingStay, CampsiteStay } from '@eddy/conditions/camping-stay';

/** Strip only an exact campground prefix followed by a separator, never a place-name substring. */
export function campsiteDisplayName(name: string | null, campground?: string): string {
  const full = name?.trim() || 'Campsite';
  const prefix = campground?.trim();
  if (!prefix || full.slice(0, prefix.length).toLowerCase() !== prefix.toLowerCase()) return full;
  const rest = full.slice(prefix.length);
  return /^\s+[-–—:]\s+\S/.test(rest) ? rest.replace(/^\s+[-–—:]\s+/, '') : full;
}

export function campsiteDisplayLoop(loop: string | null, campground?: string): string | null {
  return loop?.trim() && loop.trim().toLowerCase() !== campground?.trim().toLowerCase() ? loop.trim() : null;
}
/** Both picker presentations use the same dates. Checkout may be the day after
 * the final tracked night, but can never be on or before arrival. */
export function campingPickerDates(nights: string[], field: 'arrival' | 'departure', arrival: string): string[] {
  if (field === 'arrival') return nights;
  if (!nights.length) return [];
  return [...nights, nextCampingDate(nights[nights.length - 1])].filter((date) => date > arrival);
}
export const campsiteStateLabel: Record<CampsiteNightState, string> = {
  open: 'Open',
  reserved: 'Booked',
  closed: 'Closed',
  walk_up: 'First-come only',
  not_yet_released: 'Not yet released',
  unknown: 'Availability not updated',
};

export type CampingSort = 'nearest' | 'openings' | 'name';
/** An explicit choice survives location arriving or disappearing. */
export function resolveCampingSort(
  choice: CampingSort | null,
  hasLocation: boolean,
): CampingSort {
  return choice ?? (hasLocation ? 'nearest' : 'name');
}

/**
 * The map sheet's site-type chips, for a stay instead of one night. OR within
 * the chips, as there. Every state is filtered, so the "Show unavailable (n)"
 * toggles count the same kinds of site the list shows.
 */
export function filterCampsiteStays(entries: CampsiteStay[], filters: SiteFilter[]): CampsiteStay[] {
  if (!filters.length) return entries;
  return entries.filter((entry) => {
    const tags = campsiteTags(entry.site);
    return filters.some((filter) => tags.includes(filter));
  });
}

/** Chip counts are sites a reader can take for the whole stay: bookable or walk-up. */
export function campsiteStayFilterCounts(entries: CampsiteStay[]): Record<SiteFilter, number> {
  const counts = Object.fromEntries(SITE_FILTERS.map((f) => [f, 0])) as Record<SiteFilter, number>;
  for (const entry of entries) {
    if (entry.state !== 'available' && entry.state !== 'first_come') continue;
    const tags = campsiteTags(entry.site);
    for (const filter of SITE_FILTERS) if (tags.includes(filter)) counts[filter]++;
  }
  return counts;
}

/** Expiring a cached server answer may remove a promise, never create one. */
export function currentCampingStay(result: CampingStayResult | null, maxAgeSeconds: number, now: number): CampsiteStay[] {
  if (!result) return [];
  const age = result.fetchedAt ? now - Date.parse(result.fetchedAt) : NaN;
  const fresh = Number.isFinite(age) && age >= 0 && age < maxAgeSeconds * 1000;
  if (fresh && result.sites.every(entry => !entry.site.policy)) return result.sites;
  return result.sites.map(entry => currentPolicyStay(entry, fresh, now));
}
