// Private trip summaries only. Never add GPS arrays, tracker state or raw fixes.
import type { ConditionCode } from './condition-system';

/**
 * The condition the planner gave this float at Start (/api/route-estimate):
 * the gauge that set it, which can sit below the put-in after an escalation.
 */
export interface StartCondition {
  code: Exclude<ConditionCode, 'unknown'>;
  gaugeName: string;
  /** Null for a station USGS does not run (USACE tailwaters, migration 00198). */
  usgsSiteId: string | null;
  heightFt: number | null;
  dischargeCfs: number | null;
  /** When the gauge reading was taken, not when the estimate was made. */
  observedAt: string;
  /** Stale or suspect at estimate time. */
  accuracyWarning: boolean;
}

/** The route index's calibrated span at Start: its lowest and highest access-point miles. */
export interface RiverSpan {
  firstMile: number;
  lastMile: number;
  firstName: string;
  lastName: string;
  /**
   * The mile system these miles and the float's coveredMiles are in: a hash
   * of the river's access-point miles at Start (float-recap.ts
   * spanCalibration). Access-point miles get recalibrated, and intervals from
   * two calibrations do not lie on one strip, so the lifetime line merges
   * only floats that share this value.
   */
  calibration: string;
}

/** Current conditions at the put-in at Start. Values only, never the coordinates. */
export interface StartWeather {
  tempF: number;
  precipIn1h: number;
  observedAt: string;
  /** OpenWeather observation icon; absent on older floats. */
  conditionIcon?: string;
}

/** The recap's route in the river's original mile system, never a GPS trace. */
export interface FloatRouteSnapshot {
  startMile: number;
  takeOutMile: number;
  startName: string;
  calibration: string;
}

export interface CompletedFloat {
  version: 1;
  id: string;
  riverSlug: string;
  riverName: string;
  putInId: string | null;
  putInName: string | null;
  /** Description of the recorded start, separate from the confirmed launch access. */
  startNote?: string;
  takeOutId: string;
  takeOutName: string;
  boatType: string | null;
  startedAt: number;
  endedAt: number;
  elapsedMs: number;
  movingMs: number;
  stoppedMs: number;
  unknownMs: number;
  distanceMiles: number;
  movingMph: number | null;
  plannerMph: number | null;
  firstMile: number | null;
  lastMile: number | null;
  /** Reaching the planned take-out is distinct from simply ending tracking. */
  reachedTakeOut: boolean;
  measurementVersion: 1;
  /** Historical reading resolved by the server; null when none is close enough. */
  water?: {
    gaugeName: string;
    gaugeStationId: string;
    observedAt: string;
    heightFt: number | null;
    dischargeCfs: number | null;
    /** Computed on first upload from the anchor gauge's ladder. Absent on older rows. */
    conditionCode?: ConditionCode;
    usgsSiteId?: string;
  } | null;
  // The fields below are absent on floats recorded before they existed, and
  // on any float whose capture failed. Readers must treat a malformed value
  // as absent (float-recap.ts), never reject the row.
  startCondition?: StartCondition | null;
  riverSpan?: RiverSpan | null;
  /** Credited river miles (@eddy/geo coveredMiles); null when there were too many to keep. */
  coveredMiles?: [number, number][] | null;
  startWeather?: StartWeather | null;
  routeSnapshot?: FloatRouteSnapshot | null;
}

export interface SavedFloatSummary {
  shortCode: string;
  url: string;
  riverName: string;
  riverSlug: string;
  putInName: string;
  takeOutName: string;
  putInId?: string;
  takeOutId?: string;
  distanceLabel: string;
  savedAt: string;
  photoUrl?: string;
}

export type ArchiveKind = 'completed' | 'saved';
export interface ArchiveRow {
  id: string;
  kind: ArchiveKind;
  payload: CompletedFloat | SavedFloatSummary | null;
  deleted: boolean;
  /** Version of the explicit account opt-in when this float finished. */
  contributionVersion: string | null;
}
/** One result per input row, in the same order. A refusal keeps the local copy. */
export type ArchiveWriteResult =
  | { status: 'accepted' }
  | { status: 'rejected'; reason: string };
export interface ContributionPreference {
  enabled: boolean;
  version: string | null;
}
export const NO_CONTRIBUTION: ContributionPreference = { enabled: false, version: null };
