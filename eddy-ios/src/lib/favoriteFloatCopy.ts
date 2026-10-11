import type { FavoriteFloatSummary } from '@eddy/types';

/** Typical trip range; opening the plan recalculates for current water. */
export function favoriteFloatMeta(
  float: Pick<FavoriteFloatSummary, 'distanceMiles' | 'durationHours' | 'durationFormatted' | 'durationUnavailableReason' | 'difficulty'>,
): string {
  const time = float.durationFormatted ? `${float.durationFormatted} typical canoe trip` : float.durationUnavailableReason === 'regulated' ? 'Time varies with dam releases' : 'Open plan for float time';
  return `${float.distanceMiles.toFixed(1)} mi · ${time}${float.difficulty ? ` · Class ${float.difficulty}` : ''}`;
}

/** Keep published range endpoints intact while shortening their display units. */
export function compactFloatTime(formatted: string): string {
  return formatted.replace(/~/g, '').replace(/hours?/g, 'hr').replace(/minutes?/g, 'min').replace(/\s+[-–]\s+/g, '–').trim();
}
