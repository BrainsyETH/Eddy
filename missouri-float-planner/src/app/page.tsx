'use client';

// src/app/page.tsx
// Main home page with interactive map and Organic Brutalist design

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
import { useGaugeStations } from '@/hooks/useGaugeStations';
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
    <div className="w-full h-full bg-neutral-100 flex items-center justify-center">
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
  const { data: allGaugeStations } = useGaugeStations();

  // Filter gauge stations for selected river
  const gaugeStations = selectedRiverId && allGaugeStations
    ? allGaugeStations.filter(gauge => gauge.thresholds?.some(t => t.riverId === selectedRiverId))
    : [];

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
      // Only auto-open modal on desktop (1024px+), not on mobile
      if (window.innerWidth >= 1024) {
        setShowRiverModal(true);
      }
    }
  }, [rivers]);

  // Handle access point click - supports selection and deselection
  const handleAccessPointClick = useCallback((point: AccessPoint) => {
    // If clicking the current put-in, deselect it and clear take-out too
    if (point.id === selectedPutIn) {
      setSelectedPutIn(null);
      setSelectedTakeOut(null);
      setShowPlan(false);
      return;
    }

    // If clicking the current take-out, deselect it
    if (point.id === selectedTakeOut) {
      setSelectedTakeOut(null);
      setShowPlan(false);
      return;
    }

    // Prevent upstream take-out selection
    if (selectedPutIn && accessPoints) {
      const putInPoint = accessPoints.find((ap) => ap.id === selectedPutIn);
      if (putInPoint && point.riverMile < putInPoint.riverMile) {
        setUpstreamWarning('That take-out is upstream of your put-in. Choose a downstream point.');
        return;
      }
    }

    // Normal selection flow
    if (!selectedPutIn) {
      setSelectedPutIn(point.id);
    } else if (!selectedTakeOut && point.id !== selectedPutIn) {
      setSelectedTakeOut(point.id);
      setShowPlan(true);
    } else {
      // Both selected - clicking a new point changes the take-out
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
      alert('Link copied to clipboard!');
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
      <div className="h-screen flex items-center justify-center bg-neutral-50">
        <div className="text-center max-w-md px-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <span className="text-3xl">😕</span>
          </div>
          <h2 className="text-xl font-heading font-bold text-neutral-900 mb-2">Failed to Load Rivers</h2>
          <p className="text-neutral-600 mb-6">
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
    <div className="h-screen flex flex-col bg-neutral-50">
      {/* Header with controls */}
      <header className="relative z-20 border-b-2 border-neutral-900 pb-4" style={{ backgroundColor: '#163F4A' }}>
        <div className="max-w-7xl mx-auto px-4 pt-4">
          {/* Logo and title */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg border-2 border-neutral-900 shadow-md flex items-center justify-center" style={{ backgroundColor: '#F07052' }}>
                <Waves className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-heading font-bold" style={{ color: '#FFFFFF' }}>Missouri Float Planner</h1>
                <p className="text-sm" style={{ color: '#A3D1DB' }}>Plan your Ozark adventure</p>
              </div>
            </div>

            {/* Quick instructions */}
            {selectedRiverId && !selectedPutIn && (
              <div className="hidden md:block text-sm text-primary-100 bg-primary-700 px-4 py-2 rounded-md border border-primary-600">
                Click a marker to set your <span className="text-support-400 font-semibold">put-in</span>
              </div>
            )}
            {selectedPutIn && !selectedTakeOut && (
              <div className="hidden md:block text-sm text-primary-100 bg-primary-700 px-4 py-2 rounded-md border border-primary-600">
                Now click another marker for your <span className="text-accent-400 font-semibold">take-out</span>
              </div>
            )}
          </div>

          {/* Controls row */}
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Clear selection button */}
            {(selectedPutIn || selectedTakeOut) && (
              <button
                onClick={handleClearSelection}
                className="px-4 py-2 text-sm text-primary-100 hover:text-white
                         border border-primary-600 hover:border-primary-400 rounded-md
                         bg-primary-700 hover:bg-primary-600 transition-colors"
              >
                Clear Selection
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main content area - split layout */}
      <main className="flex-1 flex flex-col lg:flex-row gap-4 p-4 overflow-hidden">
        {/* Left sidebar - River selector and Plan summary */}
        <aside className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-4 order-2 lg:order-1">
          {/* River Selector */}
          <div className="bg-white border-2 border-neutral-200 rounded-lg p-4 shadow-sm">
            <label className="block text-sm font-medium text-neutral-700 mb-2">Select a River</label>
            <RiverSelector
              rivers={rivers || []}
              selectedRiverId={selectedRiverId}
              onSelect={handleRiverSelect}
            />
          </div>

          {/* Plan Summary (when available) */}
          {showPlan ? (
            <PlanSummary
              plan={plan || null}
              isLoading={planLoading}
              onClose={handleClearSelection}
              onShare={handleShare}
            />
          ) : (
            /* Instruction card when no plan is selected */
            <div className="bg-white border-2 border-neutral-200 rounded-lg p-6 shadow-sm">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: '#2D7889' }}>
                  <Waves className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-lg font-bold text-neutral-900 mb-2">Plan Your Float</h3>
                <p className="text-sm text-neutral-600 mb-4">
                  {!selectedRiverId
                    ? 'Select a river from the dropdown above to get started.'
                    : !selectedPutIn
                    ? 'Click a marker on the map to set your put-in point.'
                    : 'Click another marker to set your take-out point.'}
                </p>
                <div className="flex flex-col gap-2 text-left text-sm">
                  <div className="flex items-center gap-3 py-2 px-3 rounded-lg" style={{ backgroundColor: selectedRiverId ? '#E8F5E9' : '#F5F5F5' }}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${selectedRiverId ? 'bg-emerald-500 text-white' : 'bg-neutral-300 text-neutral-600'}`}>1</span>
                    <span className={selectedRiverId ? 'text-emerald-700 font-medium' : 'text-neutral-600'}>Select a river</span>
                  </div>
                  <div className="flex items-center gap-3 py-2 px-3 rounded-lg" style={{ backgroundColor: selectedPutIn ? '#E8F5E9' : '#F5F5F5' }}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${selectedPutIn ? 'bg-emerald-500 text-white' : 'bg-neutral-300 text-neutral-600'}`}>2</span>
                    <span className={selectedPutIn ? 'text-emerald-700 font-medium' : 'text-neutral-600'}>Choose put-in point</span>
                  </div>
                  <div className="flex items-center gap-3 py-2 px-3 rounded-lg" style={{ backgroundColor: selectedTakeOut ? '#E8F5E9' : '#F5F5F5' }}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${selectedTakeOut ? 'bg-emerald-500 text-white' : 'bg-neutral-300 text-neutral-600'}`}>3</span>
                    <span className={selectedTakeOut ? 'text-emerald-700 font-medium' : 'text-neutral-600'}>Choose take-out point</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* Map Container with integrated bottom panel for desktop */}
        <div className="flex-1 flex flex-col rounded-lg overflow-hidden shadow-lg border-2 border-neutral-200 min-h-[400px] lg:min-h-0 order-1 lg:order-2">
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
              <div className="absolute inset-0 flex items-center justify-center bg-neutral-100">
                <div className="text-center">
                  <LoadingSpinner size="lg" />
                  <p className="mt-4 text-neutral-600">Loading rivers...</p>
                </div>
              </div>
            ) : !selectedRiverId ? (
              <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: '#163F4A' }}>
                {/* Hero content */}
                <div className="relative z-10 text-center max-w-2xl px-4 animate-in">
                  <div className="mb-8">
                    <div className="w-24 h-24 mx-auto rounded-xl border-4 border-neutral-900 shadow-xl flex items-center justify-center" style={{ backgroundColor: '#F07052' }}>
                      <Waves className="w-14 h-14 text-white" />
                    </div>
                  </div>
                  <h2 className="text-4xl md:text-5xl font-heading font-bold text-white mb-4 drop-shadow-lg">
                    Discover Missouri&apos;s <br />
                    <span style={{ color: '#F07052' }}>
                      Float Trips
                    </span>
                  </h2>
                  <p className="text-lg text-white/80 mb-8 max-w-lg mx-auto">
                    Plan your perfect float on the Current River, Eleven Point, Meramec,
                    and more. Real-time water conditions and shuttle times.
                  </p>

                  {/* Feature pills */}
                  <div className="flex flex-wrap justify-center gap-3 mb-8">
                    <span className="px-4 py-2 border-3 border-neutral-900 rounded-lg text-sm text-white font-bold shadow-md" style={{ backgroundColor: '#1D525F' }}>
                      8 Rivers
                    </span>
                    <span className="px-4 py-2 border-3 border-neutral-900 rounded-lg text-sm text-white font-bold shadow-md" style={{ backgroundColor: '#1D525F' }}>
                      30+ Access Points
                    </span>
                    <span className="px-4 py-2 border-3 border-neutral-900 rounded-lg text-sm text-white font-bold shadow-md" style={{ backgroundColor: '#1D525F' }}>
                      Real-time Conditions
                    </span>
                  </div>

                  <p className="text-white font-bold text-lg animate-pulse" style={{ color: '#4EB86B' }}>
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
                    className="absolute bottom-4 left-4 z-30 bg-white hover:bg-neutral-50 text-neutral-900 px-4 py-2 rounded-md shadow-md border-2 border-neutral-200 hover:border-primary-400 transition-colors"
                    aria-label="Show river details"
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="font-semibold">River Info</span>
                    </div>
                  </button>
                )}

                {/* Mobile bottom sheet indicator */}
                {selectedPutIn && !selectedTakeOut && (
                  <div className="absolute bottom-4 left-4 right-4 md:hidden z-20">
                    <div className="bg-white border-2 border-neutral-200 rounded-lg p-4 text-center shadow-md">
                      <p className="text-neutral-700">
                        Tap another marker for your <span className="text-accent-600 font-semibold">take-out</span>
                      </p>
                    </div>
                  </div>
                )}

                {upstreamWarning && (
                  <div className="absolute top-4 left-4 right-4 md:left-auto md:right-4 z-30">
                    <div className="bg-red-50 border-2 border-red-300 text-red-800 text-sm px-4 py-2 rounded-md shadow-md">
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
              gaugeStations={gaugeStations}
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
          gaugeStations={gaugeStations}
          isOpen={showRiverModal}
          onClose={handleCloseRiverModal}
          isDesktop={false}
        />
      )}

      {/* Footer */}
      <footer className="relative z-10 bg-primary-800 border-t-2 border-neutral-900 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-sm text-primary-200">
          <p>Missouri Float Planner • Water data from USGS</p>
          <p className="hidden md:block">Always check local conditions before floating</p>
        </div>
      </footer>
    </div>
  );
}
