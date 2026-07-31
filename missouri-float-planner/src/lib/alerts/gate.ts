// src/lib/alerts/gate.ts
// Data-quality gate: decides whether a gauge reading is trustworthy enough to
// change a river's condition and fire an alert.
//
// WHY: before this existed, `gauge_readings.qualifiers` was written and never
// read, and the flatline check only incremented a counter. A stuck sensor or an
// equipment-flagged reading classified exactly like a clean one — and because
// the alert path posts publicly, a sensor outage could put a false "DANGEROUS"
// on Facebook.
//
// Pure and I/O-free so the whole policy is unit-testable.

/** Codes meaning the VALUE is suspect (not merely unapproved). */
const SUSPECT_QUALIFIERS: ReadonlySet<string> = new Set([
  'e', 'Ice', 'Eqp', 'Bkw', 'Mnt', 'ZFl', '***', 'Dis', 'Rat', 'Ssn',
]);

/**
 * Qualifiers that can only describe a DISCHARGE series.
 *
 * USGS merges qualifier codes across parameters into one flat array on the
 * reading (see mergeQualifierCodes in src/lib/flow-providers/usgs.ts), so we
 * cannot tell whether `Ice` flagged the stage or the flow. Without this carve
 * out, an ice-affected discharge series would suppress a stage-primary gauge's
 * genuine dangerous alert. These three cannot describe a stage sensor:
 *   ZFl = zero flow · Ssn = seasonal (parameter not recorded) · Rat = rating extension
 */
const DISCHARGE_ONLY_QUALIFIERS: ReadonlySet<string> = new Set(['ZFl', 'Ssn', 'Rat']);

/**
 * Max reading age before we refuse to act on it. NWS sites report far less
 * often; USACE release series publish hourly but with enough publication lag
 * that the 3h default would gate a normal, healthy dam.
 */
const MAX_AGE_MS: Record<string, number> = {
  usgs: 3 * 60 * 60 * 1000,
  nws: 6 * 60 * 60 * 1000,
  usace: 4 * 60 * 60 * 1000,
};
const DEFAULT_MAX_AGE_MS = 3 * 60 * 60 * 1000;

/**
 * The same limit, in hours, for the read path.
 *
 * Exported so a screen cannot confidently display a reading this module has
 * already stopped acting on. /api/gauges/[siteId] used its own 6, which left a
 * three-hour window where the gauge screen showed a number with a condition
 * chip on it while every alert against that station was being skipped as
 * `gated` — invisibly, since no skip reason reaches a client.
 */
export function maxReadingAgeHours(provider?: string | null): number {
  return (MAX_AGE_MS[provider ?? 'usgs'] ?? DEFAULT_MAX_AGE_MS) / 3_600_000;
}

/** Tolerance for clock skew before a future timestamp is treated as bad data. */
const MAX_FUTURE_SKEW_MS = 10 * 60 * 1000;

/** Identical consecutive readings that mean the sensor is stuck. */
const FLATLINE_MIN_SAMPLES = 6;

export type GateRejection =
  | 'no_primary_value'
  | 'suspect_qualifier'
  | 'stale'
  | 'future'
  | 'flatline';

export interface GateInput {
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  thresholdUnit: 'ft' | 'cfs';
  floodStageFt?: number | null;
  /** Merged qualifier codes from the reading row. */
  qualifiers?: string[] | null;
  readingAt: Date | string | null;
  now?: Date;
  /**
   * Recent values of the PRIMARY unit, newest first, for flatline detection.
   * Only supply these when a transition is actually in play — a steady gauge in
   * a drought is normal, and flatline only matters when a value claims to move.
   */
  recentPrimaryValues?: Array<number | null>;
  provider?: string;
}

export type GateResult =
  | {
      ok: true;
      /** The primary-unit value, or null when only the flood override applies. */
      value: number | null;
      unit: 'ft' | 'cfs';
      /**
       * True when the primary unit has no reading but the stored stage is at or
       * above NWS flood stage. The caller must still classify (computeCondition
       * applies the flood override before its null guard) — refusing here would
       * turn a genuine flood into `unknown`.
       */
      floodOverrideOnly: boolean;
    }
  | { ok: false; reason: GateRejection };

function toDate(value: Date | string | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Suspect codes that could describe this gauge's primary sensor. */
export function blockingQualifiers(
  qualifiers: string[] | null | undefined,
  thresholdUnit: 'ft' | 'cfs'
): string[] {
  if (!qualifiers?.length) return [];
  return qualifiers.filter((code) => {
    if (!SUSPECT_QUALIFIERS.has(code)) return false;
    if (thresholdUnit === 'ft' && DISCHARGE_ONLY_QUALIFIERS.has(code)) return false;
    return true;
  });
}

/** True when the recent primary series is stuck at one value. */
export function isFlatlined(values: Array<number | null> | undefined): boolean {
  if (!values?.length) return false;
  const present = values.filter((v): v is number => v !== null && v !== undefined);
  if (present.length < FLATLINE_MIN_SAMPLES) return false;
  return present.every((v) => v === present[0]);
}

export function gateReading(input: GateInput): GateResult {
  const now = input.now ?? new Date();
  const unit = input.thresholdUnit;

  // ── Timestamp sanity ───────────────────────────────────────────
  const readingAt = toDate(input.readingAt);
  if (readingAt) {
    const ageMs = now.getTime() - readingAt.getTime();
    if (ageMs < -MAX_FUTURE_SKEW_MS) return { ok: false, reason: 'future' };
    const maxAge = MAX_AGE_MS[input.provider ?? 'usgs'] ?? DEFAULT_MAX_AGE_MS;
    if (ageMs > maxAge) return { ok: false, reason: 'stale' };
  }

  // ── Suspect qualifiers ─────────────────────────────────────────
  // Note 'P' (provisional) is NOT suspect — essentially every real-time USGS
  // reading carries it, so blocking on it would disable alerting entirely.
  if (blockingQualifiers(input.qualifiers, unit).length > 0) {
    return { ok: false, reason: 'suspect_qualifier' };
  }

  // ── Primary-unit value ─────────────────────────────────────────
  // No cross-unit fallback: comparing cfs against ft thresholds is how a dead
  // stage sensor used to manufacture a `dangerous`.
  const value = (unit === 'cfs' ? input.dischargeCfs : input.gaugeHeightFt) ?? null;

  if (value === null) {
    const stage = input.gaugeHeightFt;
    const floodStage = input.floodStageFt;
    if (floodStage != null && stage != null && stage >= floodStage) {
      // Primary sensor is out, but the stage says this is flood water. Let it
      // through so the flood override can fire.
      return { ok: true, value: null, unit, floodOverrideOnly: true };
    }
    return { ok: false, reason: 'no_primary_value' };
  }

  // ── Flatline ───────────────────────────────────────────────────
  // Exempt regulated releases: a dam holding 3,590 cfs for eight hours is
  // normal operation, not a stuck sensor. On a USACE station a constant value
  // is the expected case, so flatline detection would suppress exactly the
  // alerts that matter.
  if (input.provider !== 'usace' && isFlatlined(input.recentPrimaryValues)) {
    return { ok: false, reason: 'flatline' };
  }

  return { ok: true, value, unit, floodOverrideOnly: false };
}
