'use client';

// src/app/rivers/[slug]/RiverHubMap.tsx
// Read-only overview map for the river hub — the river line + every access
// point pin. Reuses the same MapLibre components as the planner; fetches its
// own data so it stays a self-contained island on the server-rendered page.
//
// The river line is condition-colored (ConditionRiverLayer), NOT the
// planner's green route line — on this surface color means floatability,
// so the legend's route rows are hidden (legendRoute={false}).
//
// LAZY MOUNT: the map sits mid-page (Access Points section), but the
// MapLibre chunk (~250 KB gz) + style + tiles used to load at hydration
// even when the map was below the fold. The engine now mounts only when
// the container scrolls within ~600px of the viewport; until then the
// slot is a stable placeholder, so nothing shifts.

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { useRiver } from '@/hooks/useRivers';
import { useAccessPoints } from '@/hooks/useAccessPoints';
import { useHazards } from '@/hooks/useHazards';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const MapContainer = dynamic(() => import('@/components/map/MapContainer'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-ozark-900 flex items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  ),
});
const AccessPointMarkers = dynamic(() => import('@/components/map/AccessPointMarkers'), { ssr: false });
const HazardMarkers = dynamic(() => import('@/components/map/HazardMarkers'), { ssr: false });
const ConditionRiverLayer = dynamic(() => import('@/components/map/ConditionRiverLayer'), { ssr: false });

/** True once the element has come within `rootMargin` of the viewport —
 *  sticky, so the map never unmounts after the user scrolls past. */
function useNearViewport<T extends HTMLElement>(rootMargin = '600px') {
  const ref = useRef<T | null>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true); // ancient browser: just load
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true);
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [near, rootMargin]);

  return { ref, near };
}

export default function RiverHubMap({ riverSlug }: { riverSlug: string }) {
  const { ref, near } = useNearViewport<HTMLDivElement>();
  // Data hooks also wait for approach — no reason to hit the API for a map
  // the user never scrolls to. (React Query dedupes with the page's other
  // consumers, so this costs nothing when they're already fetched.)
  const { data: river } = useRiver(near ? riverSlug : '');
  const { data: accessPoints = [] } = useAccessPoints(near ? riverSlug : '');
  const { data: hazards = [] } = useHazards(near ? riverSlug : '');

  return (
    <div
      ref={ref}
      className="relative h-[360px] md:h-[440px] rounded-xl overflow-hidden border border-neutral-200"
    >
      {near && river ? (
        <MapContainer initialBounds={river.bounds} showLegend={true} legendRoute={false} cooperativeGestures={true}>
          {river.geometry && (
            <ConditionRiverLayer
              riverId={river.id}
              riverName={river.name}
              riverSlug={riverSlug}
              geometry={river.geometry}
            />
          )}
          <AccessPointMarkers accessPoints={accessPoints} />
          <HazardMarkers hazards={hazards} />
        </MapContainer>
      ) : (
        <div className="w-full h-full bg-ozark-900 flex items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      )}
    </div>
  );
}
