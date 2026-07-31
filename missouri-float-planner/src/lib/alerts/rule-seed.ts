// src/lib/alerts/rule-seed.ts
// Which side of its threshold is the river on, right now?
//
// Answered once, at creation, so an edge-triggered rule starts armed correctly.
// Without it the evaluator's first pass has to choose between two wrong
// behaviours: fire (telling someone who just typed "above 3 ft" about a river
// they can see is at 5.2) or seed silently (swallowing a crossing that happened
// between the tap and the pass).
//
// Best effort by design. Every failure here degrades to an unseeded rule, which
// the evaluator handles as `seeding` on its first look — a slightly later first
// alert, not a broken one. A gauge being briefly unreadable must never be the
// reason someone cannot create an alert on it.

import { classifyReading, hasLadder } from '@shared/condition-ladder';
import { loadLatestReadings } from '@/lib/gauges/latest-readings';
import { metricUnit, thresholdState, type CrossingState } from './gauge-threshold';
import { toNum } from '@/lib/utils/num';
import type { AlertComparator, AlertMetric } from '@/types/api';

export interface SeedInput {
  gaugeStationId: string;
  riverId: string | null;
  mode: 'condition' | 'threshold';
  metric: AlertMetric | null;
  comparator: AlertComparator | null;
  thresholdValue: number | null;
  thresholdValueMax: number | null;
}

export interface SeedResult {
  state: CrossingState | null;
  value: number | null;
  unit: 'ft' | 'cfs' | null;
  readingAt: string | null;
  /** Condition mode only — the verdict the rule starts from. */
  conditionCode: string | null;
}

const EMPTY: SeedResult = {
  state: null,
  value: null,
  unit: null,
  readingAt: null,
  conditionCode: null,
};

export async function seedCrossingState(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  input: SeedInput,
): Promise<SeedResult> {
  try {
    const readings = await loadLatestReadings(supabase, [input.gaugeStationId]);
    const reading = readings.get(input.gaugeStationId);
    if (!reading) return EMPTY;

    // ── Condition mode ────────────────────────────────────────────────────
    if (input.mode === 'condition') {
      if (!input.riverId) return EMPTY;

      const { data: pairing } = await supabase
        .from('river_gauges')
        .select(
          'threshold_unit, level_too_low, level_low, level_optimal_min, ' +
            'level_optimal_max, level_high, level_dangerous, flood_stage_ft',
        )
        .eq('river_id', input.riverId)
        .eq('gauge_station_id', input.gaugeStationId)
        .maybeSingle();

      if (!pairing) return EMPTY;

      const ladder = {
        levelTooLow: toNum(pairing.level_too_low),
        levelLow: toNum(pairing.level_low),
        levelOptimalMin: toNum(pairing.level_optimal_min),
        levelOptimalMax: toNum(pairing.level_optimal_max),
        levelHigh: toNum(pairing.level_high),
        levelDangerous: toNum(pairing.level_dangerous),
        thresholdUnit: (pairing.threshold_unit ?? 'ft') as 'ft' | 'cfs',
        floodStageFt: toNum(pairing.flood_stage_ft),
      };
      if (!hasLadder(ladder)) return EMPTY;

      const code = classifyReading(
        reading.gauge_height_ft,
        ladder,
        reading.discharge_cfs,
        { strictUnit: true },
      );
      // `unknown` is left unseeded on purpose. Storing it would satisfy the
      // evaluator's "have I seen this before?" check with a code that can never
      // be transitioned FROM — classifyEventKind treats unknown on either side
      // as 'info' — so the rule would look seeded and never fire.
      if (code === 'unknown') return EMPTY;

      const unit = ladder.thresholdUnit;
      return {
        state: null,
        value: unit === 'cfs' ? reading.discharge_cfs : reading.gauge_height_ft,
        unit,
        readingAt: reading.reading_at,
        conditionCode: code,
      };
    }

    // ── Threshold mode ────────────────────────────────────────────────────
    const unit = metricUnit(input.metric);
    const value = unit === 'cfs' ? reading.discharge_cfs : reading.gauge_height_ft;
    // No cross-unit fallback, here as everywhere: a stage reading must not seed
    // a discharge rule.
    if (value == null || input.thresholdValue == null) return EMPTY;

    // Deliberately NOT gated. gateReading() decides whether a reading may move
    // a rule and fire a notification; this only decides where the rule starts.
    // Refusing to seed off an ice-flagged reading would leave the rule unarmed
    // and hand the very first crossing to the `seeding` path instead.
    const state = thresholdState(
      {
        comparator: input.comparator,
        threshold_value: input.thresholdValue,
        threshold_value_max: input.thresholdValueMax,
      },
      value,
    );

    return { state, value, unit, readingAt: reading.reading_at, conditionCode: null };
  } catch {
    return EMPTY;
  }
}
