import {
  campingDemand,
  campingDemandRivers,
  type CampingDemand,
  type DemandBand,
} from '@eddy/conditions/camping-demand';
import { weekdayOf } from '@eddy/conditions/camping-window';
import type { CampingOverview } from '@eddy/types';

export const DEMAND_STRIP_NIGHTS = 7;
export const DEMAND_MAX_RIVERS = 4;

export interface DemandRow {
  slug: string;
  name: string;
  headline: CampingDemand;
  strip: CampingDemand[];
}

/** The weekend night the headline describes: Saturday when it is in the
 * window (the peak), otherwise the window's first night. */
export function demandNight(overview: CampingOverview): string | null {
  const nights = overview.weekend.nights;
  return nights.find((d) => weekdayOf(d) === 6) ?? nights[0] ?? null;
}

/** Saved rivers first, then the rest by name. Aggregates every tracked
 * campground, never the four rows the camping card happens to display. */
export function demandRows(
  overview: CampingOverview,
  saved: ReadonlySet<string>,
  now: number,
): { night: string; rows: DemandRow[] } | null {
  const night = demandNight(overview);
  if (!night) return null;
  const names = new Map<string, string>();
  for (const c of overview.tracked)
    for (const slug of c.riverSlugs)
      if (!names.has(slug) || c.displayGroup.key === slug)
        names.set(slug, c.displayGroup.key === slug ? c.displayGroup.label : slug);
  const rivers = campingDemandRivers(overview)
    .map((slug) => ({ slug, name: names.get(slug) ?? slug }))
    .sort(
      (a, b) =>
        Number(saved.has(b.slug)) - Number(saved.has(a.slug)) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, DEMAND_MAX_RIVERS);
  if (!rivers.length) return null;
  const stripNights = overview.horizon.nights.slice(0, DEMAND_STRIP_NIGHTS);
  return {
    night,
    rows: rivers.map(({ slug, name }) => ({
      slug,
      name,
      headline: campingDemand(overview, slug, night, now),
      strip: stripNights.map((d) => campingDemand(overview, slug, d, now)),
    })),
  };
}

/** "Sat night" — the date always means that night, not daytime traffic. */
export function demandNightLabel(date: string): string {
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekdayOf(date)];
  return `${day} night`;
}

/** Scale position, 0 (Quiet) to 4 (Packed); null when withheld. */
export function bandLevel(band: DemandBand | null): number | null {
  return band == null
    ? null
    : ['quiet', 'moderate', 'busy', 'crowded', 'packed'].indexOf(band);
}
