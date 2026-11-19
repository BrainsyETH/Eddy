// The level's freshness rule and label live in shared/lake-reading.ts, where
// the iOS lake screen reads them too.
export { lakeReadingIsStale, lakeReadingLabel } from '@shared/lake-reading';

/** Only deduplicate actual observation instants, never matching rounded ages. */
export function sharedObservationAt(readings: Array<{ at: string } | undefined>): string | null {
  const present = readings.filter((r): r is { at: string } => Boolean(r));
  if (!present.length || !Number.isFinite(Date.parse(present[0].at))) return null;
  return present.every((r) => Date.parse(r.at) === Date.parse(present[0].at)) ? present[0].at : null;
}
