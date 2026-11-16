import type { LakeEntry } from './registry';
import { lakeObservationIsCurrent } from './freshness';

/** Pure so the health rule can be asserted without a network. */
export function lakeHealth(
  lake: LakeEntry,
  readings: Array<{ at: string }>,
  now: number,
): { newestAt: string | null; healthy: boolean } {
  const newest = readings
    .map((r) => Date.parse(r.at))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  if (newest === undefined) return { newestAt: null, healthy: false };
  const newestAt = new Date(newest).toISOString();
  return {
    newestAt,
    healthy: lakeObservationIsCurrent(newestAt, lake.poolCadence, now),
  };
}
