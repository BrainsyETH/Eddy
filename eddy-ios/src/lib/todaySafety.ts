import type { HighWaterEntry, RiverAlert } from '@eddy/types';

export type CurrentAlertsFilter = 'favorites' | 'all';

/** Only identifiers are needed; the local favorites store remains authoritative. */
export interface AlertFavorite {
  kind: HighWaterEntry['kind'];
  entityId: string;
  slug: string;
  usgsSiteId?: string | null;
}

export function defaultCurrentAlertsFilter(favorites: readonly AlertFavorite[]): CurrentAlertsFilter {
  return favorites.length > 0 ? 'favorites' : 'all';
}

/** Missing, malformed, and older scope-based links show the complete feed. */
export function decodeCurrentAlertsFilter(value: string | string[] | undefined): CurrentAlertsFilter {
  return value === 'favorites' ? 'favorites' : 'all';
}

export function filterCurrentAlerts(
  highWater: HighWaterEntry[],
  notices: RiverAlert[],
  filter: CurrentAlertsFilter,
  favorites: readonly AlertFavorite[],
): { high: HighWaterEntry[]; notices: RiverAlert[] } {
  if (filter === 'all') return { high: highWater, notices };

  const entityKeys = new Set(favorites.map((item) => `${item.kind}:${item.entityId}`));
  const riverSlugs = new Set(favorites.filter((item) => item.kind === 'river' && item.slug).map((item) => item.slug));
  const gaugeSiteIds = new Set(favorites.filter((item) => item.kind === 'gauge' && item.usgsSiteId).map((item) => item.usgsSiteId));
  // Agency notices are river-based, including the river associated with a saved
  // gauge or dam. Saving one gauge does not save every gauge on that river.
  const noticeSlugs = new Set(favorites.filter((item) => item.slug).map((item) => item.slug));
  return {
    high: highWater.filter((entry) => entityKeys.has(entry.id)
      || Boolean(entry.riverSlug && riverSlugs.has(entry.riverSlug))
      || (entry.kind === 'gauge' && Boolean(entry.siteId && gaugeSiteIds.has(entry.siteId)))
      || (entry.kind === 'dam' && Boolean(entry.damId && entityKeys.has(`dam:${entry.damId}`)))),
    notices: notices.filter((entry) => Boolean(entry.riverSlug && noticeSlugs.has(entry.riverSlug))),
  };
}

/** Today and its destination use the same selection and completeness rules. */
export function currentAlertsSummary(
  highWater: HighWaterEntry[] | null,
  notices: RiverAlert[] | null,
  filter: CurrentAlertsFilter,
  favorites: readonly AlertFavorite[],
  failed: { high: boolean; notices: boolean },
) {
  const filtered = filterCurrentAlerts(highWater ?? [], notices ?? [], filter, favorites);
  const count = filtered.high.length + filtered.notices.length;
  const failure = failed.high || failed.notices;
  const loading = (highWater === null && !failed.high) || (notices === null && !failed.notices);
  const incomplete = highWater === null || notices === null;
  return {
    ...filtered,
    count,
    label: count > 0 ? `${count}${incomplete ? '+' : ''} ${count === 1 && !incomplete ? 'alert' : 'alerts'}`
      : failure ? 'Unable to refresh' : loading ? 'Checking…' : 'No alerts',
    detail: failure ? 'Some alerts may be missing or outdated.' : loading && count > 0 ? 'Checking remaining alerts…' : null,
  };
}
