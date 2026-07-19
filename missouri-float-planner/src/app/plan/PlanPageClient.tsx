'use client';

// src/app/plan/PlanPageClient.tsx
// Unified float planner. River is selected via ?river=<slug> query param so a
// single page handles every river. URL params (river, putIn, takeOut, vessel)
// keep the planner state shareable and refresh-stable.

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Camera, BookOpen, ChevronDown, AlertTriangle, RefreshCw } from 'lucide-react';
import AccessPointStrip from '@/components/river/AccessPointStrip';
import ForecastCard from '@/components/river/ForecastCard';
import NearbyServices from '@/components/river/NearbyServices';
import ShuttlePanel from '@/components/river/ShuttlePanel';
import RiverVisualGallery from '@/components/river/RiverVisualGallery';
import RiverVisualSubmitForm from '@/components/river/RiverVisualSubmitForm';
import FloatPlanCard, { ShareableFloatCard } from '@/components/plan/FloatPlanCard';
import type { RouteItem } from '@/components/plan/FloatPlanCard';
import PlanSidebar from '@/components/plan/PlanSidebar';
import { RouteStatsBadge, MapLegend } from '@/components/plan/MapOverlayHelpers';
import PlanFilters from '@/components/plan/PlanFilters';
import MapEddySays from '@/components/plan/MapEddySays';
import WeatherBug from '@/components/ui/WeatherBug';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import FeedbackModal from '@/components/ui/FeedbackModal';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useRiver, useRivers } from '@/hooks/useRivers';
import { useAccessPoints } from '@/hooks/useAccessPoints';
import { useConditions } from '@/hooks/useConditions';
import { useFloatPlan } from '@/hooks/useFloatPlan';
import { useVesselTypes } from '@/hooks/useVesselTypes';
import { useGaugeStations, findNearestGauge } from '@/hooks/useGaugeStations';
import { usePOIs } from '@/hooks/usePOIs';
import { useHazards } from '@/hooks/useHazards';
import { useWeather, useForecastByCoords } from '@/hooks/useWeather';
import { useNearbyServices } from '@/hooks/useNearbyServices';
import { useConditionNetwork } from '@/hooks/useStatewideConditions';
import type { AccessPoint, ConditionCode, FeedbackContext, RiverListItem } from '@/types/api';
import Image from 'next/image';
import { CONDITION_COLORS, CONDITION_LABELS, EDDY_IMAGES } from '@/constants';
import { getConditionTailwindColor } from '@/lib/conditions';
import { trackEvent } from '@/lib/analytics';
import OutfittersNearby from '@/components/plan/OutfittersNearby';

const ConditionNetworkLayer = dynamic(() => import('@/components/map/ConditionNetworkLayer'), { ssr: false });
const ConditionRiverLayer = dynamic(() => import('@/components/map/ConditionRiverLayer'), { ssr: false });
const MapContainer = dynamic(() => import('@/components/map/MapContainer'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-neutral-100 flex items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  ),
});
const AccessPointMarkers = dynamic(() => import('@/components/map/AccessPointMarkers'), { ssr: false });
const RouteLayer = dynamic(() => import('@/components/map/RouteLayer'), { ssr: false });
const GaugeStationMarkers = dynamic(() => import('@/components/map/GaugeStationMarkers'), { ssr: false });
const POIMarkers = dynamic(() => import('@/components/map/POIMarkers'), { ssr: false });
const HazardMarkers = dynamic(() => import('@/components/map/HazardMarkers'), { ssr: false });
const FlowParticlesLayer = dynamic(() => import('@/components/map/FlowParticlesLayer'), { ssr: false });

// Roughly the bounding box covering all Missouri Ozark float rivers we plan
// — used as the default map view when no river is selected yet.
const OZARKS_BOUNDS: [number, number, number, number] = [-93.5, 36.4, -90.4, 38.6];

// localStorage key for the Filters panel's layer choices (versioned so a
// future shape change can just bump the suffix instead of migrating).
const FILTERS_STORAGE_KEY = 'eddy-plan-map-filters-v1';

interface PlanPageClientProps {
  initialRiverSlug: string | null;
  guidePost?: { slug: string; title: string } | null;
}

export default function PlanPageClient({ initialRiverSlug, guidePost = null }: PlanPageClientProps) {
  const searchParams = useSearchParams();

  const urlRiver = searchParams.get('river') ?? initialRiverSlug;
  const urlPutIn = searchParams.get('putIn');
  const urlTakeOut = searchParams.get('takeOut');
  const urlVessel = searchParams.get('vessel');

  const [riverSlug, setRiverSlug] = useState<string | null>(urlRiver);
  const [selectedPutIn, setSelectedPutIn] = useState<string | null>(urlPutIn);
  const [selectedTakeOut, setSelectedTakeOut] = useState<string | null>(urlTakeOut);
  const [selectedVesselTypeId, setSelectedVesselTypeId] = useState<string | null>(null);
  const [urlInitialized, setUrlInitialized] = useState(false);
  // Gauges default ON — condition-colored gauge pins are core map content.
  const [showGauges, setShowGauges] = useState(true);
  // Map content filters (see components/plan/PlanFilters). Everything
  // defaults on — nearby-rivers network, river name labels, gauges, POIs;
  // hiddenPoiCategories is empty = all shown, so a paddler's category
  // choices persist as they switch rivers.
  const [showNetwork, setShowNetwork] = useState(true);
  const [showRiverNames, setShowRiverNames] = useState(true);
  const [showPOIs, setShowPOIs] = useState(true);
  const [hiddenPoiCategories, setHiddenPoiCategories] = useState<Set<string>>(() => new Set());
  const toggleNetwork = useCallback(() => setShowNetwork((v) => !v), []);
  const toggleRiverNames = useCallback(() => setShowRiverNames((v) => !v), []);
  const toggleGauges = useCallback(() => setShowGauges((v) => !v), []);
  const togglePOIs = useCallback(() => setShowPOIs((v) => !v), []);
  const togglePoiCategory = useCallback((c: string) => {
    setHiddenPoiCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }, []);
  // Legend-chip condition filter: narrow the nearby-rivers network to the
  // tapped conditions ("show me only flowing rivers"). Empty = show all.
  const [conditionFilter, setConditionFilter] = useState<Set<ConditionCode>>(() => new Set());
  const toggleCondition = useCallback((code: ConditionCode) => {
    // Filtering implies wanting to SEE the network — turn it on if off.
    setShowNetwork(true);
    setConditionFilter((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
    trackEvent('map_condition_filter', { condition: code });
  }, []);
  const clearConditionFilter = useCallback(() => setConditionFilter(new Set()), []);
  const visibleConditions = useMemo(
    () => (conditionFilter.size ? Array.from(conditionFilter) : null),
    [conditionFilter],
  );
  // Flow particles are ambience, so the toggle is session-only (never
  // persisted) and the default is per-device: on for desktop, off on
  // phones (battery). null = viewport not known yet (hydration).
  const [showFlow, setShowFlow] = useState<boolean | null>(null);
  const toggleFlow = useCallback(() => setShowFlow((v) => !(v === true)), []);
  const flowOn = showFlow === true;

  // Layer choices persist across visits (the map style already does). The
  // condition filter deliberately does NOT persist — "what's floatable" is
  // a today question, and a stale filter reads as missing rivers.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Record<string, unknown>;
      if (typeof saved.showNetwork === 'boolean') setShowNetwork(saved.showNetwork);
      if (typeof saved.showRiverNames === 'boolean') setShowRiverNames(saved.showRiverNames);
      if (typeof saved.showGauges === 'boolean') setShowGauges(saved.showGauges);
      if (typeof saved.showPOIs === 'boolean') setShowPOIs(saved.showPOIs);
      if (Array.isArray(saved.hiddenPoiCategories)) {
        setHiddenPoiCategories(
          new Set(saved.hiddenPoiCategories.filter((c): c is string => typeof c === 'string')),
        );
      }
    } catch {
      // Bad/absent storage — defaults stand.
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(
        FILTERS_STORAGE_KEY,
        JSON.stringify({
          showNetwork,
          showRiverNames,
          showGauges,
          showPOIs,
          hiddenPoiCategories: Array.from(hiddenPoiCategories),
        }),
      );
    } catch {
      // Storage full/blocked — persistence is best-effort.
    }
  }, [showNetwork, showRiverNames, showGauges, showPOIs, hiddenPoiCategories]);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackContext, setFeedbackContext] = useState<FeedbackContext | undefined>(undefined);
  const [showVisualSubmitForm, setShowVisualSubmitForm] = useState(searchParams.get('submitPhoto') === 'true');
  const visualFormRef = useFocusTrap<HTMLDivElement>(showVisualSubmitForm, () => setShowVisualSubmitForm(false));
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'saving'>('idle');

  const captureRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Data fetching — all hooks gracefully handle null/empty slug
  const { data: rivers } = useRivers();
  const { data: river, isLoading: riverLoading, error: riverError } = useRiver(riverSlug ?? '');
  const { data: accessPoints } = useAccessPoints(riverSlug);
  const { data: conditionData } = useConditions(river?.id || null, {
    putInAccessPointId: selectedPutIn,
  });
  const condition = conditionData?.condition ?? null;
  const { data: vesselTypes } = useVesselTypes();
  // Statewide gauges stop fetching whenever the layer is toggled off in
  // Filters — /api/gauges is the planner's slowest fetch.
  const { data: allGaugeStations } = useGaugeStations({ enabled: showGauges });
  // Statewide condition counts + newest-reading stamp for the Filters
  // legend. Same React Query keys the network layer uses — no extra fetch.
  const { countsByCode, newestReadingAt } = useConditionNetwork();
  const { data: pois } = usePOIs(riverSlug);
  const { data: hazards } = useHazards(riverSlug);
  const { data: weather } = useWeather(riverSlug);
  const { data: nearbyServices } = useNearbyServices(riverSlug);

  // lg breakpoint gate so only ONE MapLibre instance ever mounts. Rendering
  // both layouts and hiding one with CSS still initializes two WebGL maps —
  // a real cost on the rural connections this app targets. null = hydration
  // render (viewport unknown): render both wrappers exactly like the old
  // CSS-hidden markup so server and client HTML agree, then drop one.
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  // Resolve the flow-particle default once the viewport is known; a choice
  // the user already made this session wins.
  useEffect(() => {
    if (isDesktop !== null) setShowFlow((v) => (v === null ? isDesktop : v));
  }, [isDesktop]);

  const gaugeStations = useMemo(
    () => allGaugeStations?.filter(g => g.thresholds?.some(t => t.riverId === river?.id)),
    [allGaugeStations, river?.id]
  );

  // POI category filter (see PlanFilters). availableCategories drives which
  // pills show; filteredPois is what the map renders.
  const availablePoiCategories = useMemo(
    () => Array.from(new Set((pois ?? []).map((p) => p.type))),
    [pois],
  );
  const filteredPois = useMemo(
    () => (showPOIs ? (pois ?? []).filter((p) => !hiddenPoiCategories.has(p.type)) : []),
    [pois, showPOIs, hiddenPoiCategories],
  );

  // Update URL whenever any planner state changes
  const updateUrl = useCallback((next: {
    river: string | null;
    putIn: string | null;
    takeOut: string | null;
    vessel: string | null;
  }) => {
    const params = new URLSearchParams();
    if (next.river) params.set('river', next.river);
    if (next.putIn) params.set('putIn', next.putIn);
    if (next.takeOut) params.set('takeOut', next.takeOut);
    if (next.vessel) params.set('vessel', next.vessel);

    const qs = params.toString();
    const newUrl = qs ? `?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
  }, []);

  useEffect(() => {
    if (urlInitialized) {
      updateUrl({
        river: riverSlug,
        putIn: selectedPutIn,
        takeOut: selectedTakeOut,
        vessel: selectedVesselTypeId,
      });
    }
  }, [riverSlug, selectedPutIn, selectedTakeOut, selectedVesselTypeId, urlInitialized, updateUrl]);

  // Initialize vessel selection from URL or default to canoe
  useEffect(() => {
    if (vesselTypes && vesselTypes.length > 0 && !selectedVesselTypeId) {
      if (urlVessel) {
        const found = vesselTypes.find(v => v.id === urlVessel || v.slug === urlVessel);
        if (found) {
          setSelectedVesselTypeId(found.id);
          setUrlInitialized(true);
          return;
        }
      }
      const fallback = vesselTypes.find(v => v.slug === 'canoe') || vesselTypes[0];
      setSelectedVesselTypeId(fallback.id);
      setUrlInitialized(true);
    }
  }, [vesselTypes, selectedVesselTypeId, urlVessel]);

  // Validate URL access points belong to the loaded river
  useEffect(() => {
    if (accessPoints && accessPoints.length > 0 && urlInitialized) {
      if (selectedPutIn && !accessPoints.find(ap => ap.id === selectedPutIn)) {
        setSelectedPutIn(null);
      }
      if (selectedTakeOut && !accessPoints.find(ap => ap.id === selectedTakeOut)) {
        setSelectedTakeOut(null);
      }
    }
  }, [accessPoints, selectedPutIn, selectedTakeOut, urlInitialized]);

  // River change: clear access point selections (a put-in from one river
  // never makes sense on another)
  const handleRiverChange = useCallback((slug: string | null, source: 'dropdown' | 'map' = 'dropdown') => {
    if (slug) trackEvent('river_selected', { slug, source });
    setRiverSlug(slug);
    setSelectedPutIn(null);
    setSelectedTakeOut(null);
  }, []);

  // Put-in is always upstream of take-out (lower river_mile_downstream).
  const setBothPoints = useCallback((idA: string, idB: string) => {
    if (!accessPoints) {
      setSelectedPutIn(idA);
      setSelectedTakeOut(idB);
      return;
    }
    const a = accessPoints.find(ap => ap.id === idA);
    const b = accessPoints.find(ap => ap.id === idB);
    if (a && b && a.riverMile > b.riverMile) {
      setSelectedPutIn(idB);
      setSelectedTakeOut(idA);
    } else {
      setSelectedPutIn(idA);
      setSelectedTakeOut(idB);
    }
  }, [accessPoints]);

  const planParams = (river && selectedPutIn && selectedTakeOut)
    ? {
        riverId: river.id,
        startId: selectedPutIn,
        endId: selectedTakeOut,
        vesselTypeId: selectedVesselTypeId || undefined,
      }
    : null;
  const {
    data: plan,
    isLoading: planLoading,
    isError: planIsError,
    refetch: refetchPlan,
  } = useFloatPlan(planParams);
  // Show the plan error state only once both endpoints are chosen (a null
  // planParams simply means the user hasn't finished selecting yet).
  const planHasError = !!(selectedPutIn && selectedTakeOut && planIsError);

  const selectedPutInPoint = accessPoints?.find(ap => ap.id === selectedPutIn);
  const nearestGauge = gaugeStations && gaugeStations.length > 0
    ? selectedPutInPoint
      ? findNearestGauge(gaugeStations, selectedPutInPoint.coordinates.lat, selectedPutInPoint.coordinates.lng)
      : river?.bounds
        ? findNearestGauge(
            gaugeStations,
            (river.bounds[1] + river.bounds[3]) / 2,
            (river.bounds[0] + river.bounds[2]) / 2,
          )
        : null
    : null;

  // Forecast anchor: put-in when chosen, else nearest gauge (only known
  // once the gauge layer has been toggled on — gauges load lazily now),
  // else the river's bounds centre. County-scale forecasts don't care
  // about the few miles between these.
  const boundsCenterLat = river?.bounds ? (river.bounds[1] + river.bounds[3]) / 2 : null;
  const boundsCenterLng = river?.bounds ? (river.bounds[0] + river.bounds[2]) / 2 : null;
  const forecastLat = selectedPutInPoint?.coordinates.lat ?? nearestGauge?.coordinates.lat ?? boundsCenterLat;
  const forecastLng = selectedPutInPoint?.coordinates.lng ?? nearestGauge?.coordinates.lng ?? boundsCenterLng;
  const { data: forecast } = useForecastByCoords(forecastLat, forecastLng);

  const handleMarkerClick = useCallback((point: AccessPoint) => {
    if (point.id === selectedPutIn) {
      setSelectedPutIn(null);
      return;
    }
    if (point.id === selectedTakeOut) {
      setSelectedTakeOut(null);
      return;
    }
    if (!selectedPutIn && !selectedTakeOut) {
      trackEvent('putin_selected', { river: riverSlug ?? '' });
      setSelectedPutIn(point.id);
    } else if (selectedPutIn && !selectedTakeOut) {
      trackEvent('takeout_selected', { river: riverSlug ?? '' });
      setBothPoints(selectedPutIn, point.id);
    } else if (!selectedPutIn && selectedTakeOut) {
      trackEvent('putin_selected', { river: riverSlug ?? '' });
      setBothPoints(point.id, selectedTakeOut);
    } else if (selectedPutIn && selectedTakeOut) {
      trackEvent('takeout_selected', { river: riverSlug ?? '' });
      setBothPoints(selectedPutIn, point.id);
    }
  }, [selectedPutIn, selectedTakeOut, setBothPoints, riverSlug]);

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

  const handleShare = useCallback(async () => {
    if (!riverSlug || !selectedPutIn || !selectedTakeOut || !river) return;

    // Fallback: a query-string planner link, used if saving the plan fails.
    const params = new URLSearchParams();
    params.set('river', riverSlug);
    params.set('putIn', selectedPutIn);
    params.set('takeOut', selectedTakeOut);
    if (selectedVesselTypeId) params.set('vessel', selectedVesselTypeId);
    const fallbackUrl = `${window.location.origin}/plan?${params.toString()}`;

    // Persist the plan for a branded short-code link that snapshots conditions
    // at save time (the /plan/[shortCode] landing page + OG card). Fall back to
    // the query-string URL if the save fails so sharing always works.
    let shareUrl = fallbackUrl;
    setShareStatus('saving');
    try {
      const res = await fetch('/api/plan/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          riverId: river.id,
          startId: selectedPutIn,
          endId: selectedTakeOut,
          vesselTypeId: selectedVesselTypeId,
          // Send the already-computed plan so the save endpoint can skip the
          // full (USGS + Mapbox) recalculation — this is what makes the Share
          // click resolve near-instantly instead of after several seconds.
          snapshot: plan
            ? {
                distanceMiles: plan.distance.miles,
                estimatedFloatMinutes: plan.floatTime?.minutes ?? null,
                driveBackMinutes: plan.driveBack?.minutes ?? null,
                conditionCode: plan.condition?.code ?? null,
                gaugeHeightFt: plan.condition?.gaugeHeightFt ?? null,
                dischargeCfs: plan.condition?.dischargeCfs ?? null,
                gaugeName: plan.condition?.gaugeName ?? null,
              }
            : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.url) shareUrl = data.url;
      }
    } catch {
      // keep fallbackUrl
    }

    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    if (isMobile && navigator.share) {
      try {
        await navigator.share({
          title: `Float Plan - ${river.name}`,
          url: shareUrl,
        });
        trackEvent('plan_shared', { river: riverSlug ?? '', method: 'link' });
        setShareStatus('idle');
        return;
      } catch {
        // fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      trackEvent('plan_shared', { river: riverSlug ?? '', method: 'link' });
      setShareStatus('copied');
      setTimeout(() => setShareStatus('idle'), 2000);
    } catch {
      setShareStatus('idle');
      window.prompt('Copy this link:', shareUrl);
    }
  }, [riverSlug, selectedPutIn, selectedTakeOut, selectedVesselTypeId, river, plan]);

  const handleDownloadImage = useCallback(async () => {
    if (!selectedPutIn || !selectedTakeOut || !river || !plan || !captureRef.current) return;
    trackEvent('plan_shared', { river: riverSlug ?? '', method: 'image' });
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(captureRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        useCORS: true,
      });
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `eddy-float-plan-${river.name.toLowerCase().replace(/\s+/g, '-')}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 'image/png');
    } catch (err) {
      console.error('Error generating image:', err);
    }
  }, [selectedPutIn, selectedTakeOut, river, plan, riverSlug]);

  const handleAccessPointHover = useCallback((point: AccessPoint) => {
    if (!river || !accessPoints || !selectedVesselTypeId) return;
    const sortedPoints = [...accessPoints].sort((a, b) => a.riverMile - b.riverMile);
    const pointIndex = sortedPoints.findIndex(ap => ap.id === point.id);

    if (selectedPutIn && !selectedTakeOut) {
      queryClient.prefetchQuery({
        queryKey: ['float-plan', river.id, selectedPutIn, point.id, selectedVesselTypeId, undefined],
        queryFn: async () => {
          const sp = new URLSearchParams({
            riverId: river.id,
            startId: selectedPutIn,
            endId: point.id,
            vesselTypeId: selectedVesselTypeId,
          });
          const response = await fetch(`/api/plan?${sp.toString()}`);
          if (!response.ok) throw new Error('Failed to calculate float plan');
          const data = await response.json();
          return data.plan;
        },
        staleTime: 5 * 60 * 1000,
      });
    } else if (!selectedPutIn) {
      const nearby = sortedPoints.slice(
        Math.max(0, pointIndex + 1),
        Math.min(sortedPoints.length, pointIndex + 4),
      );
      nearby.forEach(takeOut => {
        queryClient.prefetchQuery({
          queryKey: ['float-plan', river.id, point.id, takeOut.id, selectedVesselTypeId, undefined],
          queryFn: async () => {
            const sp = new URLSearchParams({
              riverId: river.id,
              startId: point.id,
              endId: takeOut.id,
              vesselTypeId: selectedVesselTypeId,
            });
            const response = await fetch(`/api/plan?${sp.toString()}`);
            if (!response.ok) throw new Error('Failed to calculate float plan');
            const data = await response.json();
            return data.plan;
          },
          staleTime: 5 * 60 * 1000,
        });
      });
    }
  }, [river, accessPoints, selectedPutIn, selectedTakeOut, selectedVesselTypeId, queryClient]);

  const putInPoint = accessPoints?.find(ap => ap.id === selectedPutIn) || null;
  const takeOutPoint = accessPoints?.find(ap => ap.id === selectedTakeOut) || null;

  const pointsAlongRoute: RouteItem[] = useMemo(() => {
    if (!putInPoint || !takeOutPoint) return [];
    const minMile = Math.min(putInPoint.riverMile, takeOutPoint.riverMile);
    const maxMile = Math.max(putInPoint.riverMile, takeOutPoint.riverMile);

    const intermediateAPs: RouteItem[] = (accessPoints || [])
      .filter(ap =>
        ap.id !== putInPoint.id &&
        ap.id !== takeOutPoint.id &&
        ap.riverMile > minMile &&
        ap.riverMile < maxMile,
      )
      .map(ap => ({
        id: ap.id,
        name: ap.name,
        riverMile: ap.riverMile,
        type: 'access_point' as const,
        subType: ap.types?.[0] || ap.type || 'access',
        description: ap.description,
        imageUrl: ap.imageUrls?.[0] || null,
      }));

    const routePOIs: RouteItem[] = (pois || [])
      .filter(poi =>
        poi.riverMile !== null &&
        poi.riverMile > minMile &&
        poi.riverMile < maxMile,
      )
      .map(poi => ({
        id: poi.id,
        name: poi.name,
        riverMile: poi.riverMile!,
        type: 'poi' as const,
        subType: poi.type,
        description: poi.description,
        imageUrl: poi.images?.[0]?.url || null,
        npsUrl: poi.npsUrl,
      }));

    return [...intermediateAPs, ...routePOIs].sort((a, b) => a.riverMile - b.riverMile);
  }, [putInPoint, takeOutPoint, accessPoints, pois]);

  const activeMileRange = putInPoint && takeOutPoint
    ? { min: Math.min(putInPoint.riverMile, takeOutPoint.riverMile), max: Math.max(putInPoint.riverMile, takeOutPoint.riverMile) }
    : null;

  // (No auto-scroll here: the mobile plan card is a fixed-position bottom
  // sheet, so it is always on screen — scrollIntoView on a fixed element only
  // risks yanking the document toward the below-fold content.)

  // ─── No river selected: show the map with a prominent river picker ───
  if (!riverSlug) {
    return (
      <div className="relative bg-neutral-100 plan-viewport-h">
        <MapContainer initialBounds={OZARKS_BOUNDS} showLegend={false}>
          {/* Every river in its live condition color — click one to start
              planning it (no river excluded here since none is selected). */}
          <ConditionNetworkLayer showLabels={showRiverNames} onSelectRiver={(slug) => handleRiverChange(slug, 'map')} />
          {/* Statewide flow at first sight — the wow frame. */}
          {flowOn && <FlowParticlesLayer />}
        </MapContainer>

        {/* Prominent river selector floating on the map */}
        <div className="absolute top-4 left-4 right-4 sm:right-auto sm:w-[380px] z-30">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl border border-neutral-200 p-4">
            <h1
              className="text-lg font-bold text-neutral-900 mb-0.5"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Plan a Float
            </h1>
            <p className="text-sm text-neutral-600 mb-3">
              Tap any river on the map — colored by today&apos;s conditions —
              or pick one from the list.
            </p>
            <RiverSwitcher
              currentSlug={null}
              rivers={rivers || []}
              onChange={handleRiverChange}
            />
            {/* The browsing mood belongs to the Observatory — offer it. */}
            <Link
              href="/river-map"
              className="mt-3 flex items-center justify-center gap-1 text-xs font-semibold text-primary-600 transition-colors hover:text-primary-700"
            >
              See statewide conditions →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ─── River loading/error states ───
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
          <Image
            src={EDDY_IMAGES.flag}
            alt="Eddy the otter"
            width={72}
            height={72}
            className="mx-auto mb-4 object-contain"
          />
          <h2 className="text-xl font-bold text-neutral-900 mb-2">River Not Found</h2>
          <p className="text-neutral-600 mb-4">
            We couldn&apos;t find that river. Try picking another.
          </p>
          <button
            onClick={() => handleRiverChange(null)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
          >
            Choose a river
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* OfflineBanner is rendered once globally in the root layout (above the
          header); no second copy here. */}
      {/* ─── DESKTOP: Split-panel layout ─── */}
      {isDesktop !== false && (
      <div className="hidden lg:flex overflow-hidden plan-viewport-h">
        {/* Map-first: the sidebar column only exists once a put-in starts a
            plan. Before that the map is full-bleed and the river switcher
            floats on it (left overlay stack below). */}
        {putInPoint && (
        <div className="w-[400px] flex-shrink-0 border-r border-neutral-200 bg-white flex flex-col min-h-0">
          <div className="p-3 border-b border-neutral-200 bg-white">
            <RiverSwitcher
              currentSlug={riverSlug}
              rivers={rivers || []}
              onChange={handleRiverChange}
            />
          </div>
          <PlanSidebar
            riverName={river.name}
            riverSlug={river.slug}
            pois={pois}
            conditionCode={condition?.code ?? 'unknown'}
            plan={plan || null}
            isLoading={planLoading}
            putInPoint={putInPoint}
            takeOutPoint={takeOutPoint}
            onClearPutIn={() => setSelectedPutIn(null)}
            onClearTakeOut={() => setSelectedTakeOut(null)}
            onShare={handleShare}
            onDownloadImage={handleDownloadImage}
            shareStatus={shareStatus}
            selectedVesselTypeId={selectedVesselTypeId}
            onVesselChange={setSelectedVesselTypeId}
            onReportIssue={handleReportAccessPointIssue}
            pointsAlongRoute={pointsAlongRoute}
            captureRef={captureRef}
          />
        </div>
        )}

        <div className="flex-1 relative">
          <MapContainer
            initialBounds={river.bounds}
            showLegend={false}
            syncCameraToUrl
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
            {filteredPois.length > 0 && (
              <POIMarkers pois={filteredPois} activeMileRange={activeMileRange} />
            )}
            {/* Statewide condition network: every OTHER river in its live
                condition color, thin, as context. Click one to switch the
                active river. The selected river is drawn separately below. */}
            {showNetwork && (
              <ConditionNetworkLayer excludeRiverId={river.id} showLabels={showRiverNames} visibleConditions={visibleConditions} onSelectRiver={(slug) => handleRiverChange(slug, 'map')} />
            )}
            {/* The selected river, drawn prominently in its own condition color
                (so it's not the one bare line among colored context rivers). */}
            {river.geometry && (
              <ConditionRiverLayer riverId={river.id} riverName={river.name} geometry={river.geometry} showLabel={showRiverNames} />
            )}
            {/* Selected float route line between put-in and take-out */}
            <RouteLayer routeGeometry={putInPoint && takeOutPoint ? plan?.route ?? null : null} />
            {/* Safety-critical: hazards render always, never gated behind toggles */}
            <HazardMarkers hazards={hazards ?? []} />
            {/* Animated downstream current. Honors the legend-chip filter;
                when the network is hidden, flow stays on the hero river. */}
            {flowOn && (
              <FlowParticlesLayer
                visibleConditions={visibleConditions}
                onlyRiverId={showNetwork ? undefined : river.id}
              />
            )}
          </MapContainer>

          {/* Left overlay stack — river switcher (until a put-in starts the
              plan), weather, filters. One column so they never overlap. */}
          <div className="absolute top-4 left-4 z-30 flex w-[300px] flex-col items-start gap-2">
            {!putInPoint && (
              // relative z-10: the backdrop-blur cards each create a stacking
              // context, and later siblings (weather, Filters) were painting
              // OVER the open river dropdown. Lifting the card lifts its
              // dropdown with it.
              <div className="relative z-10 w-full rounded-2xl border border-neutral-200 bg-white/95 p-3 shadow-2xl backdrop-blur-sm">
                <RiverSwitcher
                  currentSlug={riverSlug}
                  rivers={rivers || []}
                  onChange={handleRiverChange}
                />
              </div>
            )}
            <WeatherBug riverSlug={riverSlug} riverId={river.id} positionClassName="relative" />
            <PlanFilters
              showNetwork={showNetwork}
              onToggleNetwork={toggleNetwork}
              showRiverNames={showRiverNames}
              onToggleRiverNames={toggleRiverNames}
              showGauges={showGauges}
              onToggleGauges={toggleGauges}
              showFlow={flowOn}
              onToggleFlow={toggleFlow}
              showPOIs={showPOIs}
              onTogglePOIs={togglePOIs}
              availableCategories={availablePoiCategories}
              hiddenCategories={hiddenPoiCategories}
              onToggleCategory={togglePoiCategory}
              conditionCounts={countsByCode}
              conditionFilter={conditionFilter}
              onToggleCondition={toggleCondition}
              onClearConditionFilter={clearConditionFilter}
              readingsAsOf={newestReadingAt}
              className="relative"
            />
          </div>

          <MapEddySays
            riverSlug={riverSlug}
            conditionCode={condition?.code ?? 'unknown'}
            gaugeHeightFt={plan?.condition?.gaugeHeightFt ?? null}
            onSubmitPhoto={() => setShowVisualSubmitForm(true)}
          />
          {(putInPoint && takeOutPoint) && (
            <RouteStatsBadge plan={plan ?? null} isLoading={planLoading} className="!top-[4.75rem]" />
          )}
          {planHasError && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 max-w-[calc(100%-2rem)]">
              <PlanErrorBanner onRetry={() => refetchPlan()} />
            </div>
          )}
          <MapLegend />

          {accessPoints && accessPoints.length > 0 && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white/95 via-white/80 to-transparent pt-8 pb-2 px-2 pointer-events-none">
              <div className="pointer-events-auto">
                <AccessPointStrip
                  accessPoints={accessPoints}
                  selectedPutInId={selectedPutIn}
                  selectedTakeOutId={selectedTakeOut}
                  onSelect={handleMarkerClick}
                  onHover={handleAccessPointHover}
                  onReportIssue={handleReportAccessPointIssue}
                  hideExpandedDetails={true}
                  riverSlug={riverSlug}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* ─── MOBILE: Full-screen map + bottom sheet ─── */}
      {isDesktop !== true && (
      <div className="lg:hidden">
        <div className="px-4 py-2 bg-white border-b border-neutral-200 flex items-center justify-between gap-2">
          <MobileRiverSwitcher
            currentSlug={riverSlug}
            currentName={river.name}
            rivers={rivers || []}
            onChange={handleRiverChange}
          />
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowVisualSubmitForm(true)}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
              aria-label="Submit a river photo"
              title="Show us what the river looks like"
            >
              <Camera className="w-4 h-4" />
            </button>
            {/* Temp lives here on mobile (not a floating WeatherBug) so the
                map's top edge stays clear for the hint/stats overlays. */}
            {typeof weather?.temp === 'number' && (
              <span className="text-xs font-semibold text-neutral-600 tabular-nums">
                {weather.temp}°
              </span>
            )}
            <span
              className="px-2 py-0.5 rounded text-[10px] font-bold"
              // Near-black ink on the solid condition fill — white text is
              // illegible on the light conditions (low/good/flowing).
              style={{ backgroundColor: CONDITION_COLORS[condition?.code ?? 'unknown'] || CONDITION_COLORS.unknown, color: '#1A1814' }}
            >
              {CONDITION_LABELS[(condition?.code ?? 'unknown') as ConditionCode] || 'Unknown'}
            </span>
          </div>
        </div>

        <div className={`relative ${putInPoint && takeOutPoint ? 'plan-map-h--sheet' : 'plan-map-h'}`}>
          <MapContainer
            initialBounds={river.bounds}
            showLegend={false}
            syncCameraToUrl
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
            {filteredPois.length > 0 && (
              <POIMarkers pois={filteredPois} activeMileRange={activeMileRange} />
            )}
            {/* Statewide condition network: every OTHER river in its live
                condition color, thin, as context. Click one to switch the
                active river. The selected river is drawn separately below. */}
            {showNetwork && (
              <ConditionNetworkLayer excludeRiverId={river.id} showLabels={showRiverNames} visibleConditions={visibleConditions} onSelectRiver={(slug) => handleRiverChange(slug, 'map')} />
            )}
            {/* The selected river, drawn prominently in its own condition color
                (so it's not the one bare line among colored context rivers). */}
            {river.geometry && (
              <ConditionRiverLayer riverId={river.id} riverName={river.name} geometry={river.geometry} showLabel={showRiverNames} />
            )}
            {/* Selected float route line between put-in and take-out */}
            <RouteLayer routeGeometry={putInPoint && takeOutPoint ? plan?.route ?? null : null} />
            {/* Safety-critical: hazards render always, never gated behind toggles */}
            <HazardMarkers hazards={hazards ?? []} />
            {/* Animated downstream current. Honors the legend-chip filter;
                when the network is hidden, flow stays on the hero river. */}
            {flowOn && (
              <FlowParticlesLayer
                visibleConditions={visibleConditions}
                onlyRiverId={showNetwork ? undefined : river.id}
              />
            )}
          </MapContainer>

          {/* Below the top-center Eddy pill (92% wide on phones — a top-4
              left-4 button would sit underneath it). */}
          <PlanFilters
            showNetwork={showNetwork}
            onToggleNetwork={toggleNetwork}
            showRiverNames={showRiverNames}
            onToggleRiverNames={toggleRiverNames}
            showGauges={showGauges}
            onToggleGauges={toggleGauges}
            showFlow={flowOn}
            onToggleFlow={toggleFlow}
            showPOIs={showPOIs}
            onTogglePOIs={togglePOIs}
            availableCategories={availablePoiCategories}
            hiddenCategories={hiddenPoiCategories}
            onToggleCategory={togglePoiCategory}
            conditionCounts={countsByCode}
            conditionFilter={conditionFilter}
            onToggleCondition={toggleCondition}
            onClearConditionFilter={clearConditionFilter}
            readingsAsOf={newestReadingAt}
            className="absolute top-[4.25rem] left-3 z-30"
          />

          {/* Hidden once both endpoints are chosen: the fixed z-40 float
              sheet takes the stage and buried/collided with the pill on
              the sliver of map that remains — and the sheet's conditions
              card carries the same report. */}
          {!(putInPoint && takeOutPoint) && (
            <MapEddySays
              riverSlug={riverSlug}
              conditionCode={condition?.code ?? 'unknown'}
              gaugeHeightFt={plan?.condition?.gaugeHeightFt ?? null}
              onSubmitPhoto={() => setShowVisualSubmitForm(true)}
            />
          )}
          {/* Same row as the Filters button (left-3) — centered stats,
              aligned tops, no overlap on ≥360px viewports. */}
          {(putInPoint && takeOutPoint) && (
            <RouteStatsBadge plan={plan ?? null} isLoading={planLoading} className="!top-[4.25rem]" />
          )}

          {/* Access point picker strip — only while picking. Once both
              endpoints are chosen the bottom sheet carries all the detail and
              the strip would just stack a third band of UI over the map. */}
          {accessPoints && accessPoints.length > 0 && !(putInPoint && takeOutPoint) && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white/95 via-white/80 to-transparent pt-6 pb-[calc(0.25rem+env(safe-area-inset-bottom))] px-1 pointer-events-none">
              <div className="pointer-events-auto">
                <AccessPointStrip
                  accessPoints={accessPoints}
                  selectedPutInId={selectedPutIn}
                  selectedTakeOutId={selectedTakeOut}
                  onSelect={handleMarkerClick}
                  onHover={handleAccessPointHover}
                  onReportIssue={handleReportAccessPointIssue}
                  hideExpandedDetails={true}
                  riverSlug={riverSlug}
                />
              </div>
            </div>
          )}
        </div>

        {planHasError && (
          <div className="px-4 py-3">
            <PlanErrorBanner onRetry={() => refetchPlan()} />
          </div>
        )}

        {putInPoint && takeOutPoint && (
          <FloatPlanCard
            plan={plan ?? null}
            isLoading={planLoading}
            isError={planHasError}
            onRetry={() => refetchPlan()}
            putInPoint={putInPoint}
            takeOutPoint={takeOutPoint}
            onClearPutIn={() => setSelectedPutIn(null)}
            onClearTakeOut={() => setSelectedTakeOut(null)}
            onShare={handleShare}
            onDownloadImage={handleDownloadImage}
            shareStatus={shareStatus}
            riverSlug={riverSlug}
            riverName={river.name}
            vesselTypeId={selectedVesselTypeId}
            onVesselChange={setSelectedVesselTypeId}
            captureRef={captureRef}
            onReportIssue={handleReportAccessPointIssue}
            pointsAlongRoute={pointsAlongRoute}
          />
        )}
      </div>
      )}

      {/* ─── Below-fold info ─── */}
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        {forecast?.days && forecast.days.length > 0 && (
          <ForecastCard days={forecast.days} city={forecast.city} />
        )}

        {putInPoint && takeOutPoint && nearbyServices && (
          <ShuttlePanel
            putInId={putInPoint.id}
            takeOutId={takeOutPoint.id}
            putInName={putInPoint.name}
            takeOutName={takeOutPoint.name}
            services={nearbyServices}
          />
        )}

        <RiverVisualGallery
          riverSlug={riverSlug}
          accessPointId={selectedPutIn}
        />

        <OutfittersNearby pois={pois} putInPoint={putInPoint} riverSlug={riverSlug} />

        <NearbyServices riverSlug={riverSlug} defaultOpen={false} />

        {guidePost && (
          <Link
            href={`/blog/${guidePost.slug}`}
            className="block bg-primary-50 rounded-xl border border-primary-100 p-4 hover:bg-primary-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <BookOpen className="w-5 h-5 text-primary-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-neutral-900">
                  Read the full {river.name} Float Trip Guide
                </p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Best floats, access points, outfitters, and everything you need to know
                </p>
              </div>
            </div>
          </Link>
        )}

        {/* Cross-link back to river guide page */}
        <Link
          href={`/rivers/${riverSlug}`}
          className="block text-center text-sm text-neutral-500 hover:text-primary-600 transition-colors py-2"
        >
          ← Back to {river.name} guide
        </Link>
      </div>

      {putInPoint && takeOutPoint && plan && captureRef && (
        <ShareableFloatCard
          plan={plan}
          putInPoint={putInPoint}
          takeOutPoint={takeOutPoint}
          riverName={river.name}
          captureRef={captureRef}
        />
      )}

      <FeedbackModal
        isOpen={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
        context={feedbackContext}
      />

      {showVisualSubmitForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowVisualSubmitForm(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Submit a river photo"
        >
          <div
            ref={visualFormRef}
            tabIndex={-1}
            className="w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <RiverVisualSubmitForm
              riverId={river.id}
              accessPoints={accessPoints}
              currentGaugeHeightFt={condition?.gaugeHeightFt ?? null}
              currentDischargeCfs={condition?.dischargeCfs ?? null}
              gaugeStationId={conditionData?.gauges?.find(g => g.isPrimary)?.id}
              onSubmitted={() => setShowVisualSubmitForm(false)}
              onClose={() => setShowVisualSubmitForm(false)}
            />
          </div>
        </div>
      )}

    </div>
  );
}

function RiverSwitcher({
  currentSlug,
  rivers,
  onChange,
}: {
  currentSlug: string | null;
  rivers: RiverListItem[];
  onChange: (slug: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = currentSlug ? rivers.find(r => r.slug === currentSlug) : null;

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left rounded-xl border-2 border-primary-300 bg-white hover:border-primary-500 hover:bg-primary-50 shadow-sm transition-colors"
      >
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-primary-600 font-bold">River</div>
          <div className="text-lg font-bold text-neutral-900 truncate" style={{ fontFamily: 'var(--font-display)' }}>
            {current?.name || 'Choose a river'}
          </div>
        </div>
        <span className="flex items-center gap-2 flex-shrink-0">
          {current && (
            <span className={`w-2.5 h-2.5 rounded-full ${getConditionTailwindColor(current.currentCondition?.code ?? 'unknown')}`} />
          )}
          <ChevronDown className={`w-5 h-5 text-primary-600 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 bg-white border border-neutral-200 rounded-xl shadow-2xl max-h-[60vh] overflow-y-auto">
          {rivers.length === 0 && (
            <div className="flex items-center justify-center py-6">
              <LoadingSpinner size="md" />
            </div>
          )}
          {rivers.map(r => (
            <button
              key={r.id}
              onClick={() => { onChange(r.slug); setOpen(false); }}
              className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-neutral-50 transition-colors ${
                r.slug === currentSlug ? 'bg-primary-50' : ''
              }`}
            >
              <div className="min-w-0">
                <div className="font-semibold text-neutral-900 text-sm truncate">{r.name}</div>
                <div className="text-[11px] text-neutral-500 truncate">{r.lengthMiles.toFixed(1)} mi · {r.region}</div>
              </div>
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${getConditionTailwindColor(r.currentCondition?.code ?? 'unknown')}`}
              />
            </button>
          ))}
          <Link
            href="/rivers"
            className="block px-4 py-2.5 text-center text-sm text-primary-600 hover:bg-neutral-50 border-t border-neutral-100"
          >
            Browse all rivers
          </Link>
        </div>
      )}
    </div>
  );
}

function MobileRiverSwitcher({
  currentSlug,
  currentName,
  rivers,
  onChange,
}: {
  currentSlug: string;
  currentName: string;
  rivers: RiverListItem[];
  onChange: (slug: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const sheetRef = useFocusTrap<HTMLDivElement>(open, () => setOpen(false));

  // Lock body scroll while sheet is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`Currently planning ${currentName} — change river`}
        className="flex items-center gap-1 min-w-0 flex-1 text-left"
      >
        <span
          className="text-base font-bold text-neutral-900 truncate"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {currentName}
        </span>
        <ChevronDown className="w-4 h-4 text-neutral-500 flex-shrink-0" aria-hidden="true" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-in fade-in"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Choose a river"
        >
          <div
            ref={sheetRef}
            tabIndex={-1}
            className="w-full max-h-[75vh] bg-white rounded-t-2xl shadow-2xl flex flex-col animate-in slide-in-from-bottom pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-shrink-0 px-4 pt-3 pb-2 border-b border-neutral-100">
              <div className="w-10 h-1 bg-neutral-300 rounded-full mx-auto mb-3" aria-hidden="true" />
              <h2 className="text-base font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>
                Choose a river
              </h2>
            </div>
            <div className="overflow-y-auto py-1">
              {rivers.map((r) => (
                <button
                  key={r.id}
                  onClick={() => { onChange(r.slug); setOpen(false); }}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
                    r.slug === currentSlug ? 'bg-primary-50' : 'hover:bg-neutral-50'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-neutral-900 text-sm truncate">{r.name}</div>
                    <div className="text-[11px] text-neutral-500">
                      {r.lengthMiles.toFixed(1)} mi · {r.region}
                    </div>
                  </div>
                  <span
                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${getConditionTailwindColor(r.currentCondition?.code ?? 'unknown')}`}
                    title={r.currentCondition?.label || 'Unknown'}
                  />
                </button>
              ))}
              <Link
                href="/rivers"
                onClick={() => setOpen(false)}
                className="block px-4 py-3 text-center text-sm text-primary-600 border-t border-neutral-100"
              >
                Browse all rivers
              </Link>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="flex-shrink-0 px-4 py-3 border-t border-neutral-200 text-sm font-semibold text-neutral-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// Inline "couldn't calculate the float plan" state with a retry action. Shown
// when the plan query errors (commonly a dropped rural connection) so the
// failure is visible and recoverable instead of silent.
function PlanErrorBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-center gap-3 bg-red-50 border-2 border-red-200 rounded-xl shadow-lg px-4 py-2.5"
    >
      <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-red-800">Couldn&apos;t calculate your float plan</p>
        <p className="text-xs text-red-600">Check your connection and try again.</p>
      </div>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors flex-shrink-0"
      >
        <RefreshCw className="w-4 h-4" aria-hidden="true" />
        Try again
      </button>
    </div>
  );
}

