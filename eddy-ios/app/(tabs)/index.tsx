// eddy-ios/app/(tabs)/index.tsx
// The Map tab: find a place, see the river in its live condition colour, plan
// the float, and take it with you.
//
// ── Search replaced the river chips ─────────────────────────────────────────
// This screen used to open on a horizontal strip of river chips. That works at
// thirteen rivers and stops working at thirty, it can only ever select a RIVER,
// and it spent a permanent band of a small screen on a control most people use
// once per session. A search field costs one line, scales, and can answer the
// three questions people actually arrive with — which river, which gauge, which
// access point. See src/hooks/useEddySearch.ts for why half of it is local.
//
// ── Everything else is layers, and NONE of them wait for a river ───────────
// Access points, campgrounds, gauges, hazards and outfitters are independent
// toggles rather than a single "show detail" switch. Four of them — access
// points, hazards and both gauge tiers — are on when the app opens, because
// "where do I get on", "is there water in it" and "what will hurt me" are the
// questions the map exists to answer, and none of them can be answered by a
// map that is waiting to be told which river you meant. The rest are one tap
// away in the layers sheet; see src/components/MapLayersSheet.tsx for why that
// stopped being a row of chips above the map.
//
// Every one of those sets is statewide. Put-ins and hazards come off the launch
// bundle already on disk (useNetworkPlaces), gauges and services are one flat
// request each, and the national gauge tier loads by viewport. What remains
// river-scoped is only what is genuinely about one river: the live top-up of
// its put-ins and hazards, and the planner.
//
// ── Selecting a river costs nothing now ────────────────────────────────────
// It used to fetch /api/rivers/{slug} — the heaviest response the app makes —
// for a bounding box and a line that was never drawn, and the screen carried a
// whole apparatus for the wait: a "drawn" river distinct from the selected one,
// so the old line stayed up until the new geometry landed, and a pill naming
// the river in flight. The statewide dataset the map already holds carries the
// same geometry at the same resolution, so all of that is gone. Selection is
// now a synchronous change of which line is drawn heavier, which is what makes
// it safe for tapping a put-in to select the river it sits on.
//
// ── Mapbox may be absent ────────────────────────────────────────────────────
// The native module cannot run in Expo Go, so instead of a red screen the tab
// explains itself and the other four tabs keep working — see src/map/runtime.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type {
  FloatPlan,
  Hazard,
  MapAccessPoint,
  NearbyAccessPoint,
  MapGauge,
  MapGaugeLite,
  RiverListItem,
  RiverService,
  SearchResult,
} from '@eddy/types';
// PUBLIC_LAND_OWNERSHIP_NOTE is no longer read here: the caveat moved onto the
// layer definition as `info` and is shown behind the row's ⓘ. See layers.ts.
import { hasCoordinates } from '@eddy/types';
import { boundsForLine, milePosts } from '@eddy/geo';
import {
  formatFloatTimeCeilingCompact,
  formatFloatTimeCompact,
} from '@eddy/conditions/float-time-format';
import { ApiError, fetchRiverAccessPoints, fetchRivers } from '@/api/client';
import { floatableRank } from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import {
  mapAccessPointPin,
  mapCampgroundServicePin,
  mapGaugePin,
  mapHazardPin,
  mapServicePin,
  RiverMap,
  type InitialMapCamera,
  type MapPin,
} from '@/map/RiverMap';
import {
  cameraCommandFor,
  planFramingDecision,
  type MapCameraAction,
  type MapCameraCommand,
} from '@/map/cameraBehavior';
import { placeSymbol } from '@/components/map-sheet/placeSymbol';
import { mapUnavailableReason } from '@/map/runtime';
// `accessOverlapNote` and `LAYER_ROLE` are no longer read here. The resolver
// still computes the representation buckets — they are the invariant its own
// tests assert — but the sheet no longer prints them: "138 drawn as access
// points · 103 as campgrounds" is a data-integrity fact, and a map control is
// not where it belongs. The attributions moved onto the layer definitions.
import {
  activeRoles,
  resolveAccessMarkers,
  SERVICE_MARK_PRIORITY,
  SERVICE_OWNER_LAYER,
} from '@/map/accessLayers';
import { SERVICE_LAYER_KEYS, serviceOnLayer } from '@/map/serviceLayers';
import { type LayerKey } from '@/map/layers';
import { mergeRestoredLayers } from '@/map/layerRows';
import { useViewportGauges, type Viewport } from '@/hooks/useViewportGauges';
import { useNetworkPlaces } from '@/hooks/useNetworkPlaces';
import { useCuratedGauges } from '@/hooks/useCuratedGauges';
import { useDams } from '@/hooks/useDams';
import { useRiverServices } from '@/hooks/useRiverServices';
import { useRiverHazards } from '@/hooks/useRiverHazards';
import { usePublicLands } from '@/hooks/usePublicLands';
import { flowBandColor, flowBandLabel } from '@/theme/flow';
import { flowBandFor, flowMagnitude, flowReadingText } from '@/lib/gaugeFlow';
import { gaugePlaceLabel } from '@/lib/gaugeCondition';
import { formatReading, readingAge } from '@/lib/readingCopy';
import { readRiver } from '@/lib/riverCache';
import { relativeAge } from '@eddy/conditions/dam-schedule-copy';
import { rememberGauge, seedFromMapGauge, seedFromMapGaugeLite } from '@/lib/gaugeSeed';
import { usgsGaugeUrl } from '@/lib/directions';
import { useStarredRivers } from '@/hooks/useStarredRivers';
import { useEddySearch } from '@/hooks/useEddySearch';
import { useFloatPlan } from '@/hooks/useFloatPlan';
import { milesBetween, useLocation } from '@/hooks/useLocation';
import { useStatewideNetwork } from '@/hooks/useStatewideNetwork';
import { gradeGauge, readingIndex, riverBounds } from '@/lib/statewideNetwork';
import { damPins as damPinFacts } from '@/lib/damCatalog';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { asHref } from '@/lib/href';
import { Otter } from '@/components/Otter';
import { SearchBar } from '@/components/SearchBar';
import { SearchResultsList } from '@/components/SearchResultsList';
import {
  MapLayersButton,
  MapLayersSheet,
  isDefaultLayers,
} from '@/components/MapLayersSheet';
import { defaultMapLayers, readMapLayers, writeMapLayers } from '@/lib/mapPreferences';
import { readMapCamera, writeMapCamera, type StoredMapCamera } from '@/lib/mapCamera';
import {
  GaugeFilterBar,
  applyGaugeFilters,
  type GaugeFilterKey,
} from '@/components/GaugeFilterBar';
import { LayerZoomHint } from '@/components/LayerZoomHint';
import { PlanSheet } from '@/components/PlanSheet';
import { PinSheet } from '@/components/map-sheet/PinSheet';
import { RiverSheetPanel } from '@/components/map-sheet/RiverSheetPanel';
import type { SheetMetrics } from '@/components/map-sheet/MapSheet';
import { ORNAMENT_BAND } from '@/components/map-sheet/sheetGeometry';

/**
 * How far above the ornament band everything floating has to sit.
 *
 * The Mapbox wordmark and the (i) attribution button live down there, and they
 * are a legal obligation rather than decoration — the terms require them visible
 * and forbid hiding them. ORNAMENT_BAND is where that number is derived; this
 * name is kept because it is what the styles below read as.
 *
 * ── It clears the ornaments; it never cleared the SHEET ───────────────────
 * An earlier version of this comment claimed lifting the floating controls
 * fixed the exposure. It did not, and could not: the thing covering the
 * ornaments is the sheet, which is full-width, opaque and 115pt tall at its
 * shortest, so selecting any pin hid both outright however high the buttons
 * sat. What fixes it is the ornaments RIDING the sheet — `ornamentBottomInset`
 * on RiverMap — and this offset is then measured from the sheet's top edge
 * rather than the map's, so the whole bottom stack keeps its arrangement
 * wherever the sheet has settled.
 */
const MAP_CHROME_BOTTOM = ORNAMENT_BAND;

/**
 * The plan cluster's own floor, which is NOT the ornament band.
 *
 * It sits in the bottom-right corner and the ornaments run along the bottom
 * LEFT, ending around x=149, so it has nothing down there to clear. Named
 * because the sheet-open override has to lift it by the same amount it uses at
 * rest — the point of riding the sheet is that the arrangement does not change.
 */
const PLAN_CLUSTER_BOTTOM = 16;

/**
 * How much map has to be left above the sheet for the floating controls to be
 * worth showing: their own floor, the 44pt button, and a gap above it.
 *
 * They fade out over the 60pt above this rather than vanishing at it, so the
 * last part of a drag to the tallest detent takes them out smoothly instead of
 * blinking them off on settle.
 */
const CONTROLS_ROOM_MIN = MAP_CHROME_BOTTOM + 44 + 12;
const CONTROLS_ROOM_FADE = 60;

/**
 * The one array `services ?? …` may fall back to.
 *
 * Module-scope so its identity never changes: a fresh `[]` at the call site is
 * a new array every render, and `services` is null from cold open until the
 * statewide fetch succeeds — for the whole session when it fails. That one
 * unstable prop invalidated RiverMap's `accessFamily` memo and everything
 * downstream of it (every pin memo, every shape memo, the resolver over ~300
 * points), re-uploading structurally identical FeatureCollections on every
 * keystroke of a search — precisely the per-render churn RiverMap's own
 * comments document having engineered away.
 */
const NO_SERVICES: RiverService[] = [];

/**
 * A per-river layer's data, tagged with the river it was fetched for.
 *
 * Necessary because river geometry and layer data arrive independently, and the
 * layers sheet publishes COUNTS off this. An untagged list would let the sheet
 * report "3 hazards" for a river whose hazards have not been fetched, which is
 * the one thing a count must never do. Pins themselves are absolute
 * coordinates, so a brief mismatch cannot draw anything in the wrong place — it
 * just draws off screen — and the map therefore uses whatever it has.
 */
interface RiverScoped<T> {
  slug: string;
  items: T[];
}

/**
 * The plan button's label, sized for a button that sits on top of the map.
 *
 * `distance.formatted` and `floatTime.formatted` are both written for a card
 * with a whole line to spend ("8.3 miles", "~2 hours 30 minutes – ~4 hours").
 * Concatenated they wrapped this button to two lines and covered a band of
 * river. Abbreviated units and the ceiling instead of the range say the same
 * thing in a third of the space; PlanResult still carries the long form.
 */
function planButtonLabel(plan: FloatPlan): string {
  const miles = `${Math.round(plan.distance.miles * 10) / 10} mi`;
  if (!plan.floatTime) return miles;
  // No range means a float short enough that both ends round together — the
  // ceiling and the estimate are the same number, so print it plainly.
  const time = plan.floatTime.timeRange
    ? formatFloatTimeCeilingCompact(plan.floatTime.timeRange.max)
    : `~${formatFloatTimeCompact(plan.floatTime.minutes)}`;
  return `${miles} · ${time}`;
}

/**
 * The canonical presentation object for a NATIONAL-tier gauge.
 *
 * Module scope, like RiverMap's own builders, because two callers need the
 * identical pin: the layer's own memo, and a search result that has to open
 * the exact callout a tap would. The layer memo used to inline this.
 */
function referenceGaugePin(g: MapGaugeLite): MapPin {
  const band = flowBandFor(g);
  const usgs = usgsGaugeUrl(g.siteId);
  return {
    id: `refgauge:${g.id}`,
    name: g.name,
    // The place, for the label under the dot. A national station name is
    // a sentence, and the map has room for a town.
    label: gaugePlaceLabel(g.name),
    layer: 'allGauges' as LayerKey,
    subtitle: `USGS ${g.siteId} — not Eddy-rated`,
    coordinates: g.coordinates,
    color: flowBandColor(band),
    // No `code`: that field drives a CONDITION-tinted chip in the
    // callout, and this gauge has no condition. codeLabel carries the
    // band's words instead, which is a comparison, not a verdict.
    codeLabel: flowBandLabel(band),
    value: flowReadingText(g),
    magnitude: flowMagnitude(g),
    siteId: g.siteId,
    // WHEN THIS WAS MEASURED. The one thing this tier never said.
    //
    // Curated stations are polled continuously; everything else is
    // refreshed by an hourly national pass, and a station that reports
    // seasonally can be days old without anything on screen admitting it.
    // A bare number invites you to read it as "now".
    updatedAt: readingAge(g.readingAgeHours),
    // STILL OFFERED, and no longer the only destination. The gauge screen
    // below draws this station's own hydrograph, which is what people
    // came for; USGS remains the source of record and the place the rest
    // of the station's history lives, so the callout keeps the link.
    link: usgs ? { label: 'Open on USGS', url: usgs } : null,
  };
}

/**
 * The pin a gauge SEARCH RESULT opens, or null when one cannot be built.
 *
 * Choosing a gauge used to move the camera and stop — the reader then had to
 * find and tap the pin they had just named, which for an access point the same
 * field already did on their behalf. Both tiers go through the canonical
 * builders, so a searched gauge and a tapped one open identical callouts.
 *
 * Null is a real answer, not an error: a curated station whose statewide list
 * has not landed yet, or a national row from an older backend without
 * coordinates or a site id. The caller then degrades to exactly the old
 * behaviour — camera and layer, no callout.
 */
function gaugeResultPin(result: SearchResult, gauges: MapGauge[] | null): MapPin | null {
  if (result.gauge?.curated === false) {
    if (!result.coordinates || !result.siteId) return null;
    return referenceGaugePin({
      id: result.id,
      siteId: result.siteId,
      name: result.name,
      coordinates: result.coordinates,
      dischargeCfs: result.gauge.dischargeCfs,
      gaugeHeightFt: result.gauge.gaugeHeightFt,
      readingTimestamp: result.gauge.readingTimestamp,
      readingAgeHours: result.gauge.readingAgeHours,
      // The search row does not carry qualifier codes; an unflagged reading is
      // the same assumption the row itself made when it printed the number.
      readingSuspect: false,
      curated: false,
      flowPercentile: result.gauge.flowPercentile,
    });
  }
  // Curated: the full MapGauge — thresholds, condition, qualifier — is already
  // in memory (ensureGauges fires on search focus), and it is the only shape
  // the condition ladder can be graded from. A result is never graded from its
  // own thinner fields: half a ladder is a wrong verdict, not a fallback.
  const known = (gauges ?? []).find((g) => g.id === result.id);
  return known && hasCoordinates(known) ? mapGaugePin(known) : null;
}

/**
 * The pin a service SEARCH RESULT opens, and the layer that owns it.
 *
 * Owner is decided from what the row IS — every mark it holds, by the same
 * SERVICE_MARK_PRIORITY the resolver uses — rather than from which layers are
 * currently on, because the caller is about to switch the owning layer on
 * anyway. Two knowing simplifications against the resolver, both stated:
 * absorption into an access point is not consulted (a searched row opens its
 * own record even where the map draws the composed place), and the cue line
 * names every mark the row holds rather than only the live ones — for a
 * callout somebody asked for by name, more is honest.
 */
function serviceResultPin(s: RiverService): { pin: MapPin; layer: LayerKey } | null {
  const held = SERVICE_MARK_PRIORITY.filter((owner) =>
    serviceOnLayer(s, SERVICE_OWNER_LAYER[owner]),
  );
  const owner = held[0];
  if (!owner) return null;
  const layers = new Set(held);
  if (owner === 'campground') {
    return { pin: mapCampgroundServicePin({ service: s, layers }), layer: 'campgrounds' };
  }
  const layer = owner === 'rentals' ? ('outfitters' as const) : ('lodging' as const);
  return { pin: mapServicePin({ service: s, owner, layers }, layer), layer };
}

export default function MapScreen() {
  const [isFocused, setIsFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );
  const [rivers, setRivers] = useState<RiverListItem[] | null>(null);
  const [pickedSlug, setPickedSlug] = useState<string | null>(null);
  // A tab page is exactly as wide as the sheet, which is full-bleed over the
  // map. Read from the window rather than measured so it survives a rotation
  // without a layout round-trip.
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [accessPoints, setAccessPoints] = useState<MapAccessPoint[]>([]);
  // Planner data is tagged separately from what the map is drawing. The map
  // deliberately keeps the previous river visible during a switch; the planner
  // must never pair that river's access points with the newly selected river.
  const [plannerAccess, setPlannerAccess] = useState<RiverScoped<MapAccessPoint> | null>(null);
  // The hazard, dam, service and gauge DATA all live in their own hooks now —
  // see the "Layer data, fetched on demand" section below, and each hook's
  // header for the fetch posture it carries (all four moved verbatim).
  /**
   * The river list's own failure. Retried and retracted by the list.
   *
   * It used to share this slot with a download failure, which is how clearing
   * one cleared the other; the offline download is gone and this is the only
   * message left, so the slot is single again.
   */
  const [riversError, setRiversError] = useState<string | null>(null);

  // Copied, not aliased: DEFAULT_LAYERS is a module constant and nothing should
  // be one `push` away from redefining what the app opens with. Replaced by
  // whatever this device last chose, once that comes back off disk — see below.
  const [layers, setLayers] = useState<LayerKey[]>(defaultMapLayers);
  const [layersOpen, setLayersOpen] = useState(false);

  /**
   * Restore the layer set this phone was last using.
   *
   * ── Why the flag, which looks redundant and is not ───────────────────────
   *
   * Restoring is asynchronous and toggling is not, so a tap that lands in the
   * ~50ms before AsyncStorage answers would be overwritten by the answer —
   * rare, unreproducible on demand, and it looks exactly like the bug this
   * whole change exists to fix. `restored` closes that window: once a real
   * choice has been made or the read has landed, the read cannot apply again.
   *
   * Defaults stay on screen for that window rather than a spinner. The map is
   * the slowest screen in the app to become useful and it must not also wait
   * on a key-value read to draw anything.
   */
  const layersRestored = useRef(false);
  /**
   * Layers this SESSION switched on as a side effect — a search result, a
   * "View on map" deep link — as against a choice made in the sheet.
   *
   * Kept so the restore below can lay them over the stored set instead of
   * stripping them: the deep link runs in the first effect flush, inside the
   * restore window, and a stored set with that layer off used to win — the
   * camera flew to a put-in whose pin then never drew. Never persisted by
   * itself; see mergeRestoredLayers.
   */
  const sessionLayerEnables = useRef<Set<LayerKey>>(new Set());
  useEffect(() => {
    let cancelled = false;
    void readMapLayers().then((stored) => {
      if (cancelled || layersRestored.current) return;
      layersRestored.current = true;
      // Null means this device has never chosen. An EMPTY ARRAY is a choice —
      // somebody switched everything off — and is restored as one.
      if (stored) setLayers(mergeRestoredLayers(stored, sessionLayerEnables.current));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Switch a layer on because something else needs it visible — never off.
   *
   * The one way a search result or deep link may touch the layer set. Records
   * the enable so a restore landing later cannot strip it (see
   * sessionLayerEnables), and deliberately does NOT persist: asking to see a
   * gauge is not a settings choice about gauges.
   */
  const enableLayer = useCallback((key: LayerKey) => {
    sessionLayerEnables.current.add(key);
    setLayers((prev) => (prev.includes(key) ? prev : [...prev, key]));
  }, []);
  // THERE IS NO CONDITION FILTER HERE ANY MORE, and the removal was the point
  // rather than a casualty of one. A filter narrows a set you are reading; the
  // network is not a list, it is a picture, and its colours already answer the
  // question the chips asked. What the strip actually cost was the top ~100pt
  // of the one screen that wants every pixel, plus a mode in which two thirds
  // of the state sat at 0.16 opacity and read as broken rather than filtered.
  //
  // If it comes back, it belongs in the layers sheet with the other switches —
  // not as a band above the map.
  //
  // Which gauge traits/bands the national layer is narrowed to. Empty = all.
  // Not persisted, for the same reason the condition filter is not: a filter
  // restored from last week reads as gauges having gone missing.
  const [gaugeFilter, setGaugeFilter] = useState<ReadonlySet<GaugeFilterKey>>(() => new Set());
  /**
   * A filter must not outlive the layer it narrows.
   *
   * The chips only render while the layer is on, so a filter left behind by
   * switching the layer off would survive invisibly and re-apply — gauges
   * quietly missing — when the layer next comes on. Declarative rather than
   * cleared inside the toggle handler, so every off-path is covered at once:
   * the row's own on→off (which clears each tier key), Reset, and a restore
   * that strips the layer. The functional no-op guard keeps an already-empty
   * set's identity, so this never loops.
   */
  useEffect(() => {
    if (!layers.includes('allGauges')) {
      setGaugeFilter((prev) => (prev.size ? new Set() : prev));
    }
  }, [layers]);
  const cameraCommandId = useRef(0);
  const [cameraCommand, setCameraCommand] = useState<MapCameraCommand | null>(null);
  /**
   * A `fitRiver` that could not be issued yet, because the line it frames had
   * not arrived. Held until the geometry lands — see the effect below
   * `selectRiver`, which is the half of that intent this ref exists to keep.
   *
   * The gesture count is carried with it so a fit that arrives late can tell
   * whether the reader took the camera in the meantime; see `gestureCount`.
   */
  const pendingRiverFit = useRef<{ slug: string; gestures: number } | null>(null);
  /**
   * How many times the reader has moved the map themselves.
   *
   * Not `hasGestured`, which is latched for the life of the session and would
   * mean that anyone who had ever panned never got a river framed again. What a
   * deferred fit has to ask is narrower — "since I promised this, has the reader
   * positioned the map themselves?" — and a count answers exactly that.
   */
  const gestureCount = useRef(0);
  /** Issues a navigation request, and returns its id so a caller can cancel it. */
  const issueCameraCommand = useCallback((action: MapCameraAction): number | null => {
    cameraCommandId.current += 1;
    const command = cameraCommandFor(action, cameraCommandId.current);
    if (!command) return null;
    setCameraCommand(command);
    return command.id;
  }, []);

  // Stable, for the same reason NO_SERVICES is module-scope: an inline arrow
  // on the RiverMap element is a fresh prop identity per render of a screen
  // that renders per keystroke.
  const onZoomToCluster = useCallback(
    (point: { lng: number; lat: number }) =>
      void issueCameraCommand({ type: 'clusterSelected', lng: point.lng, lat: point.lat }),
    [issueCameraCommand],
  );
  // The camera, as of the last time it stopped moving. Only the national gauge
  // layer reads it — everything else on this screen loads a bounded set up front.
  const [viewport, setViewport] = useState<Viewport | null>(null);
  /**
   * The camera the LAST session settled on, once the read answers.
   *
   * Read on mount, kept as state so `initialCamera` below can prefer it. Only
   * ever set to a non-null camera: a null answer changes nothing, and setting
   * it after the map has latched its defaultSettings changes nothing either —
   * that race is accepted and stated at `initialCamera`.
   */
  const [storedCamera, setStoredCamera] = useState<StoredMapCamera | null>(null);
  useEffect(() => {
    let live = true;
    void readMapCamera().then((camera) => {
      if (live && camera) setStoredCamera(camera);
    });
    return () => {
      live = false;
    };
  }, []);
  /**
   * The camera settled: publish the viewport, and remember where.
   *
   * The write is fire-and-forget on every idle — idle fires once per settled
   * motion, so this is a handful of tiny writes per session, and a map that
   * draws correctly and forgets is the smaller failure (see mapCamera.ts).
   */
  const onViewportChange = useCallback(
    (next: { bounds: Viewport['bounds']; zoom: number; center?: [number, number] }) => {
      setViewport({ bounds: next.bounds, zoom: next.zoom });
      if (next.center) {
        void writeMapCamera({ lng: next.center[0], lat: next.center[1], zoom: next.zoom });
      }
    },
    [],
  );
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);
  /**
   * Whether dismissing this pin will reveal a river sheet the reader was just
   * looking at — which is what earns the Back control.
   *
   * ── Why this is not `Boolean(riverSheetData)` ────────────────────────────
   *
   * Because a river being selected does not mean the reader ever saw its sheet.
   * `onSelectPin` SELECTS THE RIVER as a side effect when the pin sits on one
   * nobody had chosen, so tapping a put-in from the statewide map leaves exactly
   * the same state behind as tapping one while its river's sheet was open.
   * Offering "‹ Jacks Fork" in the first case names a place the reader has never
   * been.
   *
   * ── Why it is not a three-way source either ──────────────────────────────
   *
   * It was, briefly: 'map' | 'river-sheet' | 'search'. That distinction earned
   * its keep only while × cleared the whole selection stack and the two cases
   * therefore ended differently. Now that × pops one level, HOW the pin was
   * selected stops mattering and only WHAT IS UNDERNEATH does — and a map tap
   * onto an already-selected river genuinely does replace a river sheet that was
   * on screen (`riverSheetData && !selectedPin` is what renders it). So the
   * three-way record collapsed to the one fact that decides anything.
   */
  const [revealsRiverSheet, setRevealsRiverSheet] = useState(false);
  // Search results arrive before the selected river's access-point response.
  // Keep the identity across that fetch so choosing a result can finish by
  // opening its callout rather than merely dropping the camera nearby.
  const pendingAccessSelection = useRef<{
    id: string;
    riverSlug: string;
    /**
     * The layer the pin was TAPPED on, carried across the fetch.
     *
     * Without it this path rebuilt the selection as a generic `access` pin and
     * threw away which icon the finger had landed on. The symptom was specific
     * and looked like a loading bug: tap a campground on a river not yet
     * selected, watch its calendar appear, and half a second later watch the
     * calendar vanish and a gauge reading take its place — because the sheet
     * had quietly become a put-in. Tapping the same pin again looked fine,
     * since by then the river was already selected and this path never ran.
     */
    layer: LayerKey;
  } | null>(null);
  /**
   * A pin set in the same breath as a river selection, and complete already.
   *
   * `pendingAccessSelection` carries a pin that must be REBUILT when the
   * river's access points land, and the selection effect spares the open
   * callout only for it. A gauge or hazard picked from search needs the other
   * half of that bargain and none of the machinery: its pin is built whole
   * from data already in memory, so all it needs is to not be cleared by the
   * river change its own tap caused. One-shot: consumed by the selection
   * effect, and disposed at the top of selectRiver so a stale token can never
   * spare a pin across some later, unrelated navigation.
   */
  const pinSurvivesSelection = useRef<string | null>(null);
  const [planOpen, setPlanOpen] = useState(false);

  const network = useStatewideNetwork();
  // Every river's put-ins and hazards, off the launch bundle already on disk.
  // This is what lets the opening map answer "where do I get on" and "what is
  // dangerous here" before a river is picked.
  const networkPlaces = useNetworkPlaces();
  const { isStarred, toggleStar } = useStarredRivers();
  const unavailable = mapUnavailableReason();
  const { colors, floating } = useTheme();
  const location = useLocation();
  /**
   * Has the user asked to be located ON THIS SCREEN, this session?
   *
   * ── The second permission prompt this removes ─────────────────────────────
   *
   * The puck used to mount on `location.status === 'ready'` alone. That reads
   * as the obvious condition and it is the wrong one, because 'ready' is
   * reachable without anybody touching this screen: useLocation's mount effect
   * calls getForegroundPermissionsAsync — the getter, which never prompts —
   * and if a grant is already held and a fix is under five minutes old, it goes
   * straight to 'ready'.
   *
   * Which is exactly the state somebody is in one tab-tap after granting
   * location during onboarding. So opening Map mounted <Mapbox.UserLocation>
   * with no interaction at all, and the puck is not ours: @rnmapbox/maps runs
   * its own native CLLocationManager. useLocation's header already names this
   * as the hazard — "the Mapbox user-location puck (which would itself prompt)
   * must never be mounted off [a remembered position]" — and the rule was
   * simply never applied to the live case as well.
   *
   * The app itself has never prompted twice: there are two request sites, the
   * onboarding chip and the locate button, and both are explicit taps. This
   * closes the third one, which we do not own and cannot see.
   *
   * NOT PERSISTED, deliberately. It is a statement about this visit to this
   * screen, not a setting. Somebody who tapped locate on Tuesday has not asked
   * to be tracked on Thursday, and the button is right there.
   */
  const [locateAsked, setLocateAsked] = useState(false);
  const router = useRouter();

  /**
   * The river list, with a retry — and a message that takes itself back down.
   *
   * ── The state this fixes ──────────────────────────────────────────────────
   *
   * This request is fired once, on mount. Open the app somewhere with no signal
   * and it fails, which puts a red line under the map. The map itself keeps
   * working — the network, the put-ins and the hazards are all on disk — so
   * what the line describes is one failed request rather than a broken screen.
   *
   * Then the signal comes back, and the line stays. Nothing on this screen ever
   * cleared it. It used to be cleared as a SIDE EFFECT of selecting a river,
   * which was wrong in the other direction — a successful geometry fetch says
   * nothing about whether the river list is working — and that fetch is gone
   * anyway.
   *
   * So: clear it when the thing it is about succeeds, and try again when the
   * tab comes forward, which is the moment somebody is looking at the message
   * and wondering why it is still there.
   */
  // A promise chain rather than an async function, so both writes are plainly
  // inside a callback. An `await` in the body reads to react-hooks as a
  // setState in the effect that calls it, and this is not one — the response
  // has to come back first.
  const loadRivers = useCallback(
    (signal?: AbortSignal) =>
      fetchRivers(signal)
        .then((loaded) => {
          setRivers(loaded);
          // The line means "this is not working RIGHT NOW", which it can only
          // mean if success takes it down.
          setRiversError(null);
        })
        .catch((err: unknown) => {
          if (err instanceof ApiError && err.message === 'Request cancelled') return;
          setRiversError(
            err instanceof ApiError
              ? err.message
              : 'Couldn’t load rivers. Eddy retries when you reopen this tab.',
          );
        }),
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadRivers(controller.signal);
    return () => controller.abort();
  }, [loadRivers]);

  /**
   * Retry on focus, and ONLY while it is still broken.
   *
   * Gated on the error rather than on `rivers === null`, which is also true for
   * the moment before the first response lands — and the first focus happens
   * inside that moment, so an unguarded retry would double every cold start's
   * request. An error showing means the mount fetch has already settled, badly.
   */
  useFocusEffect(
    useCallback(() => {
      if (!riversError) return;
      const controller = new AbortController();
      void loadRivers(controller.signal);
      return () => controller.abort();
    }, [riversError, loadRivers]),
  );

  // Ordered the way someone actually chooses: their starred rivers first, then
  // floatable-first within the rest. floatableRank uses WEEKEND_SEVERITY, the
  // "where should I go" ordering rather than the alert-severity one.
  //
  // This no longer decides which river the map opens on — nothing does, the map
  // opens on the network — so it is now only a lookup order.
  const ordered = useMemo(() => {
    if (!rivers) return [];
    return [...rivers].sort((a, b) => {
      const starDiff = Number(isStarred('river', b.id)) - Number(isStarred('river', a.id));
      if (starDiff !== 0) return starDiff;
      const rankDiff =
        floatableRank(a.currentCondition?.code ?? 'unknown') -
        floatableRank(b.currentCondition?.code ?? 'unknown');
      if (rankDiff !== 0) return rankDiff;
      return a.name.localeCompare(b.name);
    });
  }, [rivers, isStarred]);

  // The selection is DERIVED, not stored: "nothing picked yet" means the first
  // river in the current ordering, computed during render. It used to be an
  // effect that wrote the default into state, which meant the first paint had
  // no selection and the second did — a visible flash of the empty map, and one
  // React flags outright (react-hooks/set-state-in-effect).
  // NULL until someone picks one. This used to fall back to `ordered[0]`,
  // which meant the map opened on whichever river won the sort — and with
  // nothing starred and several rivers sharing the top condition band, the
  // tiebreak is alphabetical, so it always opened on Big River. Nobody chose
  // that. The map now opens on the whole network instead and waits to be asked.
  const selectedSlug = pickedSlug;

  const selected = useMemo(
    () => ordered.find((r) => r.slug === selectedSlug) ?? null,
    [ordered, selectedSlug],
  );

  /**
   * ── SELECTING A RIVER NO LONGER FETCHES ITS GEOMETRY ──────────────────────
   *
   * /api/rivers/{slug} is the heaviest response the app makes — a 632-point
   * LineString for the Current River — and this screen used to pull it on every
   * selection to get two things out of it: a bounding box for the camera, and a
   * line it then did not draw. The line is not drawn because the statewide
   * network already carries that river, at the SAME resolution (both are a bare
   * ST_AsGeoJSON over rivers.geom, no simplification on either — see
   * fetchStatewideNetwork), so `detailShape` in RiverMap has been rendering an
   * empty collection for every curated river.
   *
   * It cost little when a selection was a deliberate act. Then access points
   * went statewide and tapping any put-in on the map began selecting its river,
   * which made the app's most expensive request the response to its most casual
   * gesture. Both remaining consumers are served without it: the camera reads
   * the extent out of the network, and the offline download — the one caller
   * that genuinely needs a full river — takes the same line from the same
   * place. See `mapRiver` below.
   *
   * What is still fetched here is the river's ACCESS POINTS, which is a small
   * response and the one that can have changed since the launch bundle.
   */
  useEffect(() => {
    if (!selectedSlug) return;
    const slug = selectedSlug;
    const controller = new AbortController();
    let live = true;
    let liveAccessLanded = false;
    // The callout is dropped with the river it belonged to — EXCEPT when this
    // selection was caused by tapping a put-in on that very river. Clearing it
    // there would blink the callout out and then put back the same one, which
    // reads as the tap having failed and been retried by itself.
    //
    // A survival token is the same exemption for a pin that is already whole —
    // a gauge or hazard chosen from search, whose selection of this river is a
    // side effect of its own opening. Consumed here, once.
    const keepPin =
      pendingAccessSelection.current?.riverSlug === slug ||
      pinSurvivesSelection.current === slug;
    if (pinSurvivesSelection.current === slug) pinSurvivesSelection.current = null;
    if (!keepPin) setSelectedPin(null);

    // The app seeds every river's static data on launch. Read that first so the
    // planner can show put-ins without waiting for a network round trip, then
    // replace it with the live response when it lands.
    const cachedAccess = readRiver(slug).then((stored) => {
      const points = stored?.payload.accessPoints;
      if (live && !liveAccessLanded && points) setPlannerAccess({ slug, items: points });
      return points;
    });

    fetchRiverAccessPoints(slug, controller.signal)
      .then((points) => {
        if (!live) return points;
        liveAccessLanded = true;
        setPlannerAccess({ slug, items: points });
        return points;
      })
      .catch(async (err) => {
        if (err instanceof ApiError && err.message === 'Request cancelled') throw err;
        // The cached copy is the answer offline, and it is usually complete —
        // put-ins change monthly. No error surfaces for the same reason the
        // network's own geometry failure does not: the map is still working.
        const points = (await cachedAccess) ?? [];
        if (live) setPlannerAccess({ slug, items: points });
        return points;
      })
      .then((points) => {
        if (!live || !points) return;
        setAccessPoints(points);
        const pending = pendingAccessSelection.current;
        if (pending?.riverSlug === slug) {
          const point = points.find((candidate) => candidate.id === pending.id);
          // The TAPPED layer, not 'access'. See pendingAccessSelection.layer.
          if (point) setSelectedPin(mapAccessPointPin(point, slug, pending.layer));
          // Found or stale, this request answered it. Never let a missing row
          // reopen unexpectedly when the person returns to the river later.
          pendingAccessSelection.current = null;
        }
      })
      .catch(() => {
        // Only a cancellation reaches here — every other failure was already
        // answered from the cache above.
      });

    return () => {
      live = false;
      controller.abort();
    };
  }, [selectedSlug]);

  /**
   * ── "DRAWN" AND "SELECTED" ARE THE SAME RIVER AGAIN ───────────────────────
   *
   * They were two things because a selection took a network round trip to
   * become visible: the map kept the previous river drawn until the next one's
   * geometry landed, so the line colour, the planner and the offline row all
   * had to follow what was on SCREEN rather than what had been tapped. Every
   * part of that is gone with the fetch — the river's shape is already in
   * memory when it is selected — so `drawnSlug` is now just the selection, and
   * the loading pill it existed to explain has nothing left to say.
   */
  const drawnSlug = selectedSlug;
  const drawn = selected;

  /**
   * The ONLY place the selected river changes, and the only place setPickedSlug
   * is called. Enforced by a test — see app-camera-stop.test.ts.
   *
   * ── Why the intent is required, and why it cannot have a default ───────────
   *
   * Framing used to be derived from state: RiverMap held a bounds chain and any
   * path that changed the selection got a fit for free, whether or not its
   * author had thought about the camera. Moving to one-shot commands made that
   * implicit coverage explicit — and immediately lost two paths that had been
   * relying on it. Selecting a river from search stopped moving the map (river
   * results carry no coordinates, so the branch that issued a command was
   * simply false for them), and picking one in the Plan sheet never issued a
   * command at all.
   *
   * A REQUIRED parameter with no default is what makes that class of omission a
   * type error rather than a silent no-op: a new call site does not compile
   * until its author says what the camera does. `'hold'` is a real answer, and
   * the point is that it has to be given out loud.
   */
  type RiverCameraIntent =
    /** Frame the whole river. The river IS what the reader asked to see. */
    | { camera: 'fitRiver' }
    /** A searched point on it; the river selection is a side effect. */
    | { camera: 'searchResult'; lng: number; lat: number }
    /**
     * A tapped point on it — a pin, or the river line itself. The river
     * selection is a side effect, and the current zoom is kept.
     */
    | { camera: 'pin'; lng: number; lat: number }
    /** Deliberately nothing. Dismissal is not navigation. */
    | { camera: 'hold' };

  const selectRiver = useCallback(
    (slug: string | null, intent: RiverCameraIntent) => {
      setPickedSlug(slug);
      // Whatever this call asks for supersedes a fit still waiting on geometry:
      // the reader has navigated again, and the older river is not owed a frame.
      pendingRiverFit.current = null;
      // And a survival token from an earlier selection is spent or stale
      // either way — the caller that wants THIS selection to spare a pin sets
      // the token after this call returns. Disposing it here, at the single
      // place a selection changes, is what keeps it one-shot.
      pinSurvivesSelection.current = null;
      switch (intent.camera) {
        case 'fitRiver': {
          // Clearing a selection has no river to frame; `hold` is the honest
          // intent there, and this guard only catches the accidental pairing.
          if (!slug) return;
          const river = network.bySlug.get(slug);
          const bounds = river ? riverBounds(river) : null;
          if (bounds) {
            issueCameraCommand({ type: 'riverSelected', bounds });
            return;
          }
          // ── THE FIT IS DEFERRED, NOT DROPPED ──────────────────────────────
          //
          // `bySlug` is built from the statewide collection, which hydrates
          // from disk and then the network — so on a cold launch this lookup
          // MISSES for the first few frames. Every other intent carries its own
          // coordinates and is issuable the instant it is asked for; this one
          // alone depends on data, and simply returning here is the silent
          // no-op the required intent was introduced to make impossible.
          //
          // It is not hypothetical: a "View on map" deep link mounts this tab
          // and runs focusOnAccess in the first effect flush, when the access
          // point is not yet held either — so the intent falls to `fitRiver`
          // against an empty `bySlug`, and the reader watches the sheet open
          // over a map still sitting on the other side of the state.
          pendingRiverFit.current = { slug, gestures: gestureCount.current };
          return;
        }
        case 'searchResult':
          issueCameraCommand({
            type: 'searchResultSelected',
            lng: intent.lng,
            lat: intent.lat,
          });
          return;
        case 'pin':
          issueCameraCommand({ type: 'poiSelected', lng: intent.lng, lat: intent.lat });
          return;
        case 'hold':
          return;
      }
    },
    [network.bySlug, issueCameraCommand],
  );

  /**
   * Redeem a fit that was asked for before its river had a line.
   *
   * Runs on every `bySlug` identity change, which is what "the geometry landed"
   * looks like from here — the statewide collection hydrates from disk and then
   * from the network, and either arrival can be the one that makes this lookup
   * answerable.
   *
   * Three things drop the promise rather than keep it, and each is a case where
   * honouring it would be the rude answer:
   *  - the selection has moved on, so the fit belongs to a river the reader has
   *    already left;
   *  - the reader has moved the map themselves since the fit was deferred, and
   *    a frame landing on top of that is the jolt the startup-location effect
   *    below refuses for the same reason;
   *  - the river is genuinely lineless (`riverBounds` is null even with the
   *    record in hand), where there is nothing to frame and never will be.
   */
  useEffect(() => {
    const pending = pendingRiverFit.current;
    if (!pending) return;
    if (pending.slug !== selectedSlug || pending.gestures !== gestureCount.current) {
      pendingRiverFit.current = null;
      return;
    }
    const river = network.bySlug.get(pending.slug);
    if (!river) return; // Still hydrating; ask again on the next arrival.
    pendingRiverFit.current = null;
    const bounds = riverBounds(river);
    if (bounds) issueCameraCommand({ type: 'riverSelected', bounds });
  }, [network.bySlug, selectedSlug, issueCameraCommand]);

  /**
   * The selected river as the map and the offline planner need it.
   *
   * Straight out of the statewide dataset: slug, name, the line, and an extent
   * computed from that line. `bySlug` holds the RAW rivers rather than the
   * split-by-reach collection, because a download walks consecutive points and
   * a river reassembled from its reaches could bridge two of them with one very
   * large box.
   */
  const mapRiver = useMemo(() => {
    if (!selectedSlug) return null;
    const river = network.bySlug.get(selectedSlug);
    const bounds = river ? riverBounds(river) : null;
    // A river with no line has no extent to frame and nothing to download, and
    // both consumers already handle null — the camera falls back to the whole
    // network, and the offline row says the map data has not arrived.
    if (!river?.geometry || !bounds) return null;
    return { slug: river.slug, name: river.name, geometry: river.geometry, bounds };
  }, [network.bySlug, selectedSlug]);

  /**
   * Mile posts along the selected river, or nothing.
   *
   * The one thing on the map that speaks the planner's language: every
   * put-in, hazard and float is quoted in river miles, and the line they are
   * miles ALONG never said so. Computed with the database's own formula
   * (fraction × lengthMiles — see milePosts in @eddy/geo), so a post labelled
   * 12 sits where a put-in at Mile 12.0 sits.
   *
   * `lengthMiles` comes from the river list — the one request on this screen
   * with nothing on disk behind it — so offline the markers are simply absent,
   * which costs a nicety and never a wrong number.
   */
  const riverMilePosts = useMemo(() => {
    const coordinates = mapRiver?.geometry?.coordinates;
    const lengthMiles = selected?.lengthMiles;
    if (!coordinates?.length || !lengthMiles) return null;
    return milePosts(coordinates, lengthMiles, 1);
  }, [mapRiver, selected?.lengthMiles]);

  /**
   * Every river's put-ins, with the drawn river's LIVE list laid over the top.
   *
   * The cached half comes off disk and is a monthly-ish snapshot; the live half
   * is this session's response for the river currently selected. Where both
   * hold a point, the live one wins — it is the only one of the two that can
   * reflect a landing added or closed this week.
   *
   * Keyed by id rather than concatenated, or every point on the selected river
   * would be drawn twice: two pins at one coordinate, overlapping 44pt hitboxes
   * and an arbitrary winner on tap.
   */
  const drawnAccessPoints = useMemo(() => {
    const byId = new Map<string, { point: MapAccessPoint; riverSlug?: string | null }>();
    for (const entry of networkPlaces.accessPoints) byId.set(entry.point.id, entry);
    for (const point of accessPoints) {
      // ── THE POINT'S OWN RIVER BEATS WHICHEVER ONE IS DRAWN ───────────────
      //
      // This used to write `riverSlug: drawnSlug` unconditionally, and the
      // river-scoped `accessPoints` list is never cleared — its effect returns
      // early when no river is selected, so it outlives the selection that
      // fetched it. Clear a river and every one of its put-ins was rewritten
      // with `riverSlug: null`, which is what mapAccessPointPin and the
      // campgrounds layer build `detailRoute` from. A null route means the
      // detail request is never made at all, so the sheet sat on
      // "Loading campground details…" for ever, on a place whose data loads
      // perfectly well from the API. Switching rivers was the same bug
      // one step milder: the old river's points briefly wore the new one's slug
      // and requested a route that 404s.
      //
      // The statewide network knows which river each point belongs to and is
      // never wrong about it, so it wins. `drawnSlug` remains the fallback for a
      // put-in the network has not got yet — one added since the last bundle.
      const known = byId.get(point.id)?.riverSlug;
      byId.set(point.id, { point, riverSlug: known ?? drawnSlug });
    }
    return [...byId.values()];
  }, [networkPlaces.accessPoints, accessPoints, drawnSlug]);

  // The selected river's LIVE hazards, over the statewide set below. Fetch
  // posture in the hook's header — a safety surface, so a hazard added since
  // the last bundle does not wait for a relaunch on the river being planned.
  const hazards = useRiverHazards(layers.includes('hazards'), selectedSlug);

  /**
   * Every hazard Eddy has, with the selected river's live list over the top.
   *
   * Same merge as the put-ins above and the same reason for it — but the stakes
   * differ, which is why this one is not gated on a river having been chosen.
   * There are 19 hazards statewide across 11 of 25 rivers; a low-water dam is a
   * reason to pick a different river, and it can only be that if it is visible
   * before the river is picked.
   */
  const drawnHazards = useMemo(() => {
    const byId = new Map<string, Hazard>();
    for (const hazard of networkPlaces.hazards) byId.set(hazard.id, hazard);
    for (const hazard of hazards?.items ?? []) byId.set(hazard.id, hazard);
    return [...byId.values()];
  }, [networkPlaces.hazards, hazards]);

  // ── Layer data, fetched on demand ───────────────────────────────
  // Nothing here is requested until its layer (or another consumer) wants it.
  // The fetch behaviour lives in each hook, moved verbatim from this screen —
  // latch-on-success and one retry for dams, release-on-failure for services,
  // fire-once-and-reuse for gauges — so the screen states only WHO wants WHAT.
  const { gauges, ensureGauges } = useCuratedGauges(layers.includes('gauges'));

  // Every USACE project's LIVE state, statewide — an enrichment, not the
  // layer: the pins ship in the binary (DAM_CATALOG) and draw with no answer
  // at all. See the hook for the cold-CDN retry story.
  const dams = useDams(layers.includes('dams'));

  /**
   * Every service in the state, fetched once when something wants them.
   *
   * ── A SELECTED RIVER WANTS THEM TOO, AND THAT IS NOT A LAYER ───────────
   * The river sheet's Camping & outfitters tab is built from this same
   * directory. Gated on the layers alone, the tab would be missing entirely
   * for a reader who has those three switches off — a tab appearing and
   * disappearing with a map layer is a relationship nobody could guess, and
   * the switches are about PINS. So a river selection asks as well. Still one
   * statewide request per session, still nothing on launch, and still nothing
   * at all for somebody who never taps a river.
   *
   * The layer half is read off the tier table rather than named here: spelled
   * out by hand it once said `campgrounds || outfitters`, written before the
   * lodging tier existed — so a phone restored with only Cabins & lodges on
   * never fetched anything. See SERVICE_LAYER_KEYS.
   */
  const wantsServices =
    SERVICE_LAYER_KEYS.some((key) => layers.includes(key)) || selectedSlug != null;
  const { services, ensureServices } = useRiverServices(wantsServices);

  /**
   * Retry the silent enrichments on focus.
   *
   * The rivers list above retries on focus gated on its error, because it has
   * one to gate on. Gauges and services fail silently by design — so the gate
   * lives in the hooks instead: after a success the ref never releases and
   * these calls are free; after a failure the ref has released and coming back
   * to the tab is the retry the released ref was always waiting for. Without
   * this, "release on failure" promised a retry that no code path ever made.
   */
  useFocusEffect(
    useCallback(() => {
      if (layers.includes('gauges')) ensureGauges();
      if (wantsServices) ensureServices();
    }, [layers, wantsServices, ensureGauges, ensureServices]),
  );

  /**
   * The dam pins.
   *
   * `code`/`codeLabel` carry GENERATING or IDLE, not a condition — the callout
   * tints that chip, and this one must not borrow the condition palette: a dam
   * running its units is a fact about machinery, not a verdict on a river. The
   * colour therefore comes from the layer, which is instrumentation teal.
   *
   * `generating` is NULL for a dam that publishes no turbine flow (Kansas City
   * district publishes nothing to CWMS at all), and null means the chip is
   * omitted rather than shown as "Not generating" — an observation nobody made.
   *
   * Declared BEFORE the search block below, because a dam search result opens
   * one of these pins and a useCallback may not read a memo declared after it.
   */
  const damPins = useMemo<MapPin[]>(() => {
    const live = (dams ?? []).map((dam) => {
      const release = dam.metrics.release;
      return {
        id: dam.id,
        name: dam.name,
        lakeName: dam.lakeName,
        state: dam.state,
        generating: dam.generating,
        value: release
          ? `${Math.round(release.value).toLocaleString()} cfs${release.dailyMean ? ' (daily avg)' : ''}`
          : null,
        updatedAt: release ? relativeAge(release.at) : null,
        riverSlug: dam.tailwater?.riverSlug ?? null,
      };
    });
    // Positions for anything the shipped catalog has never heard of — a project
    // added to the registry since this build left. Everything else is placed
    // from the catalog, which is what lets the layer draw with no answer at all.
    const positions = new Map(
      (dams ?? []).map((dam) => [dam.id, { lng: dam.lon, lat: dam.lat }]),
    );

    return damPinFacts(live, positions).map((facts) => ({
      ...facts,
      layer: 'dams' as LayerKey,
    }));
  }, [dams]);

  // ── Search ──────────────────────────────────────────────────────
  // No `kinds`: this field is unscoped and wants everything. Naming the server
  // kinds would be identical — parseKinds() treats an absent list as every
  // kind — so the omission is the honest spelling of "everything". Dams,
  // hazards and services are matched locally out of what this screen already
  // holds; the server is never asked for them.
  const search = useEddySearch({
    rivers,
    gauges,
    dams: true,
    hazards: drawnHazards,
    services,
  });

  const clearSearch = search.clear;
  const onSelectResult = useCallback((result: SearchResult) => {
    clearSearch();
    setSelectedPin(null);
    if (result.kind === 'access_point' && result.riverSlug) {
      // The whole network's put-ins are on the map now, so this no longer has
      // to wait for the chosen river's response to open a callout — the point
      // is almost always already in hand, whichever river it is on. The pending
      // reference stays for the case it is not: a landing added since the last
      // bundle, on a river this session has not opened.
      const known = drawnAccessPoints.find((entry) => entry.point.id === result.id);
      if (known) {
        // No Back: a result arrives from a query, and it switches the river
        // below it, so whatever sheet was on screen is not what × should reveal.
        setRevealsRiverSheet(false);
        setSelectedPin(mapAccessPointPin(known.point, known.riverSlug ?? result.riverSlug));
      }
      // Set in BOTH cases, and that is load-bearing. Choosing a result switches
      // the river below, and the selection effect drops the open callout on a
      // river change unless this says the callout is the reason for it. Without
      // it the pin we just set would be cleared one render later — which is the
      // shape of the bug the statewide layer would otherwise have introduced
      // into search. When the point was not already held, this is also what
      // opens it once the river's own response lands.
      // 'access', and correctly so: a search result did not come from an icon,
      // so there is no tapped layer to preserve.
      pendingAccessSelection.current = {
        id: result.id,
        riverSlug: result.riverSlug,
        layer: 'access',
      };
    } else {
      pendingAccessSelection.current = null;
    }

    // A gauge or an access point is a POINT, so the camera goes to it rather
    // than refitting the whole river — otherwise choosing "Cedar Grove Access"
    // and watching the map fit ninety miles of Current River is indistinguish-
    // able from nothing happening.
    //
    // COORDINATES ARE THE ONLY REQUIREMENT for that. This used to demand a
    // riverSlug as well, which silently excluded the entire national tier: an
    // uncurated USGS station has no river_gauges row, so its slug is null —
    // while /api/search has returned st_x/st_y for it since 00196. Choosing
    // "Bush Kill at Shoemakers" cleared the field and moved nothing, which is
    // indistinguishable from a broken search box.
    //
    // ── And a RIVER result is the case with no point at all ──────────────────
    //
    // /api/search sets `coordinates: null` on every river row — a river is a
    // line, not a place — so a coordinates-only rule leaves the commonest search
    // in the app doing nothing to the camera. Selecting the river is what that
    // result means, and fitting it is what the reader asked for.
    if (result.riverSlug) {
      selectRiver(
        result.riverSlug,
        result.coordinates
          ? { camera: 'searchResult', lng: result.coordinates.lng, lat: result.coordinates.lat }
          : { camera: 'fitRiver' },
      );
    } else if (result.coordinates) {
      // A national-tier station: a point that belongs to no curated river, so
      // there is no selection to make — only somewhere to go.
      issueCameraCommand({
        type: 'searchResultSelected',
        lng: result.coordinates.lng,
        lat: result.coordinates.lat,
      });
    }

    // Turn on the layer the result lives in, so what was searched for is
    // visible when the map arrives. All are on by default; this covers the
    // person who switched one off earlier in the session and then searched for
    // exactly that kind of thing.
    //
    // WHICH gauge layer depends on the tier. `gauges` is the curated one;
    // layerGauges filters the national layer down to `!curated`, so switching on
    // `gauges` for a reference station flies the camera to a dot that layer will
    // never draw. Unknown tier is treated as curated, which is the safe way
    // round: the curated layer is the smaller set and drawing it costs nothing.
    if (result.kind === 'gauge') {
      const layer: LayerKey = result.gauge?.curated === false ? 'allGauges' : 'gauges';
      enableLayer(layer);
      // ── AND THE CALLOUT OPENS, exactly as an access result's does ────────
      // The camera arriving on an unmarked spot was the access-point bug one
      // layer over: choosing "Van Buren" and then hunting for the dot you
      // named. Set AFTER selectRiver above, which disposes survival tokens at
      // its top — the token below has to outlive this handler, not precede it.
      const pin = gaugeResultPin(result, gauges);
      if (pin) {
        setRevealsRiverSheet(false);
        // The river change this selection caused must not clear the pin it
        // opened. Only when a river was actually selected — a national
        // station belongs to none and nothing will try to clear it.
        if (result.riverSlug) pinSurvivesSelection.current = result.riverSlug;
        setSelectedPin(pin);
      }
    } else if (result.kind === 'access_point') {
      enableLayer('access');
    } else if (result.kind === 'dam') {
      // The catalog is the spine, so this pin exists before /api/dams has ever
      // answered — a searched dam opens with its identity now and its live
      // release figures whenever they land, same as a tapped one.
      enableLayer('dams');
      const pin = damPins.find((p) => p.damId === result.id);
      if (pin) {
        setRevealsRiverSheet(false);
        setSelectedPin(pin);
      }
    } else if (result.kind === 'hazard') {
      enableLayer('hazards');
      const hazard = drawnHazards.find((h) => h.id === result.id);
      if (hazard && hasCoordinates(hazard)) {
        setRevealsRiverSheet(false);
        setSelectedPin(mapHazardPin(hazard));
      }
    } else if (result.kind === 'service') {
      const service = (services ?? []).find((s) => s.id === result.id);
      const opened = service ? serviceResultPin(service) : null;
      if (opened) {
        enableLayer(opened.layer);
        setRevealsRiverSheet(false);
        setSelectedPin(opened.pin);
      }
    }
    // None of the three new kinds carries a riverSlug (see localMatches), so
    // none selects a river and none needs a survival token: the camera block
    // above flew to the point, and nothing will try to clear the pin.
  }, [
    drawnAccessPoints,
    drawnHazards,
    gauges,
    services,
    damPins,
    clearSearch,
    selectRiver,
    issueCameraCommand,
    enableLayer,
  ]);

  /**
   * ── "View on map", arriving from an access point's own screen ────────────
   *
   * That screen pushes `/` with the point's id and river, and this is what makes
   * the map act on it. Deliberately the SAME three steps `onSelectResult` takes
   * for an access-point search result — select the pin if the map already holds
   * it, record a pending selection either way, move the camera to the point —
   * because "put this place on the screen and open its sheet" is one behaviour
   * and two implementations of it would drift.
   *
   * ── CONSUMED ONCE, AND THE PARAMS ARE THEN CLEARED ──────────────────────
   * Route params outlive the navigation that carried them: the tab keeps them
   * for the life of the screen, so without clearing, every later return to the
   * Map tab would re-select a put-in the reader looked at once and has since
   * moved on from — including after they had deliberately closed its sheet.
   * The ref guards the render between the push and the clear landing.
   *
   * ── AND IT WAITS FOR THE POINT ──────────────────────────────────────────
   * `pendingAccessSelection` is the existing mechanism for "select this the
   * moment its river's access points arrive", which is the common case on a
   * cold launch into the map. Setting it in both branches is what makes the
   * deep link work before the network has answered — see the selection effect.
   */
  const focusParams = useLocalSearchParams<{ focusAccess?: string; focusRiver?: string }>();
  const focusAccess = focusParams.focusAccess ?? null;
  const focusRiver = focusParams.focusRiver ?? null;
  const focusConsumed = useRef<string | null>(null);

  // The work, as a callback rather than inline in the effect below. A route
  // param is an external system and reacting to one is what an effect is for,
  // but the state writes belong in a named function — which is also what makes
  // this the same shape as onSelectResult above, the handler it deliberately
  // mirrors.
  const focusOnAccess = useCallback(
    (accessId: string, riverSlug: string) => {
      clearSearch();
      // No Back: the reader arrived from a details screen, not by drilling into
      // this river's sheet, so × has no river sheet to reveal underneath.
      setRevealsRiverSheet(false);

      const known = drawnAccessPoints.find((entry) => entry.point.id === accessId);
      if (known) {
        setSelectedPin(mapAccessPointPin(known.point, known.riverSlug ?? riverSlug));
      }
      // Set in BOTH cases, for the reason onSelectResult documents: the
      // selection effect drops an open callout on a river change unless this
      // says the callout is the reason for it. It is also what opens the sheet
      // when the point is NOT yet held — a cold launch straight into the map.
      pendingAccessSelection.current = { id: accessId, riverSlug, layer: 'access' };

      const coordinates = known?.point.coordinates ?? null;
      selectRiver(
        riverSlug,
        coordinates
          ? { camera: 'searchResult', lng: coordinates.lng, lat: coordinates.lat }
          : { camera: 'fitRiver' },
      );

      // The put-in has to be drawable when the camera lands, for somebody who
      // switched the access layer off earlier in the session.
      enableLayer('access');

      // Clears the params so a later return to this tab does not re-select a
      // place the reader looked at once and has since closed.
      router.setParams({ focusAccess: undefined, focusRiver: undefined });
    },
    [drawnAccessPoints, clearSearch, selectRiver, router, enableLayer],
  );

  useEffect(() => {
    if (!focusAccess || !focusRiver) {
      // ── THE TOKEN IS SPENT WHEN THE PARAMS GO ─────────────────────────────
      //
      // Without this, the ref keeps the LAST place consumed for the life of the
      // screen, and "View on map" on that same put-in a second time matches it
      // and does nothing at all: no selection, no camera, a Map tab that just
      // appears. Asking for the same place twice is not a duplicate render, it
      // is a second request — the reader panned away and wants it back.
      //
      // Clearing here is safe precisely because it is the params, not the ref,
      // that say a request is outstanding. The guard the ref exists for covers
      // the window between focusOnAccess calling setParams and that clear
      // landing, and throughout that window focusAccess is still set, so this
      // branch cannot run inside it.
      focusConsumed.current = null;
      return;
    }
    const token = `${focusRiver}:${focusAccess}`;
    if (focusConsumed.current === token) return;
    focusConsumed.current = token;
    focusOnAccess(focusAccess, focusRiver);
  }, [focusAccess, focusRiver, focusOnAccess]);

  // ── Float plan ──────────────────────────────────────────────────
  const plannerAccessPoints =
    plannerAccess?.slug === selectedSlug ? plannerAccess.items : [];
  // Planning needs a river ID and ordered access points, not the river's heavy
  // full-resolution geometry. RiverListItem already carries that ID, so the
  // planner becomes usable as soon as cached access points arrive.
  const planner = useFloatPlan(selected?.id ?? null, plannerAccessPoints);

  // Memoised for identity: built inline it was a fresh object per render,
  // re-rendering the endpoint markers' shape sources with unchanged contents.
  const planEndpoints = useMemo(
    () =>
      planner.plan ? { putIn: planner.plan.putIn, takeOut: planner.plan.takeOut } : null,
    [planner.plan],
  );

  const plannerDistances = useMemo(() => {
    if (!location.coords) return null;
    const bySlug = new Map<string, number>();
    for (const feature of network.collection.features) {
      const coordinates = feature.geometry.coordinates;
      const stride = Math.max(1, Math.floor(coordinates.length / 30));
      for (let index = 0; index < coordinates.length; index += stride) {
        const coordinate = coordinates[index];
        const miles = milesBetween(location.coords, { lng: coordinate[0], lat: coordinate[1] });
        const current = bySlug.get(feature.properties.slug) ?? Infinity;
        if (miles < current) bySlug.set(feature.properties.slug, miles);
      }
    }
    return bySlug;
  }, [location.coords, network.collection.features]);

  const plannerRivers = useMemo(() => {
    if (!plannerDistances) return ordered;
    return [...ordered].sort((a, b) => {
      const favorite = Number(isStarred('river', b.id)) - Number(isStarred('river', a.id));
      if (favorite !== 0) return favorite;
      const distance =
        (plannerDistances.get(a.slug) ?? Infinity) -
        (plannerDistances.get(b.slug) ?? Infinity);
      if (distance !== 0) return distance;
      return (
        floatableRank(a.currentCondition?.code ?? 'unknown') -
        floatableRank(b.currentCondition?.code ?? 'unknown')
      );
    });
  }, [ordered, plannerDistances, isStarred]);

  /**
   * The access point behind a pin, and which river it is on.
   *
   * Searches the DRAWN set rather than the selected river's response, because
   * the layer now holds every river's put-ins and a tap on one of the other
   * twenty-four would otherwise open a callout with no place behind it — no
   * mile, no photo, no Directions, no "use as put-in".
   */
  const accessPointForPin = useCallback(
    (pin: MapPin | null): { point: MapAccessPoint; riverSlug?: string | null } | null => {
      if (!pin || !pin.id.startsWith('access:')) return null;
      const accessId = pin.id.replace(/^access:/, '');
      return drawnAccessPoints.find((entry) => entry.point.id === accessId) ?? null;
    },
    [drawnAccessPoints],
  );

  /**
   * WHAT each access point on the river is, as the mark that draws it.
   *
   * The detail response names a put-in's neighbours but does not say what they
   * ARE — NearbyAccessPoint carries no types — and this screen already holds
   * every access point with its types. So it is the only place that can answer
   * "is the take-out a boat ramp, a campground or a bare landing" without a
   * request per neighbour.
   *
   * Resolved through `placeSymbol` with a synthetic `access` layer, which is
   * exactly right rather than a shortcut: that layer is the generic one and
   * therefore the one that DEFERS to the point's own types, which is the only
   * signal available here. A neighbour has no pin of its own on this list, so
   * there is no tapped layer to honour.
   *
   * This replaced a Set of campable ids that answered one question and was drawn
   * as an emoji after the name.
   */
  const nearbyAccessMarks = useMemo(
    () =>
      new Map(
        drawnAccessPoints.map((entry) => [
          entry.point.id,
          placeSymbol({ layer: 'access' }, entry.point),
        ]),
      ),
    [drawnAccessPoints],
  );

  /**
   * Build a float between the selected put-in and one of its neighbours.
   *
   * The sheet knows the neighbour as a NearbyAccessPoint, which is the wire
   * shape and carries no coordinates; the planner wants the MapAccessPoint this
   * screen already has. Upstream neighbours are the PUT-IN and the selected
   * point the take-out — floating downhill is not negotiable, and offering the
   * pair the other way round would build a trip nobody can take.
   */
  /**
   * Everything the river sheet renders, assembled from what is already here.
   *
   * No request: the statewide network carries each river's gauges and their
   * ladders, and this screen already holds every access point and hazard it
   * draws. Tapping a river is the cheapest thing you can do on this map and it
   * stays that way.
   */
  const gaugeNameFor = useCallback(
    (siteId: string) => {
      const known = (gauges ?? []).find((g) => g.usgsSiteId === siteId);
      return known ? gaugePlaceLabel(known.name) : `USGS ${siteId}`;
    },
    [gauges],
  );

  const riverSheetData = useMemo(() => {
    if (!selectedSlug) return null;
    const river = network.bySlug.get(selectedSlug);
    if (!river) return null;

    const index = readingIndex(network.readings ?? []);
    const gauges = (river.gauges ?? []).map((gauge) => {
      const reading = index.get(`${river.id}:${gauge.site_id}`) ?? index.get(gauge.site_id) ?? null;
      const unit = gauge.threshold_unit;
      const value =
        unit === 'ft'
          ? reading?.gaugeHeightFt ?? null
          : unit === 'cfs'
            ? reading?.dischargeCfs ?? null
            : null;
      return {
        siteId: gauge.site_id,
        // StatewideRiverGauge carries no name — only a site id. The curated
        // list this screen already holds does, so it is the one asked; a bare
        // "USGS 07064533" is a row about a database.
        name: gaugeNameFor(gauge.site_id),
        // Graded against THIS river's ladder — one physical gauge can be
        // primary for two rivers with different thresholds, and the same
        // number is a different verdict on each.
        code: gradeGauge(river, gauge, index),
        reading: value != null && unit ? formatReading(value, unit) : null,
        isPrimary: gauge.is_primary,
      };
    });

    return {
      slug: river.slug,
      name: river.name,
      region: river.region,
      // ── The river's own verdict ────────────────────────────────────────
      // Curated list first, statewide collection second. This resolution used
      // to live beside the header line drawn above the map — the one with the
      // name, the dot and the chevron — which is gone now that the sheet owns
      // river identity. Same two sources in the same order, so the sheet and
      // the line the finger tapped cannot disagree.
      //
      // NOT derived from `gauges` below: those are graded against this river's
      // ladder per station, and folding them into one verdict here would be a
      // second opinion competing with the one the map is already drawing.
      code:
        selected?.currentCondition?.code ??
        network.collection.features.find((feature) => feature.properties.slug === selectedSlug)
          ?.properties.code ??
        'unknown',
      gauges,
      accesses: drawnAccessPoints
        .filter((entry) => (entry.riverSlug ?? drawnSlug) === selectedSlug)
        .map((entry) => entry.point),
      hazards: drawnHazards.filter((hazard) => hazard.riverId === river.id),
      // ── FROM THE DIRECTORY THIS SCREEN ALREADY HOLDS ──────────────────
      // No request: the services fetch is one statewide call made for the
      // layers, and `riverSlugs` is what lets it be grouped here. A row with no
      // slugs is not on any river tab — see RiverService.riverSlugs for why
      // absent and empty must not be read as "every river".
      //
      // Eligibility and closure are the tab's business (serviceSections), and
      // `mappableService` is deliberately not applied at all: this is a LIST,
      // and most of the directory still has no confirmed coordinate.
      services: (services ?? []).filter((service) =>
        service.riverSlugs?.includes(selectedSlug),
      ),
    };
  }, [
    selectedSlug,
    selected,
    network.bySlug,
    network.readings,
    network.collection,
    drawnAccessPoints,
    drawnHazards,
    drawnSlug,
    gaugeNameFor,
    services,
  ]);

  /**
   * True whenever a sheet covers the bottom of the map.
   *
   * Both sheets are full-width and bottom-anchored, so at every detent they own
   * the band the floating controls live in — including the glance.
   */
  /**
   * How tall the sheet has settled, and at which detent.
   *
   * Committed on SETTLE only — MapSheet never reports mid-drag, because the
   * two things that read this are a native camera prop and a layout offset,
   * and neither wants sixty writes a second.
   */
  const [sheet, setSheet] = useState<{ detent: string; height: number }>({
    detent: 'peek',
    height: 0,
  });
  const onSheetDetentChange = useCallback(
    (detent: string, height: number) => setSheet({ detent, height }),
    [],
  );

  /**
   * Where the sheet is between settles, for the things that should follow a
   * finger rather than wait for it to lift.
   *
   * The controls used to jump: they were positioned from `sheet.height`, which
   * is committed on settle, so through the whole of a drag they sat at the
   * height the sheet USED to be and then teleported. The camera padding and the
   * Mapbox ornaments still read the settled value — those are a native prop and
   * two more native props, and none of them wants sixty writes a second — but a
   * button's transform costs nothing on the UI thread and belongs on it.
   */
  const sheetMetrics = useSharedValue<SheetMetrics>({ height: 0, available: 0 });

  /**
   * Lift by exactly what the sheet occupies, and fade when the map runs out of
   * room to hold them.
   *
   * `bottom` stays where it is and this is a TRANSFORM, which is the same rule
   * the sheet itself follows: `bottom` is layout, and animating layout sixty
   * times a second on the heaviest screen in the app is the thing MapSheet's
   * header explains it was built to avoid.
   *
   * ── ATTACHED UNCONDITIONALLY, and that is the whole fix ─────────────────
   * This used to be applied as `sheetOpen ? controlsStyle : null`, which reads
   * as "only lift them while something is open" and does not behave that way.
   * Reanimated writes an animated style straight onto the native view; DETACHING
   * it does not revert what it already wrote. So closing a sheet flipped
   * `sheetOpen` false, removed the style, and left `translateY(-height)` on the
   * view with nothing left to set it back — Locate and Plan a float stayed up
   * where the sheet had been, for the rest of the session.
   *
   * Kept attached, the worklet does the reverting itself: MapSheet zeroes
   * `metrics` on unmount, so the controls SPRING back to the ornament band
   * instead of being abandoned mid-lift. Costs nothing when no sheet exists —
   * `available <= 0` returns identity on the first line.
   */
  const controlsStyle = useAnimatedStyle(() => {
    const { height, available } = sheetMetrics.value;
    if (available <= 0) return { opacity: 1, transform: [{ translateY: 0 }] };
    const room = available - height;
    return {
      opacity: interpolate(
        room,
        [CONTROLS_ROOM_MIN, CONTROLS_ROOM_MIN + CONTROLS_ROOM_FADE],
        [0, 1],
        Extrapolation.CLAMP,
      ),
      transform: [{ translateY: -height }],
    };
  });

  const sheetOpen = Boolean(
    !search.active && (selectedPin || (riverSheetData && !selectedPin)),
  );

  const onPlanToNearby = useCallback(
    (nearby: NearbyAccessPoint, from: MapAccessPoint) => {
      const other = drawnAccessPoints.find((entry) => entry.point.id === nearby.id)?.point;
      if (!other) return;
      // ONE call, both ends. Calling choosePutIn then chooseTakeOut looks
      // equivalent and is not: the second reads `putIn` from the render that has
      // not been replaced yet, so it either skipped the calculation entirely or
      // ran it against the previous put-in. See planFloat's header.
      const downstream = nearby.direction === 'downstream';
      planner.planFloat(downstream ? from : other, downstream ? other : from);
      setSelectedPin(null);
      setPlanOpen(true);
    },
    [drawnAccessPoints, planner],
  );

  /**
   * Write-through on every change, including the reset.
   *
   * Inside the updater rather than in an effect on `layers`: an effect would
   * also fire for the restore itself, writing back what it had just read, and
   * would race the restore's own guard. Here the only writes are the ones a
   * person caused.
   *
   * Fire and forget — writeMapLayers never rejects, and a map that draws
   * correctly and forgets is a smaller failure than one that stalls on a
   * key-value write. Reset persists too: "put it back how it was" is a choice
   * like any other, and one that did not survive a relaunch would be the same
   * bug from the other direction.
   */
  const commitLayers = useCallback((next: LayerKey[]) => {
    layersRestored.current = true;
    void writeMapLayers(next);
    return next;
  }, []);

  const toggleLayer = useCallback(
    (key: LayerKey) => {
      setLayers((prev) =>
        commitLayers(prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]),
      );
    },
    [commitLayers],
  );

  const resetLayers = useCallback(
    () => setLayers(commitLayers(defaultMapLayers())),
    [commitLayers],
  );

  // /api/gauges is statewide, and the map now draws all of it.
  //
  // This used to be narrowed to a 15-mile buffer around the selected river's
  // bounds, on the reasoning that the map is about one river. But the camera is
  // already fitted to that river, so the narrowing only ever removed pins that
  // were off screen anyway — and it removed them from the one view where they
  // matter most, the zoomed-out one. "Which rivers have water in them right now"
  // is a question the gauge layer can answer at a glance, and it cannot answer it
  // through a filter that hides every gauge but this river's.
  const mappableGauges = useMemo(() => (gauges ?? []).filter(hasCoordinates), [gauges]);

  // ── The national tier ──────────────────────────────────────────────────────
  // Fetched by viewport, not up front, and only while its layer is on. See
  // useViewportGauges for the debounce/containment/quantize chain that keeps a
  // pan from being a request.
  const referenceGauges = useViewportGauges(layers.includes('allGauges'), viewport);

  // ── Public land ────────────────────────────────────────────────────────────
  // Same arrangement, same reasons: viewport-scoped, only while its layer is on.
  // The geometry is what costs here rather than the row count, so the hook keys
  // its cache on the zoom as well as the box — see usePublicLands.
  const publicLands = usePublicLands(layers.includes('publicLand'), viewport);

  /**
   * What the "Other USGS gauges" layer actually holds.
   *
   * Curated gauges are dropped here rather than drawn twice: /api/gauges/map
   * returns them too (they are gauges in the viewport), but the curated layer
   * already paints them in their condition colour, and a second dot underneath
   * in a flow-band colour would be the same station wearing two different
   * verdicts a pixel apart.
   *
   * COMPUTED ONCE, AT THE TOP, and everything downstream reads from it — the
   * filter, the counts, the pins. It used to happen last, after the chips had
   * already narrowed the raw response, which made the drop silently intersect
   * with the filter: selecting "Eddy-rated" asked for exactly the gauges the
   * next line removed, so the map drew nothing while the strip said "Showing
   * 12 gauges" and the layers sheet said 0. Three surfaces, three answers, one
   * ordering mistake. Narrowing a set the layer will never draw is not a filter
   * anyone can reason about, so the set comes first now.
   */
  const layerGauges = useMemo(
    () => referenceGauges.gauges.filter((g) => !g.curated && hasCoordinates(g)),
    [referenceGauges.gauges],
  );

  /**
   * That set, narrowed by the chips.
   *
   * Applied BEFORE pins are built rather than as a Mapbox opacity expression,
   * which is where this deliberately differs from the condition filter. That
   * one dims because hiding a river takes its tap target with it and a map that
   * empties reads as broken. Here the layer is thousands of interchangeable
   * dots with no selection riding on them, the strip states the count it is
   * showing, and dimming ~1,200 circles to 0.16 leaves a grey haze that is
   * harder to read than an honest empty patch.
   */
  const visibleReferenceGauges = useMemo(
    () => applyGaugeFilters(layerGauges, gaugeFilter),
    [layerGauges, gaugeFilter],
  );

  const referencePins = useMemo<MapPin[]>(
    () => visibleReferenceGauges.map(referenceGaugePin),
    [visibleReferenceGauges],
  );

  /**
   * The access family, resolved for the sheet's numbers and its overlap notes.
   *
   * ── THE SAME PURE FUNCTION THE MAP CALLS, not a second copy of the rule ──
   *
   * This is where the drift used to live: `layerCounts` re-derived the access
   * and campground populations with its own filters while RiverMap derived them
   * with its own, and the two agreed only for as long as somebody kept them
   * agreeing. Guardrail 3 is about one RULE, and a second CALL to one pure
   * function cannot disagree with the first the way two hand-written filters
   * did. The alternative — resolving here and threading markers into the map —
   * would make the screen own the map's rendering decisions to save an O(n)
   * pass over three hundred points.
   */
  const accessFamily = useMemo(
    () =>
      resolveAccessMarkers(
        { accessPoints: drawnAccessPoints, services },
        activeRoles(layers),
        new Set(SERVICE_LAYER_KEYS.filter((key) => layers.includes(key))),
      ),
    [drawnAccessPoints, services, layers],
  );

  /**
   * How many of each thing we hold, for the layers sheet.
   *
   * `undefined` is load-bearing: it means the layer has never been fetched, and
   * the sheet renders no number at all rather than a zero it cannot stand behind.
   * The outfitter tallies mirror RiverMap's own filtering, including dropping
   * services with no geocode — a count that includes pins the map cannot draw is
   * a count that makes the map look broken.
   *
   * ── THE ACCESS FAMILY COUNTS MEMBERSHIP; THE REST COUNT PINS ────────────
   *
   * Access points, campgrounds and boat ramps are one population under three
   * questions — a ramp you can sleep at is all three — so "how many pins does
   * this row draw" has no stable answer: it changes when a NEIGHBOURING row is
   * switched on. Those three report how many places match the row, which holds
   * still, and the sheet says underneath where they went (see the overlap note
   * in renderLayerDetail).
   *
   * Everything else is unchanged and keeps its own computation, including the
   * three-state `undefined` / `0` / `n` contract that `allGauges` and
   * `publicLand` depend on and that the resolver has no concept of.
   */
  const layerCounts = useMemo<Partial<Record<LayerKey, number>>>(() => {
    // The three tests this used to apply here — eligible, mappable, located —
    // are the resolver's now, asked once for every service layer. A local copy
    // agreeing with it today is how the four filters that preceded it drifted.
    return {
      // Statewide now, and counted from every put-in Eddy holds. It used to be
      // river-scoped and `undefined` until a river was chosen, which was the
      // honest reading of a layer that genuinely held nothing until then; the
      // layer holds every river's put-ins from launch, so the sheet can report
      // a real number on the opening screen. Still `undefined` while empty —
      // that is the bundle not having landed, not a state with no landings.
      //
      // ── AND IT NO LONGER DROPS WHEN CAMPGROUNDS COMES ON ────────────────
      // It used to subtract the campgrounds while that row was drawing them,
      // so the number beside "Access points" fell by forty for a reason the
      // sheet never stated and that had nothing to do with access points. They
      // did not stop being put-ins; they changed which mark they wear. The
      // count is the row's population now and the line underneath says where
      // they went, which is the honest version of the same fact.
      access:
        drawnAccessPoints.length > 0
          ? accessFamily.statsByRole.access.totalMatches
          : undefined,
      // Every put-in tagged `boat_ramp`, a SUBSET of the row above rather than
      // a slice taken out of it — which is why the Access row reports its
      // outermost live tier instead of summing them. See LayerDef.tiersRefine.
      boatRamps:
        drawnAccessPoints.length > 0
          ? accessFamily.statsByRole.boatRamp.totalMatches
          : undefined,
      gauges: gauges ? mappableGauges.length : undefined,
      // Viewport-scoped, so it moves as you pan — and `undefined` until the
      // layer has actually been switched on and fetched something, per the rule
      // above. Below the zoom floor it is 0 rather than undefined: we HAVE
      // looked, and the honest answer is that this layer draws nothing here.
      allGauges: layers.includes('allGauges')
        ? referenceGauges.belowMinZoom
          ? 0
          : referenceGauges.loading && referencePins.length === 0
            ? undefined
            : referencePins.length
        : undefined,
      // undefined until the layer has been switched on and answered, per the
      // rule above. Statewide rather than river-scoped, so it does not move
      // with the selection.
      dams: dams?.length,
      // Statewide, like access above: the count is what the layer draws, and
      // what it draws is every hazard Eddy has rather than one river's.
      hazards: drawnHazards.length > 0 ? drawnHazards.filter(hasCoordinates).length : undefined,
      // Both halves, from the same resolver the map draws from: every put-in
      // tagged `campground`, plus the campground services that are not already
      // one of them. Adding the two raw totals double-counted every place that
      // exists in both tables — which after the coordinate correction is every
      // one of them that ever mattered, since the duplicates used to be miles
      // apart and now sit on top of each other.
      //
      // `undefined` until the directory lands, because half of this population
      // comes from it and half a total is a number that grows under the reader.
      campgrounds: accessFamily.servicesKnown
        ? accessFamily.statsByRole.campground.totalMatches
        : undefined,
      // ── MEMBERSHIP, for the same reason the access rows count membership ──
      //
      // These were counts of PINS, which worked only while rentals and lodging
      // were the sole claimants of a service. Now that Campgrounds can own the
      // marker of a camping-and-rentals row — 40 of the directory's rows are
      // both — a pin count would drop by up to forty the moment Campgrounds was
      // switched on, for a reason the sheet never stated and that has nothing to
      // do with rentals. That is precisely the disease the access family was
      // cured of; the cure is the same, and `accessOverlapNote` says where the
      // places went.
      //
      // `undefined` until the directory lands, exactly as `campgrounds` above:
      // half a total is a number that grows under the reader.
      outfitters: accessFamily.servicesKnown
        ? accessFamily.statsByServiceOwner.rentals.totalMatches
        : undefined,
      lodging: accessFamily.servicesKnown
        ? accessFamily.statsByServiceOwner.lodging.totalMatches
        : undefined,
      // Viewport-scoped, like allGauges above and with the same three-way
      // meaning: undefined before the layer has answered, 0 when we HAVE looked
      // and this view holds none, and a number otherwise.
      publicLand: layers.includes('publicLand')
        ? publicLands.belowMinZoom
          ? 0
          : publicLands.loading && publicLands.features.length === 0
            ? undefined
            : publicLands.features.length
        : undefined,
    };
  }, [
    accessFamily,
    drawnAccessPoints,
    drawnHazards,
    gauges,
    mappableGauges,
    dams,
    layers,
    referenceGauges.belowMinZoom,
    referenceGauges.loading,
    referencePins,
    publicLands.belowMinZoom,
    publicLands.loading,
    publicLands.features,
  ]);

  // ── `tierCoverage` is gone ───────────────────────────────────────────
  //
  // It computed "77 of 80 have a confirmed location" per service tier, for a
  // line under the row. The line is gone and so is the memo, because the
  // premise was wrong in a way worth recording: the count beside the row was
  // NEVER the 80. `resolveAccessMarkers` skips a service with no coordinates
  // before it counts anything, so the chip has always reported drawable
  // places only — and the sentence sat beneath it introducing a second,
  // larger population that the reader then had to reconcile with the first.
  // Two numbers, two populations, one row, and no way to tell which the
  // switch would draw.
  //
  // The directory's geocoding gap is real and still reachable: every service
  // Eddy holds is listed on its river page, located or not. That is where a
  // reader looking for a specific outfitter goes, and it is a list rather
  // than a map, so a missing coordinate costs nothing there.

  const conditionCode = drawn?.currentCondition?.code ?? 'unknown';

  /**
   * ── The selected river's NAME AND VERDICT NOW LIVE IN THE SHEET ──────────
   *
   * They were resolved here for a header line drawn above the map, which has
   * been removed — the river sheet is the one surface that owns a river
   * selection. The resolution itself moved into `riverSheetData` unchanged and
   * is still worth stating, because it is not obvious:
   *
   * `selected` is a lookup into /api/rivers, the one request on this screen with
   * nothing on disk behind it. Open the app with no signal, tap a river, and the
   * line goes heavy and the camera fits to it while `selected` stays null — so
   * anything gated on `selected` alone vanishes exactly when a selection is
   * hardest to undo. The statewide network is the fallback because it is the
   * same source the map is DRAWING from: off disk, every river's name, and the
   * per-river verdict already under the finger that tapped. Where both exist the
   * river list wins, so the sheet cannot disagree with the Today tab about a
   * river both can see.
   */
  // ── Where the map opens ────────────────────────────────────────────────────
  // The camera the last session settled on, when one is stored and fresh —
  // "where you were" outranks "where you are", because it is a position the
  // reader chose themselves. Then the user's own position if location was
  // ALREADY granted on a previous run (useLocation resolves that without
  // prompting), otherwise the whole network. Never a river nobody picked.
  //
  // This is handed to Mapbox as defaultSettings only. A later render can never
  // replay it over a gesture or selection. THE ACCEPTED RACE: the map does not
  // mount until the statewide collection has features, and the one-key camera
  // read usually answers well before that hydrate — but when it loses, the map
  // opens exactly as it always has and the stored camera is NOT applied late.
  // A fly-to over a map the reader is already looking at is the jolt the
  // startup-location effect below refuses, for the same reason.
  const initialCamera: InitialMapCamera | null = storedCamera
    ? { type: 'center', lng: storedCamera.lng, lat: storedCamera.lat, zoom: storedCamera.zoom }
    : location.coords
      ? {
          type: 'center',
          lng: location.coords.lng,
          lat: location.coords.lat,
          // Regional, not local. The question this answers is "which rivers are
          // near me", and that is unanswerable at street zoom.
          zoom: 8.5,
        }
      : network.bounds
        ? { type: 'bounds', bounds: network.bounds }
        : null;

  /**
   * "Open near me" when the location arrives AFTER the map already opened.
   *
   * ── The race this closes ───────────────────────────────────────────────────
   *
   * `initialCamera` is only ever read once, by RiverMap, on its first render —
   * and RiverMap does not mount until the statewide collection has features.
   * useLocation starts at null and resolves asynchronously, so which of the two
   * lands first decides what the map opens on. When the network won, the map
   * opened statewide and the coordinates that arrived 200ms later had nowhere to
   * go: the comment above promised "your position if location was already
   * granted", and the reader got the whole state.
   *
   * So it becomes a command — but an OPPORTUNISTIC one, which is why it is the
   * only command in the app that checks before issuing. It fires exactly once,
   * and only while nothing else has claimed the camera: no river selected, no
   * command ever issued, and no gesture ever made.
   *
   * `hasGestured` is LATCHED rather than read live for the reason this whole
   * effect exists — it is late. RiverMap's gesture handling cancels a command
   * that is pending while a finger is down, which answers a different question:
   * by the time these coordinates arrive the reader may have panned, lifted, and
   * started reading. `isGestureActive` is false by then and would wave it
   * through, on top of the map they had just positioned themselves.
   */
  const hasGestured = useRef(false);
  const openedWithoutLocation = useRef(false);
  const startupLocationSettled = useRef(false);
  /**
   * Whether the map's first mount opened on a remembered camera.
   *
   * Latched on the effect's first pass with the map on screen — the same
   * commit RiverMap latched its defaultSettings in, so this records what the
   * map actually consumed, not what later arrived. Null until then.
   */
  const openedOnStoredCamera = useRef<boolean | null>(null);
  const onUserGesture = useCallback(() => {
    hasGestured.current = true;
    // Also counted, for the deferred fit above — see `gestureCount`.
    gestureCount.current += 1;
  }, []);

  useEffect(() => {
    if (startupLocationSettled.current) return;
    // Nothing to decide until the map is on screen: this mirrors the condition
    // the map is rendered under below, and effects run child-first, so RiverMap
    // has already latched its defaultSettings by the time this runs.
    if (unavailable || !network.collection.features.length) return;
    // A map that opened on a remembered camera is already where the reader
    // left it — the session's camera belongs to the restore, and flying to
    // their position on top of it would be the jolt this effect exists to
    // avoid. The locate button remains one tap away.
    if (openedOnStoredCamera.current === null) {
      openedOnStoredCamera.current = storedCamera !== null;
    }
    if (openedOnStoredCamera.current) {
      startupLocationSettled.current = true;
      return;
    }
    if (!location.coords) {
      openedWithoutLocation.current = true;
      return;
    }
    startupLocationSettled.current = true;
    // The coordinates were in hand when the map mounted, so defaultSettings
    // already used them. Flying to where we opened is not a fix, it is a jolt.
    if (!openedWithoutLocation.current) return;
    if (selectedSlug || hasGestured.current || cameraCommandId.current > 0) return;
    issueCameraCommand({
      type: 'locationRequested',
      lng: location.coords.lng,
      lat: location.coords.lat,
      // The same regional framing initialCamera would have used.
      zoom: 8.5,
    });
  }, [
    unavailable,
    network.collection.features.length,
    location.coords,
    storedCamera,
    selectedSlug,
    issueCameraCommand,
  ]);

  /**
   * Frame a float plan while the reader is looking at it.
   *
   * ── Why this keys off the sheet being OPEN, not the route arriving ─────────
   *
   * It used to frame on arrival, which put an asynchronous result in competition
   * with everything the reader had done since asking for it: start a plan, close
   * the sheet, pan somewhere, and the response landed and framed over them.
   * Command ids do not answer that — they say a command is not a replay, not
   * that it is still wanted.
   *
   * Gating on `planOpen` dissolves the race rather than refereeing it. PlanSheet
   * is a pageSheet modal, so while it is up the map cannot be touched at all;
   * the window in which this frames is exactly the window in which no competing
   * intent can be formed. Depending on BOTH values is what covers the two cases
   * that matter — a route landing while the sheet is already open, and a
   * finished plan being reopened, which frames again because opening it is
   * fresh intent.
   *
   * The alternative was an interaction epoch captured when calculation starts
   * and compared on arrival. It works, but it is bookkeeping over every gesture
   * and every navigation in the app, kept in order to adjudicate a conflict this
   * rule makes impossible.
   */
  const planGeometry = planner.plan?.route?.geometry ?? null;
  const framedRoute = useRef<typeof planGeometry>(null);
  const planFrameCommandId = useRef<number | null>(null);

  useEffect(() => {
    const decision = planFramingDecision(planOpen, planGeometry, framedRoute.current);
    if (decision === 'idle') return;

    if (decision === 'endSession') {
      framedRoute.current = null;
      // Cancel a frame issued in the instant before the sheet went away. Without
      // this the command outlives the viewing session it belongs to — and any
      // future `waitForSheet` on it would make that a certainty rather than a
      // sub-frame edge.
      const pending = planFrameCommandId.current;
      planFrameCommandId.current = null;
      if (pending !== null) {
        setCameraCommand((current) => (current && current.id === pending ? null : current));
      }
      return;
    }

    if (!planGeometry) return;
    const bounds = boundsForLine(planGeometry.coordinates);
    if (!bounds) return;
    framedRoute.current = planGeometry;
    planFrameCommandId.current = issueCameraCommand({ type: 'planRouteFramed', bounds });
  }, [planOpen, planGeometry, issueCameraCommand]);

  const onCameraCommandConsumed = useCallback((id: number) => {
    // Dropped so a REMOUNT cannot replay it. RiverMap's applied-id is a ref and
    // dies with the component; this state does not, and the map is unmounted for
    // its spinner whenever the statewide collection momentarily empties.
    setCameraCommand((current) => (current && current.id === id ? null : current));
  }, []);

  // Tapping a river on the network selects it, which is the whole point of
  // drawing it: the map is now a way of CHOOSING a river, not just of looking
  // at one you already chose. Any open callout belongs to the old river.
  //
  // ── AND IT STAYS WHERE THE FINGER LANDED ─────────────────────────────────
  //
  // This framed the whole river, on the reasoning above: the reader asked for
  // the river, so show them the river. That is true of picking one from search
  // or from a list, where they have named a river and are looking at nothing in
  // particular. It is false of a TAP: tapping the Current near Van Buren says
  // "this stretch", and answering it by fitting 134 miles of river moves the
  // map off the thing under the finger — which is exactly what it felt like.
  //
  // So a tap that carried a coordinate keeps the reader there, at their own
  // zoom, nudged only by what the sheet covers (`poiSelected` waits for the
  // sheet and frames into what is left). Without one — a shape event that did
  // not carry it — the old fit is still the honest fallback: something has to
  // put the river on screen.
  //
  // The other callers still pass `fitRiver` and should: search results and the
  // river picker name a river without pointing at any part of it.
  const onSelectNetworkRiver = useCallback(
    (slug: string, at?: { lng: number; lat: number }) => {
      selectRiver(slug, at ? { camera: 'pin', lng: at.lng, lat: at.lat } : { camera: 'fitRiver' });
      setSelectedPin(null);
      pendingAccessSelection.current = null;
    },
    [selectRiver],
  );

  /**
   * Put the selected river down and go back to the whole network.
   *
   * Everything river-scoped follows from `pickedSlug` being null: the heavier
   * line stops being drawn and the planner resets itself off the riverId change
   * (see useFloatPlan's first effect). What does NOT follow is the callout,
   * which belongs to a pin on the river being put down — clearing the selection
   * and leaving its put-in's callout open would be the same half-exit the map
   * had before.
   *
   * THE CAMERA STAYS. Closing a river is a statement about the river, not a
   * request to be taken somewhere; the map used to re-frame on the user's
   * position or on the whole network, which is a hundred miles of pan away from
   * whatever the user was actually looking at.
   */
  const clearRiver = useCallback(() => {
    selectRiver(null, { camera: 'hold' });
    setSelectedPin(null);
    pendingAccessSelection.current = null;
  }, [selectRiver]);

  /**
   * Dismiss the open pin — and, when nothing was underneath it, the river its
   * own tap selected.
   *
   * ── TWO CLOSES FOR ONE THING ─────────────────────────────────────────────
   *
   * `onSelectPin` SELECTS THE RIVER a pin sits on when nobody had chosen it,
   * and it does that for good reasons of its own (everything downstream of a
   * put-in is river-scoped — see its docblock). The cost landed on the way out:
   * × cleared the pin, the selection it had silently made stayed, and a river
   * sheet the reader had never opened rose into the gap. Tapping a campground
   * from the statewide map therefore cost two dismissals, the second of them
   * for a sheet that only existed because of the first tap.
   *
   * It was survivable while access points were the only pins anyone met at that
   * zoom. With camping, cabins and rentals on by default it is most taps on the
   * map.
   *
   * ── The rule: × GOES WHERE BACK GOES ─────────────────────────────────────
   *
   * `revealsRiverSheet` already records the only fact that decides this —
   * whether a river sheet was on screen BEFORE this pin — and the Back control
   * is drawn from it. So:
   *
   *   • Something to go back to → pop one level, exactly as before, and land on
   *     the sheet Back names.
   *   • Nothing to go back to → the river underneath, if any, is this tap's own
   *     doing, so take it back down with the pin.
   *
   * That keeps the old promise ("Back names where × already goes") and drops
   * the half of it that was making the reader close a sheet they never opened.
   * A river the reader chose is still never destroyed by dismissing a pin: in
   * that case revealsRiverSheet is true and this pops one level.
   *
   * THE CAMERA STAYS either way — clearRiver holds it, and dismissal is not
   * navigation.
   */
  const dismissPin = useCallback(() => {
    if (revealsRiverSheet) {
      setSelectedPin(null);
      return;
    }
    clearRiver();
  }, [revealsRiverSheet, clearRiver]);

  const onLocate = useCallback(async () => {
    // Recorded BEFORE the request, not after it. This is what mounts the puck,
    // and the thing it stands for is "the user asked to be shown on the map" —
    // which is true the moment the button is pressed, whatever the dialog then
    // returns. See `locateAsked` for why the puck waits on this.
    setLocateAsked(true);
    // Falls back to whatever position the hook already holds — which after a
    // lapsed "Allow Once" grant is the fix remembered from the last session.
    // Declining the dialog then still recentres the map roughly where you are,
    // instead of the button doing visibly nothing.
    const coords = (await location.request()) ?? location.coords;
    if (coords) {
      issueCameraCommand({
        type: 'locationRequested',
        lng: coords.lng,
        lat: coords.lat,
        zoom: 10.5,
      });
    }
  }, [location, issueCameraCommand]);

  const pinAccess = accessPointForPin(selectedPin);
  const pinAccessPoint = pinAccess?.point ?? null;

  /**
   * Whether the tapped point's river carries any gauge at all.
   *
   * ── Asked HERE because here is where it can be answered in time ──────────
   *
   * The sheet's peek reserves a fixed box for one decision fact so that its top
   * edge does not move when the detail request lands (see peekSlot.ts). Which
   * box, though, depends on whether a reading is ever coming — and on a river
   * Eddy grades with nothing, reserving 30pt and then taking it back is the same
   * movement, merely delayed.
   *
   * The statewide network already carries every river's gauges and it is already
   * loaded before any pin can be drawn, so this costs a Map lookup and is
   * available on the frame the sheet opens. The detail response would answer it
   * more precisely and half a second too late.
   *
   * `pinAccess.riverSlug` rather than `selectedSlug`: tapping a put-in on an
   * unselected river sets the selection in the same breath, so for one render
   * the two disagree — and the pin's own river is the right answer in both.
   */
  const riverHasGauges = useMemo(() => {
    const slug = pinAccess?.riverSlug ?? selectedSlug;
    if (!slug) return false;
    return (network.bySlug.get(slug)?.gauges?.length ?? 0) > 0;
  }, [pinAccess?.riverSlug, selectedSlug, network.bySlug]);

  /**
   * Tapping a put-in selects the river it is on.
   *
   * The access layer is statewide now, so a tap can land on a river nobody has
   * chosen — and everything downstream of a put-in is river-scoped: the
   * planner's put-in and take-out options, the geometry a float is snapped to,
   * the offline row, the header. Selecting the river is what keeps them
   * coherent, and it is also what somebody tapping a landing on the Jacks Fork
   * plainly meant.
   *
   * The callout is set in the same breath rather than waiting for the river to
   * load, and the pending reference is what carries it across the selection
   * effect's reset — see the effect, which now spares a pin it is about to
   * re-select anyway.
   *
   * ── The camera has to be pinned, or the tap throws you across the state ───
   *
   * With no focus set the camera fits the SELECTED river's bounds, which is
   * exactly right when you chose that river by tapping its line and exactly
   * wrong here: tap a landing on the Jacks Fork from the statewide view and the
   * map would snap — animationMode 'none' — to a hundred miles of river, with
   * the callout still open about a pin that had become a speck.
   *
   * So a pin tap sets its own focus: the tapped point, at whatever zoom the
   * camera is already on. That is a gentle recentre rather than a jump, and
   * centring is useful in its own right because the callout occupies the bottom
   * of the screen and a pin selected near it ends up underneath.
   */
  const onSelectPin = useCallback(
    (pin: MapPin) => {
      const entry = accessPointForPin(pin);
      // The river this tap would newly select, or null when it selects none —
      // either because the pin has no river or because that river is already
      // the chosen one. Bound once so the narrowing holds below.
      const newRiverSlug =
        entry?.riverSlug && entry.riverSlug !== selectedSlug ? entry.riverSlug : null;
      // ── Was the river sheet on screen a moment ago? ──────────────────────
      // Recorded here because it is only answerable here: a river being
      // selected NOW proves nothing, since the branch below may be what
      // selected it. See the state's own comment.
      setRevealsRiverSheet(Boolean(selectedSlug) && newRiverSlug === null);
      // A POI owns the centre, never the zoom. The command waits for the sheet's
      // peek height and then eases the point into the visible map without using
      // the last onMapIdle zoom, which may belong to the statewide view if a
      // river animation was still moving when this tap landed.
      const { lng, lat } = pin.coordinates;
      if (newRiverSlug && entry) {
        pendingAccessSelection.current = {
          id: entry.point.id,
          riverSlug: newRiverSlug,
          layer: pin.layer,
        };
        selectRiver(newRiverSlug, { camera: 'pin', lng, lat });
      } else {
        // NOT selectRiver(null, …): this pin selects no river, which is a
        // different thing from clearing the one already selected. Tapping a
        // gauge on the Current must not put the Current down.
        pendingAccessSelection.current = null;
        issueCameraCommand({ type: 'poiSelected', lng, lat });
      }
      setSelectedPin(pin);
    },
    [accessPointForPin, selectedSlug, selectRiver, issueCameraCommand],
  );

  // The gauge behind a tapped gauge pin. Looked up rather than carried on
  // MapPin, which is a presentation struct — growing it a per-layer field for
  // every layer that wants one is how it stops being that.
  const pinGauge = useMemo(() => {
    if (!selectedPin || selectedPin.layer !== 'gauges') return null;
    const id = selectedPin.id.replace(/^gauge:/, '');
    return (gauges ?? []).find((g) => g.id === id) ?? null;
  }, [selectedPin, gauges]);

  /** The same, for the national tier. A different list and a different shape. */
  const pinReferenceGauge = useMemo(() => {
    if (!selectedPin || selectedPin.layer !== 'allGauges') return null;
    const id = selectedPin.id.replace(/^refgauge:/, '');
    return visibleReferenceGauges.find((g) => g.id === id) ?? null;
  }, [selectedPin, visibleReferenceGauges]);

  /**
   * Open the gauge screen, handing over what this screen already holds.
   *
   * The callout is showing the reading. Pushing a screen that then spins for
   * the same number is a loading state the app has no reason to have, so the
   * pin's own record is seeded first and the screen paints from it while its
   * own request runs. See src/lib/gaugeSeed.ts.
   */
  const onOpenGauge = useCallback(
    (siteId: string) => {
      if (pinGauge) rememberGauge(seedFromMapGauge(pinGauge));
      else if (pinReferenceGauge) rememberGauge(seedFromMapGaugeLite(pinReferenceGauge));
      // The pin stays selected across the push — see the note above PinCallout.
      router.push(`/gauge/${encodeURIComponent(siteId)}`);
    },
    [pinGauge, pinReferenceGauge, router],
  );

  /** The dam screen. No seed to hand over — it fetches its own snapshot. */
  const onOpenDam = useCallback(
    (damId: string) => router.push(`/dam/${encodeURIComponent(damId)}`),
    [router],
  );

  // NOTHING ON THIS SCREEN IS GATED. The offline download was the Map tab's
  // only paid feature and its only reason to know about entitlement, so the
  // account read, the `entitled` computation and the paywall sheet all left
  // with it. Everything the map shows — the network, put-ins, hazards, gauges,
  // conditions — is free and always has been.
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      {/* ── ONE IDENTITY SURFACE, AND IT IS THE SHEET ──────────────────────
          A selected river used to be announced twice at once: here, as a dot,
          a name, a condition, a chevron to the river screen and a ✕; and again
          in the river sheet, which carries the name, the region, the access
          count, "Open {river}" and its own close. Two surfaces claiming the
          same selection, one of them spending map height on it, and no way to
          tell which owned it.

          The sheet won, because it is the thing the selection produced. It now
          carries identity, the condition and the way out — see RiverHead — and
          its close clears the river rather than merely hiding the sheet.

          This also retired a wrong-action bug of the kind PlaceHead documents:
          the two controls here carried hitSlop 8 and hitSlop 14 across a 12pt
          gap, so their expanded regions OVERLAPPED by 10pt, and iOS hit-tests
          later siblings first — the clear ✕ won a band of taps aimed at the
          chevron. */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Map</Text>
      </View>

      <View style={styles.searchRow}>
        <SearchBar
          value={search.query}
          onChangeText={search.setQuery}
          placeholder="Search rivers, gauges, dams and more"
          // Gauges and services are matched locally, so both lists have to
          // exist before the first keystroke rather than after the first
          // query. Services especially: the placeholder and the empty state
          // both promise outfitters, and with all three service layers off
          // nothing else would ever have fetched them — "Akers Ferry" answered
          // "Nothing matched" while the directory sat unrequested.
          onFocus={() => {
            ensureGauges();
            ensureServices();
          }}
        />
      </View>

      {/* ── Why the rivers are grey ──
          The one thing that ever occupied this strip is now the only thing
          that earns it. Every line drawn in the `unknown` grey is normally a
          river nobody can grade; when the readings request itself failed they
          ALL are, and the map is presenting "we could not ask" in the same ink
          it uses for a verdict. That state shipped silently once — a null site
          id from a dam station 400'd the whole USGS batch and twenty-four
          rivers went grey with no explanation anywhere — so it says so now.

          Not an error banner over a working map: the geometry, the pins, the
          plan flow and the access points are all unaffected, and the only
          claim being withdrawn is the colour. */}
      {network.readingsFailed && !unavailable ? (
        <View style={[styles.readingsNotice, { backgroundColor: colors.cardRaised }]}>
          <Ionicons name="cloud-offline-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.readingsNoticeText, { color: colors.textMuted }]}>
            Live conditions unavailable — rivers are shown uncoloured.
          </Text>
        </View>
      ) : null}

      <View style={styles.mapArea}>
        {unavailable ? (
          <MapUnavailable reason={unavailable} />
        ) : !network.collection.features.length ? (
          // The spinner is for a COLD map — neither the network nor a river has
          // arrived. Once either has, the map draws: switching rivers keeps the
          // one already on screen until the next lands, and a river loading over
          // an already-drawn network needs no spinner at all.
          <View style={styles.centered}>
            <ActivityIndicator color={colors.interactive} />
          </View>
        ) : (
          <RiverMap
            // Frame the selection into what the sheet leaves visible. Clamped
            // to 55% of the map: past that Mapbox's framing gets unreliable,
            // and at the tallest detent the map is not visible anyway, so
            // there is nothing left to keep in view.
            cameraPaddingBottom={
              sheetOpen ? Math.min(sheet.height, Math.round(windowHeight * 0.55)) : 0
            }
            // NOT the clamped number above. Framing may give up past 55%
            // because there is nothing useful left to frame into; attribution
            // may not, because it is a term of the licence. See the prop.
            ornamentBottomInset={sheetOpen ? sheet.height : 0}
            river={mapRiver}
            milePosts={riverMilePosts}
            conditionCode={conditionCode}
            network={network.collection}
            onSelectRiverSlug={onSelectNetworkRiver}
            accessPoints={drawnAccessPoints}
            gauges={mappableGauges}
            referenceGauges={referencePins}
            publicLands={publicLands.features}
            dams={damPins}
            onViewportChange={onViewportChange}
            onZoomToCluster={onZoomToCluster}
            hazards={drawnHazards}
            services={services ?? NO_SERVICES}
            layers={layers}
            initialCamera={initialCamera}
            cameraCommand={cameraCommand}
            onCameraCommandConsumed={onCameraCommandConsumed}
            onUserGesture={onUserGesture}
            // `locateAsked` first: the puck is a native location consumer of
            // its own, so it waits for an explicit ask rather than for a status
            // that can arrive on its own. See the state's declaration.
            showUserLocation={locateAsked && location.status === 'ready' && isFocused}
            planRoute={planner.plan?.route?.geometry ?? null}
            planEndpoints={planEndpoints}
            selectedPinId={selectedPin?.id ?? null}
            onSelectPin={onSelectPin}
          />
        )}

        {/* THERE IS NO LOADING PILL ANY MORE. It existed to name the river whose
            geometry was in flight while the previous one stayed on screen, and
            nothing is in flight: a selected river's line is already in memory,
            from the statewide dataset the map opened with. A pill that could
            only ever appear for one frame is a flicker, not a signal. */}

        {/* Results overlay the map rather than pushing it down, so the map keeps
            its size and the list can be dismissed by clearing the field. */}
        {search.active ? (
          <View style={styles.resultsOverlay} pointerEvents="box-none">
            <SearchResultsList
              results={search.results}
              onSelect={onSelectResult}
              loading={search.searching}
              emptyMessage="Nothing matched. Try a river, gauge, access point, dam or outfitter."
            />
          </View>
        ) : null}

        {/* Layers. Top-right, opposite the search results, and the reason the
            map got a band of its height back — see MapLayersSheet.

            Both buttons need the map to be up, but NOT a selected river: the
            network is filterable and the gauge layer is statewide, so gating
            these on `detail` would have hidden them on the opening screen. */}
        {!unavailable && !search.active ? (
          <MapLayersButton
            onPress={() => setLayersOpen(true)}
            // The gauge filter counts too: a map narrowed to one flow band
            // with no dot anywhere reads as gauges having gone missing — the
            // exact complaint that keeps the filter from being persisted.
            changed={!isDefaultLayers(layers) || gaugeFilter.size > 0}
          />
        ) : null}


        {/* ── The bottom stack ──────────────────────────────────────────
            One bottom-anchored column holding the callout and the map controls,
            rather than three overlays each anchored to the screen edge on their
            own. The column has no `top`, so it sizes to its content and grows
            UPWARD from MAP_CHROME_BOTTOM — which is what makes it correct by
            construction for a 115pt access-point callout and a 251pt
            gauge-with-a-qualifier-note alike.

            This replaces `bottom: selectedPin ? 110 : 16` on the plan button,
            which handed 94pt of clearance to a callout whose SHORTEST variant is
            115pt. It overlapped every pin type, and a gauge — the only pin
            carrying a large reading row — by 59pt or more. No constant could
            have been right, because the height depends on what was tapped.

            THE CALLOUT COMES FIRST, so the controls sit BELOW whatever you
            selected. Locate and Plan a float are the same two buttons wherever
            you are on this screen; a selection is transient and specific, and
            putting it under the controls made them jump to a new position on
            every tap. Fixed chrome at the bottom, the answer above it.

            `gap` rather than a margin: it applies only BETWEEN children, so with
            no callout the row sits flush at the ornament band and nothing adds
            phantom space. */}
        {/* ── The controls ride the sheet ────────────────────────────────
            Lifted by however tall the sheet is, rather than hidden under it.
            They were hidden because the sheet is a full-width gesture surface
            and does not merely overlap them — it takes their touches — but
            hiding cost you Locate and Plan a float for as long as anything was
            selected.

            THE LIFT FOLLOWS THE FINGER. It used to come from the SETTLED
            height, so for the whole of a drag these sat where the sheet had
            been and then teleported when it landed. It is a transform off the
            sheet's live height now — see controlsStyle — and `bottom` stays
            put, because animating layout per frame on this screen is the thing
            MapSheet's header explains it was built to avoid.

            They keep the same offset they use at rest, now measured from the
            sheet's top edge rather than the map's. It was a bare 12, which
            cleared the sheet and nothing else; the ornaments ride the sheet
            too now, so 12 would have landed the locate button on the (i).

            At the tallest detent there is no room left above the sheet, so they
            do genuinely go away there and only there — and that stays a settled
            decision, because the fade has already taken them to nothing by the
            time it happens and a per-frame pointerEvents would be a React write
            on every frame of a drag. */}
        {sheetOpen && sheet.detent === 'full' ? null : (
        <Animated.View
          style={[styles.bottomStack, controlsStyle]}
          pointerEvents="box-none"
        >
          <View style={styles.controlRow} pointerEvents="box-none">
          {/* Locate. The ONLY thing that ever asks for location permission on
              this screen — see useLocation for why the prompt is never spent on
              launch. A granted tap recentres; the map keeps the fix for the rest
              of the session and hands it to the planner. */}
          {!unavailable && !search.active ? (
            <Pressable
              onPress={onLocate}
              disabled={location.status === 'locating'}
              style={({ pressed }) => [
                styles.locateButton,
                floating(),
                { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Show my location"
            >
              {location.status === 'locating' ? (
                <ActivityIndicator size="small" color={colors.interactive} />
              ) : (
                <Ionicons
                  name={location.status === 'ready' ? 'locate' : 'locate-outline'}
                  size={19}
                  color={location.status === 'denied' ? colors.textSubtle : colors.interactive}
                />
              )}
            </Pressable>
          ) : null}

          {/* ── THERE IS NO CONDITION LEGEND HERE ANY MORE ───────────
              It sat in this row, open by default, on the argument that the map
              is the one screen where colour works alone and therefore the one
              screen that owes the reader a key. The argument was sound and the
              placement was not: a six-row card anchored over the water covered
              the thing it was explaining, on the surface with the least room to
              spare, permanently, for a ladder that is paired with its word on
              every other screen in the app — the Today list, a river screen, an
              alert, and the callout that opens the moment you tap any pin here.
              Removed rather than moved: the map has no spare corner, and the
              layers sheet already carries the marks it toggles. */}
          </View>
        </Animated.View>
        )}

        {/* ── The plan cluster ──────────────────────────────────────────
            IN THE CORNER, not in the stack above. Locate has to clear the
            Mapbox ornaments because it shares their horizontal band on the
            left; the plan button is on the RIGHT, where the wordmark and the
            (i) end around x=149 and nothing else is competing. Sitting it at
            MAP_CHROME_BOTTOM cost it 46pt of drop it never owed anyone.

            It still reads as below the selection: the callout's own bottom edge
            is a control row and a gap above MAP_CHROME_BOTTOM, well clear of
            this. See planButton's maxWidth for the one thing that could put a
            long label back over the ornaments.

            ── IT STANDS DOWN WHILE A SHEET IS OPEN, UNLESS A PLAN EXISTS ────
            "Plan a float" is the generic way into the planner, and while a
            selection is open it was competing with two specific ones about the
            same task: the access sheet's "Use as put-in", and the Float trips
            rows that build a whole float in one tap. Three entry points to one
            flow, in one visual field, and the floating one — the only one with
            no context — was riding on top.

            `planner.plan` is the exception and is a different verb. Then the
            button reads "View float" and RESUMES state the reader already
            built, which competes with nothing: the sheet has no way back to an
            existing plan, so hiding it there would strand it. */}
        {sheetOpen && (sheet.detent === 'full' || !planner.plan) ? null : (
        <Animated.View
          style={[styles.planCluster, controlsStyle]}
          pointerEvents="box-none"
        >
          {/* CLEAR THE PLAN. The plan deliberately outlives its sheet — you
              build a float and dismiss the sheet to look at the water between
              its ends — but nothing on the map could undo it. The only way
              back was to open the sheet and press "Plan a different stretch",
              which reads as starting another one, not discarding this one. So
              someone who just wanted a clean map had no reason to open the
              planner at all. It belongs where the plan is visible. */}
          {!unavailable && planner.plan && !search.active ? (
            <Pressable
              onPress={() => {
                planner.reset();
                setSelectedPin(null);
              }}
              style={({ pressed }) => [
                styles.clearPlanButton,
                floating(),
                { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Clear this float plan"
            >
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}

          {/* The screen's one primary action, floated over the map so the map
              keeps every pixel it can. It changes label rather than multiplying:
              once a plan exists this is how you get back to it. */}
          {!unavailable && !search.active ? (
            <Pressable
              onPress={() => setPlanOpen(true)}
              style={({ pressed }) => [
                styles.planButton,
                // A floating control needs its own separation from the map behind
                // it; the shared elevation() helper is tuned for cards on a flat
                // canvas and is border-only on dark.
                floating(),
                {
                  backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill,
                },
              ]}
              accessibilityRole="button"
              // The visible label is a compacted distance and duration, so
              // VoiceOver would otherwise read "8.3 mi · up to ~4h" and leave
              // the reader to infer what tapping it does.
              accessibilityLabel={planner.plan ? 'View your float plan' : 'Plan a float'}
            >
              <Ionicons
                name={planner.plan ? 'map-outline' : 'navigate-outline'}
                size={17}
                color={colors.onAccent}
              />
              {/* COMPACT, because this button sits ON the map. The verbose form
                  ("8.3 miles · ~2 hours 30 minutes – ~4 hours") wrapped to two
                  lines and took a band of river with it. The numbers stay rather
                  than becoming a bare "View float" — they are what decides the
                  tap — but as "8.3 mi · up to ~4h", a third of the width. The
                  full wording lives in PlanResult, one tap away. */}
              <Text style={[styles.planButtonText, { color: colors.onAccent }]} numberOfLines={1}>
                {planner.plan ? planButtonLabel(planner.plan) : 'Plan a float'}
              </Text>
            </Pressable>
          ) : null}
        </Animated.View>
        )}

        {/* ── The sheet ─────────────────────────────────────────────────
            OUT of the bottom stack, which sized itself to the callout and
            grew upward from the ornament band. A sheet is not a member of
            that column: it spans the whole map area and slides, so the stack
            now holds only the fixed chrome it was always about.

            RENDERED LAST, so it draws over the map's own controls — and
            because it is a full-width gesture surface at the bottom of the
            screen, it does not merely overlap them, it takes their touches.
            An earlier version of this comment claimed they stayed reachable
            at the glance. They do not: the peek occupies exactly the band
            Locate and Plan a float sit in.

            So they are HIDDEN while a sheet is open, rather than left under it
            to be tapped at and not respond. Both remain a close away, and for
            an access point the plan action is already on the sheet itself —
            which is the more direct route to it than the floating button was. */}
        {/* ── The river sheet ───────────────────────────────────────────
            Shown when a river is selected and NO pin is. A pin belongs to a
            river, so both at once would be two sheets arguing about the same
            stretch of water — and the pin is the more specific answer, so it
            wins. Closing it puts you back on the river's own sheet, which is
            where you were.

            Tapping a river used to produce no UI whatsoever: onSelectNetworkRiver
            set the slug, closed any callout and cleared the focus, and the only
            thing that appeared was a header chip whose one action was to leave
            the screen. */}
        {riverSheetData && !selectedPin && !search.active ? (
            <RiverSheetPanel
              river={riverSheetData}
              width={windowWidth}
              onClose={clearRiver}
              onOpenGauge={onOpenGauge}
              onOpenRiver={(slug) => router.push(`/river/${slug}`)}
              // No source argument any more. This selection is on the river
              // already showing, so onSelectPin's own check — "did this tap pick
              // a new river" — answers false and records that × returns here.
              onSelectAccess={(point) => {
                const entry = drawnAccessPoints.find((e) => e.point.id === point.id);
                onSelectPin(mapAccessPointPin(point, entry?.riverSlug ?? riverSheetData.slug));
              }}
              // ── THE ROUTE IS BUILT WHERE EVERY OTHER ROUTE IS ───────────
              // Through mapAccessPointPin, so the Accesses list and the sheet's
              // own "Access point details" row cannot come to disagree about
              // what an access point's URL looks like. It returns null when the
              // point has no slug, and the tab falls back to selecting the pin.
              onOpenAccess={(point) => {
                const entry = drawnAccessPoints.find((e) => e.point.id === point.id);
                const route = mapAccessPointPin(
                  point,
                  entry?.riverSlug ?? riverSheetData.slug,
                ).detailRoute;
                if (route) router.push(asHref(route));
              }}
              onDetentChange={onSheetDetentChange}
              metrics={sheetMetrics}
            />
        ) : null}

        {selectedPin && !search.active ? (
          <PinSheet
              pin={selectedPin}
              accessPoint={pinAccessPoint}
              canSetTakeOut={
                Boolean(planner.putIn) &&
                pinAccessPoint != null &&
                pinAccessPoint.riverMile > (planner.putIn?.riverMile ?? Infinity)
              }
              riverHasGauges={riverHasGauges}
              onSetPutIn={() => {
                if (!pinAccessPoint) return;
                planner.choosePutIn(pinAccessPoint);
                setSelectedPin(null);
                setPlanOpen(true);
              }}
              onSetTakeOut={() => {
                if (!pinAccessPoint) return;
                planner.chooseTakeOut(pinAccessPoint);
                setSelectedPin(null);
                setPlanOpen(true);
              }}
              onOpenRiver={(slug) => router.push(`/river/${slug}`)}
              onOpenGauge={onOpenGauge}
              onOpenDam={onOpenDam}
              onOpenDetail={(route) => router.push(asHref(route))}
              // ── BACK NAMES WHERE × ALREADY GOES ──────────────────────────
              // Both pop one level, and that is the point rather than an
              // oversight: × is a 19pt glyph in a corner that names nothing,
              // and "‹ Meramec River" is a 44pt target that says where it
              // lands. The original complaint was that the icon communicated
              // dismissal rather than Back — a labelled control beside it is
              // the answer to that, not a second behaviour.
              //
              // Shown only when a river sheet was genuinely on screen before
              // this pin. See revealsRiverSheet for the case that is not true
              // despite a river being selected.
              onBack={
                revealsRiverSheet && riverSheetData
                  ? () => {
                      setSelectedPin(null);
                    }
                  : null
              }
              backLabel={revealsRiverSheet ? riverSheetData?.name ?? null : null}
              // ── × GOES WHERE BACK GOES ───────────────────────────────────
              // One glyph, one meaning: it lands on whatever was on screen
              // before this pin. When that is a river sheet, Back is drawn
              // beside it naming the same destination and both pop one level.
              // When there is no Back — because no river sheet was ever open —
              // the only thing under the pin is a selection the pin's OWN tap
              // made, and × takes that with it rather than leaving the reader a
              // second sheet to close. See dismissPin.
              //
              // A river the reader chose is still never destroyed by dismissing
              // a pin; that case has a Back control and pops one level.
              //
              // Dismissal is not navigation. The native camera stays exactly
              // where the reader left it; no old target or bounds can wake up.
              onClose={dismissPin}
              starred={pinGauge ? isStarred('gauge', pinGauge.id) : false}
              onToggleStar={
                pinGauge
                  ? () =>
                      toggleStar({
                        kind: 'gauge',
                        entityId: pinGauge.id,
                        name: pinGauge.name,
                        // The river it is PRIMARY for, which is where a starred
                        // gauge taps through to. Empty when it rates none.
                        slug:
                          pinGauge.thresholds?.find((link) => link.isPrimary)?.riverSlug ?? '',
                        usgsSiteId: pinGauge.usgsSiteId,
                        provider: pinGauge.provider,
                      })
                  : null
              }
              onPlanTo={(nearby) => {
                if (pinAccessPoint) onPlanToNearby(nearby, pinAccessPoint);
              }}
              nearbyMarks={nearbyAccessMarks}
              width={windowWidth}
              onDetentChange={onSheetDetentChange}
              metrics={sheetMetrics}
            />
        ) : null}
      </View>

      {riversError ? (
        <Text style={[styles.errorText, { color: colors.error }]} numberOfLines={2}>
          {riversError}
        </Text>
      ) : null}

      <MapLayersSheet
        visible={layersOpen}
        onClose={() => setLayersOpen(false)}
        active={layers}
        onToggle={toggleLayer}
        onReset={resetLayers}
        counts={layerCounts}
        // Gauge filtering lives under the layer it refines, not behind a third
        // button on the map. Rendered only while the layer is ON, because
        // chips that narrow a layer nobody is drawing narrow nothing.
        // ── ONE REFINEMENT, AND NOTHING ELSE ────────────────────────
        // This slot used to carry four kinds of muted sentence as well:
        // where a row's places went when a neighbour owned their mark, how
        // much of the services directory has a confirmed location, that radar
        // needs a connection, and the public-land caveat. Every one was true
        // and every one was on the wrong surface — a reader in a "Show on
        // map" sheet is choosing what to draw, and each sentence competed
        // with the switch beside it while pushing the rows below it further
        // off a phone screen.
        //
        // The caveat and both attributions are LayerDef.info now, behind the
        // row's ⓘ. The coverage and overlap lines are gone outright: the
        // count beside a row already counts only what that row can draw — the
        // resolver drops services with no coordinates before counting — so a
        // sentence explaining the shortfall was explaining one the number
        // does not have.
        //
        // What is left is the one thing here that was never prose: a control
        // that narrows the layer it hangs under.
        renderLayerDetail={(key, on) => {
          // The camera, not the switch, is why this layer is empty — say so
          // where the switch is, exactly as the gauge tier's own belowMinZoom
          // hint does. Parcels need a river to be read against, and the
          // opening statewide view sits below the layer's z7 floor.
          if (key === 'publicLand' && on && publicLands.belowMinZoom) {
            return <LayerZoomHint text="Zoom in to see public land boundaries." />;
          }
          return key === 'allGauges' && on ? (
            <GaugeFilterBar
              // The DRAWABLE set, not the raw response — see layerGauges. Every
              // count in the strip is a count of pins you can actually see.
              gauges={layerGauges}
              active={gaugeFilter}
              belowMinZoom={referenceGauges.belowMinZoom}
              capped={referenceGauges.capped}
              total={referenceGauges.total}
              onToggle={(k) =>
                setGaugeFilter((prev) => {
                  const next = new Set(prev);
                  if (next.has(k)) next.delete(k);
                  else next.add(k);
                  return next;
                })
              }
              onClear={() => setGaugeFilter(new Set())}
            />
          ) : null;
        }}
      />

      {/* The plan flow is deliberately a sibling of the map rather than a child
          of the button that opens it: the plan outlives the sheet, and the map
          keeps drawing the route after this closes. */}
      <PlanSheet
        visible={planOpen}
        onClose={() => setPlanOpen(false)}
        rivers={plannerRivers}
        river={selected}
        riverDistances={plannerDistances}
        // Picking a river here frames it, same as tapping its line on the map.
        // This used to rely on RiverMap's bounds chain noticing the selection
        // had changed, so when framing became a command it silently stopped
        // moving the map at all — the reader chose a river and the map stayed
        // on wherever they had been.
        onSelectRiver={(river) => {
          setSelectedPin(null);
          selectRiver(river.slug, { camera: 'fitRiver' });
        }}
        onClearRiver={() => {
          planner.reset();
          selectRiver(null, { camera: 'hold' });
          setPlannerAccess(null);
          setSelectedPin(null);
        }}
        riverLoading={Boolean(selectedSlug) && plannerAccess?.slug !== selectedSlug}
        state={planner}
        // Passed, never requested from inside the sheet. The locate button on
        // the map is the one place that spends the permission prompt.
        userCoords={location.coords}
      />

    </SafeAreaView>
  );
}

/**
 * The honest empty state. Expo Go genuinely cannot load a native map, and saying
 * so beats an infinite spinner that looks like a network problem.
 */
function MapUnavailable({ reason }: { reason: 'expo-go' | 'missing-token' | 'load-failed' }) {
  const { colors } = useTheme();
  // The body is what the person holding the phone can act on; `dev` is the
  // diagnostic that used to BE the body. A build variable or an eas flag on a
  // full-screen state is a bug report addressed to the wrong person, so it is
  // gated to __DEV__ — which is true in Expo Go and in a dev build, the only
  // two places anyone can act on it.
  const copy = {
    'expo-go': {
      title: 'Map needs a full build',
      body: 'The map uses a native module this build cannot load. The other tabs work here.',
      dev: 'Expo Go cannot load the Mapbox native module. Run: eas build --profile development',
    },
    'missing-token': {
      title: 'Map unavailable',
      body: 'The map cannot start. Conditions, alerts and float plans still work.',
      dev: 'Set EXPO_PUBLIC_MAPBOX_TOKEN to a Mapbox public token and rebuild.',
    },
    'load-failed': {
      title: 'Map failed to load',
      body: 'The map could not start. The other tabs work here.',
      dev: null,
    },
  }[reason];

  return (
    <View style={styles.centered}>
      <Otter mood="flag" size={110} />
      <Text style={[styles.unavailableTitle, { color: colors.text }]}>{copy.title}</Text>
      <Text style={[styles.unavailableBody, { color: colors.textMuted }]}>{copy.body}</Text>
      {__DEV__ && copy.dev ? (
        <Text style={[styles.unavailableBody, { color: colors.textSubtle }]}>{copy.dev}</Text>
      ) : null}
    </View>
  );
}

// ── 14pt is the floor on this screen ────────────────────────────────────────
//
// Everything the callout and the map chrome say used to be 12 (`t.xs`), which
// is the badges-and-timestamps size and is correct almost everywhere else in
// the app. It is not correct here. This is the one screen read outdoors, at
// arm's length, through glass at 0.95 opacity sitting over a bright hillshade,
// often by somebody who has just put their reading glasses in a dry bag.
//
// So the callout's text runs at `t.sm` and hierarchy is carried by WEIGHT and
// INK instead of size — the type chips are still quiet, they are quiet at 14.
// The scale has no 13; adding one for a single screen would fork the type
// system away from DESIGN.md §3, which is a worse trade than one step up.
const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12 },
  title: { ...t['3xl'], fontFamily: fonts.display },
  // The name and the clear button, as one line. `space-between` rather than a
  // gap so the × sits at the right margin instead of trailing the name, which
  // is what keeps it in the same place on "Big River" and "North Fork of the
  // White River" alike.
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 4,
  },
  // flexShrink, so a long river name gives way to the × rather than pushing it
  // off the right edge — the one control on this row that must always be there.
  headerMetaMain: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 },
  dot: { width: 9, height: 9, borderRadius: 999 },
  headerMetaText: { ...t.sm, fontFamily: fonts.body, flexShrink: 1 },
  searchRow: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  // Above the map rather than over it, and one line tall. It is displacing the
  // map by ~30pt, not the ~100pt the filter strip used to, and only in the
  // state where the map has less to say than usual anyway.
  readingsNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  readingsNoticeText: { ...t.sm, fontFamily: fonts.body, flexShrink: 1 },
  mapArea: { flex: 1, overflow: 'hidden' },
  resultsOverlay: { position: 'absolute', top: 10, left: 16, right: 16 },
  // Top-centre: clear of the layers button on the right and of nothing on the
  // left, and gone again the moment the river lands.
  loadingPillWrap: { position: 'absolute', top: 16, left: 0, right: 0, alignItems: 'center' },
  loadingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    maxWidth: '70%',
  },
  loadingPillText: { ...t.sm, fontFamily: fonts.semibold },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  unavailableTitle: { ...t.lg, fontFamily: fonts.semibold, marginTop: 10 },
  unavailableBody: { ...t.sm, fontFamily: fonts.body, textAlign: 'center', marginTop: 8 },
  // Bottom-anchored column. MAP_CHROME_BOTTOM clears the Mapbox ornaments,
  // which are a legal obligation and now sit at the map's bottom edge.
  bottomStack: { position: 'absolute', left: 0, right: 0, bottom: MAP_CHROME_BOTTOM, gap: 12 },
  // flex-end, not center. Locate is alone in this row now, but the row is still
  // the bottom edge of a column that grows upward from MAP_CHROME_BOTTOM, and
  // anything added beside the button must sit on the same baseline rather than
  // pushing it off one.
  controlRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    gap: 12,
  },
  // Hard into the corner. 16/12 rather than MAP_CHROME_BOTTOM because the
  // Mapbox ornaments run along the map's bottom LEFT and end around x=149 —
  // there is nothing on the right for this to clear.
  //
  // ANCHORED ON BOTH EDGES, which is the fix for a truncated "Plan a float".
  // With only `right` set this row was content-sized, and the button's
  // `maxWidth: '55%'` then resolved a percentage against a parent whose width
  // was itself being derived from that button — a circular measurement Yoga
  // settles by clamping the child to far less than 55% of anything. The label
  // came out as "Plan a f…" on a button with most of a screen beside it.
  // A definite width gives the percentage something real to be a percentage OF;
  // `flex-end` keeps the cluster in the corner it was already in, and
  // box-none means the band it now spans stays transparent to touches.
  planCluster: {
    position: 'absolute',
    left: 16,
    right: 12,
    bottom: PLAN_CLUSTER_BOTTOM,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  // 44pt, same as locate: it is a destructive action and must not be a
  // near-miss for the plan button it sits beside.
  clearPlanButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  calloutWrap: { paddingHorizontal: 16 },
  planButton: {
    flexDirection: 'row',
    // 55% OF THE CLUSTER, which is now a real width — see planCluster. Right-
    // aligned at bottom:16 this shares a row with the Mapbox wordmark and the
    // (i), which together run from x=12 to about x=149; on the narrowest phone
    // we support, 55% still starts to the right of that, and 62% did not.
    //
    // A ceiling, not a size: the button shrinks to its content, so the plain
    // "Plan a float" label sits well inside it and only a long distance-and-
    // time label ever reaches the cap.
    maxWidth: '55%',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
  },
  planButtonText: { ...t.sm, fontFamily: fonts.heading },
  // Left of the plan button and the same height, so the two read as one row of
  // map controls rather than two unrelated floating things.
  // Directly under the layers button (44 + 16 gap + its own 16 top inset).
  locateButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: { ...t.sm, fontFamily: fonts.body, paddingHorizontal: 20, paddingTop: 8 },
});
