import type { FavoriteFloatSummary } from '@eddy/types';

/** Makes the evergreen estimate explicit: a typical-flow canoe trip, including ordinary stops. */
export function favoriteFloatMeta(
  float: Pick<FavoriteFloatSummary, 'distanceMiles' | 'durationHours' | 'difficulty'>,
): string {
  const hours = float.durationHours.toFixed(1);
  const unit = float.durationHours === 1 ? 'hr' : 'hrs';
  return `${float.distanceMiles.toFixed(1)} mi · about ${hours} ${unit} at a relaxed canoe pace · Class ${float.difficulty}`;
}
