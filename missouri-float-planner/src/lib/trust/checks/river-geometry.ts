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
  coordsPerMile: number | null;
  boundingBox: BoundingBox | null;
  /** The geometry RPC threw. Distinct from returning nothing. */
  geometryReadFailed: boolean;
  /** The RPC succeeded but there was no geometry to read. */
  geometryMissing: boolean;
  lengthMiles: number | null;
  directionVerified: boolean;
  geometryStartsAtHeadwaters: boolean | null;
  gaugeCount: number;
  gaugesOnRiver: number;
}

/** Missouri, generously. Matches the bounds the route has always used. */
const MO_BOUNDS = { minLat: 35, maxLat: 41, minLng: -97, maxLng: -88 };
const MIN_COORDINATE_COUNT = 10;
const MIN_COORDS_PER_MILE = 5;

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
      message: `Low coordinate density: ${m.coordsPerMile} pts/mile (recommend 10+)`,
    });
  }

  if (!m.lengthMiles) {
    issues.push({ ruleKey: 'missing_length_miles', message: 'Missing length_miles' });
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

  if (m.boundingBox && isOutsideMissouri(m.boundingBox)) {
    issues.push({
      ruleKey: 'bbox_outside_missouri',
      message: 'Bounding box extends outside Missouri — geometry may be incorrect',
    });
  }

  return issues;
}

export function isOutsideMissouri(box: BoundingBox): boolean {
  return (
    box.minLat < MO_BOUNDS.minLat ||
    box.maxLat > MO_BOUNDS.maxLat ||
    box.minLng < MO_BOUNDS.minLng ||
    box.maxLng > MO_BOUNDS.maxLng
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

export function coordsPerMileOf(coordinateCount: number, lengthMiles: number | null): number | null {
  if (!lengthMiles || coordinateCount <= 0) return null;
  return Math.round((coordinateCount / lengthMiles) * 10) / 10;
}

export interface RiverHealthRow {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  lengthMiles: number | null;
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
      'id, name, slug, active, length_miles, direction_verified, geometry_starts_at_headwaters, nhd_feature_id',
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
    let boundingBox: BoundingBox | null = null;
    let geometryReadFailed = false;
    let geometryMissing = false;

    try {
      const { data: geoData } = await supabase.rpc('get_river_geometry_json', {
        p_slug: river.slug,
      });
      if (geoData && geoData.coordinates) {
        const coords: number[][] = geoData.coordinates;
        coordinateCount = coords.length;
        boundingBox = boundingBoxOf(coords);
      } else {
        geometryMissing = true;
      }
    } catch {
      geometryReadFailed = true;
    }

    const { count: gaugeCount } = await supabase
      .from('river_gauges')
      .select('id', { count: 'exact', head: true })
      .eq('river_id', river.id);

    let gaugesOnRiver = 0;
    const { data: gaugeStations } = await supabase
      .from('river_gauges')
      .select('gauge_stations!inner(location)')
      .eq('river_id', river.id);

    if (gaugeStations) {
      for (const gs of gaugeStations) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const station = gs.gauge_stations as any;
        if (!station?.location) continue;
        if (typeof station.location !== 'object' || station.location.type !== 'Point') continue;

        const lng = station.location.coordinates[0];
        const lat = station.location.coordinates[1];
        const { data: nearResult } = await supabase.rpc('find_nearest_river', {
          p_lat: lat,
          p_lng: lng,
          p_max_distance_meters: 1000,
        });
        if (nearResult && nearResult.length > 0 && nearResult[0].river_id === river.id) {
          gaugesOnRiver++;
        }
      }
    }

    const { count: apCount } = await supabase
      .from('access_points')
      .select('id', { count: 'exact', head: true })
      .eq('river_id', river.id)
      .eq('approved', true);

    const { count: poiCount } = await supabase
      .from('points_of_interest')
      .select('id', { count: 'exact', head: true })
      .eq('river_id', river.id);

    const lengthMiles = river.length_miles === null ? null : Number(river.length_miles);
    const coordsPerMile = coordsPerMileOf(coordinateCount, lengthMiles);

    rows.push({
      id: river.id,
      name: river.name,
      slug: river.slug,
      active: river.active,
      lengthMiles,
      geometryStartsAtHeadwaters: river.geometry_starts_at_headwaters,
      directionVerified: river.direction_verified,
      coordinateCount,
      coordsPerMile,
      boundingBox,
      gaugeCount: gaugeCount || 0,
      gaugesOnRiver,
      accessPointCount: apCount || 0,
      poiCount: poiCount || 0,
      issues: deriveRiverGeometryIssues({
        coordinateCount,
        coordsPerMile,
        boundingBox,
        geometryReadFailed,
        geometryMissing,
        lengthMiles,
        directionVerified: river.direction_verified,
        geometryStartsAtHeadwaters: river.geometry_starts_at_headwaters,
        gaugeCount: gaugeCount || 0,
        gaugesOnRiver,
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
            lengthMiles: row.lengthMiles,
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
