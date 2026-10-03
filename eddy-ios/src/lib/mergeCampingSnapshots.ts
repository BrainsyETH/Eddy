import type { CampingOverview } from '@eddy/types';

/** Extend a fresh short window using saved observations without refreshing their age. */
export function mergeCampingSnapshots(current: CampingOverview | null, incoming: CampingOverview): CampingOverview {
  if (!current) return incoming;
  const [newer, older] = Date.parse(incoming.generatedAt) >= Date.parse(current.generatedAt)
    ? [incoming, current] : [current, incoming];
  if (newer.horizon.nights.length >= older.horizon.nights.length) return newer;
  const start = Date.parse(`${newer.horizon.startDate}T00:00:00Z`);
  const dateAt = (offset: number) => new Date(start + offset * 86400000).toISOString().slice(0, 10);
  const nights = Array.from({ length: older.horizon.nights.length }, (_, i) => dateAt(i));
  const dates = new Set(nights);
  const savedRows = new Map(older.tracked.map((row) => [`${row.source}:${row.facilityId}`, row]));
  return {
    ...newer,
    horizon: { startDate: dateAt(0), endDateExclusive: dateAt(nights.length), nights },
    // The fresh catalog owns membership and metadata: never resurrect removed sites.
    tracked: newer.tracked.map((row) => {
      const observations = new Map((savedRows.get(`${row.source}:${row.facilityId}`)?.nights ?? [])
        .filter((night) => dates.has(night.date)).map((night) => [night.date, night]));
      for (const night of row.nights) {
        if (!dates.has(night.date)) continue;
        const saved = observations.get(night.date);
        if (!saved || !(Date.parse(saved.checkedAt) > Date.parse(night.checkedAt))) observations.set(night.date, night);
      }
      return { ...row, nights: [...observations.values()].sort((a, b) => a.date.localeCompare(b.date)) };
    }),
  };
}
