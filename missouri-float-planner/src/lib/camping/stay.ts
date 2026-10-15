// Canonical server calculation. Cards, persisted grid nights and the detail API
// all use this intersection of individual site IDs, never minima of daily totals.
import type { CampsiteSitesResult } from './sites';
import type {
  CampingStayResult,
  CampingNightState,
  CampsiteStay,
} from '../../../shared/camping-stay';
import { stayNights } from '../../../shared/camping-stay';
import { MAX_AGE_MS } from './freshness';

const STATES: Record<string, CampingNightState> = {
  A: 'open',
  R: 'reserved',
  W: 'walk_up',
  C: 'closed',
  N: 'not_yet_released',
};
export function searchCampingStay(
  campground: CampsiteSitesResult,
  arrival: string,
  departure: string,
  now = new Date(),
): CampingStayResult {
  const dates = stayNights({ arrival, departure });
  if (!dates.length) throw new Error('Invalid camping stay');
  const age = campground.fetchedAt
    ? now.getTime() - Date.parse(campground.fetchedAt)
    : NaN;
  const fresh = Number.isFinite(age) && age >= 0 && age < MAX_AGE_MS;
  const positions = new Map(
    campground.window.nights.map((date, i) => [date, i]),
  );
  const sites: CampsiteStay[] = campground.sites.map((site) => {
    const nights = dates.map((date) => {
      const i = positions.get(date);
      return {
        date,
        state:
          fresh && i !== undefined
            ? (STATES[site.nights[i]] ?? 'unknown')
            : ('unknown' as CampingNightState),
      };
    });
    const state = nights.every((n) => n.state === 'open')
      ? 'available'
      : nights.every((n) => n.state === 'walk_up')
        ? 'first_come'
        : nights.some((n) =>
              ['reserved', 'closed', 'not_yet_released'].includes(n.state),
            )
          ? 'unavailable'
          : 'unknown';
    return { site, nights, state };
  });
  const availableSites = sites
    .filter((s) => s.state === 'available')
    .map((s) => s.site);
  const complete =
    sites.length > 0 &&
    sites.every((s) => s.nights.every((n) => n.state !== 'unknown'));
  const all = (state: CampingNightState) =>
    sites.every((s) => s.nights.every((n) => n.state === state));
  return {
    facilityId: campground.facility.id,
    arrival,
    departure,
    fetchedAt: campground.fetchedAt,
    availableSites,
    sites,
    summary: complete
      ? {
          sitesOpen: availableSites.length,
          sitesReservable: sites.filter((s) =>
            s.nights.every((n) => n.state === 'open' || n.state === 'reserved'),
          ).length,
          sitesWalkUp: sites.filter((s) => s.state === 'first_come').length,
          status: availableSites.length
            ? 'open'
            : all('closed')
              ? 'closed'
              : all('not_yet_released')
                ? 'not_yet_released'
                : 'full',
        }
      : null,
  };
}
