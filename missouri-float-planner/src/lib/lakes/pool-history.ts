// src/lib/lakes/pool-history.ts
// Pure arithmetic over recorded pool readings: the signed change over a
// window, and the slice a page draws. No database, no network.
//
// Pool history is its own table (lake_pool_readings) rather than a third
// metric in dam_metric_readings: that table's CHECK admits two metrics, its
// value column is named in cfs, its pattern builder draws any other metric as
// total release, and its freshness monitor would call Truman's daily pool
// permanently stale. A lake keyed table with a feet column avoids all four.

export interface PoolPoint {
  /** Epoch milliseconds UTC of the observation. */
  at: number;
  elevationFt: number;
  /** True when the source publishes one value a day; stored with the reading. */
  daily?: boolean;
}

/**
 * Latest minus the reading nearest `hours` before it, or null when no reading
 * sits within `toleranceHours` of that target. Null is "could not be
 * computed", never "flat" (the same rule DamMetricValue.trend states).
 */
export function poolChange(points: PoolPoint[], hours: number, toleranceHours: number): number | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.at - b.at);
  const latest = sorted[sorted.length - 1];
  const target = latest.at - hours * 3_600_000;
  let best: PoolPoint | null = null;
  for (const p of sorted) {
    if (p.at >= latest.at) continue;
    if (!best || Math.abs(p.at - target) < Math.abs(best.at - target)) best = p;
  }
  if (!best || Math.abs(best.at - target) > toleranceHours * 3_600_000) return null;
  return Math.round((latest.elevationFt - best.elevationFt) * 100) / 100;
}

/** Hourly readings tolerate a 3-hour gap; a daily source tolerates most of a day. */
export function toleranceFor(daily: boolean): number {
  return daily ? 14 : 3;
}

/** Oldest-first readings inside the last `days`, as the wire carries them. */
export function historyForWire(points: PoolPoint[], now: number, days: number): Array<[string, number]> {
  const from = now - days * 86_400_000;
  return [...points]
    .filter((p) => p.at >= from && p.at <= now + 3_600_000)
    .sort((a, b) => a.at - b.at)
    .map((p) => [new Date(p.at).toISOString(), p.elevationFt]);
}
