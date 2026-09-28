import { useState } from 'react';
import type { Coords } from '@eddy/geo';
// Freeze location during browsing. Explicit refresh adopts a new fix; first restored fix is allowed.
export function useCampingRanking(
  coords: Coords | null,
  revision: number,
): Coords | null {
  const [snapshot, setSnapshot] = useState({ coords, revision });
  if (snapshot.revision !== revision || (!snapshot.coords && coords)) {
    setSnapshot({ coords, revision });
    return coords;
  }
  return snapshot.coords;
}
