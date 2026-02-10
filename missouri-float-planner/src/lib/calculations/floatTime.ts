// src/lib/calculations/floatTime.ts
// Float time calculation logic based on vessel type and water conditions

import type { ConditionCode } from '@/types/api';

export interface VesselSpeeds {
  speedLowWater: number; // mph
  speedNormal: number; // mph
  speedHighWater: number; // mph
}

/**
 * Calculates float time in minutes based on distance, vessel speeds, and water conditions
 * 
 * @param distanceMiles Distance in miles
 * @param speeds Vessel speed configuration
 * @param conditionCode Current water condition code
 * @returns Float time in minutes, or null if conditions are dangerous
 */
export function calculateFloatTime(
  distanceMiles: number,
  speeds: VesselSpeeds,
  conditionCode: ConditionCode
): { minutes: number; speedMph: number } | null {
  let speedMph: number;

  switch (conditionCode) {
    case 'dangerous':
      // Use high water speed for dangerous conditions (still fast due to high water)
      speedMph = speeds.speedHighWater;
      break;

    case 'high':
      speedMph = speeds.speedHighWater;
      break;

    case 'optimal':
      speedMph = speeds.speedNormal;
      break;

    case 'okay':
      speedMph = speeds.speedLowWater;
      break;

    case 'low':
      // Very low water slows down significantly — matches DB calculate_float_time()
      speedMph = speeds.speedLowWater * 0.75;
      break;

    case 'too_low':
      // Too low water is very slow — matches DB calculate_float_time()
      speedMph = speeds.speedLowWater * 0.5;
      break;

    case 'unknown':
    default:
      // Default to normal speed if unknown
      speedMph = speeds.speedNormal;
      break;
  }

  if (speedMph <= 0) {
    return null;
  }

  const hours = distanceMiles / speedMph;
  const minutes = Math.round(hours * 60);

  return {
    minutes,
    speedMph: Math.round(speedMph * 10) / 10,
  };
}

/**
 * Formats float time as a human-readable string
 * 
 * @param minutes Total minutes
 * @returns Formatted string like "~3 hours 20 minutes" or "45 minutes"
 */
export function formatFloatTime(minutes: number): string {
  if (minutes < 60) {
    return `~${minutes} minutes`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `~${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }

  return `~${hours} ${hours === 1 ? 'hour' : 'hours'} ${remainingMinutes} ${remainingMinutes === 1 ? 'minute' : 'minutes'}`;
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
