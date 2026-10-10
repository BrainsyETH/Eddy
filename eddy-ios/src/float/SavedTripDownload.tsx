// eddy-ios/src/float/SavedTripDownload.tsx
// The offline-map card for a saved float, which has to load its route first.
// Renders nothing until the route is known, and nothing if it cannot be.

import { useEffect, useState } from 'react';
import { useFloatSession } from '@/hooks/useFloatSession';
import type { FloatRoute } from '@/lib/floatSession';
import { loadFloatRoute } from './loadFloatRoute';
import { TripDownloadCard } from './TripDownloadCard';

export function SavedTripDownload({
  riverSlug,
  shortCode,
  putInId,
  takeOutId,
}: {
  riverSlug: string;
  shortCode: string;
  putInId: string;
  takeOutId: string;
}) {
  const active = useFloatSession();
  const [route, setRoute] = useState<FloatRoute | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadFloatRoute(riverSlug, controller.signal, shortCode)
      .then((loaded) => setRoute(loaded.ok ? loaded.route : null))
      .catch(() => {});
    return () => controller.abort();
  }, [riverSlug, shortCode]);

  if (!route) return null;
  return (
    <TripDownloadCard
      tripKey={shortCode}
      route={route}
      fromId={putInId}
      toId={takeOutId}
      protectedByActiveFloat={active?.shortCode === shortCode}
    />
  );
}
