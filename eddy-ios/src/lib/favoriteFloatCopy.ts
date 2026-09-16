import type { FavoriteFloatSummary } from '@eddy/types';

/** Typical trip range; opening the plan recalculates for current water. */
export function favoriteFloatMeta(
  float: Pick<FavoriteFloatSummary, 'distanceMiles' | 'durationHours' | 'durationFormatted' | 'difficulty'>,
): string {
  const time = float.durationFormatted ? `${float.durationFormatted} typical canoe trip` : 'Open plan for float time';
  return `${float.distanceMiles.toFixed(1)} mi · ${time} · Class ${float.difficulty}`;
}
