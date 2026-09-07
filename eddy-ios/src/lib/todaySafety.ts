import type { HighWaterEntry, MapGauge, RiverAlert, RiverListItem } from '@eddy/types';
import type { Coords } from '@eddy/geo';
import { riverMilesByGauge } from './riverDistance';
import { TODAY_RADIUS_MILES } from './todayRecommendation';

export type TodaySafetyScope =
  | { kind: 'favorites'; key: string; slugs: ReadonlySet<string> }
  | { kind: 'nearby'; key: string; slugs: ReadonlySet<string> }
  | { kind: 'statewide'; key: 'statewide'; slugs: null };

export function chooseTodaySafetyScope({
  favoriteRiverSlugs,
  rivers,
  gauges,
  coords,
}: {
  favoriteRiverSlugs: ReadonlySet<string>;
  rivers: RiverListItem[];
  gauges: MapGauge[];
  coords: Coords | null;
}): TodaySafetyScope {
  if (favoriteRiverSlugs.size > 0) {
    const key = [...favoriteRiverSlugs].sort().join(',');
    return { kind: 'favorites', key: `favorites:${key}`, slugs: favoriteRiverSlugs };
  }
  if (coords) {
    const distances = riverMilesByGauge(gauges, coords);
    const slugs = new Set(
      rivers
        .filter((river) => (distances.get(river.id) ?? Infinity) <= TODAY_RADIUS_MILES)
        .map((river) => river.slug),
    );
    return { kind: 'nearby', key: `nearby:${[...slugs].sort().join(',')}`, slugs };
  }
  return { kind: 'statewide', key: 'statewide', slugs: null };
}

/** Statewide is intentionally severe-only; narrower scopes can show every relevant notice. */
export function filterTodaySafety(
  highWater: HighWaterEntry[],
  notices: RiverAlert[],
  scope: TodaySafetyScope,
): { high: HighWaterEntry[]; notices: RiverAlert[] } {
  const inScope = (slug: string | null) => scope.slugs === null || Boolean(slug && scope.slugs.has(slug));
  return {
    high: highWater.filter((entry) =>
      inScope(entry.riverSlug) && (scope.kind !== 'statewide' || entry.conditionCode === 'dangerous')),
    notices: notices.filter((entry) =>
      inScope(entry.riverSlug) && (scope.kind !== 'statewide' || entry.severity === 'warning')),
  };
}
