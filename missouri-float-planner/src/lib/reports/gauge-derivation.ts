// src/lib/reports/gauge-derivation.ts
//
// Works out what the river was doing when a River Visual photo was taken, at
// submit time, on the server.
//
// ── Why this is here and not in the client ─────────────────────────────────
// It used to be in the client, in exactly one client. The website's submit form
// resolves the reach gauge, calls /api/gauge-reading-at, and posts the numbers
// it got back; POST /api/reports then stores whatever it was handed and derives
// nothing. That worked for as long as the website was the only way in.
//
// The iOS sheet is the other way in, and it sends no gauge fields at all — its
// own header says "the server derives the level from the capture time", which
// was never true of any code. So every photo submitted from the phone landed
// with a null stage, a null flow and a null gauge station, and the review page
// showed a photo with no reading beside it. Deriving here fixes both clients at
// once and means a third one gets it for free.
//
// ── What a submitter says still wins ──────────────────────────────────────
// A reading somebody typed is a claim about what they saw on the staff gauge.
// It is merged per-field over the derived values and marks the row `manual`, so
// a moderator can weigh it — never silently replaced by the gauge's own number.

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchUsgsReadingAt, type UsgsTrendAt } from '@/lib/flow-providers/usgs-historical';

/** Where the photo sits relative to the gauge that supplied its reading. */
export type GaugeRelation = 'upstream' | 'downstream' | 'at';

/**
 * Inside this many miles, "upstream"/"downstream" is a distinction without a
 * difference — and river_mile carries two decimals of a snapped coordinate, so
 * a tighter threshold would be reporting the flowline's resolution as a fact
 * about the photo.
 */
export const GAUGE_AT_THRESHOLD_MILES = 0.5;

/**
 * A capture this recent is "now" as far as the gauge is concerned, so the row
 * is marked `live`. Mirrors the 6h the website's form uses for the same call.
 */
export const LIVE_READING_WINDOW_MS = 6 * 60 * 60 * 1000;

export interface GaugeRelationResult {
  relation: GaugeRelation;
  offsetMiles: number;
}

/**
 * Compare a photo's river mile with its gauge's.
 *
 * Both miles run FROM THE HEADWATERS (snap_to_river: "0.0 = headwaters",
 * monotonic downstream), so the larger mile is the one further down the river.
 * Getting this backwards is a silent, plausible-looking error — the label would
 * simply be wrong on every photo — which is why it is one pure function with
 * its own tests rather than a comparison inlined at the call site.
 */
export function resolveGaugeRelation(
  photoMile: number | null | undefined,
  gaugeMile: number | null | undefined,
): GaugeRelationResult | null {
  if (typeof photoMile !== 'number' || !Number.isFinite(photoMile)) return null;
  if (typeof gaugeMile !== 'number' || !Number.isFinite(gaugeMile)) return null;

  const delta = photoMile - gaugeMile;
  const offsetMiles = Number(Math.abs(delta).toFixed(2));
  if (offsetMiles < GAUGE_AT_THRESHOLD_MILES) return { relation: 'at', offsetMiles };
  return { relation: delta > 0 ? 'downstream' : 'upstream', offsetMiles };
}

/** How a stored reading was arrived at. Mirrors the reading_source CHECK. */
export type ReadingSource = 'live' | 'historical' | 'manual';

/**
 * Which of the possible sources the reading actually stored came from.
 * `none` means no reading was obtained at all.
 */
export type ReadingOrigin = 'manual' | 'client' | 'derived' | 'none';

/**
 * Label the provenance of the reading that was STORED — not of the attempt.
 *
 * Two things this must never do, both of which it used to:
 *
 * 1. Call a value manual because the client sent one. The website's form
 *    auto-populates stage and flow from the gauge and posts them with
 *    `readingSource: live|historical`; only a value the submitter typed is a
 *    claim about a staff gauge. Presence of a number says nothing about who
 *    put it there — the declared source does.
 * 2. Name a source when there is no reading to attribute. A row whose stage
 *    and flow are both null, because USGS answered with nothing, read as
 *    "Live reading at submit" in review: a provenance for a measurement that
 *    does not exist. Null is the honest answer, and the column is nullable.
 */
export function resolveReadingSource(
  origin: ReadingOrigin,
  declared: ReadingSource | null | undefined,
  capturedAt: Date | null,
  now: number,
): ReadingSource | null {
  if (origin === 'none') return null;
  if (origin === 'manual') return 'manual';
  // The client did its own lookup and labelled it; that label describes the
  // value being stored, so it is more accurate than re-deriving one here.
  if (origin === 'client' && (declared === 'live' || declared === 'historical')) {
    return declared;
  }
  if (!capturedAt) return 'live';
  return now - capturedAt.getTime() <= LIVE_READING_WINDOW_MS ? 'live' : 'historical';
}

export interface DerivedGaugeContext {
  gaugeStationId: string | null;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  /** Null when no reading was obtained — see resolveReadingSource. */
  readingSource: ReadingSource | null;
  readingObservedAt: string | null;
  riverMile: number | null;
  gaugeRelation: GaugeRelation | null;
  gaugeOffsetMiles: number | null;
  trend: UsgsTrendAt | null;
}

export interface DeriveInput {
  riverId: string;
  latitude: number;
  longitude: number;
  /** EXIF capture time, when the client knew it. */
  capturedAt: Date | null;
  /**
   * Readings the client sent. Whether these outrank the server's own lookup
   * depends entirely on `declaredReadingSource` — see the merge in derive().
   */
  providedGaugeHeightFt?: number | null;
  providedDischargeCfs?: number | null;
  /**
   * What the client says its readings are. Only 'manual' asserts a submitter
   * typed them; the website posts auto-populated numbers as 'live'/'historical'
   * and must not have them relabelled as a staff-gauge reading.
   */
  declaredReadingSource?: ReadingSource | null;
  /** Gauge the client named. Already validated as belonging to this river. */
  providedGaugeStationId?: string | null;
}

// The admin client's generated types don't cover these RPCs' shapes; the route
// already casts the same way for find_nearest_river.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = SupabaseClient<any, any, any>;

interface SegmentConditionRow {
  gauge_usgs_id?: string | null;
  gauge_river_mile?: number | string | null;
  gauge_height_ft?: number | string | null;
  discharge_cfs?: number | string | null;
}

function num(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve the reach gauge for a point via the same PostGIS cascade the
 * conditions API uses (a reach's declared gauge, else the nearest gauge at or
 * above the mile, else the river primary). Reusing the function rather than
 * reimplementing its rules is the point: a photo must be filed against the
 * gauge the rest of the app would name for that spot.
 */
async function resolveReachGauge(
  supabase: LooseClient,
  riverId: string,
  point: string,
): Promise<SegmentConditionRow | null> {
  try {
    const { data } = await (supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown }>)('get_river_condition_segment', {
      p_river_id: riverId,
      p_put_in_point: point,
    });
    const row = Array.isArray(data) ? (data[0] as SegmentConditionRow | undefined) : undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

/** The photo's own mile along the flowline. */
async function resolveRiverMile(
  supabase: LooseClient,
  riverId: string,
  point: string,
): Promise<number | null> {
  try {
    const { data } = await (supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown }>)('snap_to_river', {
      p_point: point,
      p_river_id: riverId,
    });
    const row = Array.isArray(data) ? (data[0] as { river_mile?: unknown } | undefined) : undefined;
    return num(row?.river_mile);
  } catch {
    return null;
  }
}

/**
 * How long the whole derivation gets before the submission goes ahead without
 * it.
 *
 * This bound is the difference between "best-effort" and a claim. USGS going
 * DOWN is handled by the catch below; USGS going SLOW is not — an unbounded
 * fetch inside a submit handler turns a hung upstream into a platform timeout,
 * and the person on the gravel bar loses a photo that was already uploaded and
 * a report that would have been perfectly fine without a reading. A photo with
 * no stage is recoverable; a 504 on submit is not.
 */
export const DERIVATION_BUDGET_MS = 8_000;

/**
 * Fill in everything about a River Visual's gauge that the submitter did not.
 *
 * Best-effort throughout: a photo with no derivable reading is still a photo
 * worth having, so every failure path degrades to nulls rather than refusing
 * the submission. The route must not reject a report because USGS was down.
 */
export async function deriveRiverVisualGauge(
  supabase: LooseClient,
  input: DeriveInput,
  budgetMs: number = DERIVATION_BUDGET_MS,
): Promise<DerivedGaugeContext> {
  const providedHeight = num(input.providedGaugeHeightFt);
  const providedCfs = num(input.providedDischargeCfs);
  // Nothing was derived on this path, so the only reading that can be stored is
  // the client's — and it is labelled as whatever the client said it was.
  const hasClientReading = providedHeight != null || providedCfs != null;
  const fallback: DerivedGaugeContext = {
    gaugeStationId: input.providedGaugeStationId ?? null,
    gaugeHeightFt: providedHeight,
    dischargeCfs: providedCfs,
    readingSource: resolveReadingSource(
      !hasClientReading
        ? 'none'
        : input.declaredReadingSource === 'manual'
          ? 'manual'
          : 'client',
      input.declaredReadingSource,
      input.capturedAt,
      Date.now(),
    ),
    readingObservedAt: null,
    riverMile: null,
    gaugeRelation: null,
    gaugeOffsetMiles: null,
    trend: null,
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      derive(supabase, input),
      new Promise<DerivedGaugeContext>((resolve) => {
        timer = setTimeout(() => resolve(fallback), budgetMs);
      }),
    ]);
  } catch {
    // Anything unforeseen still yields a storable report.
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function derive(
  supabase: LooseClient,
  input: DeriveInput,
): Promise<DerivedGaugeContext> {
  const { riverId, latitude, longitude, capturedAt } = input;
  const providedHeight = num(input.providedGaugeHeightFt);
  const providedCfs = num(input.providedDischargeCfs);
  const declaredManual = input.declaredReadingSource === 'manual';

  const point = `SRID=4326;POINT(${longitude} ${latitude})`;

  const [segment, riverMile] = await Promise.all([
    resolveReachGauge(supabase, riverId, point),
    resolveRiverMile(supabase, riverId, point),
  ]);

  // The client's gauge wins when it named one (the website resolves the same
  // reach gauge itself); otherwise take the one the cascade chose.
  let gaugeStationId = input.providedGaugeStationId ?? null;
  let usgsSiteId = segment?.gauge_usgs_id ?? null;
  let gaugeMile = num(segment?.gauge_river_mile);

  if (gaugeStationId) {
    // Resolve the named station's site id and mile, so the reading and the
    // relation both describe the gauge actually stored on the row.
    const { data: station } = await supabase
      .from('gauge_stations')
      .select('usgs_site_id')
      .eq('id', gaugeStationId)
      .maybeSingle();
    usgsSiteId = station?.usgs_site_id ?? usgsSiteId;

    const { data: link } = await supabase
      .from('river_gauges')
      .select('river_mile')
      .eq('river_id', riverId)
      .eq('gauge_station_id', gaugeStationId)
      .maybeSingle();
    const linkMile = num(link?.river_mile);
    if (linkMile != null) gaugeMile = linkMile;
  } else if (usgsSiteId) {
    const { data: station } = await supabase
      .from('gauge_stations')
      .select('id')
      .eq('usgs_site_id', usgsSiteId)
      .maybeSingle();
    gaugeStationId = station?.id ?? null;
  }

  const relation = resolveGaugeRelation(riverMile, gaugeMile);

  let derivedHeight: number | null = null;
  let derivedCfs: number | null = null;
  let observedAt: string | null = null;
  let trend: UsgsTrendAt | null = null;

  if (usgsSiteId) {
    const when = capturedAt ?? new Date();
    const reading = await fetchUsgsReadingAt(usgsSiteId, when).catch(() => null);
    if (reading) {
      derivedHeight = reading.gaugeHeightFt;
      derivedCfs = reading.dischargeCfs;
      observedAt = reading.observedAt;
      trend = reading.trend;
    } else {
      // The reach cascade also hands back the gauge's CURRENT reading. For a
      // photo taken today that is the same measurement USGS would have served,
      // so it is a real fallback rather than a guess — and for an older photo
      // it stays unused, because filing a 2019 photo under today's water is the
      // exact mistake captured_at exists to prevent.
      const isRecent =
        !capturedAt || Date.now() - capturedAt.getTime() <= LIVE_READING_WINDOW_MS;
      if (isRecent) {
        derivedHeight = num(segment?.gauge_height_ft);
        derivedCfs = num(segment?.discharge_cfs);
      }
    }
  }

  // ── Merge ────────────────────────────────────────────────────────────────
  // ONLY a declared-manual reading outranks the server. The website's form
  // auto-populates both fields from the gauge and posts them as live/historical;
  // treating any supplied number as manual labelled every website submission as
  // a staff-gauge reading AND skipped the lookup, so the surface that already
  // worked lost the trend and observation time this change exists to add.
  //
  // A non-manual client value stays as the FALLBACK for when USGS yields
  // nothing. Preferring the server's own reading otherwise is what keeps the
  // stored number, `reading_observed_at` and `gauge_trend` describing one
  // measurement instead of three.
  const manualHeight = declaredManual ? providedHeight : null;
  const manualCfs = declaredManual ? providedCfs : null;
  const clientHeight = declaredManual ? null : providedHeight;
  const clientCfs = declaredManual ? null : providedCfs;

  const gaugeHeightFt = manualHeight ?? derivedHeight ?? clientHeight;
  const dischargeCfs = manualCfs ?? derivedCfs ?? clientCfs;

  // Per-field, because the iOS override supplies one unit and not both: a
  // manual stage alongside a derived flow is a real row.
  const storedDerived =
    (manualHeight == null && derivedHeight != null) ||
    (manualCfs == null && derivedCfs != null);

  let origin: ReadingOrigin;
  if (manualHeight != null || manualCfs != null) origin = 'manual';
  else if (storedDerived) origin = 'derived';
  else if (clientHeight != null || clientCfs != null) origin = 'client';
  else origin = 'none';

  return {
    gaugeStationId,
    gaugeHeightFt,
    dischargeCfs,
    readingSource: resolveReadingSource(
      origin,
      input.declaredReadingSource,
      capturedAt,
      Date.now(),
    ),
    // Timestamps the USGS observation, so it may only travel with a value that
    // came from it. Attached to a client or submitter reading it would date a
    // measurement nobody took.
    readingObservedAt: storedDerived ? observedAt : null,
    riverMile,
    gaugeRelation: relation?.relation ?? null,
    gaugeOffsetMiles: relation?.offsetMiles ?? null,
    trend,
  };
}
