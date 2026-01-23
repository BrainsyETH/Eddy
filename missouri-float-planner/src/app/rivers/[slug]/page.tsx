'use client';

// src/app/rivers/[slug]/page.tsx
// River detail page with full planning experience

import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import RiverHeader from '@/components/river/RiverHeader';
import PlannerPanel from '@/components/river/PlannerPanel';
import ConditionsBlock from '@/components/river/ConditionsBlock';
import DifficultyExperience from '@/components/river/DifficultyExperience';
import LogisticsSection from '@/components/river/LogisticsSection';
import PointsOfInterest from '@/components/river/PointsOfInterest';
import WeatherBug from '@/components/ui/WeatherBug';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useRiver } from '@/hooks/useRivers';
import { useAccessPoints } from '@/hooks/useAccessPoints';
import { useConditions } from '@/hooks/useConditions';

// Dynamic imports for map
const MapContainer = dynamic(() => import('@/components/map/MapContainer'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-ozark-900 flex items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  ),
});
const RiverLayer = dynamic(() => import('@/components/map/RiverLayer'), { ssr: false });
const AccessPointMarkers = dynamic(() => import('@/components/map/AccessPointMarkers'), { ssr: false });

export default function RiverPage() {
  const params = useParams();
  const slug = params.slug as string;

  const { data: river, isLoading: riverLoading, error: riverError } = useRiver(slug);
  const { data: accessPoints, isLoading: accessPointsLoading } = useAccessPoints(slug);
  const { data: conditionData } = useConditions(river?.id || null);
  const condition = conditionData?.condition ?? null;

  if (riverLoading) {
    return (
      <div className="min-h-screen bg-river-night flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (riverError || !river) {
    return (
      <div className="min-h-screen bg-river-night flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
            <span className="text-3xl">😕</span>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">River Not Found</h2>
          <p className="text-river-gravel">
            The river you&apos;re looking for doesn&apos;t exist or has been removed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-river-night">
      {/* River Header */}
      <RiverHeader 
        river={river} 
        condition={condition}
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Main Content */}
          <div className="lg:col-span-2 space-y-6 order-2 lg:order-1">
            {/* Planner Panel */}
            <PlannerPanel
              river={river}
              accessPoints={accessPoints || []}
              isLoading={accessPointsLoading}
            />

            {/* Conditions & Safety */}
            <ConditionsBlock
              riverId={river.id}
              condition={condition}
            />

            {/* Difficulty & Experience */}
            <DifficultyExperience river={river} />

            {/* Logistics */}
            <LogisticsSection
              accessPoints={accessPoints || []}
              isLoading={accessPointsLoading}
            />

            {/* Points of Interest */}
            <PointsOfInterest riverSlug={slug} />
          </div>

          {/* Right Column - Map */}
          <div className="lg:col-span-1 order-1 lg:order-2">
            <div className="sticky top-4 relative">
              <div className="rounded-xl overflow-hidden shadow-2xl h-[400px] sm:h-[500px] lg:h-[600px] w-full">
                {/* Weather Bug overlay */}
                <WeatherBug riverSlug={slug} riverId={river.id} />
                
                <MapContainer initialBounds={river.bounds}>
                  {/* RiverLayer removed - geometry quality needs improvement before displaying */}
                  {accessPoints && (
                    <AccessPointMarkers
                      accessPoints={accessPoints}
                      selectedPutIn={null}
                      selectedTakeOut={null}
                    />
                  )}
                </MapContainer>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
