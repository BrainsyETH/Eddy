import type { FavoriteFloatSummary } from '@eddy/types';

/** Makes the editorial estimate explicit: moving time at the source's 2 mph canoe pace. */
export function favoriteFloatMeta(
  float: Pick<FavoriteFloatSummary, 'distanceMiles' | 'durationHours' | 'difficulty'>,
): string {
  if (typeof float.durationHours !== 'number' || !Number.isFinite(float.durationHours)) return `${float.distanceMiles.toFixed(1)} mi · Open plan for float time · Class ${float.difficulty}`;
  const hours = float.durationHours.toFixed(1);
  const unit = float.durationHours === 1 ? 'hr' : 'hrs';
  return `${float.distanceMiles.toFixed(1)} mi · about ${hours} ${unit} paddling, no stops · Class ${float.difficulty}`;
}
