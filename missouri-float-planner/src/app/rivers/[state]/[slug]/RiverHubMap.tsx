'use client';

// src/app/rivers/[slug]/RiverHubMap.tsx
// Read-only overview map for the river hub — the river line + every access
// point pin. Reuses the same MapLibre components as the planner; fetches its
// own data so it stays a self-contained island on the server-rendered page.
//
// The river line is condition-colored (ConditionRiverLayer), NOT the
// planner's green route line — on this surface color means floatability,
// so the legend's route rows are hidden (legendRoute={false}).

import dynamic from 'next/dynamic';
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

export default function RiverHubMap({ riverSlug }: { riverSlug: string }) {
  const { data: river } = useRiver(riverSlug);
  const { data: accessPoints = [] } = useAccessPoints(riverSlug);
  const { data: hazards = [] } = useHazards(riverSlug);

  return (
    <div className="relative h-[360px] md:h-[440px] rounded-xl overflow-hidden border border-neutral-200">
      {river ? (
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
