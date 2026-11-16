/**
 * Kansas City District boat ramps: normalization, threshold sanity flags, and
 * the two lake-level cautions a ramp's published elevations may produce.
 *
 * The layer documents `elev_low` as the BOTTOM OF THE RAMP and `elev_high` as
 * the ELEVATION AT WHICH THE RAMP IS CLOSED (high water). They are two facts,
 * not a usable range. Below the bottom, the end of the ramp is out of the water;
 * above the closure, the Corps closes the ramp, usually because the approach or
 * the parking floods.
 *
 * Nothing here says "available". Slope, sediment, obstructions, dock placement,
 * vehicle clearance and temporary closures are not in the data, and the caution
 * wording below is fixed so no surface can imply they are
 * (docs/LAKES_AND_LAUNCHES_PLAN_2026-11-09.md §5).
 */

import { rampCaution as sharedRampCaution, type RampCaution } from '../../shared/lake-status';

export const NWK_BOAT_RAMPS_SOURCE = {
  url: 'https://geospatial.sec.usace.army.mil/server/rest/services/Hosted/NWK_Boat_Ramps/FeatureServer/0',
  objectId: 'objectid',
  fields: 'objectid,feat_name,feat_desig,feat_desc,nwk_lakename_t,agencyid,elev_low,elev_high,globalid,last_edited_date',
} as const;

export interface RampFeature {
  attributes: Record<string, unknown>;
  geometry?: { x?: number; y?: number } | null;
}

export interface RampSnapshot {
  url: string;
  retrieved_at: string;
  count: number;
  features: RampFeature[];
}

export interface Ramp {
  source_id: string;
  name: string;
  designation: string | null;
  description: string | null;
  /** The layer's lake assignment. Measured wrong for two Truman ramps; never trusted alone. */
  lake_name: string | null;
  agency: string | null;
  lon: number;
  lat: number;
  ramp_bottom_elev_ft: number | null;
  ramp_closure_elev_ft: number | null;
  /** The feature's own edit date: this source's `source_updated_at`. */
  source_updated_at: string | null;
}

/** A lake's documented pool elevations, in the datum the ramp thresholds use. */
export interface LakePoolReference {
  lake_name: string;
  multipurpose_pool_ft: number;
  flood_pool_ft: number;
  datum: 'NGVD29' | 'NAVD88';
  source: string;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function feet(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function normalizeRampSnapshot(snapshot: RampSnapshot): Ramp[] {
  if (snapshot.url !== NWK_BOAT_RAMPS_SOURCE.url) throw new Error('Unrecognized ramp source');
  if (!Number.isFinite(Date.parse(snapshot.retrieved_at))) throw new Error('Invalid retrieval time');
  if (!Array.isArray(snapshot.features) || snapshot.features.length !== snapshot.count || snapshot.count === 0) {
    throw new Error('Incomplete or empty ramp snapshot');
  }
  const seen = new Set<string>();
  return snapshot.features.map((feature) => {
    const a = feature.attributes;
    const guid = text(a.globalid)?.replace(/[{}]/g, '').toLowerCase();
    if (!guid || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(guid)) throw new Error(`Ramp ${String(a.objectid)}: missing GlobalID`);
    if (seen.has(guid)) throw new Error(`Duplicate ramp identity: ${guid}`);
    seen.add(guid);
    const x = feature.geometry?.x;
    const y = feature.geometry?.y;
    if (typeof x !== 'number' || typeof y !== 'number' || x < -180 || x > 180 || y < -90 || y > 90) {
      throw new Error(`Ramp ${guid}: missing or invalid WGS84 coordinate`);
    }
    const edited = a.last_edited_date;
    if (edited != null && (typeof edited !== 'number' || edited > Date.parse(snapshot.retrieved_at))) {
      throw new Error(`Ramp ${guid}: invalid edit date`);
    }
    return {
      source_id: guid,
      name: text(a.feat_name) ?? '(unnamed)',
      designation: text(a.feat_desig),
      description: text(a.feat_desc),
      lake_name: text(a.nwk_lakename_t),
      agency: text(a.agencyid),
      lon: x,
      lat: y,
      ramp_bottom_elev_ft: feet(a.elev_low),
      ramp_closure_elev_ft: feet(a.elev_high),
      source_updated_at: typeof edited === 'number' ? new Date(edited).toISOString() : null,
    };
  });
}

export type RampFlag =
  | 'no_thresholds'
  | 'one_threshold_only'
  | 'closure_not_above_bottom'
  | 'narrow_band'
  | 'thresholds_below_this_lake'
  | 'bottom_above_flood_pool'
  | 'closure_above_flood_pool';

/** Plain-language sanity checks against the lake's documented pools. A flag is a question for Phase 0, not a verdict. */
export function assessRamp(ramp: Ramp, lake: LakePoolReference): RampFlag[] {
  const lo = ramp.ramp_bottom_elev_ft;
  const hi = ramp.ramp_closure_elev_ft;
  if (lo === null && hi === null) return ['no_thresholds'];
  if (lo === null || hi === null) return ['one_threshold_only'];
  const flags: RampFlag[] = [];
  if (hi <= lo) flags.push('closure_not_above_bottom');
  else if (hi - lo < 5) flags.push('narrow_band');
  if (hi < lake.multipurpose_pool_ft - 10) flags.push('thresholds_below_this_lake');
  if (lo > lake.flood_pool_ft) flags.push('bottom_above_flood_pool');
  if (hi > lake.flood_pool_ft + 1) flags.push('closure_above_flood_pool');
  return flags;
}

export { RAMP_CAUTION_COPY, type RampCaution } from '../../shared/lake-status';

/**
 * The caution a pool reading produces for a ramp, or null: the shared rule
 * (shared/lake-status.ts, the one the page uses) applied to a layer row.
 */
export function rampCaution(pool: { elevation_ft: number; datum: LakePoolReference['datum'] }, ramp: Ramp, rampDatum: LakePoolReference['datum']): RampCaution | null {
  return sharedRampCaution(
    { elevationFt: pool.elevation_ft, datum: pool.datum },
    { bottomFt: ramp.ramp_bottom_elev_ft, closureFt: ramp.ramp_closure_elev_ft, datum: rampDatum },
  );
}

/**
 * Pool references for the Kansas City lakes Eddy carries or is piloting.
 * Multipurpose and flood-control pool elevations as the district publishes them
 * on each project's page (NGVD29, as the ramp thresholds are). Recorded here so
 * a flag is checkable against its reference; corrections go here with a date.
 */
export const NWK_LAKE_POOLS: readonly LakePoolReference[] = [
  { lake_name: 'Truman Lake', multipurpose_pool_ft: 706.0, flood_pool_ft: 739.6, datum: 'NGVD29', source: 'USACE Kansas City District, Harry S. Truman Dam and Reservoir project data (multipurpose pool 706.0, flood control pool 739.6)' },
  { lake_name: 'Stockton Lake', multipurpose_pool_ft: 867.0, flood_pool_ft: 892.0, datum: 'NGVD29', source: 'USACE Kansas City District, Stockton Lake project data (multipurpose pool 867.0, flood control pool 892.0)' },
  { lake_name: 'Pomme de Terre Lake', multipurpose_pool_ft: 839.0, flood_pool_ft: 874.0, datum: 'NGVD29', source: 'USACE Kansas City District, Pomme de Terre Lake project data (multipurpose pool 839.0, flood control pool 874.0)' },
];
