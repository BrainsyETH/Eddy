import { hasLadder, type ConditionThresholds } from './condition-ladder';
import { STALE_READING_HOURS } from './reading-staleness';

/** Rating evidence and observation availability are independent. */
export interface ConditionAvailability {
  ratingStatus: 'rated' | 'unrated' | 'unknown';
  readingStatus: 'current' | 'stale' | 'unavailable';
}
interface Input {
  thresholds?: ConditionThresholds | null;
  availability?: ConditionAvailability;
  gaugeHeightFt?: number | null;
  dischargeCfs?: number | null;
  thresholdUnit?: 'ft' | 'cfs';
  readingTimestamp?: string | null;
  readingAgeHours?: number | null;
}
export function conditionAvailability(input: Input, now = Date.now()): ConditionAvailability {
  const ratingStatus = input.availability?.ratingStatus ?? (input.thresholds
    ? hasLadder(input.thresholds) ? 'rated' : 'unrated' : 'unknown');
  const unit = input.thresholds?.thresholdUnit ?? input.thresholdUnit;
  const value = unit === 'cfs' ? input.dischargeCfs : unit === 'ft'
    ? input.gaugeHeightFt : input.gaugeHeightFt ?? input.dischargeCfs;
  const age = input.readingTimestamp
    ? (now - Date.parse(input.readingTimestamp)) / 3_600_000 : input.readingAgeHours;
  const readingStatus = typeof value !== 'number' || !Number.isFinite(value) ? 'unavailable'
    : age == null || !Number.isFinite(age) || age < -0.25 || age > STALE_READING_HOURS ? 'stale' : 'current';
  return { ratingStatus, readingStatus };
}
/** For unknown verdicts only. Recompute age so saved plans cannot freeze freshness. */
export function unknownConditionLabel(input: Input): string {
  const { ratingStatus, readingStatus } = conditionAvailability(input);
  const reading = readingStatus === 'unavailable' ? 'Gauge data unavailable'
    : readingStatus === 'stale' ? 'Reading out of date' : null;
  if (ratingStatus === 'unrated') return reading ? `Not rated · ${reading}` : 'Not rated — readings only';
  return reading ?? 'Conditions unavailable';
}
