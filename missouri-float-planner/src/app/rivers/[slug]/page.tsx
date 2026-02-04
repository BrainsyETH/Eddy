'use client';

// src/app/rivers/[slug]/page.tsx
// Client component for river detail page with full planning experience
// State is managed here to enable map/planner integration
// URL persistence: putIn, takeOut, and vessel params are stored in URL for sharing/refresh

import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import RiverHeader from '@/components/river/RiverHeader';
import LocalKnowledge from '@/components/river/LocalKnowledge';
import PlannerPanel from '@/components/river/PlannerPanel';
import GaugeOverview from '@/components/river/GaugeOverview';
import AccessPointStrip from '@/components/river/AccessPointStrip';
import FloatPlanCard from '@/components/plan/FloatPlanCard';
import WeatherBug from '@/components/ui/WeatherBug';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import FeedbackModal from '@/components/ui/FeedbackModal';
import { useRiver } from '@/hooks/useRivers';
import { useAccessPoints } from '@/hooks/useAccessPoints';
import { useConditions } from '@/hooks/useConditions';
import { useFloatPlan } from '@/hooks/useFloatPlan';
import { useVesselTypes } from '@/hooks/useVesselTypes';
import { useGaugeStations, findNearestGauge } from '@/hooks/useGaugeStations';
import type { AccessPoint, FeedbackContext } from '@/types/api';

// Dynamic imports for map
const MapContainer = dynamic(() => import('@/components/map/MapContainer'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-neutral-100 flex items-center justify-center">
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

  // Read initial state from URL params
  const urlPutIn = searchParams.get('putIn');
  const urlTakeOut = searchParams.get('takeOut');
  const urlVessel = searchParams.get('vessel');

  // Lifted state for planner/map integration
  const [selectedPutIn, setSelectedPutIn] = useState<string | null>(urlPutIn);
  const [selectedTakeOut, setSelectedTakeOut] = useState<string | null>(urlTakeOut);

  // Gauge visibility state - default to OFF for cleaner map view
  const [showGauges, setShowGauges] = useState(false);

  // Feedback modal state
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackContext, setFeedbackContext] = useState<FeedbackContext | undefined>(undefined);

  // Data fetching
  const { data: river, isLoading: riverLoading, error: riverError } = useRiver(slug);
  const { data: accessPoints, isLoading: accessPointsLoading } = useAccessPoints(slug);
  const { data: conditionData } = useConditions(river?.id || null, {
    putInAccessPointId: selectedPutIn,
  });
  const condition = conditionData?.condition ?? null;
  const { data: vesselTypes } = useVesselTypes();
  const { data: allGaugeStations } = useGaugeStations();

  // Filter gauge stations to only show those linked to this river
  const gaugeStations = allGaugeStations?.filter(gauge =>
    gauge.thresholds?.some(t => t.riverId === river?.id)
  );
  const [selectedVesselTypeId, setSelectedVesselTypeId] = useState<string | null>(null);
  const [upstreamWarning, setUpstreamWarning] = useState<string | null>(null);
  const [urlInitialized, setUrlInitialized] = useState(false);

  // Ref for auto-scrolling to float plan card
  const floatPlanCardRef = useRef<HTMLDivElement>(null);

  // Ref for image capture
  const captureRef = useRef<HTMLDivElement>(null);

  // React Query client for prefetching
  const queryClient = useQueryClient();

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

  // Find nearest gauge to the selected put-in, or to river center if no put-in
  const selectedPutInPoint = accessPoints?.find(ap => ap.id === selectedPutIn);
  const nearestGauge = gaugeStations && gaugeStations.length > 0
    ? selectedPutInPoint
      ? findNearestGauge(gaugeStations, selectedPutInPoint.coordinates.lat, selectedPutInPoint.coordinates.lng)
      : river?.bounds
        ? findNearestGauge(
            gaugeStations,
            (river.bounds[1] + river.bounds[3]) / 2, // center lat
            (river.bounds[0] + river.bounds[2]) / 2  // center lng
          )
        : null
    : null;

  // Handle map marker click - set as put-in or take-out
  const handleMarkerClick = useCallback((point: AccessPoint) => {
    // If clicking the current put-in, deselect it
    if (point.id === selectedPutIn) {
      setSelectedPutIn(null);
      setSelectedTakeOut(null); // Also clear take-out
      return;
    }

    // If clicking the current take-out, deselect it
    if (point.id === selectedTakeOut) {
      setSelectedTakeOut(null);
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

  // Handle report issue for access point
  const handleReportAccessPointIssue = useCallback((point: AccessPoint) => {
    setFeedbackContext({
      type: 'access_point',
      id: point.id,
      name: point.name,
      data: {
        accessPointId: point.id,
        accessPointName: point.name,
        riverName: river?.name,
        riverMile: point.riverMile,
        type: point.type,
        coordinates: point.coordinates,
      },
    });
    setFeedbackModalOpen(true);
  }, [river?.name]);

  // Share link handler
  const handleShare = useCallback(async () => {
    if (!selectedPutIn || !selectedTakeOut) return;

    const params = new URLSearchParams();
    params.set('putIn', selectedPutIn);
    params.set('takeOut', selectedTakeOut);
    if (selectedVesselTypeId) params.set('vessel', selectedVesselTypeId);

    const shareUrl = `${window.location.origin}/rivers/${slug}?${params.toString()}`;
    const isMobile = window.matchMedia('(pointer: coarse)').matches;

    if (isMobile && navigator.share) {
      try {
        await navigator.share({
          title: `Float Plan - ${river?.name}`,
          url: shareUrl,
        });
        return;
      } catch {
        // User cancelled or share failed, fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      alert('Link copied to clipboard!');
    } catch {
      window.prompt('Copy this link:', shareUrl);
    }
  }, [selectedPutIn, selectedTakeOut, selectedVesselTypeId, slug, river?.name]);

  // Download shareable image handler using html2canvas
  const handleDownloadImage = useCallback(async () => {
    if (!selectedPutIn || !selectedTakeOut || !river || !plan || !captureRef.current) return;

    try {
      // Dynamically import html2canvas
      const html2canvas = (await import('html2canvas')).default;

      // Capture the hidden shareable element
      const canvas = await html2canvas(captureRef.current, {
        backgroundColor: '#ffffff',
        scale: 2, // Higher resolution
        logging: false,
        useCORS: true,
      });

      // Convert to blob and download
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${river.name.toLowerCase().replace(/\s+/g, '-')}-float-plan.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 'image/png');
    } catch (error) {
      console.error('Error generating image:', error);
      alert('Failed to generate image. Please try again.');
    }
  }, [selectedPutIn, selectedTakeOut, river, plan]);

  // Prefetch float plans on hover for instant loading
  const handleAccessPointHover = useCallback((point: AccessPoint) => {
    if (!river || !accessPoints || !selectedVesselTypeId) return;

    // Find adjacent access points (by river mile order)
    const sortedPoints = [...accessPoints].sort((a, b) => a.riverMile - b.riverMile);
    const pointIndex = sortedPoints.findIndex(ap => ap.id === point.id);

    if (selectedPutIn && !selectedTakeOut) {
      // Put-in selected - prefetch plan with hovered point as take-out
      queryClient.prefetchQuery({
        queryKey: ['float-plan', river.id, selectedPutIn, point.id, selectedVesselTypeId, undefined],
        queryFn: async () => {
          const searchParams = new URLSearchParams({
            riverId: river.id,
            startId: selectedPutIn,
            endId: point.id,
            vesselTypeId: selectedVesselTypeId,
          });
          const response = await fetch(`/api/plan?${searchParams.toString()}`);
          if (!response.ok) throw new Error('Failed to calculate float plan');
          const data = await response.json();
          return data.plan;
        },
        staleTime: 5 * 60 * 1000,
      });
    } else if (!selectedPutIn) {
      // No put-in - prefetch plans with hovered point as put-in and nearby take-outs
      const nearbyPoints = sortedPoints.slice(
        Math.max(0, pointIndex + 1),
        Math.min(sortedPoints.length, pointIndex + 4)
      );

      nearbyPoints.forEach(takeOut => {
        queryClient.prefetchQuery({
          queryKey: ['float-plan', river.id, point.id, takeOut.id, selectedVesselTypeId, undefined],
          queryFn: async () => {
            const searchParams = new URLSearchParams({
              riverId: river.id,
              startId: point.id,
              endId: takeOut.id,
              vesselTypeId: selectedVesselTypeId,
            });
            const response = await fetch(`/api/plan?${searchParams.toString()}`);
            if (!response.ok) throw new Error('Failed to calculate float plan');
            const data = await response.json();
            return data.plan;
          },
          staleTime: 5 * 60 * 1000,
        });
      });
    }
  }, [river, accessPoints, selectedPutIn, selectedTakeOut, selectedVesselTypeId, queryClient]);

  // Get access point objects for FloatPlanCard
  const putInPoint = accessPoints?.find(ap => ap.id === selectedPutIn) || null;
  const takeOutPoint = accessPoints?.find(ap => ap.id === selectedTakeOut) || null;

  useEffect(() => {
    if (!upstreamWarning) return;
    const timeout = setTimeout(() => setUpstreamWarning(null), 4000);
    return () => clearTimeout(timeout);
  }, [upstreamWarning]);

  // Auto-scroll to float plan card when both points are selected
  useEffect(() => {
    if (selectedPutIn && selectedTakeOut && floatPlanCardRef.current) {
      // Small delay to allow card to render
      const timeout = setTimeout(() => {
        floatPlanCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [selectedPutIn, selectedTakeOut]);

  if (riverLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (riverError || !river) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <span className="text-3xl">:/</span>
          </div>
          <h2 className="text-xl font-bold text-neutral-900 mb-2">River Not Found</h2>
          <p className="text-neutral-600">
            The river you&apos;re looking for doesn&apos;t exist or has been removed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* River Header */}
      <RiverHeader
        river={river}
        condition={condition}
      />

      {/* Main Content - add bottom padding on mobile when bottom sheet is visible */}
      <div className={`max-w-7xl mx-auto px-4 py-6 ${putInPoint && takeOutPoint ? 'pb-36 lg:pb-6' : ''}`}>
        {/* Local Knowledge - collapsible section at top */}
        <div className="mb-4">
          <LocalKnowledge
            riverSlug={slug}
            riverName={river.name}
            defaultOpen={false}
          />
        </div>

        {/* Planner Selectors - always at top */}
        <div className="mb-4">
          <PlannerPanel
            river={river}
            accessPoints={accessPoints || []}
            isLoading={accessPointsLoading}
            selectedPutIn={selectedPutIn}
            selectedTakeOut={selectedTakeOut}
            onPutInChange={setSelectedPutIn}
            onTakeOutChange={setSelectedTakeOut}
          />
        </div>

        {/* Map + Access Points */}
        <div className="mb-4">
          <div className="relative h-[350px] lg:h-[450px] rounded-xl overflow-hidden shadow-2xl border-2 border-neutral-200">
            {/* Weather Bug overlay */}
            <WeatherBug riverSlug={slug} riverId={river.id} />

            {upstreamWarning && (
              <div className="absolute top-4 left-4 right-4 z-30">
                <div className="bg-red-50 border-2 border-red-300 text-red-800 text-sm px-4 py-2 rounded-md shadow-md">
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

          {/* Access Point Strip - horizontal scroll below map (no expanded details) */}
          {accessPoints && accessPoints.length > 0 && (
            <div className="mt-3">
              <AccessPointStrip
                accessPoints={accessPoints}
                selectedPutInId={selectedPutIn}
                selectedTakeOutId={selectedTakeOut}
                onSelect={handleMarkerClick}
                onHover={handleAccessPointHover}
                onReportIssue={handleReportAccessPointIssue}
                hideExpandedDetails={true}
                riverSlug={slug}
              />
            </div>
          )}
        </div>

        {/* Hint text - between map and cards */}
        {!putInPoint && !takeOutPoint && (
          <p className="text-center text-sm text-neutral-500 mb-4">
            Tap an access point to select put-in, tap again for take-out
          </p>
        )}

        {/* Float Plan Journey Card - shows when any access point is selected */}
        {(putInPoint || takeOutPoint) && (
          <div ref={floatPlanCardRef} className="mb-4">
            <FloatPlanCard
              plan={plan || null}
              isLoading={planLoading}
              putInPoint={putInPoint}
              takeOutPoint={takeOutPoint}
              onClearPutIn={() => {
                setSelectedPutIn(null);
                setSelectedTakeOut(null);
              }}
              onClearTakeOut={() => setSelectedTakeOut(null)}
              onShare={handleShare}
              onDownloadImage={handleDownloadImage}
              riverSlug={slug}
              riverName={river?.name}
              vesselTypeId={selectedVesselTypeId}
              onVesselChange={setSelectedVesselTypeId}
              captureRef={captureRef}
              onReportIssue={handleReportAccessPointIssue}
            />
          </div>
        )}

        {/* Info Sections - full width below planner/map */}
        <div className="space-y-4 mt-6">
          {/* River Conditions */}
          <GaugeOverview
            gauges={gaugeStations}
            riverId={river.id}
            isLoading={!allGaugeStations}
            putInCoordinates={selectedPutInPoint?.coordinates || null}
          />
        </div>
      </div>

      {/* Feedback Modal */}
      <FeedbackModal
        isOpen={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
        context={feedbackContext}
      />
    </div>
  );
}
