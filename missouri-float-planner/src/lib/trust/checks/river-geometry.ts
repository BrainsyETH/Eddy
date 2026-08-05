// src/lib/trust/checks/river-geometry.ts
// The geometry diagnostics that /api/admin/river-health has always run, lifted
// out of the route handler so they can also run on a schedule and be tested.
//
// This is an extraction, not a reimplementation. The route keeps its response
// shape exactly — src/app/admin/data-sync/page.tsx reads it — and now calls
// collectRiverHealth() instead of carrying 150 lines of inline logic with no
// tests. One implementation, two callers; a second copy that drifted from the
// first would be worse than either.
//
// The one behavioural difference is scope: the route reports on every river
// because an operator opening the page wants the whole table, while the
// scheduled check looks at active rivers only, matching validate_river_data().
// A draft river with no geometry yet is a to-do, not a finding.

import { mustCount, mustRows, mustRpc } from '../db';
import type { RawFinding, TrustCheck, TrustCheckContext, TrustCheckResult } from '../types';

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * One problem, carrying both halves: a stable key for the ledger's fingerprint
 * and the human sentence the admin page has always displayed.
 *
 * They have to travel together. The sentences interpolate live values ("3.2
 * pts/mile"), so they cannot be fingerprinted; the keys are meaningless to a
 * person reading the console. Splitting them into two functions would let them
 * drift.
 */
export interface RiverGeometryIssue {
  ruleKey: string;
  message: string;
}

export interface RiverGeometryMetrics {
  coordinateCount: number;
  /**
   * Vertices per mile OF THE STORED LINE, not per mile of `length_miles`.
   *
   * It used to be the latter, and that made the number partly a measure of how
   * stale a hand-maintained column was. `length_miles` is written by
   * scripts/import-nhd-rivers-from-tnm.ts only on the INSERT path; its UPDATE
   * path replaces `geom` and touches nothing else, so a re-imported river keeps
   * whatever mileage it was created with. War Eagle Creek stores 33.17 miles
   * against 68.1 miles of line, which reported 7.9 pts/mile — comfortably past
   * the threshold — for the sparsest geometry in the catalog. Meanwhile every
   * river whose column happened to be accurate got scored honestly and filed.
   *
   * Both halves now come from the same object. See geometryLengthMiles().
   */
  coordsPerMile: number | null;
  /** Measured from the coordinates themselves. Null when there are none. */
  geometryLengthMiles: number | null;
  boundingBox: BoundingBox | null;
  /**
   * The geometry could not be READ, as opposed to being absent.
   *
   * No longer set by the RPC path: an RPC error aborts the whole check, because
   * it fails identically for every river and 24 copies of one finding is noise
   * that hides its own cause. Retained because the distinction is real and a
   * future per-river read failure belongs here.
   */
  geometryReadFailed: boolean;
  /** The RPC succeeded but there was no geometry to read. */
  geometryMissing: boolean;
  /** The stored column, which is a separate claim from the geometry's own length. */
  lengthMiles: number | null;
  directionVerified: boolean;
  geometryStartsAtHeadwaters: boolean | null;
  gaugeCount: number;
  gaugesOnRiver: number;
  /** Which state's bounds to judge the bounding box against. */
  state: string | null;
}

/**
 * Where a river is allowed to be, per state, generously.
 *
 * Generous on purpose, and not a substitute for a state polygon: rivers cross
 * state lines. The Kings River rises in Madison County, Arkansas and empties
 * into Table Rock Lake in Missouri, so its geometry reaches 36.59°N — past
 * Arkansas's own 36.50 border. Bounds tight enough to catch that would be
 * reporting geography, not defects.
 *
 * This was a single MO_BOUNDS constant until the catalog stopped being
 * Missouri-only. Seven active rivers are in Arkansas now, and the Caddo — which
 * tops out at 34.46°N, below Missouri's 35 — was filed at HIGH as "geometry may
 * be incorrect" for the offence of being an Arkansas river.
 */
const STATE_BOUNDS: Readonly<Record<string, BoundingBox>> = {
  MO: { minLat: 35, maxLat: 41, minLng: -97, maxLng: -88 },
  AR: { minLat: 32.5, maxLat: 36.6, minLng: -95, maxLng: -89.5 },
};

const MIN_COORDINATE_COUNT = 10;

/**
 * Three, lowered from five, because five was measuring a defect that is not one.
 *
 * At five it fired on 22 of 24 active rivers — every one of them between 3.1 and
 * 5.1 points per mile, because they all came out of one Douglas-Peucker pass at
 * one tolerance in one import script. That is a single fact about the catalog,
 * and filing it 22 times turns the console into the wall of standing complaints
 * this whole framework exists to prevent.
 *
 * The question the rule should answer is whether the line traces the channel
 * closely enough for mileage, and the answer at 4 pts/mile is yes, measured two
 * ways that agree:
 *
 *   ST_Simplify to a QUARTER of the current vertex count — about 1.4 pts/mile —
 *     costs only 2.8% to 5.6% of channel length (Gasconade 2.80, Meramec 3.70,
 *     Current 3.97, Niangua 4.95, Jacks Fork 5.56). The curve through here is
 *     flat, so the vertices being dropped are not where the length lives.
 *
 *   The import bounds deviation at 0.0005 deg, roughly 50 m, over chords of
 *     roughly 400 m. A 50 m bulge on a 400 m chord is about 4% of arc length,
 *     which caps the error independently of the measurement above.
 *
 * So the catalog understates true channel length by something like 2-4%. That is
 * smaller than the 10% gap MAX_LENGTH_DISAGREEMENT already accepts as the
 * legitimate difference between guide miles and a traced line, and float time is
 * returned as a range that refuses to estimate at all for dangerous water — so
 * it cannot reach a go/no-go answer.
 *
 * Three still catches what the rule is for: a placeholder line with a handful of
 * vertices strung across a river. Below that, coordinate_count_very_low catches
 * the truly degenerate ones on the absolute count.
 *
 * Re-importing all 24 rivers at a finer tolerance was the alternative and is the
 * worse trade: it re-runs the machinery that leaves length_miles untouched on
 * its UPDATE path, and whose longest-connected-component walk is the likeliest
 * explanation for War Eagle Creek's 68-mile line. Chasing 3% through that risks
 * considerably more than 3%.
 */
const MIN_COORDS_PER_MILE = 3;

/**
 * How far `length_miles` may sit from the measured line before it is a finding.
 *
 * Ten percent, because a few percent is expected and legitimate — the
 * `missing_length_miles` remediation says as much, since published guide miles
 * and a digitized channel are different measurements of the same river. Ten is
 * clear of that band (the widest legitimate gap on file is Eleven Point at 6%)
 * and well under the three live offenders: Jacks Fork and the Current at 22%,
 * War Eagle Creek at 51%.
 *
 * Measured against the geometry, which is the denominator the finding quotes.
 * Against the stored column the same three read 18%, 28% and 105% — a reminder
 * that "percent off" means nothing without saying off WHAT.
 */
const MAX_LENGTH_DISAGREEMENT = 0.1;

/**
 * Pure. Everything above this line is fetched; everything below is judgement.
 *
 * Order is preserved from the original route handler because the admin page
 * renders the list as-is, and reordering it would read as churn in a UI nobody
 * asked to change.
 */
export function deriveRiverGeometryIssues(m: RiverGeometryMetrics): RiverGeometryIssue[] {
  const issues: RiverGeometryIssue[] = [];

  if (m.geometryReadFailed) {
    issues.push({ ruleKey: 'geometry_unreadable', message: 'Failed to read geometry' });
  } else if (m.geometryMissing) {
    issues.push({ ruleKey: 'geometry_missing', message: 'No geometry data found' });
  } else if (m.coordinateCount < MIN_COORDINATE_COUNT) {
    issues.push({
      ruleKey: 'coordinate_count_very_low',
      message: `Very low coordinate density (${m.coordinateCount} points)`,
    });
  }

  if (m.coordsPerMile !== null && m.coordsPerMile < MIN_COORDS_PER_MILE) {
    issues.push({
      ruleKey: 'coordinate_density_low',
      // The threshold, not an aspiration. This read "(recommend 10+)" while the
      // rule fired below 5, so it asked for a number the check does not enforce
      // and nothing between 5 and 10 ever appeared.
      message: `Low coordinate density: ${m.coordsPerMile} pts/mile of channel (under ${MIN_COORDS_PER_MILE})`,
    });
  }

  if (!m.lengthMiles) {
    issues.push({ ruleKey: 'missing_length_miles', message: 'Missing length_miles' });
  } else if (m.geometryLengthMiles !== null && m.geometryLengthMiles > 0) {
    // A stored mileage that disagrees with the line is not cosmetic: mile
    // markers are assigned as `length_miles * ST_LineLocatePoint(geom, point)`
    // (00040_assign_rivers_to_pois.sql, and the POI compute-mile route), so the
    // fraction is located on the real channel and then multiplied by a number
    // describing a different one. Every mile marker on the river scales by the
    // same error, and float distances derived from them scale with it.
    //
    // Known since audit F5 — 00142_get_float_segment_snap_fractions.sql names
    // the drift in its header and routes AROUND it for the drawn polyline. The
    // drift itself was never surfaced, so nothing was ever going to fix it.
    const drift = Math.abs(m.lengthMiles - m.geometryLengthMiles) / m.geometryLengthMiles;
    if (drift > MAX_LENGTH_DISAGREEMENT) {
      issues.push({
        ruleKey: 'length_miles_disagrees_geometry',
        message:
          `length_miles ${m.lengthMiles} disagrees with the stored line ` +
          `(${m.geometryLengthMiles} mi measured, ${Math.round(drift * 100)}% off)`,
      });
    }
  }

  if (!m.directionVerified) {
    issues.push({ ruleKey: 'direction_unverified', message: 'Flow direction not verified' });
  }

  if (m.geometryStartsAtHeadwaters === null) {
    issues.push({
      ruleKey: 'headwaters_flag_unset',
      message: 'geometry_starts_at_headwaters not set',
    });
  }

  if (m.gaugeCount === 0) {
    issues.push({ ruleKey: 'no_gauges_linked', message: 'No gauge stations linked' });
  }

  // Gauges exist and none of them are near the line. Either the gauges are
  // wired to the wrong river or the geometry stops short of them; both are the
  // misassociation class docs/gauge-alerting-misalignment-audit.md is about.
  if (m.gaugeCount > 0 && m.gaugesOnRiver === 0) {
    issues.push({
      ruleKey: 'no_gauges_near_geometry',
      message: 'No gauge stations are within 1km of river geometry — geometry may be incomplete',
    });
  }

  if (m.boundingBox && isOutsideStateBounds(m.boundingBox, m.state)) {
    issues.push({
      ruleKey: 'bbox_outside_state',
      message: `Bounding box extends outside ${m.state ?? 'the covered states'} — geometry may be incorrect`,
    });
  }

  return issues;
}

/**
 * An unknown state is judged against every state's bounds at once.
 *
 * Not silence: a river with no state set still has a geometry that can be
 * wildly wrong, and skipping the check would drop coverage without saying so.
 * The union is the widest claim that is still true — it catches a line in
 * Colorado and stays quiet about which side of a border a river sits on.
 */
export function isOutsideStateBounds(box: BoundingBox, state: string | null): boolean {
  const bounds = state ? STATE_BOUNDS[state] : undefined;
  if (bounds) return isOutsideBounds(box, bounds);
  return Object.values(STATE_BOUNDS).every((b) => isOutsideBounds(box, b));
}

function isOutsideBounds(box: BoundingBox, bounds: BoundingBox): boolean {
  return (
    box.minLat < bounds.minLat ||
    box.maxLat > bounds.maxLat ||
    box.minLng < bounds.minLng ||
    box.maxLng > bounds.maxLng
  );
}

export function boundingBoxOf(coords: number[][]): BoundingBox | null {
  if (coords.length === 0) return null;
  const lats = coords.map((c) => c[1]);
  const lngs = coords.map((c) => c[0]);
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  };
}

/**
 * The length of the stored line, walked vertex to vertex.
 *
 * Spherical rather than spheroidal, so it lands within about a tenth of a
 * percent of PostGIS's `ST_Length(geom::geography)` — irrelevant against a
 * threshold of 5 points per mile or a 10% drift, and it keeps the whole
 * calculation pure and testable on the coordinates the check already holds.
 * Measuring it in SQL would mean a second round-trip per river on a check that
 * already takes 54 seconds, or widening an RPC that other callers read.
 */
const EARTH_RADIUS_MILES = 3958.7613;

export function geometryLengthMiles(coords: readonly number[][]): number | null {
  if (coords.length < 2) return null;

  let miles = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
    miles += 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  return Math.round(miles * 100) / 100;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Points per mile of the line they describe.
 *
 * The second argument is the MEASURED length, never `rivers.length_miles` —
 * see the doc comment on RiverGeometryMetrics.coordsPerMile for the day that
 * distinction was learned.
 */
export function coordsPerMileOf(
  coordinateCount: number,
  measuredLengthMiles: number | null,
): number | null {
  if (!measuredLengthMiles || coordinateCount <= 0) return null;
  return Math.round((coordinateCount / measuredLengthMiles) * 10) / 10;
}

export interface RiverHealthRow {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  state: string | null;
  lengthMiles: number | null;
  /** Measured from `geom`. Additive to the response shape data-sync reads. */
  geometryLengthMiles: number | null;
  geometryStartsAtHeadwaters: boolean | null;
  directionVerified: boolean;
  coordinateCount: number;
  coordsPerMile: number | null;
  boundingBox: BoundingBox | null;
  gaugeCount: number;
  gaugesOnRiver: number;
  accessPointCount: number;
  poiCount: number;
  issues: RiverGeometryIssue[];
}

export interface CollectOptions {
  activeOnly?: boolean;
  /** Date.now() past which to stop and return what has been gathered. */
  deadlineMs?: number;
}

/**
 * The I/O half. Costly by nature: one geometry RPC, two counts, and one
 * find_nearest_river call per gauge, per river. That is why the scheduled
 * caller passes a deadline and the route does not.
 */
export async function collectRiverHealth(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  options: CollectOptions = {},
): Promise<{ rows: RiverHealthRow[]; examined: number; truncated: boolean }> {
  let query = supabase
    .from('rivers')
    .select(
      'id, name, slug, active, state, length_miles, direction_verified, geometry_starts_at_headwaters, nhd_feature_id',
    )
    .order('name');

  if (options.activeOnly) query = query.eq('active', true);

  const { data: rivers, error } = await query;
  if (error || !rivers) {
    throw new Error(`Failed to fetch rivers: ${error?.message ?? 'no rows'}`);
  }

  const rows: RiverHealthRow[] = [];
  let truncated = false;

  for (const river of rivers) {
    if (options.deadlineMs !== undefined && Date.now() > options.deadlineMs) {
      truncated = true;
      break;
    }

    let coordinateCount = 0;
    let measuredLengthMiles: number | null = null;
    let boundingBox: BoundingBox | null = null;
    // Always false from this path now — see the field's doc comment. Kept as a
    // named constant rather than dropped so the metrics shape stays stable for
    // deriveRiverGeometryIssues and its tests.
    const geometryReadFailed = false;
    let geometryMissing = false;

    // The `error` half is load-bearing and was missing. PostgREST does not
    // throw when an RPC does not exist — it resolves with an error object — so
    // reading only `data` made a missing FUNCTION indistinguishable from a
    // river with no GEOMETRY. get_river_geometry_json had in fact been absent
    // from production, and this check reported all 24 rivers as geometry-less
    // on its first run while rivers.geom held hundreds of points each.
    //
    // An RPC that is broken is broken for every river, so it aborts the check
    // rather than producing one wrong finding per river. That routes it through
    // reconcile.ts's check_error refusal: one honest meta-finding, and nothing
    // resolved on the strength of a run that could not see.
    const { data: geoData, error: geoError } = await supabase.rpc('get_river_geometry_json', {
      p_slug: river.slug,
    });

    if (geoError) {
      throw new Error(
        `get_river_geometry_json failed for ${river.slug}: ${geoError.message ?? 'unknown error'}`,
      );
    }

    if (geoData && Array.isArray(geoData.coordinates)) {
      const coords: number[][] = geoData.coordinates;
      coordinateCount = coords.length;
      measuredLengthMiles = geometryLengthMiles(coords);
      boundingBox = boundingBoxOf(coords);
    } else {
      geometryMissing = true;
    }

    // Every auxiliary query below now aborts the check on failure, for the same
    // reason the geometry RPC above does: these read only `data`/`count`, and
    // `count ?? 0` turned an unreadable table into "this river has zero gauges"
    // — which deriveRiverGeometryIssues() files as ungauged_river at CRITICAL,
    // against a river whose gauges are fine.
    //
    // A database that cannot answer is broken for every river, not for this one,
    // so aborting produces one honest check_error refusal instead of 24 false
    // findings. That is the shape the first scheduled run already got wrong once.
    const gaugeCount = await mustCount(
      supabase.from('river_gauges').select('id', { count: 'exact', head: true }).eq('river_id', river.id),
      `could not count gauges for ${river.slug}`,
    );

    let gaugesOnRiver = 0;
    const gaugeStations = await mustRows<{ gauge_stations: unknown }>(
      supabase.from('river_gauges').select('gauge_stations!inner(location)').eq('river_id', river.id),
      `could not load gauge stations for ${river.slug}`,
    );

    for (const gs of gaugeStations) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const station = gs.gauge_stations as any;
      if (!station?.location) continue;
      if (typeof station.location !== 'object' || station.location.type !== 'Point') continue;

      const lng = station.location.coordinates[0];
      const lat = station.location.coordinates[1];
      const nearResult = await mustRpc<{ river_id: string }[] | null>(
        supabase.rpc('find_nearest_river', {
          p_lat: lat,
          p_lng: lng,
          p_max_distance_meters: 1000,
        }),
        `find_nearest_river failed near ${river.slug}`,
      );
      if (nearResult && nearResult.length > 0 && nearResult[0].river_id === river.id) {
        gaugesOnRiver++;
      }
    }

    const apCount = await mustCount(
      supabase
        .from('access_points')
        .select('id', { count: 'exact', head: true })
        .eq('river_id', river.id)
        .eq('approved', true),
      `could not count access points for ${river.slug}`,
    );

    const poiCount = await mustCount(
      supabase
        .from('points_of_interest')
        .select('id', { count: 'exact', head: true })
        .eq('river_id', river.id),
      `could not count points of interest for ${river.slug}`,
    );

    const lengthMiles = river.length_miles === null ? null : Number(river.length_miles);
    const coordsPerMile = coordsPerMileOf(coordinateCount, measuredLengthMiles);

    rows.push({
      id: river.id,
      name: river.name,
      slug: river.slug,
      active: river.active,
      state: river.state ?? null,
      lengthMiles,
      geometryLengthMiles: measuredLengthMiles,
      geometryStartsAtHeadwaters: river.geometry_starts_at_headwaters,
      directionVerified: river.direction_verified,
      coordinateCount,
      coordsPerMile,
      boundingBox,
      gaugeCount,
      gaugesOnRiver,
      accessPointCount: apCount,
      poiCount,
      issues: deriveRiverGeometryIssues({
        coordinateCount,
        coordsPerMile,
        geometryLengthMiles: measuredLengthMiles,
        boundingBox,
        geometryReadFailed,
        geometryMissing,
        lengthMiles,
        directionVerified: river.direction_verified,
        geometryStartsAtHeadwaters: river.geometry_starts_at_headwaters,
        gaugeCount,
        gaugesOnRiver,
        state: river.state ?? null,
      }),
    });
  }

  return { rows, examined: rows.length, truncated };
}

export const riverGeometryCheck: TrustCheck = {
  id: 'river_geometry',
  title: 'River geometry and gauge proximity',
  cadence: 'daily',

  async run(ctx: TrustCheckContext): Promise<TrustCheckResult> {
    const { rows, examined, truncated } = await collectRiverHealth(ctx.supabase, {
      activeOnly: true,
      deadlineMs: ctx.deadlineMs,
    });

    const findings: RawFinding[] = [];
    for (const row of rows) {
      for (const issue of row.issues) {
        findings.push({
          entityType: 'river',
          entityKey: row.slug,
          ruleKey: issue.ruleKey,
          title: `${row.name}: ${issue.message}`,
          detail: issue.message,
          evidence: {
            riverId: row.id,
            state: row.state,
            lengthMiles: row.lengthMiles,
            geometryLengthMiles: row.geometryLengthMiles,
            coordinateCount: row.coordinateCount,
            coordsPerMile: row.coordsPerMile,
            gaugeCount: row.gaugeCount,
            gaugesOnRiver: row.gaugesOnRiver,
            boundingBox: row.boundingBox,
          },
        });
      }
    }

    // `partial` is the important half. A truncated pass emitted nothing for the
    // rivers it never opened, and resolving their findings on that silence is
    // exactly the mistake this system exists to avoid making.
    return { scopeCount: examined, findings, partial: truncated };
  },
};
