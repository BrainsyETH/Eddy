'use client';

// src/app/rivers/[slug]/page.tsx
// River detail page with full planning experience
// State is managed here to enable map/planner integration
// URL persistence: putIn, takeOut, and vessel params are stored in URL for sharing/refresh

import { useState, useCallback, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
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
import { useFloatPlan } from '@/hooks/useFloatPlan';
import { useVesselTypes } from '@/hooks/useVesselTypes';
import { useGaugeStations, findNearestGauge } from '@/hooks/useGaugeStations';
import type { AccessPoint } from '@/types/api';

// Dynamic imports for map
const MapContainer = dynamic(() => import('@/components/map/MapContainer'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-ozark-900 flex items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  ),
});
const AccessPointMarkers = dynamic(() => import('@/components/map/AccessPointMarkers'), { ssr: false });
const GaugeStationMarkers = dynamic(() => import('@/components/map/GaugeStationMarkers'), { ssr: false });

export default function RiverPage() {
  const params = useParams();
  const slug = params.slug as string;
  const searchParams = useSearchParams();

  // Data fetching
  const { data: river, isLoading: riverLoading, error: riverError } = useRiver(slug);
  const { data: accessPoints, isLoading: accessPointsLoading } = useAccessPoints(slug);
  const { data: conditionData } = useConditions(river?.id || null);
  const condition = conditionData?.condition ?? null;
  const { data: vesselTypes } = useVesselTypes();
  const { data: gaugeStations } = useGaugeStations();

  // Gauge visibility state
  const [showGauges, setShowGauges] = useState(false);

  // Read initial state from URL params
  const urlPutIn = searchParams.get('putIn');
  const urlTakeOut = searchParams.get('takeOut');
  const urlVessel = searchParams.get('vessel');

  // Lifted state for planner/map integration
  const [selectedPutIn, setSelectedPutIn] = useState<string | null>(urlPutIn);
  const [selectedTakeOut, setSelectedTakeOut] = useState<string | null>(urlTakeOut);
  const [selectedVesselTypeId, setSelectedVesselTypeId] = useState<string | null>(null);
  const [showPlan, setShowPlan] = useState(false);
  const [upstreamWarning, setUpstreamWarning] = useState<string | null>(null);
  const [urlInitialized, setUrlInitialized] = useState(false);

  // Update URL when state changes (without causing navigation)
  const updateUrl = useCallback((putIn: string | null, takeOut: string | null, vessel: string | null) => {
    const params = new URLSearchParams();
    if (putIn) params.set('putIn', putIn);
    if (takeOut) params.set('takeOut', takeOut);
    if (vessel) params.set('vessel', vessel);

    const queryString = params.toString();
    const newUrl = queryString ? `?${queryString}` : window.location.pathname;

    // Use replaceState to avoid adding to browser history on every selection
    window.history.replaceState(null, '', newUrl);
  }, []);

  // Sync URL when selections change
  useEffect(() => {
    if (urlInitialized) {
      updateUrl(selectedPutIn, selectedTakeOut, selectedVesselTypeId);
    }
  }, [selectedPutIn, selectedTakeOut, selectedVesselTypeId, urlInitialized, updateUrl]);

  // Set default vessel type (from URL or default to canoe)
  useEffect(() => {
    if (vesselTypes && vesselTypes.length > 0 && !selectedVesselTypeId) {
      // Check if URL has a vessel param that matches
      if (urlVessel) {
        const urlVesselType = vesselTypes.find(v => v.id === urlVessel || v.slug === urlVessel);
        if (urlVesselType) {
          setSelectedVesselTypeId(urlVesselType.id);
          setUrlInitialized(true);
          return;
        }
      }
      // Default to canoe
      const defaultVessel = vesselTypes.find(v => v.slug === 'canoe') || vesselTypes[0];
      setSelectedVesselTypeId(defaultVessel.id);
      setUrlInitialized(true);
    }
  }, [vesselTypes, selectedVesselTypeId, urlVessel]);

  // Auto-show plan when both selected (including from URL params)
  useEffect(() => {
    if (selectedPutIn && selectedTakeOut && !showPlan) {
      setShowPlan(true);
    }
  }, [selectedPutIn, selectedTakeOut, showPlan]);

  // Validate URL params against actual access points
  useEffect(() => {
    if (accessPoints && accessPoints.length > 0 && urlInitialized) {
      // Validate putIn exists
      if (selectedPutIn && !accessPoints.find(ap => ap.id === selectedPutIn)) {
        setSelectedPutIn(null);
      }
      // Validate takeOut exists
      if (selectedTakeOut && !accessPoints.find(ap => ap.id === selectedTakeOut)) {
        setSelectedTakeOut(null);
      }
    }
  }, [accessPoints, selectedPutIn, selectedTakeOut, urlInitialized]);

  // Calculate plan
  const planParams = (river && selectedPutIn && selectedTakeOut)
    ? {
        riverId: river.id,
        startId: selectedPutIn,
        endId: selectedTakeOut,
        vesselTypeId: selectedVesselTypeId || undefined,
      }
    : null;

  const { data: plan, isLoading: planLoading } = useFloatPlan(planParams);

  // Find nearest gauge to the selected put-in
  const selectedPutInPoint = accessPoints?.find(ap => ap.id === selectedPutIn);
  const nearestGauge = selectedPutInPoint && gaugeStations
    ? findNearestGauge(gaugeStations, selectedPutInPoint.coordinates.lat, selectedPutInPoint.coordinates.lng)
    : null;

  // Handle map marker click - set as put-in or take-out
  const handleMarkerClick = useCallback((point: AccessPoint) => {
    // If clicking the current put-in, deselect it
    if (point.id === selectedPutIn) {
      setSelectedPutIn(null);
      setSelectedTakeOut(null); // Also clear take-out
      setShowPlan(false);
      return;
    }

    // If clicking the current take-out, deselect it
    if (point.id === selectedTakeOut) {
      setSelectedTakeOut(null);
      setShowPlan(false);
      return;
    }

    if (!selectedPutIn) {
      // No put-in selected - set this as put-in
      setSelectedPutIn(point.id);
    } else if (!selectedTakeOut) {
      // Put-in selected but no take-out - set this as take-out
      // Show warning if upstream, but still allow selection
      if (accessPoints) {
        const putInPoint = accessPoints.find((ap) => ap.id === selectedPutIn);
        if (putInPoint && point.riverMile < putInPoint.riverMile) {
          setUpstreamWarning('This take-out is upstream of your put-in. You will be paddling against the current.');
        }
      }
      setSelectedTakeOut(point.id);
    } else {
      // Both selected - clicking a new point changes the take-out
      if (accessPoints) {
        const putInPoint = accessPoints.find((ap) => ap.id === selectedPutIn);
        if (putInPoint && point.riverMile < putInPoint.riverMile) {
          setUpstreamWarning('This take-out is upstream of your put-in. You will be paddling against the current.');
        }
      }
      setSelectedTakeOut(point.id);
    }
  }, [accessPoints, selectedPutIn, selectedTakeOut]);

  useEffect(() => {
    if (!upstreamWarning) return;
    const timeout = setTimeout(() => setUpstreamWarning(null), 4000);
    return () => clearTimeout(timeout);
  }, [upstreamWarning]);

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
              selectedPutIn={selectedPutIn}
              selectedTakeOut={selectedTakeOut}
              onPutInChange={setSelectedPutIn}
              onTakeOutChange={setSelectedTakeOut}
              plan={plan || null}
              planLoading={planLoading}
              showPlan={showPlan}
              onShowPlanChange={setShowPlan}
            />

            {/* Conditions & Safety */}
            <ConditionsBlock
              riverId={river.id}
              condition={condition}
              nearestGauge={nearestGauge}
              hasPutInSelected={!!selectedPutIn}
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

                {upstreamWarning && (
                  <div className="absolute top-4 left-4 right-4 z-30">
                    <div className="bg-red-500/20 border border-red-400/40 text-red-100 text-sm px-4 py-2 rounded-xl shadow-lg">
                      {upstreamWarning}
                    </div>
                  </div>
                )}

                <MapContainer
                  initialBounds={river.bounds}
                  showLegend={true}
                  showGauges={showGauges}
                  onGaugeToggle={setShowGauges}
                >
                  {accessPoints && (
                    <AccessPointMarkers
                      accessPoints={accessPoints}
                      selectedPutIn={selectedPutIn}
                      selectedTakeOut={selectedTakeOut}
                      onMarkerClick={handleMarkerClick}
                    />
                  )}
                  {showGauges && gaugeStations && (
                    <GaugeStationMarkers
                      gauges={gaugeStations}
                      selectedRiverId={river.id}
                      nearestGaugeId={nearestGauge?.id}
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
