/** Only explicitly bounded reaches may override positional gauge selection.
 * An unbounded assigned row matches the entire river in the segment RPC. */
export function sectionGaugeAssignment(section: {
  riverMileStart?: number | null;
  riverMileEnd?: number | null;
  representativeGauge?: { siteId: string };
}, stations: Map<string, string>) {
  if (section.riverMileStart == null && section.riverMileEnd == null) return {};
  const start = section.riverMileStart ?? null;
  const end = section.riverMileEnd ?? null;
  if ((start != null && !Number.isFinite(start)) || (end != null && !Number.isFinite(end))
    || (start != null && end != null && start >= end)) throw new Error('Invalid section mile bounds');
  const id = stations.get(section.representativeGauge?.siteId ?? '');
  if (!id) throw new Error('Bounded section requires a verified, resolved representative gauge');
  return { river_mile_start: start, river_mile_end: end, primary_gauge_station_id: id };
}
