// eddy-ios/src/map/mappable.ts
// Whether a service may be drawn as a pin: it has coordinates.
//
// This used to also refuse `geocodePrecision === 'centroid'` — a town-only
// coordinate a geocoder falls back to when it cannot find the business. That
// tier was retired in 2026-08 without ever being written: the backfill measures
// every candidate against the river the service serves (service_rivers ->
// rivers.geom) and simply does not write a coordinate it cannot corroborate,
// so "present but too coarse to draw" is a state the data no longer has.
// A service without a trustworthy coordinate keeps latitude NULL and belongs
// in a list, not on the map.
//
// Still a named predicate rather than an inline null-check because five
// consumers (RiverMap twice, layerCounts, tierCoverage, planSupport) must agree
// on what "drawable" means — four independent filters over one table is how
// the map and the planner once came to disagree.

import type { RiverService } from '@eddy/types';

export function mappableService(
  service: Pick<RiverService, 'latitude' | 'longitude'>,
): boolean {
  return service.latitude != null && service.longitude != null;
}
