// src/lib/calculations/floatTime.ts
// Float time calculation based on vessel type, distance, and water conditions.
//
// Model notes (see docs/FLOAT_DATA_ACCURACY_AUDIT.md):
//  - Speed is flow-dependent when a discharge (CFS) and a per-gauge reference flow
//    are supplied: V scales with (Q/Q_ref)^FLOW_EXPONENT, clamped. When no discharge
//    is available it degrades to the legacy condition-band step so nothing regresses.
//  - We distinguish MOVING time (paddling only) from TRIP time (includes the swim /
//    lunch / gravel-bar stops a real Ozark float includes). The headline number is a
//    trip estimate; the range is deliberately ASYMMETRIC and skewed long, because the
//    audit's residuals are one-directional (the old model only ever ran short).
//  - Dangerous water returns null: we never print a float time next to "do not float".

import type { ConditionCode } from '@/types/api';
import type { ReachRiverType } from '@shared/reach-types';

export interface VesselSpeeds {
  speedLowWater: number; // mph
  speedNormal: number; // mph
  speedHighWater: number; // mph
}

/**
 * Per-river degradation multipliers applied to the low-water vessel speed
 * (river_characteristics.speed_curve). The defaults are the Ozark-calibrated
 * values; rivers with different low-water behavior (bedrock, flatwater, dam
 * tailwater) should carry calibrated overrides in the database.
 */
export interface SpeedCurve {
  low?: number;
  too_low?: number;
}

const DEFAULT_SPEED_CURVE: Required<SpeedCurve> = { low: 0.75, too_low: 0.5 };

/**
 * Shared default canoe speeds (matches the seeded 'canoe' vessel_type). Use this
 * instead of re-hardcoding {2.0, 2.5, 3.5} in chat/social so every surface agrees.
 */
export const DEFAULT_CANOE_SPEEDS: VesselSpeeds = {
  speedLowWater: 2.0,
  speedNormal: 2.5,
  speedHighWater: 3.5,
};

export type TimeBasis = 'trip' | 'moving';

export interface FloatTimeResult {
  /** Headline estimate (trip time by default), in minutes. */
  minutes: number;
  /** Paddling-only time with no stops, in minutes. */
  movingMinutes: number;
  /** Fast end of the honest range (steady paddle, minimal stops). */
  minMinutes: number;
  /** Relaxed end of the honest range (frequent stops). */
  maxMinutes: number;
  /** Effective moving speed actually used, mph. */
  speedMph: number;
  /** Whether `minutes` is a trip or moving figure. */
  basis: TimeBasis;
  /**
   * Which speed model produced `speedMph`.
   *
   * Exposed because the fallback is silent by construction: omit dischargeCfs
   * or refCfs and you get the legacy band step, with no error and a
   * plausible-looking number. That is how /api/plan, chat and social came to
   * quote different times for the same trip — two of the three had simply never
   * been passed the flow arguments. A caller that cares can now assert which
   * model it got, and float-time-parity.test.ts does.
   */
  model: 'flow' | 'band';
}

export interface FloatTimeOptions {
  /** Current discharge (cfs). Enables the flow-dependent speed model when set. */
  dischargeCfs?: number | null;
  /** Reference/typical discharge for this gauge (cfs), e.g. the daily median (p50). */
  refCfs?: number | null;
  /** 'trip' (default) folds in stop time; 'moving' reports paddling-only. */
  basis?: TimeBasis;
  /** Per-river low-water multipliers (river_characteristics.speed_curve). */
  speedCurve?: SpeedCurve | null;
  /**
   * This river's hydrological archetype. Only `dam_tailwater` changes the
   * answer, and it changes it to "no answer" — see the guard in
   * calculateFloatTime.
   */
  riverType?: ReachRiverType | null;
}

// --- Model constants (tune to calibration residuals; see scripts/calibrate-float-times.ts) ---

/** Typical trip = moving time × this (≈20% overhead for stops on a relaxed float). */
const TRIP_STOP_FACTOR = 1.25;
/** Relaxed end of the range = moving time × this. Skewed long on purpose. */
const RANGE_MAX_FACTOR = 1.6;
/** Discharge sensitivity of velocity. V ∝ (Q/Q_ref)^FLOW_EXPONENT. */
const FLOW_EXPONENT = 0.3;
/** Clamp on the flow factor so extreme readings can't produce absurd speeds. */
const FLOW_FACTOR_FLOOR = 0.6; // very low water → dragging
const FLOW_FACTOR_CEIL = 1.6; // high water → fast

/**
 * Effective moving speed from discharge, relative to a reference flow.
 * Returns `baseSpeed` unchanged if inputs are missing/invalid.
 */
export function effectiveSpeedFromFlow(
  baseSpeed: number,
  dischargeCfs: number | null | undefined,
  refCfs: number | null | undefined
): number {
  if (
    dischargeCfs == null ||
    refCfs == null ||
    !(dischargeCfs > 0) ||
    !(refCfs > 0)
  ) {
    return baseSpeed;
  }
  const factor = Math.min(
    FLOW_FACTOR_CEIL,
    Math.max(FLOW_FACTOR_FLOOR, Math.pow(dischargeCfs / refCfs, FLOW_EXPONENT))
  );
  return baseSpeed * factor;
}

/** Legacy condition-band → speed step. Used only when no discharge is available. */
function bandSpeed(
  speeds: VesselSpeeds,
  conditionCode: ConditionCode,
  speedCurve?: SpeedCurve | null
): number {
  const curve = { ...DEFAULT_SPEED_CURVE, ...(speedCurve ?? {}) };
  switch (conditionCode) {
    case 'high':
      return speeds.speedHighWater;
    case 'flowing':
      return speeds.speedNormal;
    case 'good':
      return speeds.speedLowWater;
    case 'low':
      return speeds.speedLowWater * curve.low;
    case 'too_low':
      return speeds.speedLowWater * curve.too_low;
    case 'unknown':
    default:
      return speeds.speedNormal;
  }
}

/**
 * Why a float time is being withheld, or null when it is not.
 *
 * TWO DIFFERENT SILENCES, and callers must not word them the same:
 *
 *   'dangerous' — there IS a float time and we decline to quote it, because
 *                 the water should not be floated at all.
 *   'regulated' — there is no single float time to quote. The release can
 *                 change mid-float, so any one number is wrong the moment the
 *                 units start or stop. It is uncertainty about WHEN, not a
 *                 verdict about whether.
 *
 * Exported and shared because both /api/plan and chat have to make this
 * decision, and each of them previously made a DIFFERENT part of it: the
 * planner checked `dangerous` before serving published float_segments times
 * but only checked the river type on the estimate branch, and chat reported
 * "conditions are dangerous" for every withheld time regardless of cause.
 * One function, so the gate and the reason cannot drift apart again.
 */
export type FloatTimeWithholdReason = 'dangerous' | 'regulated';

export function floatTimeWithholding(
  conditionCode: ConditionCode,
  riverType?: ReachRiverType | null,
): FloatTimeWithholdReason | null {
  if (conditionCode === 'dangerous') return 'dangerous';
  if (riverType === 'dam_tailwater') return 'regulated';
  return null;
}

/**
 * Calculates float time from distance, vessel speeds, and water conditions.
 *
 * Returns `null` for dangerous conditions (we do not estimate a float time for
 * water that should not be floated) and for dam tailwaters (we cannot).
 */
export function calculateFloatTime(
  distanceMiles: number,
  speeds: VesselSpeeds,
  conditionCode: ConditionCode,
  options?: FloatTimeOptions
): FloatTimeResult | null {
  // One decision, made in one place — see floatTimeWithholding above.
  if (floatTimeWithholding(conditionCode, options?.riverType)) {
    return null;
  }

  // Kept as prose because the reason is not obvious from the predicate:
  //
  // Every model above takes ONE discharge and holds it for the whole trip.
  // That is a fair assumption on a rain-fed river, where the flow a floater
  // launches on is roughly the flow they take out on. It is simply false below
  // a hydro dam: Bull Shoals can go from a minimum-flow 800 cfs to over 20,000
  // in about an hour, so a party that launches on an idle river can be on a
  // different river by mile five — faster, deeper, and pushing.
  //
  // The failure is asymmetric, which is why this is a hard null rather than a
  // wider range. An estimate computed at idle flow is too LONG, so it reads as
  // conservative while actually telling someone they have hours of daylight
  // left on water that is about to rise under them.
  //
  // Restoring a number here means knowing when the release arrives at each
  // access, which is the travel-time lag calibration in docs/TAILWATER_PLAN.md
  // — measured, with a correlation floor, not assumed.

  const basis: TimeBasis = options?.basis ?? 'trip';

  // Prefer the flow-dependent model when we have a live discharge and a reference
  // flow; otherwise fall back to the legacy condition-band step.
  let speedMph: number;
  let model: 'flow' | 'band';
  if (options?.dischargeCfs != null && options?.refCfs != null) {
    model = 'flow';
    // Base on the vessel's normal speed, modulate by flow, and keep the result
    // within the vessel's own low↔high envelope so it stays physically sane.
    const flowSpeed = effectiveSpeedFromFlow(
      speeds.speedNormal,
      options.dischargeCfs,
      options.refCfs
    );
    speedMph = Math.min(
      speeds.speedHighWater,
      Math.max(speeds.speedLowWater * 0.5, flowSpeed)
    );
  } else {
    model = 'band';
    speedMph = bandSpeed(speeds, conditionCode, options?.speedCurve);
  }

  if (!(speedMph > 0) || !(distanceMiles > 0)) {
    return null;
  }

  const movingMinutes = Math.round((distanceMiles / speedMph) * 60);
  const headline =
    basis === 'trip' ? Math.round(movingMinutes * TRIP_STOP_FACTOR) : movingMinutes;

  return {
    minutes: headline,
    movingMinutes,
    minMinutes: movingMinutes, // fastest realistic: steady paddle, minimal stops
    maxMinutes: Math.round(movingMinutes * RANGE_MAX_FACTOR), // relaxed pace
    speedMph: Math.round(speedMph * 10) / 10,
    basis,
    model,
  };
}

// ── Wording ──────────────────────────────────────────────────────────────
// The formatters moved to shared/float-time-format.ts so eddy-ios can word a
// float time with the same rounding the website uses; a phone that rounded
// differently would show a different number for the same float. Re-exported
// here because ~20 call sites import them from this module.
export {
  roundToQuarterHour,
  formatFloatTime,
  formatFloatTimeRange,
  formatFloatTimeCompact,
  formatFloatTimeRangeCompact,
  formatFloatTimeCeiling,
  formatFloatTimeCeilingCompact,
  floatTimeCeilingBasisNote,
} from '@shared/float-time-format';

/**
 * Formats distance as a human-readable string
 *
 * @param miles Distance in miles
 * @returns Formatted string like "8.3 miles" or "0.5 miles"
 */
export function formatDistance(miles: number): string {
  const rounded = Math.round(miles * 10) / 10;
  return `${rounded} ${rounded === 1 ? 'mile' : 'miles'}`;
}

/**
 * Formats drive time as a human-readable string
 *
 * @param minutes Drive time in minutes
 * @returns Formatted string like "28 minutes" or "1 hour 15 minutes"
 */
export function formatDriveTime(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }

  return `${hours} ${hours === 1 ? 'hour' : 'hours'} ${remainingMinutes} ${remainingMinutes === 1 ? 'minute' : 'minutes'}`;
}
