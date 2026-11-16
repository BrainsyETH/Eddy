import type { CampingSitePolicy } from '../../../shared/camping-policy';

// Reviewed 2026-11-11. Exact provider/loop scope; no inference from one night's W.
// NPS announces reservations for A/E from 2027-03-15: these rules expire first.
const SOURCE = 'https://www.nps.gov/buff/planyourvisit/camping.htm';
const SEASON_SOURCE = 'https://www.nps.gov/buff/planyourvisit/buffalo-point-campground.htm';
const CHECKED = '2026-11-11T17:00:00Z';
const REVIEW_BY = '2027-03-15T05:00:00Z';

export function campsitePolicy(
  source: string, sourceFacilityId: string | null | undefined,
  site: { loop: string | null; name: string | null },
): CampingSitePolicy | undefined {
  if (source !== 'recreation_gov' || sourceFacilityId !== '234043') return undefined;
  const loop = site.loop?.trim();
  if (loop === 'Loop A' || loop === 'Loop E') return {
    sourceUrl: SEASON_SOURCE, checkedAt: CHECKED, reviewBy: REVIEW_BY,
    periods: [
      { startDate: '2026-11-11', endDateExclusive: '2026-11-15', bookingMethod: 'first_come', operation: 'open' },
      { startDate: '2026-11-15', endDateExclusive: '2027-03-15', bookingMethod: 'first_come', operation: 'closed' },
    ],
  };
  // B38 is identified as the host site, not public walk-up inventory.
  if (loop === 'Loop B' && /^B(?:2[3-9]|3[0-7]|39|4[01])$/.test(site.name ?? '')) return {
    sourceUrl: SOURCE, checkedAt: CHECKED, reviewBy: REVIEW_BY,
    periods: [
      { startDate: '2026-11-15', endDateExclusive: '2027-03-15', bookingMethod: 'first_come', operation: 'open' },
    ],
  };
  return undefined;
}
