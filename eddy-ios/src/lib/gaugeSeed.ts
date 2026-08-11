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
import { hasLadder } from '@eddy/conditions/condition-ladder';

export interface GaugeSeed {
  /** gauge_stations.id, when the source knew it. Stars are keyed on this. */
  id: string | null;
  siteId: string;
  /**
   * Which flow provider backs this station: 'usgs', 'nws', 'usace'.
   *
   * Load-bearing for anything provider-specific, and the gauge screen has three
   * such things — the "USGS <id>" caption, the waterdata.usgs.gov link, and the
   * flow-band vocabulary. A USACE dam release is none of those: its id is a
   * slug, it has no USGS page, and UsaceProvider deliberately publishes no
   * percentile because one on a regulated release would mislead.
   *
   * NULL means "this source did not say", not "usgs" — the same posture
   * `curated` takes below, and for the same reason. Older search deployments
   * and the star store carry no provider, and Clearwater Dam is reachable
   * through both, so defaulting them to 'usgs' would flash
   * "USGS swl-clearwater-dam" for the one frame before the detail fetch
   * corrects it. A screen that does not know must print nothing rather than
   * guess — or, when the id is a USGS site number and therefore says nothing
   * about a publisher on its own, print the number. See shared/station-caption.
   *
   * This is the WIRE null, and it is not the database's: a null provider COLUMN
   * is a legacy row and the server resolves it to 'usgs' before answering. Only
   * an absent field is unknown.
   */
  provider: string | null;
  /**
   * The station's own page on the operator's site, from the detail fetch.
   *
   * Null for a provider that has none — UsaceProvider returns null on purpose,
   * because a CWMS timeseries has no public landing page. Only the detail route
   * sends it; list seeds carry null and gain it when the fetch lands.
   */
  publicUrl: string | null;
  /**
   * The station's own prose about what its reading means, from the detail fetch
   * (gauge_stations.threshold_descriptions.note).
   *
   * The only vocabulary a USACE dam release has: it gets no ladder verdict and
   * no flow band, so without this the screen has nothing true to say about the
   * number it is displaying.
   */
  stationNote: string | null;
  name: string;
  /**
   * Eddy rates this station; it has a ladder and a condition, not a band.
   *
   * NULL MEANS THE SOURCE DID NOT SAY, and it is a third answer, not a soft
   * `false`. Same posture as `provider` above and for a sharper reason: this
   * field decides which of the app's two vocabularies the gauge screen speaks,
   * and the two make incompatible claims about the same water. See gaugeTier().
   */
  curated: boolean | null;
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
 * Returns NULL when the station has no site id. That USED TO describe a USACE
 * dam, whose id lives in `site_id_external` and arrived here as null — which is
 * what once took down the Search tab on a `.toLowerCase()`. It does not any
 * more: /api/gauges now sends `usgs_site_id ?? site_id_external`, so Clearwater
 * arrives as 'swl-clearwater-dam' and opens like any other station. The guard
 * stays for a station registered with neither column set; without a site id
 * there is no gauge screen to open, and the caller must not offer one.
 */
export function seedFromMapGauge(gauge: MapGauge): GaugeSeed | null {
  if (!gauge.usgsSiteId) return null;
  return {
    id: gauge.id,
    siteId: gauge.usgsSiteId,
    // A floor for a payload cached before this field existed, NOT the "absent
    // means unknown" rule the seed's `provider` doc states. /api/gauges has
    // always sent a provider for every station it returns, Clearwater included,
    // so nothing reaching here is genuinely unknown — which is what makes this
    // the right seed for the Search tab's rated rows, where the local record is
    // authoritative even when an older search backend sends no provenance.
    provider: gauge.provider ?? 'usgs',
    // No list endpoint sends it; the detail fetch fills it in.
    publicUrl: null,
    stationNote: null,
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
    // The national tier is USGS reference gauges by construction.
    provider: 'usgs',
    // No list endpoint sends it; the detail fetch fills it in.
    publicUrl: null,
    stationNote: null,
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
    // Optional for compatibility with the 1.0 backend. Unknown stays unknown;
    // a USACE slug must never be guessed to be a USGS station.
    provider: result.provider ?? null,
    // No list endpoint sends it; the detail fetch fills it in.
    publicUrl: null,
    stationNote: null,
    name: result.name,
    // NULL, not false. A search row that carries no reading says nothing about
    // the tier, and `?? false` turned that silence into "reference gauge" —
    // which is a claim, and on a rated Eddy river it is the wrong one. See
    // gaugeTier() for what the screen does with the honest answer.
    curated: reading?.curated ?? null,
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
 * `curated: null` is a statement about what this seed KNOWS, not about the
 * station: the store does not record the tier.
 *
 * It used to be `false`, on the reasoning that the reference vocabulary "claims
 * less" while the detail fetch is in flight. It does not. "No comparison", and
 * the sentence under it — "No historical comparison published for this gauge" —
 * are a positive statement that this station has no history to compare against,
 * printed under a station Eddy has rated for years. Claiming less than a
 * verdict is not the same as claiming nothing, and the frame this occupies is
 * the one somebody is looking at while the screen loads.
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
  /** Optional across stars created or synced before 1.1. */
  provider?: string | null;
}): GaugeSeed | null {
  if (!star.usgsSiteId) return null;
  return {
    id: star.entityId,
    siteId: star.usgsSiteId,
    // Older star records do not carry it; unknown stays unknown.
    provider: star.provider ?? null,
    // No list endpoint sends it; the detail fetch fills it in.
    publicUrl: null,
    stationNote: null,
    name: star.name,
    curated: null,
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

/**
 * Which vocabulary the screen may speak about this station yet.
 *
 * ── The bug this ends ──────────────────────────────────────────────────────
 *
 * The gauge screen has two ways of describing a number and they contradict each
 * other by design: a RATED station gets a ladder and a verdict ("Floatable"),
 * and a REFERENCE station gets a comparison to its own history ("Much lower
 * than usual") or, having none, "No comparison" and the sentence "No historical
 * comparison published for this gauge".
 *
 * The screen chose between them by asking whether the seed carried a ladder —
 * and three of the five seeds cannot carry one. Search results, starred rows
 * and the national tier all arrive with `thresholds: null` because no list
 * endpoint sends ladders, not because the station has none. So opening a rated
 * Eddy gauge from search painted the reference tier's answer, in full
 * confidence, until /api/gauges/[siteId] landed a moment later and replaced it.
 *
 * That is worse than a spinner. A spinner says the screen does not know yet;
 * "No historical comparison published for this gauge" says it asked and there
 * is none. Reported from the field on the Eleven Point near Bardley, which is
 * rated, has a ladder, and read as an unrated creek for the first frame.
 *
 * ── The three answers ──────────────────────────────────────────────────────
 *
 *   rated      A ladder is present and usable. Verdict vocabulary.
 *   reference  Known not to be curated, or carrying ladders with none usable.
 *              Flow-band vocabulary.
 *   unknown    No ladders on the wire AND no statement about the tier. The
 *              screen must say neither thing — see app/gauge/[siteId].tsx.
 *
 * Pure and total, so the web suite can hold it to this; the Expo app has no
 * test runner of its own.
 */
export type GaugeTier = 'rated' | 'reference' | 'unknown';

export function gaugeTier(seed: GaugeSeed): GaugeTier {
  // FIND-PRIMARY, matching the screen and gaugeLink() everywhere else: a
  // station that rates two rivers must be graded on the one it is primary for.
  const link = seed.thresholds?.find((l) => l.isPrimary) ?? seed.thresholds?.[0] ?? null;
  if (link && hasLadder(link)) return 'rated';
  // Ladders were on the wire and none of them is a ladder. That is an answer:
  // the source that carries ladders carried this station's, and it has none.
  if (seed.thresholds != null) return 'reference';
  // No ladders, but the source stated the tier outright. The national tier says
  // `curated: false` and means it — those stations get their band immediately,
  // with the percentile the lite seed already carries.
  if (seed.curated === false) return 'reference';
  return 'unknown';
}

/** The fetched record, so a revisit within the session paints from the fuller one. */
export function seedFromDetail(gauge: GaugeDetail): GaugeSeed {
  return {
    id: gauge.id,
    siteId: gauge.siteId,
    provider: gauge.provider,
    publicUrl: gauge.publicUrl,
    stationNote: gauge.stationNote ?? null,
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
