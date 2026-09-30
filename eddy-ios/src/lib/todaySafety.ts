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
  displayedRiverSlugs: ReadonlySet<string> = new Set(),
): { high: HighWaterEntry[]; notices: RiverAlert[] } {
  const displayed = (slug: string | null) => Boolean(slug && displayedRiverSlugs.has(slug));
  const inScope = (slug: string | null) => displayed(slug) || scope.slugs === null || Boolean(slug && scope.slugs.has(slug));
  return {
    high: highWater.filter((entry) =>
      inScope(entry.riverSlug) && (displayed(entry.riverSlug) || scope.kind !== 'statewide' || entry.conditionCode === 'dangerous')),
    notices: notices.filter((entry) =>
      inScope(entry.riverSlug) && (displayed(entry.riverSlug) || scope.kind !== 'statewide' || entry.severity === 'warning')),
  };
}

export interface CurrentAlertsScope {
  scope: TodaySafetyScope;
  displayedRiverSlugs: ReadonlySet<string>;
}

const statewideScope = (): CurrentAlertsScope => ({
  scope: { kind: 'statewide', key: 'statewide', slugs: null },
  displayedRiverSlugs: new Set(),
});

/** Carry river identifiers, never location coordinates or stale alert rows. */
export function encodeCurrentAlertsScope(scope: TodaySafetyScope, displayedRiverSlugs: ReadonlySet<string>): string {
  return JSON.stringify({ version: 1, kind: scope.kind, slugs: scope.slugs ? [...scope.slugs].sort() : [],
    displayed: [...displayedRiverSlugs].sort() });
}

function validSlugs(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 250 && value.every((slug) =>
    typeof slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 100);
}

/** Direct links are untrusted. An invalid/missing descriptor has a visible fallback. */
export function decodeCurrentAlertsScope(value: string | string[] | undefined): CurrentAlertsScope & { fallback: boolean } {
  const fallback = () => ({ ...statewideScope(), fallback: true });
  if (typeof value !== 'string' || value.length > 30_000) return fallback();
  try {
    const parsed = JSON.parse(value);
    if (!parsed || parsed.version !== 1 || !['favorites', 'nearby', 'statewide'].includes(parsed.kind)
      || !validSlugs(parsed.slugs) || !validSlugs(parsed.displayed)
      || (parsed.kind === 'statewide' && parsed.slugs.length > 0)
      || (parsed.kind === 'favorites' && parsed.slugs.length === 0)) return fallback();
    const scope: TodaySafetyScope = parsed.kind === 'statewide'
      ? { kind: 'statewide', key: 'statewide', slugs: null }
      : { kind: parsed.kind, key: `${parsed.kind}:${[...new Set(parsed.slugs)].sort().join(',')}`, slugs: new Set(parsed.slugs) };
    return { scope, displayedRiverSlugs: new Set(parsed.displayed), fallback: false };
  } catch {
    return fallback();
  }
}

export function currentAlertsScopeLabel({ scope, displayedRiverSlugs }: CurrentAlertsScope): string {
  const extraSuggestions = [...displayedRiverSlugs].some((slug) => !scope.slugs?.has(slug));
  if (scope.kind === 'favorites') return extraSuggestions ? 'Favorite and suggested rivers' : 'Favorite rivers';
  if (scope.kind === 'nearby') return extraSuggestions ? 'Nearby and suggested rivers' : 'Near you';
  return displayedRiverSlugs.size ? 'Statewide warnings and suggested rivers' : 'Statewide warnings';
}

/** Same filtering and completeness rules on Today and its destination. */
export function currentAlertsSummary(
  highWater: HighWaterEntry[] | null,
  notices: RiverAlert[] | null,
  selection: CurrentAlertsScope,
  failed: { high: boolean; notices: boolean },
) {
  const filtered = filterTodaySafety(highWater ?? [], notices ?? [], selection.scope, selection.displayedRiverSlugs);
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
