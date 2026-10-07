import {
  HORIZON_NIGHTS,
  resolveHorizon,
  resolveWeekend,
} from '@eddy/conditions/camping-window';
import type {
  CampingOverview,
  CampingObservation,
  TrackedCampground,
  CampingPlace,
} from '@eddy/types';
import { milesBetween, type Coords } from '@eddy/geo';
import type { CampingSort } from './campingStay';
export type HeatMark =
  | 'open-1'
  | 'open-2'
  | 'open-3'
  | 'no-reservable'
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
  if (!n) return 'unknown';
  if (n.status === 'closed') return 'closed';
  if (n.status === 'not_yet_released') return 'nyr';
  if (n.status === 'full' && n.sitesReservable === 0) return 'no-reservable';
  if (n.status === 'full') return 'full';
  return n.sitesOpen < 3 ? 'open-1' : n.sitesOpen < 10 ? 'open-2' : 'open-3';
}
/** Exact openings for a green pill; other availability states keep their symbol. */
export function campingOpenCount(n?: CampingObservation): number | null {
  return n?.status === 'open' && n.sitesOpen > 0 ? n.sitesOpen : null;
}

/** A Today deep link carries its night through to the campground sheet. */
export function linkedCampingNight(overview: CampingOverview, night: unknown): string | undefined {
  return typeof night === 'string' && overview.horizon.nights.includes(night) ? night : undefined;
}
export function nightLine(n?: CampingObservation): string {
  const mark = cellMark(n);
  if (mark === 'unknown') return 'Not checked';
  if (mark === 'closed') return 'Closed for this night';
  if (mark === 'nyr') return 'Not yet released';
  if (mark === 'no-reservable') return 'No reservable sites';
  if (mark === 'full') return 'No reservable openings';
  return `${n!.sitesOpen} of ${n!.sitesReservable} reservable sites open`;
}
export function checkedLabel(at: string | null, now = Date.now()): string {
  const time = at ? Date.parse(at) : NaN;
  if (!Number.isFinite(time)) return 'Not updated';
  const today = campingDate(time) === campingDate(now);
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    ...(today
      ? { hour: 'numeric' as const, minute: '2-digit' as const }
      : { month: 'short' as const, day: 'numeric' as const }),
  }).format(new Date(time));
  return `Updated ${today ? 'at' : 'on'} ${label}`;
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
        : mark === 'no-reservable'
          ? 'no reservable sites'
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
  const horizon = resolveHorizon(
      new Date(now),
      data.horizon.nights.length || HORIZON_NIGHTS,
    ),
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

/**
 * Disjoint pages of about seven nights. A page never ends on a Friday whose
 * Saturday follows, so a weekend is always picked on one page. A horizon that
 * starts on Saturday would otherwise split Fri/Sat at the page break; the first
 * page ends Thursday instead and a one-night tail joins the last page (eight
 * nights) rather than becoming a third page.
 */
export function campingNightPages(nights: string[]): string[][] {
  const pages: string[][] = [];
  let start = 0;
  while (start < nights.length) {
    let end = Math.min(start + 7, nights.length);
    if (
      end < nights.length &&
      new Date(nights[end - 1] + 'T12:00:00Z').getUTCDay() === 5
    )
      end--;
    if (nights.length - end === 1) end = nights.length;
    pages.push(nights.slice(start, end));
    start = end;
  }
  return pages;
}

/** A compact footer describes only observations in the visible grid. */
export function campingFreshness(
  rows: TrackedCampground[],
  overview: CampingOverview,
  now: number,
): string {
  const dates = rows.flatMap((row) =>
    overview.horizon.nights.flatMap((date) => {
      const night = currentNight(
        row,
        date,
        overview.maxObservationAgeSeconds,
        now,
      );
      return night ? [Date.parse(night.checkedAt)] : [];
    }),
  );
  return dates.length
    ? checkedLabel(new Date(Math.min(...dates)).toISOString(), now)
    : 'Not updated';
}

export function campingRowNeedsUpdate(
  row: TrackedCampground,
  overview: CampingOverview,
  now: number,
): boolean {
  return !overview.horizon.nights.some((date) =>
    currentNight(row, date, overview.maxObservationAgeSeconds, now),
  );
}

export function filterCamping<T extends CampingPlace>(
  rows: T[],
  river: string | null,
  nearby: boolean,
  coords: Coords | null,
): T[] {
  return rows.filter(
    (row) =>
      (!river || row.riverSlugs.includes(river)) &&
      (!nearby || distance(row, coords) <= 120),
  );
}

/** Use the same planning night for every campground, regardless of its openings. */
export function initialCampingNight(overview: CampingOverview): string {
  return (
    overview.weekend.nights.find((date) =>
      overview.horizon.nights.includes(date),
    ) ?? overview.horizon.startDate
  );
}

export function campingRiverOptions(
  tracked: TrackedCampground[],
  places: CampingPlace[] = [],
): { slug: string; label: string }[] {
  const labels = new Map(
    [...places, ...tracked]
      .filter((row) => row.riverSlugs.includes(row.displayGroup.key))
      .map((row) => [row.displayGroup.key, row.displayGroup.label]),
  );
  return [...new Set(tracked.flatMap((row) => row.riverSlugs))]
    .filter((slug) => labels.has(slug))
    .map((slug) => ({ slug, label: labels.get(slug)! }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Trim only the unobserved tail; unknown dates inside the range remain explicit. */
export function observedCampingOverview(
  rows: TrackedCampground[],
  data: CampingOverview,
  now: number,
): CampingOverview {
  const nights = data.horizon.nights;
  let end = nights.length;
  while (
    end > 0 &&
    !rows.some((row) =>
      currentNight(row, nights[end - 1], data.maxObservationAgeSeconds, now),
    )
  )
    end--;
  const shown = nights.slice(0, end);
  const endDateExclusive = shown.length
    ? new Date(Date.parse(shown[shown.length - 1] + 'T12:00:00Z') + 86400000)
        .toISOString()
        .slice(0, 10)
    : data.horizon.startDate;
  return {
    ...data,
    horizon: { ...data.horizon, nights: shown, endDateExclusive },
  };
}
export function campingCoverageLabel(data: CampingOverview | null): string {
  const last = data?.horizon.nights.at(-1);
  return last
    ? `Through ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(last + 'T12:00:00Z'))}`
    : 'No recent availability';
}
export function campingRowSummary(
  row: TrackedCampground,
  data: CampingOverview,
  now: number,
): string {
  const afterWeekend = data.weekend.endDateExclusive;
  const next = data.horizon.nights.find((date) => {
    const night = currentNight(row, date, data.maxObservationAgeSeconds, now);
    return (
      date >= afterWeekend && night?.status === 'open' && night.sitesOpen > 0
    );
  });
  return `This weekend: ${weekendLine(row, data, now)}.${next ? ` Next observed opening: ${dateLabel(next)}.` : ''}`;
}

/** The API display group identifies the primary river; never duplicate multi-river parks. */
export function campingRiverGroups<T extends CampingPlace>(rows: T[]) {
  const groups = new Map<string, { key: string; title: string; data: T[] }>();
  for (const row of rows) {
    const key = row.riverSlugs.length ? row.displayGroup.key : 'other';
    if (!groups.has(key))
      groups.set(key, {
        key,
        title: key === 'other' ? 'Other campgrounds' : row.displayGroup.label,
        data: [],
      });
    groups.get(key)!.data.push(row);
  }
  return [...groups.values()]
    .sort((a, b) =>
      a.key === 'other'
        ? 1
        : b.key === 'other'
          ? -1
          : a.title.localeCompare(b.title),
    )
    .map((group) => ({
      ...group,
      data: group.data.sort(
        (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
      ),
    }));
}

/**
 * A campground's own coordinate is a real point, unlike a river's gauge, but
 * this is still a straight line, so "≈" and never a drive. Null when either end
 * is unknown: "we don't know" and "far away" are different claims.
 */
export function campingMilesLabel(row: CampingPlace, coords: Coords | null): string | null {
  const miles = distance(row, coords);
  if (!Number.isFinite(miles)) return null;
  return miles < 1 ? 'Under 1 mi' : `≈ ${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

/** Reservable openings summed over `nights`; unknown, booked and closed add nothing. */
export function campingOpenings(
  row: TrackedCampground,
  nights: string[],
  overview: CampingOverview,
  now: number,
): number {
  return nights.reduce(
    (sum, date) => sum + (campingOpenCount(currentNight(row, date, overview.maxObservationAgeSeconds, now)) ?? 0),
    0,
  );
}

/**
 * The row order for a sort, and whether river headings still describe it.
 * Only `name` keeps the river groups: a distance or openings order interleaves
 * rivers, and a heading above each run would claim a grouping that isn't there.
 * `nearest` without a fix falls back to river groups rather than to Infinity ties.
 */
export function orderCampingRows<T extends CampingPlace>(
  rows: T[],
  sort: CampingSort,
  coords: Coords | null,
  openings?: (row: T) => number,
): { rows: T[]; grouped: boolean } {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  if (sort === 'nearest' && coords) {
    return {
      rows: [...rows].sort((a, b) => {
        const da = distance(a, coords), db = distance(b, coords);
        return da === db ? byName(a, b) : da < db ? -1 : 1;
      }),
      grouped: false,
    };
  }
  if (sort === 'openings' && openings) {
    const counts = new Map(rows.map((row) => [row, openings(row)]));
    return {
      rows: [...rows].sort((a, b) => counts.get(b)! - counts.get(a)! || byName(a, b)),
      grouped: false,
    };
  }
  return { rows: campingRiverGroups(rows).flatMap((group) => group.data), grouped: true };
}

export const campingSortLabel: Record<CampingSort, string> = {
  name: 'By river',
  nearest: 'Nearest',
  openings: 'Most open',
};
