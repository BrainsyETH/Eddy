import type { MapGaugeLite } from '@eddy/types';

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
