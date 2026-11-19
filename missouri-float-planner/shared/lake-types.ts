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

/**
 * Wind and weather at ONE point on the lake, named in `place`. A lake this
 * size has more than one wind; the label is what keeps the number honest.
 * An observation, never a forecast and never a verdict on whether to go out.
 */
export interface LakeWeather {
  /** Where the observation applies, e.g. "Near Table Rock Dam". */
  place: string;
  windMph: number;
  /** Present only when the source reports a gust above the sustained wind. */
  windGustMph?: number;
  /** Compass point the wind blows FROM, e.g. "SW". */
  windFrom: string;
  tempF: number;
  /** The source's condition group, e.g. "Clouds". */
  condition: string;
  conditionIcon: string;
  /** When the source took the observation; absent when it does not say. */
  observedAt?: string;
}

/** An observed flow. Never a schedule or a forecast (dam-types.ts keeps those apart, and so does this). */
export interface LakeSystemFlow {
  cfs: number;
  at: string;
  /** True when the source publishes a daily average, not a spot reading. */
  dailyMean?: boolean;
  /**
   * True when the source reports once a day (Truman, through Ameren's daily
   * report), whatever kind of value it reports. A day-old figure from such a
   * source is current, so it gets the daily freshness limit and says so.
   */
  daily?: boolean;
}

export type LakeSystemStage = 'coming_in' | 'dam' | 'below';

/**
 * One neighbour of the lake in the water it belongs to: what feeds it, the dam
 * that holds it, and where the release goes. Each row opens a screen Eddy
 * already has. A client skips a `kind` it does not know.
 */
export type LakeSystemRow =
  /** The measured inflow to the lake, from the dam's own record. */
  | { kind: 'inflow'; stage: 'coming_in'; flow: LakeSystemFlow }
  | {
      kind: 'river';
      stage: 'coming_in' | 'below';
      slug: string;
      state: string;
      name: string;
      condition?: { code: string; label: string };
      /** In the unit the river's thresholds use, the only unit it may be shown in. */
      reading?: { value: number; unit: 'ft' | 'cfs'; at?: string };
    }
  | {
      kind: 'dam';
      stage: LakeSystemStage;
      damId: string;
      name: string;
      /** The lake behind this dam, when the row is about a neighbouring lake. */
      lakeName?: string;
      /** The river that carries this dam's release to the lake, for an upstream dam. */
      via?: string;
      release?: LakeSystemFlow;
      /** Observed turbine state. Absent when unknown or when the dam has no powerhouse. */
      generating?: boolean;
      /** The neighbouring lake's level, for a dam downstream. */
      pool?: { valueFt: number; at: string };
    };

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
  /** Absent when the weather source did not answer; the page draws no card. */
  weather?: LakeWeather;
  /** Upstream to downstream. Absent on the dam page's preview, which has the dam above it already. */
  system?: LakeSystemRow[];
  /** The dam whose pool this is, so a client can open it without the registry. */
  dam?: { id: string; name: string };
}
