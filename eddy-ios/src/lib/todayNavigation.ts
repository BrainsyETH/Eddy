export type TodayRiverFilter = 'all' | 'floatable' | 'starred' | 'low' | 'high' | 'unknown';
export type TodayReadFilter = 'for-you' | 'following' | 'nearby' | 'floatable' | 'all';
type RouteParam = string | string[] | undefined;

function first(value: RouteParam): string | undefined { return Array.isArray(value) ? value[0] : value; }

/** Invalid incoming links must not silently empty either list. */
export function riverFilterFromParam(value: RouteParam): TodayRiverFilter {
  const filter = first(value);
  return filter === 'floatable' || filter === 'starred' || filter === 'low' || filter === 'high' || filter === 'unknown'
    ? filter : 'all';
}

export function readFilterFromParam(value: RouteParam): TodayReadFilter {
  const filter = first(value);
  return filter === 'following' || filter === 'nearby' || filter === 'floatable' || filter === 'all'
    ? filter : 'for-you';
}
