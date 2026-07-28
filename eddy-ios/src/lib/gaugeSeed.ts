// eddy-ios/src/lib/gaugeSeed.ts
// What the gauge screen paints with before its own request lands.
//
// ── The problem this solves ────────────────────────────────────────────────
// Every route into the gauge screen comes from a surface that is ALREADY
// showing that gauge's reading. A map callout has it. A starred row has it. A
// search result has it. Then the screen opens, holds nothing, and spins for a
// number that was on the previous screen a frame ago.
//
// So the tapping surface hands it over. The screen renders immediately from the
// seed, fires /api/gauges/[siteId] behind it, and swaps in the fuller record
// when it arrives — the ladder, the percentile, the qualifier note, all the
// things a map pin does not carry.
//
// ── Why a module, not a context ────────────────────────────────────────────
// This is a handoff, not state. Nothing re-renders when it changes, nothing
// subscribes to it, and its entire lifetime is the gap between a tap and a
// fetch. A provider around the whole app to carry a value across one navigation
// would be plumbing that outlives the thing it plumbs.
//
// It is bounded and it is allowed to miss. A deep link into the app has no
// seed and the screen simply loads the ordinary way, which is the same path
// this takes when the cache has been evicted — so the no-seed case is the one
// that gets exercised, not a rare branch.
//
// ── Why the seed is not just MapGauge ──────────────────────────────────────
// Because the three sources are three different shapes: MapGauge (curated, with
// a ladder), MapGaugeLite (national, with a percentile and no ladder) and a
// SearchResult's nested reading. Normalising here means the screen branches on
// `curated` — the real distinction — rather than on which list the object fell
// out of.

import type {
  GaugeDetail,
  GaugeDetailThreshold,
  GaugeFloodStages,
  MapGauge,
  MapGaugeLite,
  SearchResult,
} from '@eddy/types';

export interface GaugeSeed {
  /** gauge_stations.id, when the source knew it. Stars are keyed on this. */
  id: string | null;
  siteId: string;
  name: string;
  /** Eddy rates this station; it has a ladder and a condition, not a band. */
  curated: boolean;
  coordinates: { lng: number; lat: number } | null;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  readingTimestamp: string | null;
  readingAgeHours: number | null;
  readingSuspect: boolean;
  qualifierNote: string | null;
  flowPercentile: number | null;
  thresholds: GaugeDetailThreshold[] | null;
  /**
   * NWS stages, which ONLY the detail fetch carries.
   *
   * No list endpoint sends them — not /api/gauges, not the viewport route, not
   * search — so every seed built from a tapped pin has null here and the screen
   * gains the flood lines a moment later when its own request lands. That is the
   * right trade: seeding exists to put a READING on the first frame, and a
   * threshold that appears a beat later is not a threshold anyone missed.
   */
  floodStages: GaugeFloodStages | null;
}

/**
 * A handful of stations. Somebody who taps twenty gauges in a session is
 * navigating, not accumulating, and the twenty-first eviction costs one request
 * on a screen that was going to make one anyway.
 */
const CACHE_SIZE = 12;

const cache = new Map<string, GaugeSeed>();

export function rememberGauge(seed: GaugeSeed | null): void {
  if (!seed) return;
  // Delete-then-set so a re-tap moves the entry to the young end; Map preserves
  // insertion order, which is the whole eviction policy.
  cache.delete(seed.siteId);
  cache.set(seed.siteId, seed);
  if (cache.size > CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

export function recallGauge(siteId: string | null | undefined): GaugeSeed | null {
  if (!siteId) return null;
  return cache.get(siteId) ?? null;
}

/**
 * A curated gauge, from /api/gauges.
 *
 * Returns NULL when the station has no site id. That is not hypothetical — a
 * USACE dam keeps its id in a different column and arrives here as null, which
 * is what once took down the Search tab on a `.toLowerCase()`. Without a site id
 * there is no gauge screen to open, and the caller must not offer one.
 */
export function seedFromMapGauge(gauge: MapGauge): GaugeSeed | null {
  if (!gauge.usgsSiteId) return null;
  return {
    id: gauge.id,
    siteId: gauge.usgsSiteId,
    name: gauge.name,
    curated: true,
    coordinates: gauge.coordinates,
    gaugeHeightFt: gauge.gaugeHeightFt,
    dischargeCfs: gauge.dischargeCfs,
    readingTimestamp: gauge.readingTimestamp,
    readingAgeHours: gauge.readingAgeHours,
    readingSuspect: gauge.readingSuspect,
    qualifierNote: gauge.qualifierNote,
    // Not on the wire for a curated gauge: /api/gauges answers with the ladder
    // instead, which is the stronger statement. The detail fetch fills it.
    flowPercentile: null,
    thresholds: gauge.thresholds ?? null,
    floodStages: null,
  };
}

/** A reference gauge, from /api/gauges/map. No ladder, by definition. */
export function seedFromMapGaugeLite(gauge: MapGaugeLite): GaugeSeed {
  return {
    id: gauge.id,
    siteId: gauge.siteId,
    name: gauge.name,
    curated: gauge.curated,
    coordinates: gauge.coordinates,
    gaugeHeightFt: gauge.gaugeHeightFt,
    dischargeCfs: gauge.dischargeCfs,
    readingTimestamp: gauge.readingTimestamp,
    readingAgeHours: gauge.readingAgeHours,
    readingSuspect: gauge.readingSuspect,
    qualifierNote: null,
    flowPercentile: gauge.flowPercentile,
    thresholds: null,
    floodStages: null,
  };
}

/**
 * A gauge result from /api/search.
 *
 * Null when the row carries no site id — older deployments of the endpoint do
 * not send one, and the field is optional for exactly that reason. A result
 * without one can still be shown; it just cannot be opened.
 */
export function seedFromSearchResult(result: SearchResult): GaugeSeed | null {
  if (result.kind !== 'gauge' || !result.siteId) return null;
  const reading = result.gauge ?? null;
  return {
    id: result.id,
    siteId: result.siteId,
    name: result.name,
    curated: reading?.curated ?? false,
    coordinates: result.coordinates,
    gaugeHeightFt: reading?.gaugeHeightFt ?? null,
    dischargeCfs: reading?.dischargeCfs ?? null,
    readingTimestamp: reading?.readingTimestamp ?? null,
    readingAgeHours: reading?.readingAgeHours ?? null,
    // The search row says nothing about qualifiers, and "no note" and "clean
    // reading" must not be conflated — false here would claim the second.
    readingSuspect: false,
    qualifierNote: null,
    flowPercentile: reading?.flowPercentile ?? null,
    thresholds: null,
    floodStages: null,
  };
}

/**
 * A starred gauge, from the local store and nothing else.
 *
 * The thinnest seed there is: the store keeps an id, a name, a slug and a site
 * id, and no reading at all. It exists for the case /api/gauges cannot cover —
 * a starred NATIONAL station, which that endpoint has never returned, so the
 * Favorites row has no MapGauge to build from and the screen would otherwise
 * open on a spinner with no name on it.
 *
 * `curated: false` is a statement about what this seed KNOWS, not about the
 * station: the store does not record the tier. The detail fetch corrects it a
 * moment later, and until then the screen shows the reference vocabulary, which
 * is the one that claims less.
 */
export function seedFromStar(star: {
  entityId: string;
  name: string;
  /**
   * OPTIONAL as well as nullable, matching StarredItem. Stars written by builds
   * that predate the field carry no site id at all, and those are the same
   * "cannot be opened" case as a station that has none.
   */
  usgsSiteId?: string | null;
}): GaugeSeed | null {
  if (!star.usgsSiteId) return null;
  return {
    id: star.entityId,
    siteId: star.usgsSiteId,
    name: star.name,
    curated: false,
    coordinates: null,
    gaugeHeightFt: null,
    dischargeCfs: null,
    readingTimestamp: null,
    readingAgeHours: null,
    readingSuspect: false,
    qualifierNote: null,
    flowPercentile: null,
    thresholds: null,
    floodStages: null,
  };
}

/** The fetched record, so a revisit within the session paints from the fuller one. */
export function seedFromDetail(gauge: GaugeDetail): GaugeSeed {
  return {
    id: gauge.id,
    siteId: gauge.siteId,
    name: gauge.name,
    curated: gauge.curated,
    coordinates: gauge.coordinates,
    gaugeHeightFt: gauge.gaugeHeightFt,
    dischargeCfs: gauge.dischargeCfs,
    readingTimestamp: gauge.readingTimestamp,
    readingAgeHours: gauge.readingAgeHours,
    readingSuspect: gauge.readingSuspect,
    qualifierNote: gauge.qualifierNote,
    flowPercentile: gauge.flowPercentile,
    thresholds: gauge.thresholds,
    floodStages: gauge.floodStages,
  };
}
