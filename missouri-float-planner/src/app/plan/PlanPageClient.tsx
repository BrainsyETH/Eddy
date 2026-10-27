'use client';

// src/app/plan/PlanPageClient.tsx
// Unified float planner. River is selected via ?river=<slug> query param so a
// single page handles every river. URL params (river, putIn, takeOut, vessel)
// keep the planner state shareable and refresh-stable.

import { useState, useReducer, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Camera, BookOpen, Search, Focus, Undo2, AlertTriangle, RefreshCw } from 'lucide-react';
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
import { trackEvent } from '@/lib/analytics';
import OutfittersNearby from '@/components/plan/OutfittersNearby';
import { useRiverVisualPins, useRegionalRiverVisualPins } from '@/hooks/useRiverVisualPins';
import { usePlannerMapCatalog } from '@/hooks/usePlannerMapCatalog';
import PlannerMapSearch from '@/components/plan/PlannerMapSearch';
import PlannerPlaceCard from '@/components/plan/PlannerPlaceCard';
import { orderedPlannerEndpoints, plannerSelectionReducer, type PlannerSelection } from '@/lib/planner-selection';
import { plannerMapPois } from '@/lib/planner-map-catalog';
import type { PlannerMapPlace } from '@/lib/planner-map-catalog';

const PlannerAccessLayer = dynamic(() => import('@/components/map/PlannerAccessLayer'), { ssr: false });
const PlannerMapFocus = dynamic(() => import('@/components/map/PlannerAccessLayer').then(module => module.PlannerMapFocus), { ssr: false });
const ACCESS_PRIORITY_LAYERS = ['planner-access-dots'];

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
const RiverPhotoMarkers = dynamic(() => import('@/components/map/RiverPhotoMarkers'), { ssr: false });
const HazardMarkers = dynamic(() => import('@/components/map/HazardMarkers'), { ssr: false });
const FlowParticlesLayer = dynamic(() => import('@/components/map/FlowParticlesLayer'), { ssr: false });

// Last-resort frame if the server could not compute the service area.
//
// It is NOT the default view — `defaultBounds` is, and it comes from
// getServiceAreaBounds() on the server. This constant is what that box used to
// be, and it is kept only so a failed RPC still renders a map: at minLat 36.4
// it excluded the Buffalo, Caddo and Mulberry, which is exactly the falling-
// behind that moving the real value server-side is meant to end.
const FALLBACK_BOUNDS: [number, number, number, number] = [-93.5, 36.4, -90.4, 38.6];

// localStorage key for the Filters panel's layer choices (versioned so a
// future shape change can just bump the suffix instead of migrating).
const FILTERS_STORAGE_KEY = 'eddy-plan-map-filters-v1';

interface PlanPageClientProps {
  initialRiverSlug: string | null;
  guidePost?: { slug: string; title: string } | null;
  /** [minLng, minLat, maxLng, maxLat] covering every active river. */
  defaultBounds?: [number, number, number, number];
}

export default function PlanPageClient({
  initialRiverSlug,
  guidePost = null,
  defaultBounds = FALLBACK_BOUNDS,
}: PlanPageClientProps) {
  const searchParams = useSearchParams();

  const urlRiver = searchParams.get('river') ?? initialRiverSlug;
  const urlPutIn = searchParams.get('putIn');
  const urlTakeOut = searchParams.get('takeOut');
  const urlVessel = searchParams.get('vessel');

  const [selection, dispatchSelection] = useReducer(plannerSelectionReducer, {
    current: { riverSlug: urlRiver, selectedPutIn: urlPutIn, selectedTakeOut: urlTakeOut }, past: [],
  });
  const { riverSlug, selectedPutIn, selectedTakeOut } = selection.current;
  const changeSelection = useCallback((patch: Partial<PlannerSelection>) => {
    dispatchSelection({ type: 'change', patch });
  }, []);
  const [mapExpanded, setMapExpanded] = useState(false);
  // Browsing the region is independent of the river that owns the saved route.
  const [showAllRivers, setShowAllRivers] = useState(!urlRiver);
  const [focusPlace, setFocusPlace] = useState<PlannerMapPlace | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const initialCamera = useRef([['lat', -90, 90], ['lng', -180, 180], ['z', 0, 22]].every(([key, min, max]) => {
    const value = searchParams.get(String(key));
    return value !== null && value !== '' && Number.isFinite(Number(value))
      && Number(value) >= Number(min) && Number(value) <= Number(max);
  }));
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
  const [showPhotos, setShowPhotos] = useState(true);
  const [hiddenPoiCategories, setHiddenPoiCategories] = useState<Set<string>>(() => new Set());
  const toggleNetwork = useCallback(() => setShowNetwork((v) => !v), []);
  const toggleRiverNames = useCallback(() => setShowRiverNames((v) => !v), []);
  const toggleGauges = useCallback(() => setShowGauges((v) => !v), []);
  const togglePOIs = useCallback(() => setShowPOIs((v) => !v), []);
  const togglePhotos = useCallback(() => setShowPhotos((v) => !v), []);
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

  // Mobile layer choices persist across visits; desktop starts with all on. The
  // condition filter deliberately does NOT persist — "what's floatable" is
  // a today question, and a stale filter reads as missing rivers.
  useEffect(() => {
    // Desktop starts with all content enabled; choices last for this visit.
    if (window.matchMedia('(min-width: 1024px)').matches) return;
    try {
      const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Record<string, unknown>;
      if (typeof saved.showNetwork === 'boolean') setShowNetwork(saved.showNetwork);
      if (typeof saved.showRiverNames === 'boolean') setShowRiverNames(saved.showRiverNames);
      if (typeof saved.showGauges === 'boolean') setShowGauges(saved.showGauges);
      if (typeof saved.showPOIs === 'boolean') setShowPOIs(saved.showPOIs);
      if (typeof saved.showPhotos === 'boolean') setShowPhotos(saved.showPhotos);
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
    if (window.matchMedia('(min-width: 1024px)').matches) return;
    try {
      localStorage.setItem(
        FILTERS_STORAGE_KEY,
        JSON.stringify({
          showNetwork,
          showRiverNames,
          showGauges,
          showPOIs,
          showPhotos,
          hiddenPoiCategories: Array.from(hiddenPoiCategories),
        }),
      );
    } catch {
      // Storage full/blocked — persistence is best-effort.
    }
  }, [showNetwork, showRiverNames, showGauges, showPOIs, showPhotos, hiddenPoiCategories]);
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
  // ── Two arrays, because two different questions ─────────────────────────
  //
  // `visibleAccessPoints` is everything the map draws. `floatEndpointAccessPoints`
  // is what a trip may be built from. They used to be one array, which meant
  // every marker was implicitly an endpoint: handleMarkerClick took whatever it
  // was handed and made it a put-in.
  //
  // A place with a real page and a real pin that is not a launch has to be
  // drawable and unselectable at the same time, and one array cannot say both.
  // (Montauk State Park prompted this and is not itself an example: it is the
  // Current's first put-in — see 20260823192151.) The API only sends
  // non-endpoints because this page asked for them (`include=non_endpoints`);
  // filtering here is the other half of that bargain.
  //
  // `!== false` and not `=== true`: a payload predating the field omits it, and
  // absent means eligible. See the field's note in packages/eddy-types.
  const { data: visibleAccessPoints, isPlaceholderData: accessPlaceholder, isPending: accessLoading,
    isError: accessError, refetch: refetchAccess } = useAccessPoints(riverSlug);
  const floatEndpointAccessPoints = useMemo(
    () => accessPlaceholder ? undefined : visibleAccessPoints?.filter(ap => ap.isFloatEndpoint !== false),
    [visibleAccessPoints, accessPlaceholder],
  );
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
  const { collection: conditionNetwork, countsByCode, newestReadingAt } = useConditionNetwork();
  const { data: pois, isPlaceholderData: poisPlaceholder } = usePOIs(riverSlug);
  const { data: hazards } = useHazards(riverSlug);
  const { data: weather } = useWeather(riverSlug);
  const { data: nearbyServices } = useNearbyServices(riverSlug);

  // lg breakpoint gate so only ONE MapLibre instance ever mounts. Rendering
  // both layouts and hiding one with CSS still initializes two WebGL maps —
  // a real cost on the rural connections this app targets. null = hydration
  // render (viewport unknown): render both wrappers exactly like the old
  // CSS-hidden markup so server and client HTML agree, then drop one.
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const catalog = usePlannerMapCatalog(isDesktop === true);
  const { data: photoPins } = useRiverVisualPins(riverSlug, showPhotos && isDesktop === false);
  const regionalPhotoPins = useRegionalRiverVisualPins(
    isDesktop ? (rivers ?? []).map(river => river.slug) : [], showPhotos,
  );
  const desktopPanelRef = useRef<HTMLDivElement>(null);
  const desktopStripRef = useRef<HTMLDivElement>(null);
  const mobileSheetRef = useRef<HTMLDivElement>(null);
  const mobilePreviewRef = useRef<HTMLDivElement>(null);
  const mobileStripRef = useRef<HTMLDivElement>(null);
  const previewReturnRef = useRef<HTMLElement | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<PlannerMapPlace | null>(null);
  const previewAccess = useAccessPoints(selectedPlace?.riverSlug ?? null);
  const searchConditions = useMemo(() => new Map(
    (conditionNetwork?.features ?? []).map(feature => [feature.properties.slug, feature.properties]),
  ), [conditionNetwork]);

  // Resolve the flow-particle default once the viewport is known; a choice
  // the user already made this session wins.
  useEffect(() => {
    if (isDesktop !== null) setShowFlow((v) => (v === null ? isDesktop : v));
  }, [isDesktop]);

  const gaugeStations = useMemo(
    () => allGaugeStations?.filter(g => g.thresholds?.some(t => t.riverId === river?.id)),
    [allGaugeStations, river?.id]
  );

  const catalogPois = useMemo(() => plannerMapPois(catalog.data), [catalog.data]);
  const desktopPois = useMemo(() => {
    const detailedRiver = !showAllRivers && river?.slug === riverSlug && pois && !poisPlaceholder ? river.id : null;
    const others = catalogPois.filter(poi => !detailedRiver || poi.riverId !== detailedRiver);
    return [...others, ...(detailedRiver ? pois ?? [] : [])];
  }, [catalogPois, pois, poisPlaceholder, river, riverSlug, showAllRivers]);
  const visibleDesktopPois = useMemo(() => showPOIs
    ? desktopPois.filter(poi => !hiddenPoiCategories.has(poi.type)) : [],
  [desktopPois, showPOIs, hiddenPoiCategories]);

  // POI category filter (see PlanFilters). availableCategories drives which
  // pills show; filteredPois is what the map renders.
  const availablePoiCategories = useMemo(
    () => Array.from(new Set((isDesktop ? desktopPois : pois ?? []).map((p) => p.type))),
    [isDesktop, desktopPois, pois],
  );
  const filteredPois = useMemo(
    () => (showPOIs ? (pois ?? []).filter((p) => !hiddenPoiCategories.has(p.type)) : []),
    [pois, showPOIs, hiddenPoiCategories],
  );

  // Photo pins all render; ones from a different water level than their
  // gauge's CURRENT band (pin.matchesCurrent, computed server-side) draw
  // small and faded instead of being hidden — a strict filter left the map
  // empty whenever no photo matched today's level, which read as uploads
  // silently vanishing.

  // Update URL whenever any planner state changes
  const updateUrl = useCallback((next: {
    river: string | null;
    putIn: string | null;
    takeOut: string | null;
    vessel: string | null;
  }) => {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(next)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    // Keep the camera while letting Next synchronize useSearchParams for
    // navigation tabs. Next preserves its own history state automatically.
    window.history.replaceState(null, '', url);
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
    if (!accessPlaceholder && floatEndpointAccessPoints && floatEndpointAccessPoints.length > 0 && urlInitialized) {
      if (selectedPutIn && !floatEndpointAccessPoints.find(ap => ap.id === selectedPutIn)) {
        dispatchSelection({ type: 'validate', patch: { selectedPutIn: null } });
      }
      if (selectedTakeOut && !floatEndpointAccessPoints.find(ap => ap.id === selectedTakeOut)) {
        dispatchSelection({ type: 'validate', patch: { selectedTakeOut: null } });
      }
    }
  }, [floatEndpointAccessPoints, selectedPutIn, selectedTakeOut, urlInitialized, accessPlaceholder]);

  // River change: clear access point selections (a put-in from one river
  // never makes sense on another)
  const handleRiverChange = useCallback((slug: string | null, source: 'dropdown' | 'map' = 'dropdown') => {
    setSelectedPlace(null);
    setFocusPlace(null);
    setFocusRequest(value => value + 1);
    if (!slug && isDesktop !== false) {
      setShowAllRivers(true);
      return;
    }
    setShowAllRivers(!slug);
    if (slug === riverSlug) return;
    if (slug) trackEvent('river_selected', { slug, source });
    changeSelection({ riverSlug: slug, selectedPutIn: null, selectedTakeOut: null });
  }, [riverSlug, isDesktop, changeSelection]);

  const handlePlaceSelect = useCallback((place: PlannerMapPlace) => {
    previewReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setShowAllRivers(false);
    setFocusPlace(place);
    setFocusRequest(value => value + 1);
    setSelectedPlace(place);
  }, []);

  const closePlace = useCallback(() => {
    setSelectedPlace(null);
    setFocusPlace(null);
    const trigger = previewReturnRef.current;
    requestAnimationFrame(() => {
      if (trigger?.isConnected && trigger !== document.body) trigger.focus({ preventScroll: true });
      else document.querySelector<HTMLElement>('.planner-search input, [data-planner-search-trigger]')?.focus({ preventScroll: true });
    });
  }, []);
  const previewPoint = !previewAccess.isPlaceholderData
    ? previewAccess.data?.find(point => point.id === selectedPlace?.id) : undefined;

  const undoSelection = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    const previous = selection.past.at(-1);
    if (!previous) return;
    const returnFocus = event.detail === 0 && selection.past.length === 1
      && document.activeElement?.getAttribute('aria-label') === 'Undo route change';
    dispatchSelection({ type: 'undo' });
    setSelectedPlace(null);
    setFocusPlace(null);
    setShowAllRivers(!previous.riverSlug);
    setFocusRequest(value => value + 1);
    if (returnFocus) requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>('[aria-label="Show route"]')
        ?? document.querySelector<HTMLElement>('.planner-search input, [data-planner-search-trigger]');
      target?.focus({ preventScroll: true });
    });
  }, [selection.past]);

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
    // Include background route/vessel recalculation. React Query may retain
    // the last result during that fetch, but the UI must not imply it is new.
    isFetching: planLoading,
    isError: planIsError,
    refetch: refetchPlan,
    isLastValidFallback,
    lastValidAt,
  } = useFloatPlan(planParams);
  // Show the plan error state only once both endpoints are chosen (a null
  // planParams simply means the user hasn't finished selecting yet).
  const planHasError = !!(selectedPutIn && selectedTakeOut && planIsError);
  const showStandalonePlanError = planHasError && !isLastValidFallback;

  const selectedPutInPoint = floatEndpointAccessPoints?.find(ap => ap.id === selectedPutIn);
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

  const inspectAccessPoint = useCallback((point: AccessPoint) => {
    if (!river || river.slug !== riverSlug || accessPlaceholder) return;
    handlePlaceSelect({ id: point.id, name: point.name, slug: point.slug,
      riverId: river.id, riverSlug: river.slug, riverName: river.name, coordinates: point.coordinates });
  }, [river, riverSlug, accessPlaceholder, handlePlaceSelect]);

  // Strip cards and mobile pins retain the original two-tap planning flow.
  const handleMarkerClick = useCallback((point: AccessPoint) => {
    if (!river || river.slug !== riverSlug || accessPlaceholder || point.isFloatEndpoint === false) return;
    setSelectedPlace(null);
    setFocusPlace(null);
    if (point.id === selectedPutIn) {
      changeSelection({ selectedPutIn: null });
    } else if (point.id === selectedTakeOut) {
      changeSelection({ selectedTakeOut: null });
    } else {
      const other = floatEndpointAccessPoints?.find(ap => ap.id === (selectedPutIn ?? selectedTakeOut));
      const next = other
        ? orderedPlannerEndpoints(selectedPutIn ? other : point, selectedPutIn ? point : other)
        : { selectedPutIn: point.id, selectedTakeOut: null };
      changeSelection(next);
      trackEvent(next.selectedPutIn === point.id ? 'putin_selected' : 'takeout_selected', { river: riverSlug });
      setShowAllRivers(false);
      if (other || isDesktop) {
        if (!other) setFocusPlace({ id: point.id, name: point.name, slug: point.slug,
          riverId: river.id, riverSlug: river.slug, riverName: river.name, coordinates: point.coordinates });
        setFocusRequest(value => value + 1);
      }
    }
  }, [river, riverSlug, accessPlaceholder, selectedPutIn, selectedTakeOut, floatEndpointAccessPoints, changeSelection, isDesktop]);

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
        floatTimeRange: plan.floatTime?.timeRange ?? null,
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
    if (!river || !floatEndpointAccessPoints || !selectedVesselTypeId) return;
    const sortedPoints = [...floatEndpointAccessPoints].sort((a, b) => a.riverMile - b.riverMile);
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
  }, [river, floatEndpointAccessPoints, selectedPutIn, selectedTakeOut, selectedVesselTypeId, queryClient]);

  const putInPoint = floatEndpointAccessPoints?.find(ap => ap.id === selectedPutIn)
    || (isLastValidFallback && plan?.putIn.id === selectedPutIn ? plan.putIn : null);
  const takeOutPoint = floatEndpointAccessPoints?.find(ap => ap.id === selectedTakeOut)
    || (isLastValidFallback && plan?.takeOut.id === selectedTakeOut ? plan.takeOut : null);

  const pointsAlongRoute: RouteItem[] = useMemo(() => {
    if (!putInPoint || !takeOutPoint) return [];
    const minMile = Math.min(putInPoint.riverMile, takeOutPoint.riverMile);
    const maxMile = Math.max(putInPoint.riverMile, takeOutPoint.riverMile);

    // Everything you pass, not everything you could stop at: a park or
    // campground between the two ends is worth naming on the route even though
    // it could not have been chosen as one of them.
    const intermediateAPs: RouteItem[] = (visibleAccessPoints || [])
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
  }, [putInPoint, takeOutPoint, visibleAccessPoints, pois]);

  const activeMileRange = putInPoint && takeOutPoint
    ? { min: Math.min(putInPoint.riverMile, takeOutPoint.riverMile), max: Math.max(putInPoint.riverMile, takeOutPoint.riverMile) }
    : null;

  // (No auto-scroll here: the mobile plan card is a fixed-position bottom
  // sheet, so it is always on screen — scrollIntoView on a fixed element only
  // risks yanking the document toward the below-fold content.)

  const activeRiver = river?.slug === riverSlug ? river : null;
  const viewRiver = showAllRivers ? null : activeRiver;
  const localPlaces = useMemo(() => activeRiver && !accessPlaceholder
    ? (visibleAccessPoints ?? []).map(point => ({ id: point.id, name: point.name, slug: point.slug,
      riverId: activeRiver.id, riverSlug: activeRiver.slug, riverName: activeRiver.name, coordinates: point.coordinates }))
    : [], [activeRiver, accessPlaceholder, visibleAccessPoints]);
  const routeBounds = useMemo<[number, number, number, number] | undefined>(() => {
    if (!putInPoint || !takeOutPoint) return undefined;
    const coordinates = [putInPoint, takeOutPoint].map(point => [point.coordinates.lng, point.coordinates.lat]);
    // Ignore geometry retained from a previous plan while a new pair loads.
    if (plan?.putIn.id === selectedPutIn && plan?.takeOut.id === selectedTakeOut && plan.route) {
      const geometry = plan.route.type === 'Feature' ? plan.route.geometry : plan.route;
      if (geometry?.type === 'LineString') coordinates.push(...geometry.coordinates);
    }
    return [Math.min(...coordinates.map(c => c[0])), Math.min(...coordinates.map(c => c[1])),
      Math.max(...coordinates.map(c => c[0])), Math.max(...coordinates.map(c => c[1]))];
  }, [putInPoint, takeOutPoint, plan, selectedPutIn, selectedTakeOut]);
  const showRoute = () => {
    setShowAllRivers(false);
    setSelectedPlace(null);
    setFocusPlace(null);
    setFocusRequest(value => value + 1);
  };
  const plannerTools = <>
    {routeBounds && <button type="button" onClick={showRoute} title="Show route" aria-label="Show route"
      className="rounded-lg bg-white/90 p-2.5 text-gray-700 shadow-lg hover:bg-white md:p-2"><Focus size={20} /></button>}
    {selection.past.length > 0 && <button type="button" onClick={undoSelection} title="Undo" aria-label="Undo route change"
      className="rounded-lg bg-white/90 p-2.5 text-gray-700 shadow-lg hover:bg-white md:p-2"><Undo2 size={20} /></button>}
  </>;
  const canTakeOut = !!previewPoint && !!putInPoint && selectedPlace?.riverSlug === riverSlug
    && previewPoint.id !== putInPoint.id;
  const chooseEndpoint = (endpoint: 'put-in' | 'take-out', keyboard: boolean) => {
    if (!selectedPlace || !previewPoint || previewPoint.isFloatEndpoint === false) return;
    if (endpoint === 'take-out' && !canTakeOut) return;
    const keepTakeOut = selectedPlace.riverSlug === riverSlug && takeOutPoint
      && takeOutPoint.id !== previewPoint.id;
    const next = endpoint === 'take-out'
      ? orderedPlannerEndpoints(putInPoint!, previewPoint)
      : keepTakeOut
        ? orderedPlannerEndpoints(previewPoint, takeOutPoint)
        : { selectedPutIn: previewPoint.id, selectedTakeOut: null };
    changeSelection({ riverSlug: selectedPlace.riverSlug, ...next });
    const targetId = previewPoint.id;
    if (keyboard) requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>('[aria-label="Show route"]')
        ?? document.querySelector<HTMLElement>(`.access-point-marker[data-access-point-id="${CSS.escape(targetId)}"]`);
      target?.focus({ preventScroll: true });
    });
    trackEvent(next.selectedPutIn === previewPoint.id ? 'putin_selected' : 'takeout_selected', { river: selectedPlace.riverSlug });
    setSelectedPlace(null);
    setFocusPlace(next.selectedTakeOut ? null : selectedPlace);
    setFocusRequest(value => value + 1);
  };
  const placeCard = selectedPlace && <PlannerPlaceCard place={selectedPlace} point={previewPoint}
    loading={previewAccess.isFetching || previewAccess.isPlaceholderData} failed={previewAccess.isError}
    onRetry={() => { void previewAccess.refetch(); }} canTakeOut={canTakeOut} onClose={closePlace}
    onPutIn={keyboard => chooseEndpoint('put-in', keyboard)} onTakeOut={keyboard => chooseEndpoint('take-out', keyboard)} />;

  // One card for "where" and "how the map looks": search, then the weather
  // and filter tools in the same row, instead of three stacked floating bits.
  const desktopSearch = <PlannerMapSearch rivers={rivers ?? []} places={catalog.places}
    currentSlug={showAllRivers ? null : riverSlug} conditions={searchConditions} loading={catalog.isPending}
    failed={catalog.isError} onRetry={() => { void catalog.refetch(); }}
    onRiver={handleRiverChange} onPlace={handlePlaceSelect}
    actions={<>
      {activeRiver && <WeatherBug compact riverSlug={activeRiver.slug} riverId={activeRiver.id} />}
      <PlanFilters
        floating
        compact
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
        showPhotos={showPhotos}
        onTogglePhotos={togglePhotos}
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
    </>} />;
  const desktopMap = isDesktop !== false ? (
      <div className={`planner-desktop hidden lg:flex overflow-hidden ${mapExpanded ? 'fixed inset-0 z-50 bg-white' : 'relative plan-viewport-h'}`}>
        <div className="flex-1 relative">
          <MapContainer
            initialBounds={defaultBounds}
            showLegend={false}
            syncCameraToUrl
            expanded={mapExpanded} onExpandedChange={setMapExpanded}
            extraTools={<>{plannerTools}<MapLegend asControl /></>}
          >
            {activeRiver && !accessPlaceholder && visibleAccessPoints && (
              <AccessPointMarkers
                interaction="inspect"
                accessPoints={visibleAccessPoints}
                selectedPutIn={selectedPutIn}
                selectedTakeOut={selectedTakeOut}
                onMarkerClick={inspectAccessPoint}
              />
            )}
            <PlannerAccessLayer places={catalog.places} excludeRiverSlug={activeRiver && !accessPlaceholder && visibleAccessPoints ? activeRiver.slug : undefined} onSelect={handlePlaceSelect} />
            <PlannerMapFocus place={focusPlace} bounds={showAllRivers ? defaultBounds : routeBounds ?? activeRiver?.bounds}
              request={focusRequest} preserveInitialCamera={initialCamera.current}
              panelRef={desktopPanelRef} stripRef={desktopStripRef} />
            {showGauges && allGaugeStations && (
              <GaugeStationMarkers
                gauges={allGaugeStations}
                selectedRiverId={viewRiver?.id}
                nearestGaugeId={nearestGauge?.id}
              />
            )}
            {visibleDesktopPois.length > 0 && (
              <POIMarkers pois={visibleDesktopPois} activeMileRange={activeMileRange} activeRiverId={activeRiver?.id} />
            )}
            {showPhotos && regionalPhotoPins.length > 0 && (
              <RiverPhotoMarkers pins={regionalPhotoPins} />
            )}
            {/* Statewide condition network: every OTHER river in its live
                condition color as context. Click one to switch the
                active river. The selected river is drawn separately below. */}
            {showNetwork && (
              <ConditionNetworkLayer prominent priorityLayerIds={ACCESS_PRIORITY_LAYERS} excludeRiverId={viewRiver?.id} showLabels={showRiverNames} visibleConditions={visibleConditions} onSelectRiver={(slug) => handleRiverChange(slug, 'map')} />
            )}
            {/* The selected river, drawn prominently in its own condition color
                (so it's not the one bare line among colored context rivers). */}
            {viewRiver?.geometry && (
              <ConditionRiverLayer riverId={viewRiver.id} riverName={viewRiver.name} geometry={viewRiver.geometry} showLabel={showRiverNames} />
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
                onlyRiverId={showNetwork ? undefined : viewRiver?.id}
              />
            )}
          </MapContainer>

          {/* Search and details float in a left column pinned to the top of
              the map; the River Report and route stats center over the open
              map to its right (see the overlay column below). */}
          <h1 className="sr-only">{activeRiver ? activeRiver.name : 'Build a Route'}</h1>
          <div ref={desktopPanelRef} className="planner-panel pointer-events-none absolute top-4 bottom-10 left-5 z-30 flex w-[320px] flex-col items-stretch gap-2">
            <div className="pointer-events-auto relative z-40 shrink-0">{desktopSearch}</div>
            {/* No intro card: the search box and the colored river network
                are the call to action. Only surface load/error status. */}
            {!activeRiver && !selectedPlace && riverSlug && <div className="planner-glass rounded-2xl px-4 py-3">
              <p className="text-xs text-neutral-600" role="status">{riverError
                ? 'River details couldn’t load. Choose another river or try again.'
                : 'Loading river details…'}</p>
            </div>}
            {placeCard && <div className="pointer-events-auto min-h-0 shrink overflow-y-auto rounded-2xl">{placeCard}</div>}
            {activeRiver && putInPoint && !selectedPlace && <div className="planner-glass pointer-events-auto flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
          <PlanSidebar
            onClearRoute={() => changeSelection({ selectedPutIn: null, selectedTakeOut: null })}
            riverName={activeRiver.name}
            riverSlug={activeRiver.slug}
            pois={pois}
            conditionCode={isLastValidFallback ? plan?.condition.code ?? 'unknown' : condition?.code ?? 'unknown'}
            plan={plan || null}
            isLoading={planLoading}
            isLastValidFallback={isLastValidFallback}
            lastValidAt={lastValidAt}
            onRetry={() => refetchPlan()}
            putInPoint={putInPoint}
            takeOutPoint={takeOutPoint}
            onClearPutIn={() => changeSelection({ selectedPutIn: null })}
            onClearTakeOut={() => changeSelection({ selectedTakeOut: null })}
            onShare={handleShare}
            onDownloadImage={handleDownloadImage}
            shareStatus={shareStatus}
            selectedVesselTypeId={selectedVesselTypeId}
            onVesselChange={setSelectedVesselTypeId}
            onReportIssue={handleReportAccessPointIssue}
            pointsAlongRoute={pointsAlongRoute}
            captureRef={captureRef}
            showRiverLabel={showAllRivers}
          />
            </div>}

          </div>

          {/* Top-center overlays center over the map area right of the
              340px panel column, so the panel can sit flush at the top. */}
          <div className="pointer-events-none absolute inset-y-0 left-[340px] right-14 z-30">
          {activeRiver && <MapEddySays
            riverSlug={activeRiver.slug}
            conditionCode={condition?.code ?? 'unknown'}
            gaugeHeightFt={isLastValidFallback ? null : plan?.condition?.gaugeHeightFt ?? null}
            onSubmitPhoto={() => setShowVisualSubmitForm(true)}
          />}
          {(putInPoint && takeOutPoint) && (
            <RouteStatsBadge plan={isLastValidFallback ? null : plan ?? null} isLoading={planLoading} className="!top-[4.75rem]" />
          )}
          </div>
          {showStandalonePlanError && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 max-w-[calc(100%-2rem)]">
              <PlanErrorBanner onRetry={() => refetchPlan()} />
            </div>
          )}

          {activeRiver && floatEndpointAccessPoints && floatEndpointAccessPoints.length > 0 && (
            <div ref={desktopStripRef} className="planner-access-strip absolute bottom-0 left-[360px] right-0 bg-gradient-to-t from-white/90 via-white/60 to-transparent pt-6 pb-1 px-2 pointer-events-none">
              <div className="pointer-events-auto">
                <AccessPointStrip
                  accessPoints={floatEndpointAccessPoints}
                  selectedPutInId={selectedPutIn}
                  selectedTakeOutId={selectedTakeOut}
                  onSelect={handleMarkerClick}
                  onHover={handleAccessPointHover}
                  onReportIssue={handleReportAccessPointIssue}
                  hideExpandedDetails={true}
                  riverSlug={activeRiver.slug}
                />
              </div>
            </div>
          )}
        </div>
      </div>
  ) : null;

  // ─── No river selected: show the map with a prominent river picker ───
  if (!riverSlug && isDesktop === false) {
    return (
      <div className={`bg-neutral-100 ${mapExpanded ? 'fixed inset-0 z-50' : 'relative plan-viewport-h'}`}>
        <MapContainer initialBounds={defaultBounds} showLegend={false}
          expanded={mapExpanded} onExpandedChange={setMapExpanded} extraTools={plannerTools}>
          {/* Every river in its live condition color — click one to start
              planning it (no river excluded here since none is selected). */}
          <ConditionNetworkLayer priorityLayerIds={ACCESS_PRIORITY_LAYERS} showLabels={showRiverNames} onSelectRiver={(slug) => handleRiverChange(slug, 'map')} />
          {/* Statewide flow at first sight — the wow frame. */}
          {flowOn && <FlowParticlesLayer />}
        </MapContainer>

        {/* Mobile gets the same search-bar pattern as desktop (rivers only:
            the access-point catalogue stays a desktop-only download). The
            colored network is the invitation, so no intro copy competes. */}
        <h1 className="sr-only">Build a Route</h1>
        {/* right-16 clears the map's tool column (Layers / expand). */}
        <div className="planner-mobile absolute top-3 left-3 right-16 sm:right-auto sm:w-[380px] z-30 flex flex-col items-start gap-2 lg:hidden">
          <div className="w-full">
            <PlannerMapSearch riversOnly rivers={rivers ?? []} places={[]} currentSlug={null}
              conditions={searchConditions} loading={!rivers} failed={false} onRetry={() => {}}
              onRiver={handleRiverChange} onPlace={() => {}} />
          </div>
          {/* The browsing mood belongs to the Observatory — offer it. */}
          <Link
            href="/river-map"
            className="planner-glass rounded-full px-3 py-1.5 text-xs font-semibold text-primary-700"
          >
            See statewide conditions →
          </Link>
        </div>
      </div>
    );
  }

  // ─── River loading/error states ───
  if (isDesktop === false && riverLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isDesktop === false && (riverError || !river)) {
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
      {desktopMap}

      {/* ─── MOBILE: Full-screen map + bottom sheet ─── */}
      {isDesktop !== true && river && riverSlug && (
      <div className={`lg:hidden ${mapExpanded ? 'fixed inset-0 z-50 flex flex-col bg-white' : ''}`}>
        <div className="px-4 py-2 bg-white border-b border-neutral-200 flex items-center justify-between gap-2">
          <MobileRiverSwitcher
            currentName={river.name}
            rivers={rivers || []}
            onChange={handleRiverChange}
            places={localPlaces} conditions={searchConditions} onPlace={handlePlaceSelect}
            loading={accessLoading || accessPlaceholder} failed={accessError} onRetry={() => { void refetchAccess(); }}
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

        <div className={`relative ${mapExpanded ? 'min-h-0 flex-1' : putInPoint && takeOutPoint ? 'plan-map-h--sheet' : 'plan-map-h'}`}>
          <MapContainer
            initialBounds={river.bounds}
            showLegend={false}
            expanded={mapExpanded} onExpandedChange={setMapExpanded}
            controlsTop={putInPoint && takeOutPoint ? 0 : 64}
            extraTools={plannerTools}
            syncCameraToUrl
          >
            {visibleAccessPoints && !accessPlaceholder && (
              <AccessPointMarkers
                interaction="select"
                accessPoints={visibleAccessPoints}
                selectedPutIn={selectedPutIn}
                selectedTakeOut={selectedTakeOut}
                onMarkerClick={handleMarkerClick}
              />
            )}
            <PlannerMapFocus place={focusPlace} bounds={routeBounds ?? river.bounds}
              request={focusRequest} preserveInitialCamera={initialCamera.current} mobile
              panelRef={mobilePreviewRef} stripRef={mobileStripRef} sheetRef={mobileSheetRef}
              sheetReady={!!plan && !!putInPoint && !!takeOutPoint && !selectedPlace} />
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
            {showPhotos && photoPins && photoPins.length > 0 && (
              <RiverPhotoMarkers pins={photoPins} />
            )}
            {/* Statewide condition network: every OTHER river in its live
                condition color as context. Click one to switch the
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
              left-4 button would sit underneath it). Icon-only so the
              centered route stats beside it never collide. */}
          <PlanFilters
            compact
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
            showPhotos={showPhotos}
            onTogglePhotos={togglePhotos}
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
              gaugeHeightFt={isLastValidFallback ? null : plan?.condition?.gaugeHeightFt ?? null}
              onSubmitPhoto={() => setShowVisualSubmitForm(true)}
            />
          )}
          {/* Same row as the Filters button (left-3) — centered stats,
              aligned tops, no overlap on ≥360px viewports. */}
          {(putInPoint && takeOutPoint) && (
            <RouteStatsBadge plan={isLastValidFallback ? null : plan ?? null} isLoading={planLoading} className="!top-[4.25rem]" />
          )}

          {/* Access point picker strip — only while picking. Once both
              endpoints are chosen the bottom sheet carries all the detail and
              the strip would just stack a third band of UI over the map. */}
          {floatEndpointAccessPoints && floatEndpointAccessPoints.length > 0 && !(putInPoint && takeOutPoint) && (
            <div ref={mobileStripRef} className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white/95 via-white/80 to-transparent pt-6 pb-[calc(0.25rem+env(safe-area-inset-bottom))] px-1 pointer-events-none">
              <div className="pointer-events-auto">
                <AccessPointStrip
                  accessPoints={floatEndpointAccessPoints}
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

        {showStandalonePlanError && (
          <div className="px-4 py-3">
            <PlanErrorBanner onRetry={() => refetchPlan()} />
          </div>
        )}

        {placeCard && <div ref={mobilePreviewRef} className="fixed bottom-0 left-0 right-0 z-40 max-h-[55dvh] overflow-y-auto p-3 pb-safe">{placeCard}</div>}
        {putInPoint && takeOutPoint && (
          <div hidden={!!selectedPlace}><FloatPlanCard
            mobileSheetRef={mobileSheetRef}
            plan={plan ?? null}
            isLoading={planLoading}
            isError={planHasError}
            onRetry={() => refetchPlan()}
            isLastValidFallback={isLastValidFallback}
            lastValidAt={lastValidAt}
            putInPoint={putInPoint}
            takeOutPoint={takeOutPoint}
            onClearPutIn={() => changeSelection({ selectedPutIn: null })}
            onClearTakeOut={() => changeSelection({ selectedTakeOut: null })}
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
          /></div>
        )}
      </div>
      )}

      {river && riverSlug && <>
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
          onAddPhoto={() => setShowVisualSubmitForm(true)}
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

      </>}

      <FeedbackModal
        isOpen={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
        context={feedbackContext}
      />

      {river && showVisualSubmitForm && (
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
              accessPoints={visibleAccessPoints}
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

function MobileRiverSwitcher({ currentName, rivers, places, conditions, onChange, onPlace, loading, failed, onRetry }: {
  currentName: string;
  rivers: RiverListItem[];
  places: PlannerMapPlace[];
  conditions: React.ComponentProps<typeof PlannerMapSearch>['conditions'];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onChange: (slug: string | null) => void;
  onPlace: (place: PlannerMapPlace) => void;
}) {
  const [open, setOpen] = useState(false);
  const sheetRef = useFocusTrap<HTMLDivElement>(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  return <>
    <button type="button" data-planner-search-trigger onClick={() => setOpen(true)}
      aria-label={`Search rivers and access points, currently ${currentName}`}
      className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left">
      <Search size={18} className="shrink-0 text-primary-700" />
      <span className="truncate text-base font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>{currentName}</span>
    </button>
    {open && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      role="dialog" aria-modal="true" aria-label="Search rivers and access points" onClick={() => setOpen(false)}>
      <div ref={sheetRef} tabIndex={-1} className="w-full max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-white p-3 pb-safe"
        onClick={event => event.stopPropagation()}>
        <PlannerMapSearch rivers={rivers} places={places} currentSlug={null} conditions={conditions}
          loading={loading} failed={failed} onRetry={onRetry} inlineResults
          onRiver={slug => { onChange(slug); setOpen(false); }}
          onPlace={place => { setOpen(false); onPlace(place); }} />
        <button type="button" onClick={() => setOpen(false)} className="mt-2 w-full rounded-xl py-3 text-sm font-semibold text-neutral-600">Cancel</button>
      </div>
    </div>}
  </>;
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
