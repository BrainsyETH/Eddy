// src/lib/usgs/national-sites.ts
// Nationwide USGS stream sites, fetched by bounding box.
//
// This is src/lib/usgs/mo-sites.ts generalized from one Missouri box to the
// whole country. It exists because the by-site path cannot do this job:
// fetchLatestModern() in src/lib/flow-providers/usgs.ts joins every site id
// into the query string (`monitoring_location_id=USGS-a,USGS-b,…`), and at
// 16,500 sites that URL is ~200 KB and simply fails. bbox is the only shape of
// this query that scales.
//
// ── Why regions and not one national request ────────────────────────────────
// One national `00060` request is 14,090 features and 11.8 MB of JSON; adding
// `00065` is another 13,249 and ~11 MB. Parsing both at once is roughly
// 200-250 MB of live JS objects inside a 1024 MB Vercel lambda that is also
// holding a Supabase client and an upsert buffer. Regional chunks keep each
// parse at a few MB, and they give partial success for free: a bad response
// over the Southwest costs the Southwest, not the run.
//
// ── What this deliberately does NOT do ──────────────────────────────────────
// It never invents a gauge_stations row. Sites the caller has never seen are
// reported, not created — station creation belongs to the weekly metadata sync,
// so one malformed OGC response can never pollute the station table.

import {
  MODERN_BASE,
  PARAM_DISCHARGE,
  PARAM_GAGE_HEIGHT,
  foldOgcFeatures,
  fromLocationId,
  modernHeaders,
  type OgcFeature,
} from '@/lib/flow-providers/usgs';
import type { GaugeReading } from '@/lib/flow-providers/types';
import { stateCodeFromName } from '@/lib/navigation/states';

export type Bbox = [west: number, south: number, east: number, north: number];

/**
 * The country in ~12 boxes.
 *
 * Boundaries follow meridians rather than state lines because the OGC `bbox`
 * parameter takes a rectangle and nothing else — these are transfer chunks,
 * not geography. They overlap slightly at the seams; dedupe is by site id, so
 * an overlap costs a little bandwidth and never a duplicate row.
 *
 * Alaska is split at the antimeridian: a box whose west edge is greater than
 * its east edge is not a bbox, it is a bug, and the Aleutians cross 180°.
 */
export const US_REGIONS: Array<{ name: string; bbox: Bbox }> = [
  { name: 'pacific-northwest', bbox: [-125.0, 41.9, -110.0, 49.1] },
  { name: 'california-nevada', bbox: [-125.0, 32.4, -113.9, 42.1] },
  { name: 'southwest', bbox: [-115.0, 31.2, -102.0, 42.1] },
  { name: 'northern-plains', bbox: [-105.1, 40.9, -89.0, 49.1] },
  { name: 'southern-plains', bbox: [-107.0, 25.7, -94.3, 41.1] },
  { name: 'great-lakes', bbox: [-97.3, 40.9, -80.4, 49.5] },
  { name: 'ohio-valley', bbox: [-94.4, 35.9, -79.9, 41.1] },
  { name: 'southeast', bbox: [-94.4, 24.4, -75.4, 36.1] },
  { name: 'mid-atlantic', bbox: [-80.6, 36.4, -73.8, 42.6] },
  { name: 'northeast', bbox: [-74.2, 40.4, -66.8, 47.6] },
  { name: 'alaska', bbox: [-179.9, 51.0, -129.9, 71.5] },
  { name: 'alaska-aleutians', bbox: [172.0, 51.0, 179.9, 56.0] },
  { name: 'hawaii-pacific', bbox: [-160.3, 18.8, -154.7, 22.4] },
  { name: 'puerto-rico', bbox: [-67.3, 17.8, -64.5, 18.6] },
];

/**
 * Stream site types, applied server-side.
 *
 * 'ST' is a stream; the subtypes ST-CA (canal), ST-DCH (ditch) and ST-TS
 * (tidal) share the prefix and are deliberately NOT requested — a tidal
 * stage station is not a river reading, and asking the API for exactly what we
 * want is cheaper than downloading it and throwing it away.
 */
const STREAM_SITE_TYPES = ['ST'];

/**
 * Page size, and the page ceiling that stops a runaway cursor loop.
 *
 * NOT a result cap. An earlier version passed limit=10000 and treated the
 * response as complete, which silently truncated the Southeast (26,978 stream
 * sites) and the Great Lakes at exactly 10,000 — the tell was 4,117 live
 * gauges nationwide with no metadata row. The collection is cursor-paginated
 * and advertises `rel: next` when there is more; follow it instead of guessing
 * a number. MAX_PAGES only exists so a malformed cursor cannot spin forever.
 */
const PAGE_SIZE = 10000;
const MAX_PAGES = 20;

export interface NationalSiteMeta {
  siteId: string;
  name: string | null;
  lng: number | null;
  lat: number | null;
  stateCode: string | null;
  county: string | null;
  huc: string | null;
  siteTypeCode: string | null;
  agencyCode: string | null;
  drainageAreaSqMi: number | null;
}

export interface NationalSiteReading extends GaugeReading {
  /** From latest-continuous geometry — the coordinate fallback. */
  lng: number | null;
  lat: number | null;
}

interface OgcCollection {
  features?: OgcFeature[];
  links?: Array<{ rel?: string; href?: string }>;
}

/**
 * Every feature at `url`, following cursor pagination to the end.
 *
 * Never throws. Every caller is a bulk pass over a dozen regions, and one
 * region failing must degrade that region rather than the run — the posture
 * mo-sites.ts takes, for the same reason. A page that fails mid-walk returns
 * what was collected so far and logs; a partial region is worth more than none,
 * and the caller's upsert is idempotent so the next run repairs it.
 */
async function fetchAllFeatures(url: URL, revalidate: number): Promise<OgcFeature[]> {
  const out: OgcFeature[] = [];
  let next: string | null = url.toString();

  for (let page = 0; page < MAX_PAGES && next; page++) {
    let data: OgcCollection;
    try {
      const res = await fetch(next, { next: { revalidate }, headers: modernHeaders() });
      if (!res.ok) {
        console.warn(`[national-sites] ${url.pathname} page ${page} → ${res.status} ${res.statusText}`);
        return out;
      }
      data = (await res.json()) as OgcCollection;
    } catch (err) {
      console.warn(`[national-sites] ${url.pathname} page ${page} failed:`, err);
      return out;
    }

    for (const f of data.features ?? []) out.push(f);

    const link = data.links?.find((l) => l.rel === 'next')?.href;
    next = link && link !== next ? link : null;

    if (!next && (data.features?.length ?? 0) === PAGE_SIZE) {
      // A full page with no `next` is the truncation signature that cost us
      // 4,117 gauges. Loud, because it means the API's contract moved.
      console.warn(
        `[national-sites] ${url.pathname} returned a full page with no next link — results may be truncated`,
      );
    }
  }

  return out;
}

function coordsOf(feature: OgcFeature): { lng: number | null; lat: number | null } {
  const c = feature.geometry?.type === 'Point' ? feature.geometry.coordinates : null;
  const lng = typeof c?.[0] === 'number' ? c[0] : null;
  const lat = typeof c?.[1] === 'number' ? c[1] : null;
  // Null island is what an unparseable location looks like, not a location.
  if (lng === 0 && lat === 0) return { lng: null, lat: null };
  return { lng, lat };
}

function numOrNull(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
  return Number.isFinite(n) ? n : null;
}

/**
 * Station metadata for one region.
 *
 * Narrowed to USGS stream sites SERVER-SIDE: the collection supports
 * `agency_code` and `site_type_code` as query parameters (verified), so the
 * other agencies it carries — Arkansas Dept of Health among them — and every
 * well, spring, lake and tidal station never cross the wire. The filters are
 * re-asserted below anyway, because a silently-ignored query parameter would
 * otherwise import 1.5M non-stream sites without a single error.
 */
export async function fetchRegionSites(bbox: Bbox): Promise<NationalSiteMeta[]> {
  const url = new URL(`${MODERN_BASE}/monitoring-locations/items`);
  url.searchParams.set('f', 'json');
  url.searchParams.set('bbox', bbox.join(','));
  url.searchParams.set('agency_code', 'USGS');
  url.searchParams.set('site_type_code', STREAM_SITE_TYPES.join(','));
  url.searchParams.set('limit', String(PAGE_SIZE));

  // Station metadata changes on the order of years, not minutes.
  const features = await fetchAllFeatures(url, 86400);
  const out: NationalSiteMeta[] = [];

  for (const f of features) {
    const props = f.properties as Record<string, unknown> | null | undefined;
    if (!props) continue;

    const agency = typeof props.agency_code === 'string' ? props.agency_code : null;
    if (agency !== 'USGS') continue;

    const siteType = typeof props.site_type_code === 'string' ? props.site_type_code : null;
    if (!siteType || !STREAM_SITE_TYPES.includes(siteType)) continue;

    const siteId =
      typeof props.monitoring_location_number === 'string'
        ? props.monitoring_location_number
        : typeof f.id === 'string'
          ? fromLocationId(f.id)
          : null;
    if (!siteId) continue;

    const { lng, lat } = coordsOf(f);
    out.push({
      siteId,
      name: typeof props.monitoring_location_name === 'string' ? props.monitoring_location_name : null,
      lng,
      lat,
      // state_name is a display name ('Missouri') and state_code is FIPS ('29').
      // rivers.state is the postal code, so normalize to that or store nothing —
      // a column holding three different notations is worse than a null.
      stateCode: stateCodeFromName(
        typeof props.state_name === 'string' ? props.state_name : null,
      ),
      county: typeof props.county_name === 'string' ? props.county_name : null,
      huc: typeof props.hydrologic_unit_code === 'string' ? props.hydrologic_unit_code : null,
      siteTypeCode: siteType,
      agencyCode: agency,
      drainageAreaSqMi: numOrNull(props.drainage_area),
    });
  }

  return out;
}

/**
 * Latest readings for one region, folded per site.
 *
 * One request per parameter code rather than the comma-joined `00060,00065`
 * the by-site path uses: at region scale each parameter is its own multi-MB
 * response, and asking for both at once doubles peak memory for no fewer
 * round trips.
 *
 * The fold itself is foldOgcFeatures from the provider — the sentinel
 * rejection, the qualifier normalization and the timestamp rule are shared,
 * not re-implemented.
 */
export async function fetchRegionLatest(bbox: Bbox): Promise<NationalSiteReading[]> {
  const features: OgcFeature[] = [];
  const coords = new Map<string, { lng: number | null; lat: number | null }>();

  for (const param of [PARAM_DISCHARGE, PARAM_GAGE_HEIGHT]) {
    const url = new URL(`${MODERN_BASE}/latest-continuous/items`);
    url.searchParams.set('f', 'json');
    url.searchParams.set('bbox', bbox.join(','));
    url.searchParams.set('parameter_code', param);
    url.searchParams.set('limit', String(PAGE_SIZE));

    // 15 minutes: the cadence USGS publishes at, and the cadence the observatory
    // route already uses for its context sites.
    const pageFeatures = await fetchAllFeatures(url, 900);
    for (const f of pageFeatures) {
      const locId = f.properties?.monitoring_location_id;
      if (typeof locId !== 'string' || !locId.startsWith('USGS-')) continue;
      features.push(f);
      const siteId = fromLocationId(locId);
      if (!coords.has(siteId)) coords.set(siteId, coordsOf(f));
    }
  }

  const folded = foldOgcFeatures(features);
  const out: NationalSiteReading[] = [];
  for (const [siteId, reading] of folded) {
    // A row with neither number is not a reading. Folding keeps the site so a
    // caller can tell "reported nothing valid" from "was not in the response";
    // for ingest those are the same thing and neither is worth a write.
    if (reading.gaugeHeightFt === null && reading.dischargeCfs === null) continue;
    const c = coords.get(siteId) ?? { lng: null, lat: null };
    out.push({ ...reading, lng: c.lng, lat: c.lat });
  }

  return out;
}

/**
 * Station metadata for specific site ids, with failure kept separate from
 * absence.
 *
 * ── Why this exists next to fetchRegionSites rather than in its caller ───
 *
 * Same collection, different question: that one asks "what is in this box",
 * this one asks "what does USGS currently say about these particular sites".
 * Putting it here is the rule no-legacy-urls.test.ts enforces — the host and
 * the collection path are named in one place, so the next deprecation is a
 * single-file change rather than an archaeology exercise.
 *
 * ── Why it does NOT reuse fetchAllFeatures ──────────────────────────────
 *
 * That helper never throws, by design: its callers are bulk regional passes
 * where one bad region should degrade that region and not the run, and a
 * partial import is repaired by the next idempotent upsert.
 *
 * The opposite is required here. This feeds a trust check, and for a check
 * "USGS did not answer" and "USGS has no such record" are OPPOSITE facts that
 * a degrading fetch renders identical — the first silently becomes the second,
 * and the ledger files a notice about a station that is fine because a request
 * timed out. That is precisely the failure mode this subsystem was built to
 * catch, recorded twice in TRUST_LEDGER_V1_PLAN.md about the ledger's own first
 * day.
 *
 * So `unreached` carries the site ids whose batch failed. A caller may conclude
 * a site is absent ONLY if it appears in neither `found` nor `unreached`.
 */
export interface SiteMetadataLookup {
  found: Map<string, NationalSiteMeta>;
  /** Site ids whose request failed. NOT known to be absent — nothing was learned. */
  unreached: string[];
}

/**
 * How many sites go in one request.
 *
 * The filter is a comma-joined query parameter, so the ceiling is URL length
 * rather than anything USGS documents. Fifty keeps the URL near 900 characters
 * with room for the rest of the query, and the whole curated set is one request
 * at that size.
 */
const SITE_BATCH = 50;

/**
 * Headroom on `limit` above the batch size, and why it is not zero.
 *
 * The first version set `limit` to exactly the batch size, which is a
 * truncation bug waiting for its input: any batch that matches more features
 * than sites requested pushes the surplus onto a page this function never
 * reads, and the sites on that page come back as `found`-misses — which a
 * caller is entitled to read as "USGS has no such record". A silent absence
 * manufactured by pagination is the worst possible failure for this function.
 *
 * Filtering by the fully-qualified feature id makes a surplus unlikely, so this
 * is belt and braces; the truncation check below is the part that actually
 * refuses to guess.
 */
const LIMIT_HEADROOM = 4;

/** '07019000' → 'USGS-07019000'. The identity USGS actually keys on. */
function toUsgsFeatureId(siteId: string): string {
  return siteId.startsWith('USGS-') ? siteId : `USGS-${siteId}`;
}


// ── Classifying a response, as a pure function ──────────────────────────
//
// Both lookups below ask USGS about a batch of stations and must answer one
// question honestly before anything else: did we LEARN something about this
// batch, or not? For a trust check those are not degrees of the same thing.
// "USGS says this station has no flow record" is a high-severity finding.
// "The response was not usable" must produce silence.
//
// This lived inline in each fetch, and the two drifted immediately: the site
// lookup treated a 200-with-zero-features as unusable and the time-series
// lookup did not — written in the same commit, one guard apart. That gap meant
// a silently-changed filter or a degraded endpoint would set every station in
// the batch to "no series", and the check would file usgs_site_record_ended at
// high severity for all 43 wired gauges at once. A mass false decommission, out
// of a 200 OK.
//
// So the ladder is one implementation, applied by both, and it is pure — these
// semantics are the safety-critical part and they should be testable without
// standing up a fake network.

/** Why a batch produced nothing usable. */
export type BatchRefusal = 'empty_response' | 'limit_saturated' | 'no_batch_matches';

export type BatchOutcome<T> =
  | { reached: false; refusal: BatchRefusal }
  | { reached: true; data: T };

/**
 * The guard ladder. Returns a refusal, or null when the response is usable.
 *
 * - `empty_response`: 200 with no features at all. Indistinguishable from a
 *   filter USGS silently stopped honouring, and the production batch is known
 *   to contain live gauges — so "everything we asked about has no data" is far
 *   more likely to be a broken request than a true answer.
 * - `limit_saturated`: as many features as we allowed, so more may sit on a
 *   page nobody read. Every value derived from this batch is a possible
 *   under-estimate, and under-estimating here reads as "this station died".
 * - `no_batch_matches`: features came back, but not one of them is about a
 *   station we asked about. That is a filter doing something other than what
 *   the query said.
 *
 * What it deliberately does NOT do is refuse a PARTIAL match. A batch where
 * some stations answer and others do not is the normal shape of a real answer —
 * refusing it would make the rules unable to fire at all. The residual risk is
 * a filter that half-works; nothing in the response distinguishes that from
 * genuine absence, and the check carries a second, independent guard against
 * the mass case for exactly that reason.
 */
export function classifyBatchResponse(
  featureCount: number,
  limit: number,
  matchedSites: number,
): BatchRefusal | null {
  if (featureCount === 0) return 'empty_response';
  if (featureCount >= limit) return 'limit_saturated';
  if (matchedSites === 0) return 'no_batch_matches';
  return null;
}

/**
 * Pure: features from monitoring-locations → station metadata for this batch.
 *
 * Agency is re-asserted per feature rather than trusted from the query. A
 * silently-ignored parameter is how the region importer would have taken 1.5M
 * non-stream sites without a single error (see fetchRegionSites), and here the
 * filter is load-bearing for identity: a monitoring location is agency_code +
 * monitoring_location_number, so accepting another agency's row under the same
 * number would overwrite a USGS station's coordinates with someone else's.
 */
export function classifySiteMetadataResponse(
  batch: string[],
  features: OgcFeature[],
  limit: number,
): BatchOutcome<Map<string, NationalSiteMeta>> {
  const wanted = new Set(batch);
  const found = new Map<string, NationalSiteMeta>();

  for (const f of features) {
    const props = f.properties as Record<string, unknown> | null | undefined;
    if (!props) continue;

    const agency = typeof props.agency_code === 'string' ? props.agency_code : null;
    if (agency !== 'USGS') continue;

    const siteId =
      typeof props.monitoring_location_number === 'string'
        ? props.monitoring_location_number
        : typeof f.id === 'string'
          ? fromLocationId(f.id)
          : null;
    if (!siteId || !wanted.has(siteId)) continue;

    const { lng, lat } = coordsOf(f);
    found.set(siteId, {
      siteId,
      name:
        typeof props.monitoring_location_name === 'string'
          ? props.monitoring_location_name
          : null,
      lng,
      lat,
      stateCode: stateCodeFromName(typeof props.state_name === 'string' ? props.state_name : null),
      county: typeof props.county_name === 'string' ? props.county_name : null,
      huc: typeof props.hydrologic_unit_code === 'string' ? props.hydrologic_unit_code : null,
      siteTypeCode: typeof props.site_type_code === 'string' ? props.site_type_code : null,
      agencyCode: agency,
      drainageAreaSqMi: numOrNull(props.drainage_area),
    });
  }

  const refusal = classifyBatchResponse(features.length, limit, found.size);
  return refusal ? { reached: false, refusal } : { reached: true, data: found };
}

/**
 * Pure: features from time-series-metadata → newest series end per station.
 *
 * Every station in a REACHED batch gets an entry, defaulting to null, because
 * null is the answer "USGS publishes no discharge or gage-height series for
 * this station" and the caller needs to tell it from "not asked". That default
 * is only safe behind the ladder above — it is precisely what turned a
 * 200-with-no-features into 43 false findings before the ladder was shared.
 *
 * Scoped to `batch` rather than to an accumulating map: keying off a map that
 * grows across batches lets a feature in batch two overwrite a station answered
 * in batch one.
 */
export function classifyRecordEndsResponse(
  batch: string[],
  features: OgcFeature[],
  limit: number,
): BatchOutcome<Map<string, Date | null>> {
  const ends = new Map<string, Date | null>(batch.map((id) => [id, null]));
  const matched = new Set<string>();

  for (const f of features) {
    const props = f.properties as Record<string, unknown> | null | undefined;
    if (!props) continue;

    const locId = props.monitoring_location_id;
    if (typeof locId !== 'string') continue;
    const siteId = fromLocationId(locId);
    if (!ends.has(siteId)) continue;

    // A feature that is about a station we asked about COUNTS as a match even
    // if its `end` is unparseable. The alternative would let a response full of
    // malformed timestamps look like a filter failure and be refused, when what
    // it actually is — USGS answered, the values are junk — leaves every
    // station legitimately at null.
    matched.add(siteId);

    // `end` is the station's LOCAL wall-clock time. USGS keeps it only for
    // backwards compatibility; `end_utc` is the same observation with the
    // timezone made explicit. Reading `end` with `new Date()` made this check
    // depend on the server timezone and shifted every station outside UTC.
    // Prefer the field whose meaning survives deployment geography.
    const rawEnd = props.end_utc ?? props.end;
    if (typeof rawEnd !== 'string') continue;
    // A legacy response may omit end_utc. Keep that response usable and make
    // the fallback deterministic: a timezone-less ISO value is interpreted as
    // UTC rather than as whichever timezone happens to run the worker. The
    // fallback can be a few hours less precise than end_utc, but the check's
    // record-ended horizon is measured in days and the result no longer moves
    // between GitHub Actions, Vercel and a Chicago development machine.
    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(rawEnd);
    const parsed = new Date(hasTimezone ? rawEnd : `${rawEnd}Z`);
    if (Number.isNaN(parsed.getTime())) continue;

    const current = ends.get(siteId) ?? null;
    if (current === null || parsed.getTime() > current.getTime()) ends.set(siteId, parsed);
  }

  const refusal = classifyBatchResponse(features.length, limit, matched.size);
  return refusal ? { reached: false, refusal } : { reached: true, data: ends };
}

export async function fetchSitesByIds(siteIds: string[]): Promise<SiteMetadataLookup> {
  const found = new Map<string, NationalSiteMeta>();
  const unreached: string[] = [];

  // Duplicates would inflate the batch and produce a `found` map that already
  // deduplicates itself, so the count of requests would not match the input.
  const unique = [...new Set(siteIds.filter((id) => id && id.trim().length > 0))];

  for (let i = 0; i < unique.length; i += SITE_BATCH) {
    const batch = unique.slice(i, i + SITE_BATCH);
    const limit = batch.length + LIMIT_HEADROOM;
    const url = new URL(`${MODERN_BASE}/monitoring-locations/items`);
    url.searchParams.set('f', 'json');

    // ── Query the fully-qualified id, not the bare number ────────────────
    //
    // A monitoring location's identity is agency_code + monitoring_location_number,
    // and the collection's feature id is that pair as `USGS-07014000`. Querying
    // the bare number asks a question whose answer is not guaranteed unique:
    // another agency using the same number would come back too, and since
    // results were keyed by number alone, whichever arrived last would win —
    // silently replacing a USGS station's coordinates with someone else's.
    url.searchParams.set('id', batch.map(toUsgsFeatureId).join(','));
    url.searchParams.set('agency_code', 'USGS');
    url.searchParams.set('limit', String(limit));

    try {
      // Station metadata changes on the order of years. The same 24 hours
      // fetchRegionSites uses, for the same reason.
      const res = await fetch(url, { next: { revalidate: 86400 }, headers: modernHeaders() });
      if (!res.ok) {
        unreached.push(...batch);
        continue;
      }
      const data = (await res.json()) as OgcCollection;
      const outcome = classifySiteMetadataResponse(batch, data.features ?? [], limit);
      if (!outcome.reached) {
        unreached.push(...batch);
        continue;
      }
      for (const [siteId, meta] of outcome.data) found.set(siteId, meta);
    } catch {
      unreached.push(...batch);
    }
  }

  return { found, unreached };
}

/**
 * When each station's published record for the parameters Eddy reads last ended.
 *
 * ── Why this is a second request against a different collection ─────────
 *
 * Because monitoring-locations cannot answer the question. USGS KEEPS a
 * location record after telemetry stops — verified against three stations this
 * repository has already marked dead (06928900, 07014100 and 05497485, all
 * deactivated by 00153, and 00077's header says outright that 07014100 "exists
 * as a USGS monitoring location but has no data"): every one still returns a
 * full monitoring-location record today.
 *
 * So absence from that collection means the IDENTIFIER is unknown, which is a
 * real but different defect. Whether a station is still publishing lives in
 * time-series-metadata, in the `end` of its series.
 *
 * ── Scoped to 00060 and 00065 ───────────────────────────────────────────
 *
 * Discharge and gage height are what Eddy reads. A station still publishing
 * water temperature while its discharge series ended is, for this product,
 * not publishing — and asking for every parameter would return roughly ten
 * series per station instead of two.
 */
export interface SiteRecordEnds {
  /** Newest series end per site. A site present with `null` publishes no such series. */
  ends: Map<string, Date | null>;
  unreached: string[];
}

const RECORD_PARAMETERS = [PARAM_DISCHARGE, PARAM_GAGE_HEIGHT];

/**
 * Series per station for the two parameters, times the batch, plus headroom.
 *
 * A station typically has one Points, one Daily and one Water Year series per
 * parameter, so six is generous. classifyBatchResponse()'s saturation guard is
 * what makes an underestimate safe rather than silently wrong.
 */
const SERIES_PER_SITE = 6;

export async function fetchSiteRecordEnds(siteIds: string[]): Promise<SiteRecordEnds> {
  const ends = new Map<string, Date | null>();
  const unreached: string[] = [];
  const unique = [...new Set(siteIds.filter((id) => id && id.trim().length > 0))];

  for (let i = 0; i < unique.length; i += SITE_BATCH) {
    const batch = unique.slice(i, i + SITE_BATCH);
    const limit = batch.length * SERIES_PER_SITE * RECORD_PARAMETERS.length;
    const url = new URL(`${MODERN_BASE}/time-series-metadata/items`);
    url.searchParams.set('f', 'json');
    url.searchParams.set('monitoring_location_id', batch.map(toUsgsFeatureId).join(','));
    url.searchParams.set('parameter_code', RECORD_PARAMETERS.join(','));
    url.searchParams.set('limit', String(limit));

    try {
      // One hour. Unlike station metadata this moves continuously on a live
      // station, and the check reading it runs daily — a day-old answer would
      // put the freshness question a day behind the thing it is asking about.
      const res = await fetch(url, { next: { revalidate: 3600 }, headers: modernHeaders() });
      if (!res.ok) {
        unreached.push(...batch);
        continue;
      }
      const data = (await res.json()) as OgcCollection;
      const outcome = classifyRecordEndsResponse(batch, data.features ?? [], limit);
      if (!outcome.reached) {
        unreached.push(...batch);
        continue;
      }
      for (const [siteId, end] of outcome.data) ends.set(siteId, end);
    } catch {
      unreached.push(...batch);
      for (const id of batch) ends.delete(id);
    }
  }

  return { ends, unreached };
}
