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
 * Calculates float time from distance, vessel speeds, and water conditions.
 *
 * Returns `null` for dangerous conditions (we do not estimate a float time for
 * water that should not be floated).
 */
export function calculateFloatTime(
  distanceMiles: number,
  speeds: VesselSpeeds,
  conditionCode: ConditionCode,
  options?: FloatTimeOptions
): FloatTimeResult | null {
  // Never produce a float time for dangerous water.
  if (conditionCode === 'dangerous') {
    return null;
  }

  const basis: TimeBasis = options?.basis ?? 'trip';

  // Prefer the flow-dependent model when we have a live discharge and a reference
  // flow; otherwise fall back to the legacy condition-band step.
  let speedMph: number;
  if (options?.dischargeCfs != null && options?.refCfs != null) {
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
  };
}

/** Rounds a minute count to the nearest quarter hour (no false precision on estimates). */
export function roundToQuarterHour(minutes: number): number {
  return Math.max(15, Math.round(minutes / 15) * 15);
}

/**
 * Formats float time as a human-readable string. Rounds to the nearest quarter
 * hour so we never imply minute-level precision on an estimate.
 */
export function formatFloatTime(minutes: number): string {
  const rounded = roundToQuarterHour(minutes);
  if (rounded < 60) {
    return `~${rounded} minutes`;
  }

  const hours = Math.floor(rounded / 60);
  const remainingMinutes = rounded % 60;

  if (remainingMinutes === 0) {
    return `~${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }

  return `~${hours} ${hours === 1 ? 'hour' : 'hours'} ${remainingMinutes} ${remainingMinutes === 1 ? 'minute' : 'minutes'}`;
}

/**
 * Formats an estimate as a range, e.g. "~2 hours 30 minutes – ~4 hours".
 * Collapses to a single value when the rounded ends coincide.
 */
export function formatFloatTimeRange(minMinutes: number, maxMinutes: number): string {
  const lo = roundToQuarterHour(minMinutes);
  const hi = roundToQuarterHour(maxMinutes);
  if (lo >= hi) {
    return formatFloatTime(lo);
  }
  return `${formatFloatTime(lo)} – ${formatFloatTime(hi)}`;
}

/**
 * Compact abbreviated float time, e.g. "11h 30m", "4h", or "45m". Built for
 * tight stat displays where the verbose "~11 hours 30 minutes" wraps badly.
 */
export function formatFloatTimeCompact(minutes: number): string {
  const rounded = roundToQuarterHour(minutes);
  if (rounded < 60) {
    return `${rounded}m`;
  }
  const hours = Math.floor(rounded / 60);
  const remainingMinutes = rounded % 60;
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
}

/**
 * Compact estimate range for narrow stat columns, e.g. "~11h 30m–18h 30m".
 * A single "~" leads the range and the units are abbreviated so the value
 * stays on one or two lines instead of wrapping to three. Collapses to a
 * single value when the rounded ends coincide.
 */
export function formatFloatTimeRangeCompact(minMinutes: number, maxMinutes: number): string {
  const lo = roundToQuarterHour(minMinutes);
  const hi = roundToQuarterHour(maxMinutes);
  if (lo >= hi) {
    return `~${formatFloatTimeCompact(lo)}`;
  }
  return `~${formatFloatTimeCompact(lo)}–${formatFloatTimeCompact(hi)}`;
}

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
