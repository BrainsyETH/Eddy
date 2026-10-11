import type { ConditionCode } from '@/types/api';
import {
  calculateFloatTime,
  floatTimeWithholding,
  type FloatTimeOptions,
  type VesselSpeeds,
} from './floatTime';

export interface PublishedTiming {
  min: number;
  max: number;
  minutes: number;
}
export interface TripDuration {
  minutes: number;
  speedMph: number;
  isEstimate: boolean;
  basis: 'trip' | 'moving';
  timeRange: { min: number; max: number };
}

export function validPublishedTiming(published?: PublishedTiming | null): published is PublishedTiming {
  return Boolean(published &&
    [published.min, published.max, published.minutes].every(n => Number.isFinite(n) && n > 0) &&
    published.max >= published.min && published.minutes >= published.min && published.minutes <= published.max);
}

/** One timing decision for screening and confirmed plans. No IO and no second
 * stop allowance on published trip times. Same inputs must give the same range. */
export function calculateTripDuration(input: {
  miles: number;
  speeds: VesselSpeeds;
  condition: ConditionCode;
  options?: FloatTimeOptions;
  published?: PublishedTiming | null;
}): TripDuration | null {
  const { miles, speeds, condition, options, published } = input;
  if (
    !(miles > 0) ||
    !Number.isFinite(miles) ||
    floatTimeWithholding(condition, options?.riverType)
  )
    return null;
  if (validPublishedTiming(published)) {
    const factor =
      condition === 'too_low'
        ? 2
        : condition === 'low'
          ? 1.33
          : condition === 'high'
            ? 0.85
            : 1;
    const minutes = Math.round(published.minutes * factor);
    return {
      minutes,
      speedMph: miles / (minutes / 60),
      isEstimate: false,
      basis: 'trip',
      timeRange: {
        min: Math.round(published.min * factor),
        max: Math.round(published.max * factor),
      },
    };
  }
  const result = calculateFloatTime(miles, speeds, condition, {
    ...options,
    basis: 'trip',
  });
  return result
    ? {
        minutes: result.minutes,
        speedMph: result.speedMph,
        isEstimate: true,
        basis: result.basis,
        timeRange: { min: result.minMinutes, max: result.maxMinutes },
      }
    : null;
}
