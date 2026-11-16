// shared/lake-types.ts
// The wire shape of a lake surface: what the "On the lake" section renders on
// the web now and what an iOS screen will read once the shape stops moving
// (LAKES_AND_LAUNCHES_PLAN_2026-11-09.md §3, "Wire contract").
//
// Everything optional here is optional for the reason dam-types.ts gives: an
// absent field means "this deploy does not send one", and an installed client
// must render without it. Nothing here is ever null to mean "unknown"; it is
// absent.

import type { DamStaleness } from './dam-types';
import type { PoolPosition, RampCaution, VerticalDatum } from './lake-status';

export type LaunchMethod = 'trailer' | 'hand';

export interface LakeOperatingRange {
  conservationFt: number;
  floodFt: number;
  /** Who documents these elevations, for the page's source line. */
  source: string;
  /** When the documented elevations were last checked against the source. */
  asOf: string;
}

export interface LakePoolReading {
  valueFt: number;
  /** ISO instant of the observation, as the source stamped it. */
  at: string;
  staleness: DamStaleness;
  /** True when the source publishes one value a day (Truman via Ameren), not a spot reading. From the registry's cadence. */
  daily?: boolean;
}

export interface LakeLaunchThresholds {
  bottomFt: number | null;
  closureFt: number | null;
  datum: VerticalDatum;
  source: string;
  sourceUpdatedAt: string | null;
}

export interface LakeLaunch {
  id: string;
  slug: string;
  name: string;
  lon: number;
  lat: number;
  launchMethods: LaunchMethod[];
  amenities: string[];
  managingAgency: string | null;
  feeRequired: boolean | null;
  thresholds?: LakeLaunchThresholds;
  /** Present only when the lake's cautions are verified AND the pool and thresholds share a datum. */
  caution?: RampCaution;
  /** The access point this launch is, when it is one Eddy already carries. One place, one identity. */
  accessPoint?: { slug: string; riverSlug: string; state: string };
}

export interface LakeSection {
  slug: string;
  name: string;
  states: string[];
  timeZone: string;
  datum: VerticalDatum;
  pool?: LakePoolReading;
  /** Signed change in feet over the window, from Eddy's own recorded readings. Absent when not computable. */
  change24hFt?: number;
  change7dFt?: number;
  operatingRange?: LakeOperatingRange;
  poolPosition?: PoolPosition;
  /** Recorded pool readings, oldest first, for the trend line: [ISO instant, feet]. */
  history: Array<[string, number]>;
  launches: LakeLaunch[];
  /** Whether this deploy may draw elevation cautions for this lake (registry gate). */
  cautionsVerified: boolean;
  sources: string[];
}
