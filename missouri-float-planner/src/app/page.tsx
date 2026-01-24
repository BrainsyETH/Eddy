'use client';

// src/app/page.tsx
// Main home page with interactive map and Ozark-themed design

import { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Waves } from 'lucide-react';
import RiverSelector from '@/components/ui/RiverSelector';
import PlanSummary from '@/components/plan/PlanSummary';
import RiverOverviewPanel from '@/components/river/RiverOverviewPanel';
import WeatherBug from '@/components/ui/WeatherBug';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useRivers, useRiver } from '@/hooks/useRivers';
import { useAccessPoints } from '@/hooks/useAccessPoints';
import { useConditions } from '@/hooks/useConditions';
import { useFloatPlan } from '@/hooks/useFloatPlan';
import { useVesselTypes } from '@/hooks/useVesselTypes';
import type { AccessPoint } from '@/types/api';

// Hook to detect desktop viewport
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const checkDesktop = () => setIsDesktop(window.innerWidth >= 1024);
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  return isDesktop;
}

// Dynamic import for map (client-side only)
const MapContainer = dynamic(() => import('@/components/map/MapContainer'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-ozark-900 flex items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  ),
});
const AccessPointMarkers = dynamic(() => import('@/components/map/AccessPointMarkers'), { ssr: false });

export default function Home() {
  const [selectedRiverId, setSelectedRiverId] = useState<string | null>(null);
  const [selectedRiverSlug, setSelectedRiverSlug] = useState<string | null>(null);
  const [selectedPutIn, setSelectedPutIn] = useState<string | null>(null);
  const [selectedTakeOut, setSelectedTakeOut] = useState<string | null>(null);
  const [selectedVesselTypeId, setSelectedVesselTypeId] = useState<string | null>(null);
  const [showPlan, setShowPlan] = useState(false);
  const [showRiverModal, setShowRiverModal] = useState(false);
  const [upstreamWarning, setUpstreamWarning] = useState<string | null>(null);

  // Detect desktop viewport
  const isDesktop = useIsDesktop();

  // Fetch data
  const { data: rivers, isLoading: riversLoading, error: riversError } = useRivers();
  const { data: river } = useRiver(selectedRiverSlug || '');
  const { data: accessPoints } = useAccessPoints(selectedRiverSlug);
  const { data: conditionData } = useConditions(selectedRiverId);
  const condition = conditionData?.condition ?? null;
  const { data: vesselTypes } = useVesselTypes();

  // Set default vessel type when loaded (using useEffect to avoid render issues)
  useEffect(() => {
    if (vesselTypes && vesselTypes.length > 0 && !selectedVesselTypeId) {
      const defaultVessel = vesselTypes.find(v => v.slug === 'canoe') || vesselTypes[0];
      setSelectedVesselTypeId(defaultVessel.id);
    }
  }, [vesselTypes, selectedVesselTypeId]);

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
  const handleRiverSelect = useCallback((riverId: string) => {
    const river = rivers?.find((r) => r.id === riverId);
    if (river) {
      setSelectedRiverId(riverId);
      setSelectedRiverSlug(river.slug);
      setSelectedPutIn(null);
      setSelectedTakeOut(null);
      setShowPlan(false);
      setShowRiverModal(true); // Auto-open modal when river is selected
    }
  }, [rivers]);

  // Handle access point click
  const handleAccessPointClick = useCallback((point: AccessPoint) => {
    if (selectedPutIn && accessPoints) {
      const putInPoint = accessPoints.find((ap) => ap.id === selectedPutIn);
      if (putInPoint && point.riverMile < putInPoint.riverMile) {
        setUpstreamWarning('That take-out is upstream of your put-in. Choose a downstream point.');
        return;
      }
    }
    if (!selectedPutIn) {
      setSelectedPutIn(point.id);
    } else if (!selectedTakeOut && point.id !== selectedPutIn) {
      setSelectedTakeOut(point.id);
      setShowPlan(true);
    }
  }, [accessPoints, selectedPutIn, selectedTakeOut]);

  useEffect(() => {
    if (!upstreamWarning) return;
    const timeout = setTimeout(() => setUpstreamWarning(null), 4000);
    return () => clearTimeout(timeout);
  }, [upstreamWarning]);

  // Handle share
  const handleShare = async () => {
    if (!planParams) return;

    try {
      const response = await fetch('/api/plan/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(planParams),
      });

      if (!response.ok) throw new Error('Failed to save plan');

      const { url } = await response.json();
      await navigator.clipboard.writeText(url);
      alert('Link copied to clipboard! 🎉');
    } catch (error) {
      console.error('Error sharing plan:', error);
      alert('Failed to create shareable link');
    }
  };

  // Clear selections
  const handleClearSelection = () => {
    setSelectedPutIn(null);
    setSelectedTakeOut(null);
    setShowPlan(false);
  };

  // Close river modal (but keep river selected)
  const handleCloseRiverModal = () => {
    setShowRiverModal(false);
    setSelectedPutIn(null);
    setSelectedTakeOut(null);
    setShowPlan(false);
  };

  const initialBounds = river?.bounds;

  // Show error state if rivers fail to load
  if (riversError) {
    return (
      <div className="h-screen flex items-center justify-center bg-ozark-900">
        <div className="text-center max-w-md px-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
            <span className="text-3xl">😕</span>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Failed to Load Rivers</h2>
          <p className="text-bluff-400 mb-6">
            Unable to connect to the server. Please check your connection and try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="btn-primary"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-river-night">
      {/* Header with controls */}
      <header className="relative z-20 bg-gradient-to-b from-river-night via-river-deep/50 to-transparent pb-4">
        <div className="max-w-7xl mx-auto px-4 pt-4">
          {/* Logo and title */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-river-water to-river-forest 
                            flex items-center justify-center shadow-glow">
                <Waves className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Missouri Float Planner</h1>
                <p className="text-sm text-river-gravel">Plan your Ozark adventure</p>
              </div>
            </div>
            
            {/* Quick instructions */}
            {selectedRiverId && !selectedPutIn && (
              <div className="hidden md:block text-sm text-river-gravel glass-bg px-4 py-2 rounded-lg border border-white/10">
                👆 Click a marker to set your <span className="text-river-water font-medium">put-in</span>
              </div>
            )}
            {selectedPutIn && !selectedTakeOut && (
              <div className="hidden md:block text-sm text-river-gravel glass-bg px-4 py-2 rounded-lg border border-white/10">
                👆 Now click another marker for your <span className="text-sky-warm font-medium">take-out</span>
              </div>
            )}
          </div>

          {/* Controls row */}
          <div className="flex flex-col lg:flex-row gap-4">
            {/* River selector */}
            <div className="lg:w-80">
              <RiverSelector
                rivers={rivers || []}
                selectedRiverId={selectedRiverId}
                onSelect={handleRiverSelect}
              />
            </div>

            {/* Clear selection button */}
            {(selectedPutIn || selectedTakeOut) && (
              <button
                onClick={handleClearSelection}
                className="px-4 py-2 text-sm text-river-gravel hover:text-white 
                         border border-white/10 hover:border-river-water rounded-xl
                         glass-bg-soft transition-colors"
              >
                Clear Selection
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main content area - split layout */}
      <main className="flex-1 flex flex-col lg:flex-row gap-4 p-4 overflow-hidden">
        {/* Left sidebar - Plan summary only */}
        <aside className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-4 overflow-y-auto scrollbar-thin order-2 lg:order-1">
          {/* Plan Summary (when available) */}
          {showPlan && (
            <PlanSummary
              plan={plan || null}
              isLoading={planLoading}
              onClose={handleClearSelection}
              onShare={handleShare}
            />
          )}
        </aside>

        {/* Map Container with integrated bottom panel for desktop */}
        <div className="flex-1 flex flex-col rounded-xl overflow-hidden shadow-2xl min-h-[400px] lg:min-h-0 order-1 lg:order-2">
          {/* Map area - shrinks when panel is open on desktop */}
          <div className={`relative flex-1 transition-all duration-300 ${
            isDesktop && showRiverModal ? 'flex-[2]' : 'flex-1'
          }`}>
            {/* Weather Bug - floating overlay */}
            {selectedRiverId && selectedRiverSlug && (
              <WeatherBug
                riverSlug={selectedRiverSlug}
                riverId={selectedRiverId}
              />
            )}

            {riversLoading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-river-night">
                <div className="text-center">
                  <LoadingSpinner size="lg" />
                  <p className="mt-4 text-river-gravel">Loading rivers...</p>
                </div>
              </div>
            ) : !selectedRiverId ? (
              <div className="absolute inset-0 flex items-center justify-center bg-river-night">
                {/* Hero background */}
                <div className="absolute inset-0 hero-gradient" />

                {/* Hero content */}
                <div className="relative z-10 text-center max-w-2xl px-4 animate-in">
                  <div className="mb-8">
                    <Waves className="w-16 h-16 mx-auto text-river-water" />
                  </div>
                  <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                    Discover Missouri&apos;s <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-river-water to-sky-warm">
                      Float Trips
                    </span>
                  </h2>
                  <p className="text-lg text-river-gravel mb-8 max-w-lg mx-auto">
                    Plan your perfect float on the Current River, Eleven Point, Meramec,
                    and more. Real-time water conditions and shuttle times.
                  </p>

                  {/* Feature pills */}
                  <div className="flex flex-wrap justify-center gap-3 mb-8">
                    <span className="px-4 py-2 glass-bg border border-white/10 rounded-full text-sm text-white">
                      8 Rivers
                    </span>
                    <span className="px-4 py-2 glass-bg border border-white/10 rounded-full text-sm text-white">
                      30+ Access Points
                    </span>
                    <span className="px-4 py-2 glass-bg border border-white/10 rounded-full text-sm text-white">
                      Real-time Conditions
                    </span>
                  </div>

                  <p className="text-river-water animate-pulse">
                    ↑ Select a river above to get started
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Toggle button for river modal */}
                {selectedRiverId && river && !showRiverModal && (
                  <button
                    onClick={() => setShowRiverModal(true)}
                    className="absolute bottom-4 left-4 z-30 bg-river-deep hover:bg-river-deep/90 text-white px-4 py-2 rounded-xl shadow-lg border-2 border-white/15 transition-colors"
                    aria-label="Show river details"
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="font-medium">River Info</span>
                    </div>
                  </button>
                )}

                {/* Mobile bottom sheet indicator */}
                {selectedPutIn && !selectedTakeOut && (
                  <div className="absolute bottom-4 left-4 right-4 md:hidden z-20">
                    <div className="bg-river-deep border-2 border-white/15 rounded-xl p-4 text-center">
                      <p className="text-river-gravel">
                        Tap another marker for your <span className="text-sky-warm font-medium">take-out</span>
                      </p>
                    </div>
                  </div>
                )}

                {upstreamWarning && (
                  <div className="absolute top-4 left-4 right-4 md:left-auto md:right-4 z-30">
                    <div className="bg-red-500/20 border border-red-400/40 text-red-100 text-sm px-4 py-2 rounded-xl shadow-lg">
                      {upstreamWarning}
                    </div>
                  </div>
                )}

                <MapContainer initialBounds={initialBounds} showLegend={true}>
                  {accessPoints && (
                    <AccessPointMarkers
                      accessPoints={accessPoints}
                      onMarkerClick={handleAccessPointClick}
                      selectedPutIn={selectedPutIn}
                      selectedTakeOut={selectedTakeOut}
                    />
                  )}
                </MapContainer>
              </>
            )}
          </div>

          {/* Desktop: Inline river panel under map */}
          {isDesktop && selectedRiverId && river && (
            <RiverOverviewPanel
              river={river}
              condition={condition || null}
              accessPointCount={accessPoints?.length || 0}
              isOpen={showRiverModal}
              onClose={handleCloseRiverModal}
              isDesktop={true}
            />
          )}
        </div>
      </main>

      {/* Mobile: River Bottom Sheet - Outside map container */}
      {!isDesktop && selectedRiverId && river && (
        <RiverOverviewPanel
          river={river}
          condition={condition || null}
          accessPointCount={accessPoints?.length || 0}
          isOpen={showRiverModal}
          onClose={handleCloseRiverModal}
          isDesktop={false}
        />
      )}

      {/* Footer */}
      <footer className="relative z-10 bg-river-night border-t border-white/10 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-sm text-river-gravel">
          <p>Missouri Float Planner • Water data from USGS</p>
          <p className="hidden md:block">Always check local conditions before floating</p>
        </div>
      </footer>
    </div>
  );
}
