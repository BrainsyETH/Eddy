// src/lib/social/section-picker.ts
// Build a deterministic rotation of put-in → take-out float sections for the
// Float of the Day.
//
// Access points come from the DB `access_points` table, filtered to the SAME
// public + approved set the river planner shows (is_public AND approved). This
// is the single source of truth for endpoints, so the Float can never feature a
// private / unapproved access that isn't on the planner. Springs (features
// along the run) still come from the mile-marker JSON, which is on the same
// downstream-mile scale.

import mileMarkers from '../../../floatmissouri_mile_markers.json';

interface MileMarker {
  river_id: string;
  mile: number;
  description: string;
  feature_type: string | null;
  is_access_point: boolean;
  is_campground: boolean;
  has_spring: boolean;
  side: string | null;
}

/** A spring on the float, between the put-in and take-out. */
export interface RouteSpring {
  name: string;
  mile: number;
  side: string | null;
}

export interface Section {
  /** Slug used in eddy_updates / river_gauges (e.g. "current", "jacks-fork"). */
  riverSlug: string;
  /** Display name (e.g. "Current River"). */
  riverName: string;
  putInName: string;
  putInMile: number;
  takeOutName: string;
  takeOutMile: number;
  /** Distance in miles. */
  distanceMi: number;
  /** Rough float time in hours (2 mph canoe default; callers prefer the
   *  condition-aware canoeHours()). */
  hoursCanoe: number;
  putInDescription: string;
  takeOutDescription: string;
  /** Whether the put-in access point offers camping. */
  putInCamping: boolean;
  /** Whether the take-out access point offers camping. */
  takeOutCamping: boolean;
  /** Springs located on the run (between put-in and take-out). */
  springs: RouteSpring[];
}

interface AccessRow {
  name: string;
  mile: number;
  description: string | null;
  isCampground: boolean;
}

/** Longest float we'll ever offer as a "section" (caps the pair-building). */
const MAX_SECTION_MI = 12;

/** Mile-markers use "-river" / "-creek" / "-fork" suffixes; DB slugs don't. */
function normalizeSlug(markerId: string): string {
  return markerId.replace(/-river$/, '').replace(/-creek$/, '').replace(/-fork$/, '');
}

/** DB access-point names are already curated — just normalize whitespace. */
function cleanName(s: string): string {
  return (s || '').trim().replace(/\s+/g, ' ');
}

/** Spring descriptions read like "Welch Spring enters on the left." — keep the
 *  name, drop the "enters on …" clause and trailing punctuation. */
function cleanSpringName(desc: string): string {
  return desc
    .replace(/\s+enters?\b.*$/i, '')
    .replace(/\s+(on|enters?)\s+(the\s+)?(left|right)\b.*$/i, '')
    .replace(/\.?\s*$/, '')
    .trim();
}

// ---------------------------------------------------------------------------
// Springs from the mile-marker JSON, keyed by normalized slug.
// ---------------------------------------------------------------------------
let springsBySlug: Map<string, MileMarker[]> | null = null;
function getSpringsBySlug(): Map<string, MileMarker[]> {
  if (springsBySlug) return springsBySlug;
  const m = new Map<string, MileMarker[]>();
  for (const marker of mileMarkers as MileMarker[]) {
    if (marker.feature_type === 'spring' || marker.has_spring) {
      const slug = normalizeSlug(marker.river_id);
      const list = m.get(slug) || [];
      list.push(marker);
      m.set(slug, list);
    }
  }
  springsBySlug = m;
  return m;
}

/**
 * Build the full list of public + approved put-in → take-out sections across
 * every river, from the DB. Pairs every public+approved access point with each
 * downstream public+approved access point up to MAX_SECTION_MI — so a real
 * 5–9 mi float that skips a closely-spaced intermediate access is still
 * offered (consecutive-only would miss those). Queried fresh each call
 * (~hundreds of rows); no module cache, to avoid serverless staleness.
 */
export async function listAllSections(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<Section[]> {
  const { data, error } = await supabase
    .from('access_points')
    .select('name, river_mile_downstream, description, type, types, rivers!inner(slug, name)')
    .eq('is_public', true)
    .eq('approved', true)
    .not('river_mile_downstream', 'is', null);

  if (error || !data) {
    if (error) console.error('[SectionPicker] access_points query failed:', error.message);
    return [];
  }

  // Group access points by river slug.
  const byRiver = new Map<string, { name: string; access: AccessRow[] }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of data as any[]) {
    const slug: string | undefined = row.rivers?.slug;
    if (!slug) continue;
    const types: string[] = Array.isArray(row.types) ? row.types : [];
    // Endpoints must be reachable by car. Float camps (type campground /
    // float_camp with no 'access' marker) are river-access-only — you can't get
    // a car there to put in or take out — so they're excluded as endpoints.
    // We key off the access marker, not the name: "Boze Mill Float Camp" is
    // actually type 'access' and IS a valid take-out.
    const carAccessible =
      row.type === 'access' || types.includes('access') || types.includes('boat_ramp');
    if (!carAccessible) continue;
    const entry: { name: string; access: AccessRow[] } =
      byRiver.get(slug) || { name: row.rivers?.name || slug, access: [] };
    entry.access.push({
      name: cleanName(row.name),
      mile: Number(row.river_mile_downstream),
      description: row.description || null,
      isCampground: row.type === 'campground' || types.includes('campground'),
    });
    byRiver.set(slug, entry);
  }

  const springs = getSpringsBySlug();
  const sections: Section[] = [];
  for (const slug of Array.from(byRiver.keys()).sort()) {
    const { name: riverName, access } = byRiver.get(slug)!;
    const sorted = access.slice().sort((a, b) => a.mile - b.mile);
    const riverSprings = springs.get(slug) || [];

    for (let i = 0; i < sorted.length; i++) {
      const putIn = sorted[i];
      for (let j = i + 1; j < sorted.length; j++) {
        const takeOut = sorted[j];
        const distance = Math.round((takeOut.mile - putIn.mile) * 10) / 10;
        if (distance < 0.5) continue;
        if (distance > MAX_SECTION_MI) break; // sorted by mile — further j only grow
        const secSprings: RouteSpring[] = riverSprings
          .filter((s) => s.mile > putIn.mile && s.mile < takeOut.mile)
          .map((s) => ({ name: cleanSpringName(s.description), mile: s.mile, side: s.side }))
          .sort((a, b) => a.mile - b.mile);
        sections.push({
          riverSlug: slug,
          riverName,
          putInName: putIn.name,
          putInMile: putIn.mile,
          takeOutName: takeOut.name,
          takeOutMile: takeOut.mile,
          distanceMi: distance,
          hoursCanoe: Math.round((distance / 2) * 10) / 10,
          putInDescription: putIn.description || '',
          takeOutDescription: takeOut.description || '',
          putInCamping: putIn.isCampground,
          takeOutCamping: takeOut.isCampground,
          springs: secSprings,
        });
      }
    }
  }
  return sections;
}

/**
 * Day-since-1970 index. "Float of the Day" rotates the section daily and
 * deterministically (same answer all day, no DB pointer needed). Exported so
 * other daily rotations (e.g. Eddy's Favorite Floats) share the same clock.
 */
export function dayIndex(date = new Date()): number {
  return Math.floor(date.getTime() / (24 * 60 * 60 * 1000));
}

/**
 * Springs on a run between two miles, from the mile-marker JSON, cleaned and
 * sorted downstream. Shared by the access-point section builder above and the
 * favorite-floats picker (which builds sections straight from guide endpoints).
 */
export function springsForRun(
  riverSlug: string,
  putInMile: number,
  takeOutMile: number,
): RouteSpring[] {
  const lo = Math.min(putInMile, takeOutMile);
  const hi = Math.max(putInMile, takeOutMile);
  return (getSpringsBySlug().get(riverSlug) || [])
    .filter((s) => s.mile > lo && s.mile < hi)
    .map((s) => ({ name: cleanSpringName(s.description), mile: s.mile, side: s.side }))
    .sort((a, b) => a.mile - b.mile);
}

/**
 * Pick the section to feature for the given floatable rivers + distance window,
 * rotating deterministically by day. Returns null when nothing qualifies.
 */
export async function pickSectionForRivers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  riverSlugs: string[],
  opts: { minMi?: number; maxMi?: number } = {},
  date = new Date(),
): Promise<Section | null> {
  const { minMi = 0, maxMi = Infinity } = opts;
  const all = await listAllSections(supabase);
  const subset = all.filter(
    (s) => riverSlugs.includes(s.riverSlug) && s.distanceMi >= minMi && s.distanceMi <= maxMi,
  );
  if (subset.length === 0) return null;
  return subset[dayIndex(date) % subset.length];
}

/**
 * Find a specific section by river + endpoint miles — used by the cover image
 * so it renders the EXACT same section the reel did (rather than re-picking,
 * which could diverge). Returns null if no matching section exists.
 */
export async function findSection(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  riverSlug: string,
  putInMile: number,
  takeOutMile: number,
): Promise<Section | null> {
  const all = await listAllSections(supabase);
  return (
    all.find(
      (s) =>
        s.riverSlug === riverSlug &&
        Math.abs(s.putInMile - putInMile) < 0.05 &&
        Math.abs(s.takeOutMile - takeOutMile) < 0.05,
    ) || null
  );
}
