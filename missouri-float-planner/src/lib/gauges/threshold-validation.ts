// src/lib/gauges/threshold-validation.ts
// What an admin may save into a river_gauges threshold ladder.
//
// These numbers decide the condition badge every visitor sees, so the save
// path refuses a ladder the trust check would immediately flag. The ordering
// rule is deliberately the same predicate as validate_river_data()'s
// `threshold_order` (supabase/migrations/20261101175651_…): adjacent set
// values must strictly increase, and level_high is compared with
// level_dangerous only, because classifyReading() starts the High band at
// level_optimal_max (shared/condition-ladder.ts).
//
// Pure, so the admin page runs the same check before it sends the request.

export type ThresholdUnit = 'ft' | 'cfs';

export const LADDER_KEYS = [
  'levelTooLow',
  'levelLow',
  'levelOptimalMin',
  'levelOptimalMax',
  'levelHigh',
  'levelDangerous',
] as const;
export const ALT_LADDER_KEYS = [
  'altLevelTooLow',
  'altLevelLow',
  'altLevelOptimalMin',
  'altLevelOptimalMax',
  'altLevelHigh',
  'altLevelDangerous',
] as const;

export type LadderKey = (typeof LADDER_KEYS)[number];
export type AltLadderKey = (typeof ALT_LADDER_KEYS)[number];
export type ThresholdKey = LadderKey | AltLadderKey;
export type Ladder = Record<LadderKey, number | null>;

export interface ThresholdState extends Record<ThresholdKey, number | null> {
  thresholdUnit: ThresholdUnit;
}

const LABELS: Record<LadderKey, string> = {
  levelTooLow: 'Too Low',
  levelLow: 'Low',
  levelOptimalMin: 'Optimal Min',
  levelOptimalMax: 'Optimal Max',
  levelHigh: 'High',
  levelDangerous: 'Dangerous',
};

// The pairs validate_river_data() compares. Keep in step with that function.
const ORDERED_PAIRS: ReadonlyArray<readonly [LadderKey, LadderKey]> = [
  ['levelTooLow', 'levelLow'],
  ['levelLow', 'levelOptimalMin'],
  ['levelOptimalMin', 'levelOptimalMax'],
  ['levelOptimalMax', 'levelDangerous'],
  ['levelHigh', 'levelDangerous'],
];

export function otherUnit(unit: ThresholdUnit): ThresholdUnit {
  return unit === 'ft' ? 'cfs' : 'ft';
}

/** Null when the ladder is acceptable, otherwise a sentence for the operator. */
export function ladderProblem(ladder: Ladder, unit: ThresholdUnit): string | null {
  for (const key of LADDER_KEYS) {
    const value = ladder[key];
    if (value === null) continue;
    if (!Number.isFinite(value)) return `${LABELS[key]} is not a number`;
    // Stage can legitimately sit below a gauge's datum; flow cannot be negative.
    if (unit === 'cfs' && value < 0) return `${LABELS[key]} cannot be negative in cfs`;
  }
  for (const [lower, upper] of ORDERED_PAIRS) {
    const a = ladder[lower];
    const b = ladder[upper];
    if (a !== null && b !== null && a >= b) {
      return `${LABELS[lower]} (${a} ${unit}) must be below ${LABELS[upper]} (${b} ${unit})`;
    }
  }
  return null;
}

/**
 * Reads one submitted threshold. `undefined` means "not part of this request";
 * '' and null clear the value. Anything else must be a real number — an
 * unparseable entry used to be stored as null, silently deleting a threshold.
 */
export function parseThresholdValue(raw: unknown): { ok: true; value: number | null | undefined } | { ok: false } {
  if (raw === undefined) return { ok: true, value: undefined };
  if (raw === null || raw === '') return { ok: true, value: null };
  if (typeof raw === 'number') return Number.isFinite(raw) ? { ok: true, value: raw } : { ok: false };
  if (typeof raw === 'string' && /^\s*-?(\d+\.?\d*|\.\d+)\s*$/.test(raw)) return { ok: true, value: Number(raw) };
  return { ok: false };
}

export type ThresholdPatch = Partial<Record<ThresholdKey, unknown>> & { thresholdUnit?: unknown };

export type ThresholdUpdateResult =
  | { ok: true; next: ThresholdState; changed: boolean }
  | { ok: false; error: string };

/**
 * Applies a partial edit to the stored ladder and decides whether the result
 * may be saved.
 *
 * Feet and cfs are related only by each gauge's own rating curve — there is no
 * conversion — so a unit change may never carry numbers across. The stored
 * primary ladder moves to the alternate slot (it is still correct in its own
 * unit) and the alternate ladder becomes primary; the request may then
 * overwrite either. A switch that would leave the selected unit with no
 * thresholds is refused, because that river would lose its condition badge.
 */
export function applyThresholdPatch(current: ThresholdState, patch: ThresholdPatch): ThresholdUpdateResult {
  let unit = current.thresholdUnit;
  if (patch.thresholdUnit !== undefined) {
    if (patch.thresholdUnit !== 'ft' && patch.thresholdUnit !== 'cfs') {
      return { ok: false, error: 'Unit must be ft or cfs' };
    }
    unit = patch.thresholdUnit;
  }
  const unitChanged = unit !== current.thresholdUnit;

  const next: ThresholdState = { ...current, thresholdUnit: unit };
  if (unitChanged) {
    LADDER_KEYS.forEach((key, i) => {
      next[key] = current[ALT_LADDER_KEYS[i]];
      next[ALT_LADDER_KEYS[i]] = current[key];
    });
  }

  let touched = unitChanged;
  for (const key of [...LADDER_KEYS, ...ALT_LADDER_KEYS]) {
    const parsed = parseThresholdValue(patch[key]);
    if (!parsed.ok) return { ok: false, error: `${key} is not a number` };
    if (parsed.value === undefined) continue;
    if (next[key] !== parsed.value) touched = true;
    next[key] = parsed.value;
  }
  if (!touched) return { ok: true, next, changed: false };

  const primary = Object.fromEntries(LADDER_KEYS.map((key) => [key, next[key]])) as Ladder;
  const alternate = Object.fromEntries(LADDER_KEYS.map((key, i) => [key, next[ALT_LADDER_KEYS[i]]])) as Ladder;

  if (unitChanged && LADDER_KEYS.every((key) => primary[key] === null)) {
    return {
      ok: false,
      error: `Enter the ${unit} thresholds before switching to ${unit}. The ${current.thresholdUnit} values cannot be reused: the two units are related only by this gauge's rating curve.`,
    };
  }

  const primaryProblem = ladderProblem(primary, unit);
  if (primaryProblem) return { ok: false, error: primaryProblem };
  const altProblem = ladderProblem(alternate, otherUnit(unit));
  if (altProblem) return { ok: false, error: `Alternate thresholds: ${altProblem}` };

  return { ok: true, next, changed: true };
}
