import {
  resolveHorizon,
  resolveWeekend,
} from '@eddy/conditions/camping-window';
import { campingNightState, campingCountBucket } from '../components/map-sheet/availability';
import type {
  CampingOverview,
  CampingObservation,
  TrackedCampground,
  CampingPlace,
} from '@eddy/types';
import { milesBetween, type Coords } from '@eddy/geo';
export type HeatMark =
  | 'open-1'
  | 'open-2'
  | 'open-3'
  | 'full'
  | 'closed'
  | 'nyr'
  | 'unknown';
export function campingDate(now = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now));
}
export function dateLabel(date: string, short = false): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    ...(short ? {} : { month: 'short' as const }),
    day: 'numeric',
  }).format(new Date(date + 'T12:00:00Z'));
}
export function currentNight(
  row: TrackedCampground,
  date: string,
  maxAge: number,
  now: number,
): CampingObservation | undefined {
  const n = row.nights.find((n) => n.date === date),
    age = n ? now - Date.parse(n.checkedAt) : NaN;
  return n && Number.isFinite(age) && age >= 0 && age < maxAge * 1000
    ? n
    : undefined;
}
export function cellMark(n?: CampingObservation): HeatMark {
  const state = campingNightState(n);
  if (state === 'unknown') return 'unknown';
  if (state === 'closed') return 'closed';
  if (state === 'not_yet_released') return 'nyr';
  if (state === 'full') return 'full';
  return `open-${campingCountBucket(n!.sitesOpen)}`;
}
export function nightLine(n?: CampingObservation): string {
  const mark = cellMark(n);
  if (mark === 'unknown') return 'Not checked';
  if (mark === 'closed') return 'Closed for this night';
  if (mark === 'nyr') return 'Not yet released';
  if (mark === 'full') return 'No reservable openings';
  return `${n!.sitesOpen} of ${n!.sitesReservable} reservable sites open`;
}
export function checkedLabel(at: string | null): string {
  if (!at) return 'No recent observations';
  return (
    'Data from ' +
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(at)) +
    ' CT'
  );
}
export function weekendLine(
  row: TrackedCampground,
  overview: CampingOverview,
  now: number,
): string {
  return overview.weekend.nights
    .map((date) => {
      const n = currentNight(row, date, overview.maxObservationAgeSeconds, now),
        mark = cellMark(n);
      const text = mark.startsWith('open')
        ? `${n!.sitesOpen} open`
        : mark === 'full'
          ? 'full'
          : mark === 'closed'
            ? 'closed'
            : mark === 'nyr'
              ? 'unreleased'
              : 'not checked';
      return `${dateLabel(date, true)}: ${text}`;
    })
    .join(' · ');
}
export function cardSummary(
  rows: TrackedCampground[],
  overview: CampingOverview,
  now: number,
): string {
  const count = rows.filter((r) =>
    overview.weekend.nights.every((d) =>
      cellMark(
        currentNight(r, d, overview.maxObservationAgeSeconds, now),
      ).startsWith('open'),
    ),
  ).length;
  const unknown = rows.filter((r) =>
    overview.weekend.nights.some(
      (d) =>
        cellMark(currentNight(r, d, overview.maxObservationAgeSeconds, now)) ===
        'unknown',
    ),
  ).length;
  return `${count} of ${rows.length} tracked campgrounds have openings each night${unknown ? ` · ${unknown} not fully checked` : ''}`;
}
export function distance(row: CampingPlace, coords: Coords | null): number {
  return coords && row.location ? milesBetween(coords, row.location) : Infinity;
}
export function sortCamping<T extends CampingPlace>(
  rows: T[],
  coords: Coords | null,
  saved: ReadonlySet<string> = new Set(),
): T[] {
  return [...rows].sort((a, b) => {
    if (coords) {
      const da = distance(a, coords),
        db = distance(b, coords);
      if (da !== db) return da < db ? -1 : 1;
    } else {
      const priority =
        Number(b.riverSlugs.some((r) => saved.has(r))) -
        Number(a.riverSlugs.some((r) => saved.has(r)));
      if (priority) return priority;
      const group = a.displayGroup.label.localeCompare(b.displayGroup.label);
      if (group) return group;
    }
    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
}
export function todayCampgrounds(
  rows: TrackedCampground[],
  coords: Coords | null,
  saved: ReadonlySet<string>,
) {
  const near = coords ? rows.filter((r) => distance(r, coords) <= 120) : [];
  const favorites = rows.filter((r) => r.riverSlugs.some((s) => saved.has(s)));
  const scope = near.length ? near : favorites.length ? favorites : rows;
  return {
    title: near.length
      ? 'Camping near you'
      : favorites.length
        ? 'Camping on saved rivers'
        : 'Camping this weekend',
    rows: sortCamping(scope, near.length ? coords : null, saved),
  };
}
export function campingSections(
  rows: TrackedCampground[],
  coords: Coords | null,
  saved: ReadonlySet<string>,
) {
  const groups = new Map<
    string,
    { title: string; data: TrackedCampground[] }
  >();
  for (const row of sortCamping(rows, coords, saved)) {
    const key = row.displayGroup.key;
    if (!groups.has(key))
      groups.set(key, { title: row.displayGroup.label, data: [] });
    groups.get(key)!.data.push(row);
  }
  return [...groups.values()];
}
export function safeExternalUrl(raw: string | null | undefined): string | null {
  try {
    const u = new URL(raw ?? '');
    return u.protocol === 'https:' && !u.username && !u.password
      ? u.toString()
      : null;
  } catch {
    return null;
  }
}

/** Roll cached catalogs to destination-local tonight; newly uncovered nights remain unknown. */
export function currentOverview(
  data: CampingOverview,
  now: number,
): CampingOverview {
  if (data.horizon.startDate === campingDate(now)) return data;
  const horizon = resolveHorizon(new Date(now)),
    weekend = resolveWeekend(new Date(now));
  return {
    ...data,
    horizon: {
      startDate: horizon.startDate,
      endDateExclusive: horizon.endDate,
      nights: horizon.nights,
    },
    weekend: {
      startDate: weekend.startDate,
      endDateExclusive: weekend.endDate,
      nights: weekend.nights,
      label: weekend.label,
    },
  };
}
