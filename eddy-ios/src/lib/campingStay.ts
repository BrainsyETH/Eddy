import {
  decodeCampsiteNights,
  type CampsiteNightState,
  type CampsiteSite,
  type CampsiteSitesResponse,
} from '@eddy/types';
import { campsiteTags, SITE_FILTERS, type SiteFilter } from '../components/map-sheet/siteList';

export interface CampingStay {
  arrival: string;
  departure: string;
}
export function nextCampingDate(date: string, days = 1): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** Both picker presentations use the same dates. Checkout may be the day after
 * the final tracked night, but can never be on or before arrival. */
export function campingPickerDates(nights: string[], field: 'arrival' | 'departure', arrival: string): string[] {
  if (field === 'arrival') return nights;
  if (!nights.length) return [];
  return [...nights, nextCampingDate(nights[nights.length - 1])].filter((date) => date > arrival);
}
/** Departure is not an occupied night. Date-only arithmetic also crosses DST safely. */
export function stayNights(stay: CampingStay): string[] {
  if (stay.departure <= stay.arrival) return [];
  const result: string[] = [];
  for (
    let date = stay.arrival;
    date < stay.departure && result.length < 90;
    date = nextCampingDate(date)
  )
    result.push(date);
  return result;
}
export interface CampsiteStay {
  site: CampsiteSite;
  nights: { date: string; state: CampsiteNightState }[];
  state: 'available' | 'first_come' | 'unavailable' | 'unknown';
}
export function campsiteStays(
  responses: CampsiteSitesResponse[],
  stay: CampingStay,
  maxAgeSeconds: number,
  now: number,
): CampsiteStay[] {
  const dates = stayNights(stay);
  const catalog = new Map<string, CampsiteSite>();
  const observations = new Map<string, Map<string, CampsiteNightState>>();
  for (const response of responses) {
    const age = response.fetchedAt ? now - Date.parse(response.fetchedAt) : NaN;
    const fresh =
      Number.isFinite(age) && age >= 0 && age < maxAgeSeconds * 1000;
    for (const site of response.sites) {
      catalog.set(site.id, site);
      const nights =
        observations.get(site.id) ?? new Map<string, CampsiteNightState>();
      const states = decodeCampsiteNights(site.nights);
      response.window.nights.forEach((date, i) =>
        nights.set(date, fresh ? (states[i] ?? 'unknown') : 'unknown'),
      );
      observations.set(site.id, nights);
    }
  }
  return [...catalog.values()].map((site) => {
    const nights = dates.map((date) => ({
      date,
      state:
        observations.get(site.id)?.get(date) ??
        ('unknown' as CampsiteNightState),
    }));
    const state: CampsiteStay['state'] =
      nights.length && nights.every((n) => n.state === 'open')
        ? 'available'
        : nights.length && nights.every((n) => n.state === 'walk_up')
          ? 'first_come'
          : nights.some(
                (n) =>
                  n.state !== 'open' &&
                  n.state !== 'unknown' &&
                  n.state !== 'walk_up',
              )
            ? 'unavailable'
            : 'unknown';
    return { site, nights, state };
  });
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
