// eddy-ios/src/float/useRouteAccessPoints.ts
// The float's river access points as the phone cached them, by id, for their
// photos and place marks. The float session copies only what tracking needs
// (names, positions, miles) and never the photos, so Float tools reads them
// from the river cache the launch bundle seeds. Missing is fine: rows fall
// back to the Eddy place mark, which needs nothing.

import { useEffect, useState } from 'react';
import type { MapAccessPoint } from '@eddy/types';
import { readRiver } from '@/lib/riverCache';

export function useRouteAccessPoints(slug: string | undefined): ReadonlyMap<string, MapAccessPoint> {
  const [points, setPoints] = useState<ReadonlyMap<string, MapAccessPoint>>(new Map());
  useEffect(() => {
    if (!slug) return;
    let current = true;
    void readRiver(slug).then((cached) => {
      if (!current) return;
      setPoints(new Map((cached?.payload.accessPoints ?? []).map((point) => [point.id, point])));
    }).catch(() => {});
    return () => { current = false; };
  }, [slug]);
  return points;
}
