// src/lib/coverage.ts
// The canonical answer to "how much does Eddy cover?"
//
// ── Why this exists ─────────────────────────────────────────────────────────
//
// Coverage numbers used to be written down in whatever surface needed one. The
// About page said 8 rivers, its own FAQ schema said 8 rivers, a landing card
// said 8 rivers, and production had 24 — because the copy was typed once, in
// 2024, and rivers kept being onboarded after it. A hardcoded count does not
// stay wrong quietly: it ships to Google as FAQ structured data, and it is the
// first thing a competitive teardown quotes back at you.
//
// So no count in this codebase is a literal. Every number below is DERIVED from
// production at request time, which makes "the roster changed" a non-event
// instead of a docs chore. Onboard a river and the About page, the landing
// card, the coverage page and /api/coverage all move together.
//
// ── The vocabulary ──────────────────────────────────────────────────────────
//
// Eddy covers water at two very different depths, and collapsing them into one
// number is how the marketing claim and the engineering claim end up
// contradicting each other. They are named separately here and everywhere else:
//
//   CURATED RIVER   A river Eddy has researched. It has a float-condition
//                   ladder calibrated against outfitter/NPS guidance, access
//                   points placed and verified against official sources,
//                   hazards, float-time estimates, and shuttle logistics.
//                   Eddy makes RECOMMENDATIONS here. `rivers.active = true`.
//
//   RATED GAUGE     A gauge wired to a curated river AND carrying a floatability
//                   ladder, so it can produce a recreational verdict
//                   ("Flowing — ideal") rather than a bare number. A curated
//                   river can have several: one per reach.
//
//   REFERENCE GAUGE Every other live USGS station Eddy ingests — nationwide,
//                   not just the Ozarks. Eddy shows the MEASUREMENT and the
//                   forecast, and deliberately offers no float verdict, because
//                   nobody has researched what "good" means on that water.
//                   `gauge_stations.active AND NOT curated`.
//
// The distinction is a safety property before it is a marketing one. A verdict
// on an unresearched river would be a guess wearing the same badge as a
// researched one, and the badge is what people launch on.
//
// ── Why counts and not a cached table ───────────────────────────────────────
//
// These are `head: true` counts: PostgREST returns the number in a header and
// no rows cross the wire, so asking for all seven costs one round trip each
// against indexed columns and nothing is materialized. A nightly-refreshed
// stats table would add a way for the number to be stale, which is the exact
// failure this module exists to end.

import { createAdminClient } from '@/lib/supabase/admin';
import { riverPath } from '@/lib/navigation/river-path';

/**
 * A count that could not be established reads `null`, never `0`.
 *
 * Zero is a real answer ("no hazards recorded on any active river") and a
 * database blip must not be able to impersonate it. Callers render null as
 * absence — the sentence omits the figure — rather than printing "0 rivers",
 * which is the one output worse than saying nothing.
 */
export type CoverageCount = number | null;

export interface CoverageCounts {
  /** Rivers with researched logistics and a float verdict. `rivers.active`. */
  curatedRivers: CoverageCount;
  /** Gauges on curated rivers carrying a floatability ladder. */
  ratedGauges: CoverageCount;
  /** Live USGS stations Eddy ingests nationwide with no float verdict. */
  referenceGauges: CoverageCount;
  /** Put-ins and take-outs that are approved AND public. */
  accessPoints: CoverageCount;
  /** Recorded hazards on curated rivers. */
  hazards: CoverageCount;
  /** NPS campgrounds synced from the NPS API, plus private campgrounds. */
  campgrounds: CoverageCount;
  /** Outfitters, campgrounds and cabins/lodges, excluding closed businesses. */
  services: CoverageCount;
}

export interface CuratedRiver {
  name: string;
  slug: string;
  /** Two-letter code. Curated rivers span more than one state. */
  state: string;
  /**
   * Canonical river page path, built with `riverPath` rather than by the
   * caller. The hierarchy is `/rivers/missouri/current` — a full state slug,
   * not the two-letter code — and a page interpolating `state.toLowerCase()`
   * would emit `/rivers/mo/current`, which only survives as a 301. Anything
   * feeding crawlers is supposed to link canonically the first time.
   */
  path: string;
}

/**
 * Cache TTL.
 *
 * Coverage changes when a river is onboarded or a gauge is rated — events
 * measured in weeks. Five minutes is not about freshness, it is about not
 * issuing seven counts per render on a page that several surfaces embed.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

let countsCache: { value: CoverageCounts; loadedAt: number } | null = null;
let riversCache: { value: CuratedRiver[]; loadedAt: number } | null = null;

type Client = ReturnType<typeof createAdminClient>;

/**
 * Every figure unavailable. Returned when the database cannot be reached at all,
 * and deliberately NOT cached — a blip must not pin the page to blanks for the
 * next five minutes when the following request would have succeeded.
 */
const ALL_UNKNOWN: CoverageCounts = {
  curatedRivers: null,
  ratedGauges: null,
  referenceGauges: null,
  accessPoints: null,
  hazards: null,
  campgrounds: null,
  services: null,
};

/**
 * One `head: true` count, with failure isolated to the single field.
 *
 * Isolation matters: seven counts behind one try/catch means a permissions
 * change on `river_hazards` blanks the river count too, and the page then
 * understates coverage for a reason that has nothing to do with rivers.
 */
async function countOf(
  label: string,
  run: () => PromiseLike<{ count: number | null; error: unknown }>,
): Promise<CoverageCount> {
  try {
    const { count, error } = await run();
    if (error) throw error;
    return count ?? null;
  } catch (error) {
    console.error(`[coverage] ${label} count failed:`, error);
    return null;
  }
}

/**
 * Campgrounds come from two tables and are reported as one number.
 *
 * `nps_campgrounds` is synced from the NPS API for park rivers; private
 * campgrounds live in `nearby_services`. A visitor asking "how many campgrounds
 * does Eddy know about" is not asking who operates them, so the sum is the
 * honest answer — but it is a SUM, and if either half fails the total would be
 * a confident undercount. Hence: either half null ⇒ the whole figure is null.
 */
async function countCampgrounds(supabase: Client): Promise<CoverageCount> {
  const [nps, priv] = await Promise.all([
    countOf('campgrounds.nps', () =>
      supabase.from('nps_campgrounds').select('*', { count: 'exact', head: true }),
    ),
    countOf('campgrounds.private', () =>
      supabase
        .from('nearby_services')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'campground')
        .neq('status', 'permanently_closed'),
    ),
  ]);

  if (nps === null || priv === null) return null;
  return nps + priv;
}

/**
 * Live coverage counts, cached briefly.
 *
 * Never throws. A surface that asks for coverage is decorating a page it must
 * render anyway, so this degrades field by field to null rather than failing.
 */
export async function getCoverageCounts(): Promise<CoverageCounts> {
  if (countsCache && Date.now() - countsCache.loadedAt < CACHE_TTL_MS) {
    return countsCache.value;
  }

  // Constructing the client is itself a throwing operation — it rejects missing
  // service-role credentials — and it happens BEFORE any per-count try/catch.
  // Left unguarded it would break the "never throws" contract in exactly the
  // situation the contract is for: a prerender with no env, which would fail the
  // build rather than render a page with the figures omitted.
  let supabase: Client;
  try {
    supabase = createAdminClient();
  } catch (error) {
    console.error('[coverage] admin client unavailable:', error);
    return ALL_UNKNOWN;
  }

  const [
    curatedRivers,
    ratedGauges,
    referenceGauges,
    accessPoints,
    hazards,
    campgrounds,
    services,
  ] = await Promise.all([
    countOf('curatedRivers', () =>
      supabase.from('rivers').select('*', { count: 'exact', head: true }).eq('active', true),
    ),

    // `rivers!inner` makes the river's active flag a JOIN FILTER rather than an
    // embedded column, so an inactive river's rated gauges are excluded instead
    // of counted with a null river attached. A ladder is identified by
    // `level_optimal_min` — the anchor `computeCondition` needs before it can
    // return anything but `unknown`. Ladders missing only their top or bottom
    // rung still rate, and are tracked by validate_river_data(), not here.
    countOf('ratedGauges', () =>
      supabase
        .from('river_gauges')
        .select('*, rivers!inner(active)', { count: 'exact', head: true })
        .eq('rivers.active', true)
        .not('level_optimal_min', 'is', null),
    ),

    // NOT curated, so this never double-counts a rated gauge. `active` excludes
    // the discontinued stations kept on file for provenance — a station with no
    // real-time discharge since 2022 is not coverage.
    countOf('referenceGauges', () =>
      supabase
        .from('gauge_stations')
        .select('*', { count: 'exact', head: true })
        .eq('active', true)
        .eq('curated', false),
    ),

    // Both flags, because they mean different things: `approved` is "a human
    // verified this pin", `is_public` is "it may be shown". A pending pin is
    // real work that is not yet coverage, and must not be advertised as one.
    countOf('accessPoints', () =>
      supabase
        .from('access_points')
        .select('*', { count: 'exact', head: true })
        .eq('approved', true)
        .eq('is_public', true),
    ),

    countOf('hazards', () =>
      supabase
        .from('river_hazards')
        .select('*, rivers!inner(active)', { count: 'exact', head: true })
        .eq('rivers.active', true),
    ),

    countCampgrounds(supabase),

    // Closed businesses stay in the table so the outreach record survives, but
    // counting one as coverage would advertise a phone number that rings nowhere.
    countOf('services', () =>
      supabase
        .from('nearby_services')
        .select('*', { count: 'exact', head: true })
        .neq('status', 'permanently_closed'),
    ),
  ]);

  const value: CoverageCounts = {
    curatedRivers,
    ratedGauges,
    referenceGauges,
    accessPoints,
    hazards,
    campgrounds,
    services,
  };

  countsCache = { value, loadedAt: Date.now() };
  return value;
}

/**
 * The curated river roster — names, for rendering a list rather than a count.
 *
 * Deliberately NOT `getRivers()` from `@/lib/data/rivers`: that one fans out a
 * `get_river_condition` RPC per river to build the live conditions list. A page
 * printing a roster of names needs one query and no live water, and should not
 * pay two dozen round trips to render a static-feeling list.
 *
 * Ordered by name so the roster is stable between renders; a list that
 * reshuffles on every request reads as broken even when it is complete.
 */
export async function getCuratedRivers(): Promise<CuratedRiver[]> {
  if (riversCache && Date.now() - riversCache.loadedAt < CACHE_TTL_MS) {
    return riversCache.value;
  }

  try {
    const { data, error } = await createAdminClient()
      .from('rivers')
      .select('name, slug, state')
      .eq('active', true)
      .order('name', { ascending: true });

    if (error) throw error;

    const value: CuratedRiver[] = (data ?? []).map((row) => {
      const state = row.state || 'MO';
      return { name: row.name, slug: row.slug, state, path: riverPath(state, row.slug) };
    });

    riversCache = { value, loadedAt: Date.now() };
    return value;
  } catch (error) {
    console.error('[coverage] curated river roster failed:', error);
    // An empty roster renders as "no list", which callers already handle. The
    // previous cache is NOT served past its TTL: a stale roster is how the 8
    // rivers survived to 24, and this module exists to stop exactly that.
    return [];
  }
}

/**
 * The distinct states with curated rivers, e.g. `['AR', 'MO']`.
 *
 * Derived from the roster rather than counted separately, so it cannot disagree
 * with the list rendered beside it.
 */
export function curatedStates(rivers: CuratedRiver[]): string[] {
  return [...new Set(rivers.map((river) => river.state))].sort();
}

/** Test seam. Production callers rely on the TTL. */
export function __resetCoverageCacheForTests(): void {
  countsCache = null;
  riversCache = null;
}
