'use client';

// src/app/page.tsx
// Main home page with interactive map

import { useState } from 'react';
import MapContainer from '@/components/map/MapContainer';
import RiverLayer from '@/components/map/RiverLayer';
import AccessPointMarkers from '@/components/map/AccessPointMarkers';
import AccessPointPopup from '@/components/map/AccessPointPopup';
import RiverSelector from '@/components/ui/RiverSelector';
import VesselSelector from '@/components/ui/VesselSelector';
import PlanSummary from '@/components/plan/PlanSummary';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorMessage from '@/components/ui/ErrorMessage';
import { useRivers } from '@/hooks/useRivers';
import { useRiver } from '@/hooks/useRivers';
import { useAccessPoints } from '@/hooks/useAccessPoints';
import { useFloatPlan } from '@/hooks/useFloatPlan';
import { useVesselTypes } from '@/hooks/useVesselTypes';
import type { AccessPoint } from '@/types/api';

export default function Home() {
  const [selectedRiverId, setSelectedRiverId] = useState<string | null>(null);
  const [selectedRiverSlug, setSelectedRiverSlug] = useState<string | null>(null);
  const [selectedPutIn, setSelectedPutIn] = useState<string | null>(null);
  const [selectedTakeOut, setSelectedTakeOut] = useState<string | null>(null);
  const [selectedVesselTypeId, setSelectedVesselTypeId] = useState<string | null>(null);
  const [popupPoint, setPopupPoint] = useState<AccessPoint | null>(null);
  const [popupCoordinates, setPopupCoordinates] = useState<{ lng: number; lat: number } | null>(null);
  const [showPlan, setShowPlan] = useState(false);

  // Fetch data
  const { data: rivers, isLoading: riversLoading } = useRivers();
  const { data: river, isLoading: riverLoading } = useRiver(selectedRiverSlug || '');
  const { data: accessPoints, isLoading: accessPointsLoading } = useAccessPoints(selectedRiverSlug);
  const { data: vesselTypes } = useVesselTypes();

  // Calculate plan when all required data is selected
  const planParams =
    selectedRiverId && selectedPutIn && selectedTakeOut
      ? {
          riverId: selectedRiverId,
          startId: selectedPutIn,
          endId: selectedTakeOut,
          vesselTypeId: selectedVesselTypeId || undefined,
        }
      : null;

  const { data: plan, isLoading: planLoading } = useFloatPlan(planParams);

  // Handle river selection
  const handleRiverSelect = (riverId: string) => {
    const river = rivers?.find((r) => r.id === riverId);
    if (river) {
      setSelectedRiverId(riverId);
      setSelectedRiverSlug(river.slug);
      setSelectedPutIn(null);
      setSelectedTakeOut(null);
      setShowPlan(false);
    }
  };

  // Handle access point click
  const handleAccessPointClick = (point: AccessPoint) => {
    setPopupPoint(point);
    setPopupCoordinates(point.coordinates);

    // If no put-in selected, set as put-in
    // If put-in selected but not take-out, set as take-out
    // If both selected, replace take-out
    if (!selectedPutIn) {
      setSelectedPutIn(point.id);
    } else if (!selectedTakeOut) {
      setSelectedTakeOut(point.id);
      setShowPlan(true);
    } else {
      setSelectedTakeOut(point.id);
      setShowPlan(true);
    }
  };

  // Handle share
  const handleShare = async () => {
    if (!planParams) return;

    try {
      const response = await fetch('/api/plan/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(planParams),
      });

      if (!response.ok) {
        throw new Error('Failed to save plan');
      }

      const { url } = await response.json();
      await navigator.clipboard.writeText(url);
      alert('Shareable link copied to clipboard!');
    } catch (error) {
      console.error('Error sharing plan:', error);
      alert('Failed to create shareable link');
    }
  };

  // Get initial bounds from river
  const initialBounds = river?.bounds
    ? [river.bounds[0], river.bounds[1], river.bounds[2], river.bounds[3]]
    : undefined;

  return (
    <main className="flex flex-col h-screen">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 z-10">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            Missouri Float Planner
          </h1>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <RiverSelector
                rivers={rivers || []}
                selectedRiverId={selectedRiverId}
                onSelect={handleRiverSelect}
              />
            </div>
            {vesselTypes && vesselTypes.length > 0 && (
              <div className="flex-1">
                <VesselSelector
                  vesselTypes={vesselTypes}
                  selectedVesselTypeId={selectedVesselTypeId}
                  onSelect={setSelectedVesselTypeId}
                />
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Map Container */}
      <div className="flex-1 relative">
        <MapContainer initialBounds={initialBounds}>
          {river && (
            <RiverLayer
              riverGeometry={river.geometry}
              selected={true}
              routeGeometry={plan?.route.geometry}
            />
          )}
          {accessPoints && (
            <AccessPointMarkers
              accessPoints={accessPoints}
              onMarkerClick={handleAccessPointClick}
              selectedPutIn={selectedPutIn}
              selectedTakeOut={selectedTakeOut}
            />
          )}
          {popupPoint && popupCoordinates && (
            <AccessPointPopup point={popupPoint} coordinates={popupCoordinates} />
          )}
        </MapContainer>

        {/* Plan Summary Panel */}
        {showPlan && (
          <div className="absolute top-4 right-4 z-20">
            <PlanSummary
              plan={plan || null}
              isLoading={planLoading}
              onClose={() => setShowPlan(false)}
              onShare={handleShare}
            />
          </div>
        )}

        {/* Loading Overlay */}
        {(riversLoading || riverLoading || accessPointsLoading) && (
          <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-30">
            <LoadingSpinner size="lg" />
          </div>
        )}
      </div>
    </main>
  );
}
