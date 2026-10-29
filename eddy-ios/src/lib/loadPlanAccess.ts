import type { MapAccessPoint } from '@eddy/types';

/** Race static cached places against fresh data without letting late cache win. */
export async function loadPlanAccess(deps: {
  cached: () => Promise<MapAccessPoint[] | undefined>;
  fresh: () => Promise<MapAccessPoint[]>;
  publish: (points: MapAccessPoint[]) => void;
  unavailable: () => void;
  signal: AbortSignal;
}): Promise<void> {
  let freshLanded = false;
  const cached = deps.cached().then((points) => {
    if (!deps.signal.aborted && !freshLanded && points !== undefined) deps.publish(points);
    return points;
  }).catch(() => undefined);

  try {
    const points = await deps.fresh();
    freshLanded = true;
    if (!deps.signal.aborted) deps.publish(points);
  } catch {
    const points = await cached;
    if (!deps.signal.aborted && points === undefined) deps.unavailable();
  }
}

/** How many bail-outs "Along the way" shows before its "Show all" control. */
export const ALONG_ROUTE_PREVIEW = 6;

/**
 * The access points strictly between the put-in and take-out, in river order,
 * and the rows to draw.
 *
 * `all` is the whole list and is what the heading counts. It used to be cut to
 * six before anything saw it, so "Along the way (6)" was a claim about the
 * cap, and the hidden rows were always the ones nearest the take-out — the
 * bail-outs a tired group reaches last and needs most.
 */
export function alongRoutePoints<T extends Pick<MapAccessPoint, 'riverMile'>>(
  points: readonly T[] | undefined,
  putInMile: number,
  takeOutMile: number,
  expanded: boolean,
): { all: T[]; shown: T[]; hidden: number } {
  const all = (points ?? [])
    .filter((p) => p.riverMile > putInMile && p.riverMile < takeOutMile)
    .sort((a, b) => a.riverMile - b.riverMile);
  // One more than the preview is shown whole: a "Show all" row costs the same
  // height as the single row it would hide.
  const shown = expanded || all.length <= ALONG_ROUTE_PREVIEW + 1 ? all : all.slice(0, ALONG_ROUTE_PREVIEW);
  return { all, shown, hidden: all.length - shown.length };
}
