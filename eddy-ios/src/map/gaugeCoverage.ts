import type { MapGaugeLite } from '@eddy/types';
import type { Bounds } from '@eddy/geo';

/** Keep the national overview intact; closer views send only their padded area
 * to the native source. No count cap: small stations inside the box stay visible. */
export function gaugeRenderSubset(gauges: MapGaugeLite[], bounds: Bounds | null): MapGaugeLite[] {
  if (!bounds) return gauges;
  const [west, south, east, north] = bounds;
  return gauges.filter(({ coordinates: { lng, lat } }) =>
    lng >= west && lng <= east && lat >= south && lat <= north);
}

/** Locations come from the complete index; viewport records enrich by station identity. */
export function gaugeCoverage(index: MapGaugeLite[], viewport: MapGaugeLite[]): MapGaugeLite[] {
  const stations = new Map(index.map(g => [g.siteId, g]));
  for (const gauge of viewport) {
    if (gauge.curated) { stations.delete(gauge.siteId); continue; }
    const indexed = stations.get(gauge.siteId);
    // A cached viewport must not replace a fresher index reading.
    const indexTime = Date.parse(indexed?.readingTimestamp ?? '');
    const viewportTime = Date.parse(gauge.readingTimestamp ?? '');
    stations.set(gauge.siteId, indexed && Number.isFinite(indexTime) &&
      (!Number.isFinite(viewportTime) || indexTime > viewportTime)
      ? { ...indexed, id: gauge.id, name: gauge.name } : gauge);
  }
  return [...stations.values()];
}
