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
