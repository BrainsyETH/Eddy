// eddy-ios/src/lib/riverDistance.ts
// How far a river is, for the two screens that rank rivers by it.
//
// ── A river has no coordinate, so this measures to its GAUGE ────────────────
//
// /api/rivers carries no position — a river is a line, and the list endpoint has
// never needed to say where that line is. Rather than change a CDN-cached
// endpoint the website depends on, distance is measured to the river's PRIMARY
// GAUGE, which is by definition a point on the river.
//
// That makes every number here a proxy, and the UI has to say so: Today writes
// "≈ 32 mi to its gauge", never a bare distance and never a drive time. See
// milesBetween in @eddy/geo for why drive time is not on the table.
//
// ── Why it is shared ────────────────────────────────────────────────────────
//
// Today and the first-run picker both rank rivers this way. Two copies of this
// loop would be two definitions of "near", and they would drift the first time
// one of them learned about secondary gauges. It is also pure — gauges in, miles
// out — which is the only way eddy-ios logic gets test coverage at all.

import type { MapGauge } from '@eddy/types';
import { hasCoordinates } from '@eddy/types';
import { milesBetween, type Coords } from '@eddy/geo';

/**
 * Straight-line miles from `here` to each river's gauge, keyed by river id.
 *
 * A river whose gauge has no coordinates is ABSENT from the map rather than
 * present with a large number. Callers sort it last; the distinction matters
 * because "we don't know" and "it is far away" are different claims, and only
 * one of them should be rendered.
 */
export function riverMilesByGauge(gauges: MapGauge[], here: Coords): Map<string, number> {
  const map = new Map<string, number>();

  for (const gauge of gauges) {
    if (!hasCoordinates(gauge)) continue;
    const miles = milesBetween(here, gauge.coordinates);

    for (const link of gauge.thresholds ?? []) {
      // Primary wins; a secondary association only fills a gap. A gauge that two
      // rivers share should measure the river it actually rates.
      const existing = map.get(link.riverId);
      if (existing == null || (link.isPrimary && miles < existing)) {
        map.set(link.riverId, miles);
      }
    }
  }

  return map;
}

/**
 * The proxy distance as a person reads it.
 *
 * The "≈" and the "to its gauge" are not decoration — they are the whole reason
 * this is allowed to be shown. Dropping either turns a straight line to a
 * measuring station into an implied drive.
 */
export function riverDistanceLabel(miles: number): string {
  return `≈ ${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi to its gauge`;
}
