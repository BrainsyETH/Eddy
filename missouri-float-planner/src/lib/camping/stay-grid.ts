import type { FetchResult, DailyAggregate } from './types';
import { SITE_NIGHT_CODE } from './sites';
import { searchCampingStay } from './stay';
import { nextCampingDate } from '../../../shared/camping-stay';

/** Materialize single-night stays during sync so a 90-night grid stays cheap. */
export function stayGridNights(
  result: FetchResult,
  now: Date,
): DailyAggregate[] {
  const byDate = new Map<string, Map<string, string>>();
  for (const night of result.siteNights) {
    const sites = byDate.get(night.date) ?? new Map<string, string>();
    sites.set(night.sourceSiteId, SITE_NIGHT_CODE[night.status]);
    byDate.set(night.date, sites);
  }
  return result.nights.flatMap((night) => {
    const observed = byDate.get(night.date);
    // Some providers explicitly close an entire facility without publishing units.
    if (!observed?.size)
      return night.status === 'closed' || night.status === 'not_yet_released'
        ? [night]
        : [];
    const snapshot = {
      facility: { id: '', displayName: '', kind: '', source: '' },
      window: {
        startDate: night.date,
        endDate: nextCampingDate(night.date),
        label: '',
        nights: [night.date],
      },
      fetchedAt: now.toISOString(),
      sites: [...observed].map(([id, code]) => ({
        id,
        name: null,
        loop: null,
        siteType: null,
        maxOccupancy: null,
        bookingUrl: null,
        nights: code,
      })),
    };
    const summary = searchCampingStay(
      snapshot,
      night.date,
      nextCampingDate(night.date),
      now,
    ).summary;
    return summary
      ? [
          {
            date: night.date,
            sitesOpen: summary.sitesOpen,
            sitesReservable: summary.sitesReservable,
            status: summary.status,
          },
        ]
      : [];
  });
}
