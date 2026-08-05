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
  DamSnapshot,
  MapGauge,
  RiverListItem,
  RiverService,
  SearchResult,
} from '@eddy/types';
import { hasCoordinates, isCampground, PUBLIC_LAND_OWNERSHIP_NOTE } from '@eddy/types';
import {
  formatFloatTimeCeilingCompact,
  formatFloatTimeCompact,
} from '@eddy/conditions/float-time-format';
import {
  ApiError,
  fetchGauges,
  fetchDams,
  fetchHazards,
  fetchRiverAccessPoints,
  fetchServices,
  fetchRivers,
} from '@/api/client';
import { conditionColor, conditionLabel, floatableRank } from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { mapAccessPointPin, RiverMap, type MapPin } from '@/map/RiverMap';
import { mapUnavailableReason } from '@/map/runtime';
import {
  drawnAsAccessPoint,
  OUTFITTER_SERVICE_TYPES,
  PUBLIC_LAND_ATTRIBUTION,
  RADAR_ATTRIBUTION,
  type LayerKey,
} from '@/map/layers';
import { useViewportGauges, type Viewport } from '@/hooks/useViewportGauges';
import { useNetworkPlaces } from '@/hooks/useNetworkPlaces';
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
import { warn } from '@/lib/monitoring';
import { useFocusEffect, useRouter } from 'expo-router';
import { asHref } from '@/lib/href';
import { Otter } from '@/components/Otter';
import { SearchBar } from '@/components/SearchBar';
import { SearchResultsList } from '@/components/SearchResultsList';
import {
  LayerNote,
  MapLayersButton,
  MapLayersSheet,
  isDefaultLayers,
} from '@/components/MapLayersSheet';
import { defaultMapLayers, readMapLayers, writeMapLayers } from '@/lib/mapPreferences';
import {
  GaugeFilterBar,
  applyGaugeFilters,
  type GaugeFilterKey,
} from '@/components/GaugeFilterBar';
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
 * A camera target, tagged with the river it belongs to.
 *
 * `slug` is nullable because the map now opens with no river selected, and
 * "show me where I am" is if anything MORE useful in that state. Tagging it
 * null rather than '' matters: activeFocus compares this against selectedSlug,
 * and an empty string would never equal a null selection, which quietly turned
 * the locate button into a no-op on the opening screen.
 */
interface Focus {
  slug: string | null;
  lng: number;
  lat: number;
  /** Omitted for pin/search focus, which wants the map's default close zoom. */
  zoom?: number;
}

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
  // Null rather than [] until fetched, so the layers sheet can tell "this river
  // has none" from "we have not asked yet" and only claims a zero it knows.
  const [hazards, setHazards] = useState<RiverScoped<Hazard> | null>(null);
  // Null until the layer has been switched on, so the sheet can tell "not fetched"
  // from "none" — see layerCounts.
  const [dams, setDams] = useState<DamSnapshot[] | null>(null);
  // Statewide and unscoped, unlike hazards above: every service Eddy can place
  // on a map, fetched once. Null until then, so the layers sheet can tell "not
  // asked" from "none" — see layerCounts.
  const [services, setServices] = useState<RiverService[] | null>(null);
  const [gauges, setGauges] = useState<MapGauge[] | null>(null);
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
  useEffect(() => {
    let cancelled = false;
    void readMapLayers().then((stored) => {
      if (cancelled || layersRestored.current) return;
      layersRestored.current = true;
      // Null means this device has never chosen. An EMPTY ARRAY is a choice —
      // somebody switched everything off — and is restored as one.
      if (stored) setLayers(stored);
    });
    return () => {
      cancelled = true;
    };
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
  const [focus, setFocus] = useState<Focus | null>(null);
  // The camera, as of the last time it stopped moving. Only the national gauge
  // layer reads it — everything else on this screen loads a bounded set up front.
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);
  // Search results arrive before the selected river's access-point response.
  // Keep the identity across that fetch so choosing a result can finish by
  // opening its callout rather than merely dropping the camera nearby.
  const pendingAccessSelection = useRef<{
    id: string;
    riverSlug: string;
  } | null>(null);
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
    if (pendingAccessSelection.current?.riverSlug !== slug) setSelectedPin(null);

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
          if (point) setSelectedPin(mapAccessPointPin(point, slug));
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
    for (const point of accessPoints) byId.set(point.id, { point, riverSlug: drawnSlug });
    return [...byId.values()];
  }, [networkPlaces.accessPoints, accessPoints, drawnSlug]);

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
  // Nothing below is requested until its layer is on. Hazards and services are
  // per-river and cheap; gauges are one flat list for the whole state, which is
  // why the request is fired once and reused by search.
  const wantsGauges = layers.includes('gauges');
  const gaugesRequested = useRef(false);

  const ensureGauges = useCallback(() => {
    if (gaugesRequested.current) return;
    gaugesRequested.current = true;
    // Deliberately un-aborted and un-erroring: this is a background enrichment
    // for search and a map layer, and a failure means "no gauges", not a
    // message. Retrying is one more tap in the layers sheet.
    const startedAt = Date.now();
    fetchGauges()
      .then((loaded) => {
        const durationMs = Date.now() - startedAt;
        if (__DEV__) {
          console.info('[map] curated gauges loaded', {
            durationMs,
            returned: loaded.length,
          });
        }
        if (durationMs >= 2000) {
          warn('map', 'curated gauge load was slow', {
            durationMs,
            returned: loaded.length,
          });
        }
        setGauges(loaded);
      })
      .catch(() => setGauges([]));
  }, []);

  useEffect(() => {
    if (wantsGauges) ensureGauges();
  }, [wantsGauges, ensureGauges]);

  /**
   * Every USACE project, fetched once on first enable and kept.
   *
   * NOT river-scoped, which is the structural difference from services below:
   * those are "what is on THIS river" and re-fetch when the selection changes,
   * while the dam set is fixed and regional. Most of these dams have no Eddy
   * river at all — more so since the Tulsa district projects were added, which
   * put dams in Oklahoma and Texas where Eddy carries no rivers at all — so
   * scoping them to a selection would hide the majority of the layer behind a
   * river that does not exist.
   *
   * fetchDams already answers [] on failure, so there is no error branch: a
   * layer that draws nothing is the honest outcome of a feed being down.
   */
  const wantsDams = layers.includes('dams');
  const damsRequested = useRef(false);
  useEffect(() => {
    if (!wantsDams || damsRequested.current) return;
    damsRequested.current = true;
    void fetchDams().then(setDams);
  }, [wantsDams]);

  /**
   * The selected river's hazards, LIVE, over the statewide set from disk.
   *
   * The layer no longer depends on this — every hazard Eddy has is already
   * drawn from the launch bundle — so what this adds is freshness for the one
   * river somebody is looking at. Kept rather than dropped because it is a
   * safety layer: a hazard added since the last bundle should not wait for a
   * relaunch on the river being planned right now.
   */
  const wantsHazards = layers.includes('hazards');
  useEffect(() => {
    if (!wantsHazards || !selectedSlug) return;
    const slug = selectedSlug;
    const controller = new AbortController();
    fetchHazards(slug, controller.signal)
      .then((items) => setHazards({ slug, items }))
      .catch(() => {
        // Neither a cancelled request NOR a failed one is "this river has no
        // hazards". Leaving the state null is what the layers sheet already
        // reads as "not asked" — see the RiverScoped docblock above, which
        // calls publishing a count for unfetched hazards "the one thing a
        // count must never do". Writing [] here did exactly that, and on the
        // safety surface: a river with a low-water dam on it reported
        // "Hazards 0" whenever the endpoint was down.
      });
    return () => controller.abort();
  }, [wantsHazards, selectedSlug]);

  /**
   * Every placed service in the state, fetched once when a layer wants them.
   *
   * Was per-river and re-fetched on every selection, which made both layers
   * empty until a river was chosen and then two or three pins deep. One
   * statewide request draws all of them — 25 in total, because 129 of the 154
   * services on file have no coordinates and cannot be drawn by anyone. See
   * /api/services, which says the same thing from the other end.
   *
   * A ref rather than a slug guard: the set is fixed and statewide, so once it
   * has been asked for there is nothing a change of selection could add.
   * fetchServices already answers [] on failure, so there is no error branch.
   */
  const wantsServices = layers.includes('campgrounds') || layers.includes('outfitters');
  const servicesRequested = useRef(false);
  useEffect(() => {
    if (!wantsServices || servicesRequested.current) return;
    servicesRequested.current = true;
    void fetchServices().then(setServices);
  }, [wantsServices]);

  // ── Search ──────────────────────────────────────────────────────
  // No `kinds`: this field is unscoped and wants all three. Naming them would
  // be identical — parseKinds() treats an absent list as every kind — so the
  // omission is the honest spelling of "everything".
  const search = useEddySearch({ rivers, gauges });

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
        setSelectedPin(mapAccessPointPin(known.point, known.riverSlug ?? result.riverSlug));
      }
      // Set in BOTH cases, and that is load-bearing. Choosing a result switches
      // the river below, and the selection effect drops the open callout on a
      // river change unless this says the callout is the reason for it. Without
      // it the pin we just set would be cleared one render later — which is the
      // shape of the bug the statewide layer would otherwise have introduced
      // into search. When the point was not already held, this is also what
      // opens it once the river's own response lands.
      pendingAccessSelection.current = { id: result.id, riverSlug: result.riverSlug };
    } else {
      pendingAccessSelection.current = null;
    }

    if (result.riverSlug) setPickedSlug(result.riverSlug);

    // A gauge or an access point is a POINT, so the camera goes to it rather
    // than refitting the whole river — otherwise choosing "Cedar Grove Access"
    // and watching the map fit ninety miles of Current River is indistinguish-
    // able from nothing happening.
    //
    // COORDINATES ARE THE ONLY REQUIREMENT. This used to demand a riverSlug as
    // well, which silently excluded the entire national tier: an uncurated USGS
    // station has no river_gauges row, so its slug is null — while /api/search
    // has returned st_x/st_y for it since 00196. Choosing "Bush Kill at
    // Shoemakers" cleared the field and moved nothing, which is indistinguish-
    // able from a broken search box.
    //
    // The slug is a TAG, not a precondition: it says which river's camera rules
    // this target belongs to, and null means "no river's" — see activeFocus,
    // which lets an untagged focus through unconditionally.
    if (result.coordinates) {
      setFocus({
        slug: result.riverSlug ?? null,
        lng: result.coordinates.lng,
        lat: result.coordinates.lat,
      });
    } else {
      setFocus(null);
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
      setLayers((prev) => (prev.includes(layer) ? prev : [...prev, layer]));
    } else if (result.kind === 'access_point') {
      setLayers((prev) => (prev.includes('access') ? prev : [...prev, 'access']));
    }
  }, [drawnAccessPoints, clearSearch]);

  // ── Float plan ──────────────────────────────────────────────────
  const plannerAccessPoints =
    plannerAccess?.slug === selectedSlug ? plannerAccess.items : [];
  // Planning needs a river ID and ordered access points, not the river's heavy
  // full-resolution geometry. RiverListItem already carries that ID, so the
  // planner becomes usable as soon as cached access points arrive.
  const planner = useFloatPlan(selected?.id ?? null, plannerAccessPoints);

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
   * Which access points on the river you can sleep at.
   *
   * The detail response names a put-in's neighbours but does not say what they
   * ARE, and this screen already holds every access point with its types — so
   * it is the only place that can answer "can I camp at the take-out" without
   * a second request per neighbour.
   */
  const campableAccessIds = useMemo(
    () =>
      new Set(
        drawnAccessPoints.filter((entry) => isCampground(entry.point)).map((entry) => entry.point.id),
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
      gauges,
      accesses: drawnAccessPoints
        .filter((entry) => (entry.riverSlug ?? drawnSlug) === selectedSlug)
        .map((entry) => entry.point),
      hazards: drawnHazards.filter((hazard) => hazard.riverId === river.id),
    };
  }, [
    selectedSlug,
    network.bySlug,
    network.readings,
    drawnAccessPoints,
    drawnHazards,
    drawnSlug,
    gaugeNameFor,
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
      const downstream = nearby.direction === 'downstream';
      planner.choosePutIn(downstream ? from : other);
      planner.chooseTakeOut(downstream ? other : from);
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
    () =>
      visibleReferenceGauges.map((g) => {
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
      }),
    [visibleReferenceGauges],
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
   */
  const damPins = useMemo<MapPin[]>(
    () =>
      (dams ?? []).map((dam) => {
        const release = dam.metrics.release;
        return {
          id: `dam:${dam.id}`,
          name: dam.name,
          layer: 'dams' as LayerKey,
          subtitle: [dam.lakeName, dam.state].filter(Boolean).join(' · ') || null,
          coordinates: { lng: dam.lon, lat: dam.lat },
          ...(dam.generating !== null
            ? { codeLabel: dam.generating ? 'Generating' : 'Units idle' }
            : {}),
          value: release
            ? `${Math.round(release.value).toLocaleString()} cfs${release.dailyMean ? ' (daily avg)' : ''}`
            : null,
          updatedAt: release ? relativeAge(release.at) : null,
          // The dam screen, never the gauge screen — see MapPin.damId.
          damId: dam.id,
          riverSlug: dam.tailwater?.riverSlug ?? null,
        };
      }),
    [dams],
  );

  /**
   * How many of each thing we hold, for the layers sheet.
   *
   * `undefined` is load-bearing: it means the layer has never been fetched, and
   * the sheet renders no number at all rather than a zero it cannot stand behind.
   * The campground and outfitter tallies mirror RiverMap's own filtering,
   * including dropping services with no geocode — a count that includes pins the
   * map cannot draw is a count that makes the map look broken.
   */
  const layerCounts = useMemo<Partial<Record<LayerKey, number>>>(() => {
    // The endpoint already drops services with no geocode, and this filters
    // again rather than trusting it: a count that includes pins the map cannot
    // draw is a count that makes the map look broken.
    const placed = services?.filter((s) => s.latitude != null && s.longitude != null) ?? null;
    return {
      // Statewide now, and counted from what is actually drawn. It used to be
      // river-scoped and `undefined` until a river was chosen, which was the
      // honest reading of a layer that genuinely held nothing until then; the
      // layer holds every river's put-ins from launch, so the sheet can report
      // a real number on the opening screen. Still `undefined` while empty —
      // that is the bundle not having landed, not a state with no landings.
      //
      // MINUS THE CAMPGROUNDS, but only while the Campgrounds row has them.
      // The two rows partition the put-ins between them when both are on (see
      // campgroundPins in RiverMap), and a sheet whose two counts add up to
      // more pins than the map draws is a sheet arguing with the map.
      access:
        drawnAccessPoints.length > 0
          ? layers.includes('campgrounds')
            ? drawnAccessPoints.filter((entry) => !isCampground(entry.point)).length
            : drawnAccessPoints.length
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
      // A COUNT OF PINS, which is the only thing a count beside a switch can
      // honestly be. Both halves mirror RiverMap's campgrounds branch exactly:
      // every drawn put-in tagged `campground`, plus the campground services
      // that are not already one of them. Adding the two raw totals double-
      // counted every place that exists in both tables — which after the
      // coordinate correction is every one of them that ever mattered, since
      // the duplicates used to be miles apart and now sit on top of each other.
      campgrounds: placed
        ? (() => {
            const camps = drawnAccessPoints.filter((entry) => isCampground(entry.point));
            const points = camps.map((entry) => entry.point);
            return (
              camps.length +
              placed.filter((s) => s.type === 'campground' && !drawnAsAccessPoint(s, points))
                .length
            );
          })()
        : undefined,
      outfitters: placed?.filter((s) => OUTFITTER_SERVICE_TYPES.includes(s.type)).length,
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
    drawnAccessPoints,
    drawnHazards,
    gauges,
    mappableGauges,
    dams,
    services,
    layers,
    referenceGauges.belowMinZoom,
    referenceGauges.loading,
    referencePins,
    publicLands.belowMinZoom,
    publicLands.loading,
    publicLands.features,
  ]);

  const conditionCode = drawn?.currentCondition?.code ?? 'unknown';

  /**
   * The header line's river, WHICH IS NOT ALWAYS THE RIVER LIST'S.
   *
   * `selected` is a lookup into /api/rivers, and that request is the one thing
   * on this screen with nothing on disk behind it. Open the app with no signal,
   * tap a river on the map, and the line goes heavy and the camera fits to it
   * while `selected` stays null — so a header gated on `selected` disappeared
   * exactly when a selection was hardest to undo, taking the only way out of it
   * with it.
   *
   * The statewide network is the fallback because it is the same source the map
   * is DRAWING from: it comes off disk, it holds every river's name, and its
   * per-river verdict is the colour already under the finger that tapped. Where
   * both exist the river list wins, so the header cannot disagree with the
   * Today tab over a river both can see.
   */
  const networkRiver = selectedSlug ? network.bySlug.get(selectedSlug) : undefined;
  const headerName = selected?.name ?? networkRiver?.name ?? null;
  const headerCode =
    selected?.currentCondition?.code ??
    network.collection.features.find((feature) => feature.properties.slug === selectedSlug)
      ?.properties.code ??
    'unknown';
  // A focus applies when it is tagged with the river on screen, OR when it is
  // tagged with no river at all.
  //
  // The tag exists so a camera target computed for one river cannot survive into
  // the next — pick an access point on the Current, switch to the Meramec, and
  // the stale target must not fire. An UNTAGGED focus makes no claim about a
  // river, so there is nothing for it to be stale against: it is a coordinate
  // somebody just chose. Requiring `null === selectedSlug` made two things
  // no-ops the moment any river was selected — the locate button, and every
  // national-tier gauge picked out of search.
  const activeFocus = focus && (focus.slug === null || focus.slug === selectedSlug) ? focus : null;

  // ── Where the map opens ────────────────────────────────────────────────────
  // Nothing selected, so: the user's own position if location was ALREADY
  // granted on a previous run (useLocation resolves that without prompting),
  // otherwise the whole network. Never a river nobody picked.
  //
  // Only while no river is selected and no focus is set — after that the
  // ordinary camera rules take over, and re-centring on the user mid-plan would
  // yank the map out from under them.
  const openingFocus: Focus | null =
    !selectedSlug && !activeFocus && location.coords
      ? {
          slug: null,
          lng: location.coords.lng,
          lat: location.coords.lat,
          // Regional, not local. The question this answers is "which rivers are
          // near me", and that is unanswerable at street zoom.
          zoom: 8.5,
        }
      : null;

  /**
   * Leave the camera exactly where it is.
   *
   * ── The bug this is the fix for ────────────────────────────────────────────
   *
   * Closing a river — or closing a pin's callout with no river selected — set
   * `focus` to null, and null is not "stay". It is "I have no opinion", and two
   * things downstream do have one. `openingFocus` becomes live again the moment
   * nothing is selected and no focus is set, so putting a river down flew the
   * map back to the user's own position at zoom 8.5; and with location denied
   * the camera fell through to the network bounds and snapped to the whole
   * state instead. Either way the answer to "close this" was "and here is
   * somewhere else", after the user had panned to exactly where they wanted.
   *
   * A focus on the current centre is a flyTo to where the camera already is,
   * which is no movement at all, and being non-null is what keeps the two
   * fallbacks above from claiming the camera. Tagged `slug: null` so it makes no
   * claim about a river and cannot go stale against one — see activeFocus.
   *
   * Returns null before the first onMapIdle, when there is no viewport to hold.
   * The caller then falls back to the old behaviour, which is the right thing on
   * a camera that has not settled anywhere yet.
   */
  const heldCamera = useCallback((): Focus | null => {
    if (!viewport) return null;
    const [west, south, east, north] = viewport.bounds;
    return {
      slug: null,
      lng: (west + east) / 2,
      lat: (south + north) / 2,
      zoom: viewport.zoom,
    };
  }, [viewport]);

  // Tapping a river on the network selects it, which is the whole point of
  // drawing it: the map is now a way of CHOOSING a river, not just of looking
  // at one you already chose. Any open callout belongs to the old river.
  //
  // Focus IS cleared here, unlike the two below: choosing a river is a request
  // to be shown it, and RiverMap's bounds chain framing the new selection is
  // the whole answer.
  const onSelectNetworkRiver = useCallback((slug: string) => {
    setPickedSlug(slug);
    setSelectedPin(null);
    pendingAccessSelection.current = null;
    setFocus(null);
  }, []);

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
   * whatever the user was actually looking at. See heldCamera.
   */
  const clearRiver = useCallback(() => {
    setPickedSlug(null);
    setSelectedPin(null);
    pendingAccessSelection.current = null;
    setFocus(heldCamera());
  }, [heldCamera]);

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
    if (coords) setFocus({ slug: selectedSlug, lng: coords.lng, lat: coords.lat });
  }, [location, selectedSlug]);

  const pinAccess = accessPointForPin(selectedPin);
  const pinAccessPoint = pinAccess?.point ?? null;

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
      if (entry?.riverSlug && entry.riverSlug !== selectedSlug) {
        pendingAccessSelection.current = { id: entry.point.id, riverSlug: entry.riverSlug };
        setPickedSlug(entry.riverSlug);
        setFocus({
          slug: entry.riverSlug,
          lng: pin.coordinates.lng,
          lat: pin.coordinates.lat,
          // Hold the zoom. Falling through to the focus default of 13 would fly
          // in from a statewide view for somebody who only asked what a dot was.
          zoom: viewport?.zoom,
        });
      } else {
        // ── THE CAMERA STAYS for a pin on the river already shown ──────────
        // Deliberate, and the thing that makes browsing nearby pins feel
        // continuous: the map holds still and only the sheet changes, dropping
        // back to its glance for the new selection. Re-framing on every tap
        // would fly the map a short distance for each dot you were comparing.
        //
        // What keeps that pin out from under the sheet is camera PADDING —
        // see cameraPaddingBottom on RiverMap — rather than a new centre.
        pendingAccessSelection.current = null;
      }
      setSelectedPin(pin);
    },
    [accessPointForPin, selectedSlug, viewport?.zoom],
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
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Map</Text>
        {/* ── The selected river, and the way back out of it ────────────
            Selecting a river is one tap — a line, a put-in, a search result —
            and until now there was NO gesture that undid it. The map fits to
            that river's extent, its line is drawn heavier, the planner is
            scoped to it, and the only exits anyone found were killing the app
            or picking a different river, which is not the same thing as asking
            for the whole network back.

            So the header line is two controls rather than one: the name opens
            the river, the × puts it down. Split rather than made a toggle
            because they are opposite intentions and a single target that
            sometimes navigates and sometimes clears is a target nobody can
            aim. */}
        {selectedSlug && headerName ? (
          <View style={styles.headerMeta}>
            <Pressable
              onPress={() => router.push(`/river/${selectedSlug}`)}
              style={styles.headerMetaMain}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${headerName} details`}
            >
              <View style={[styles.dot, { backgroundColor: conditionColor(headerCode) }]} />
              <Text style={[styles.headerMetaText, { color: colors.textMuted }]} numberOfLines={1}>
                {headerName} · {conditionLabel(headerCode)}
              </Text>
              <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
            </Pressable>
            <Pressable
              onPress={clearRiver}
              // hitSlop rather than padding: this row is one line tall by
              // design and a 44pt box would push the map down by the height of
              // the thing it is clearing.
              hitSlop={14}
              accessibilityRole="button"
              accessibilityLabel={`Clear ${headerName} and show every river`}
            >
              <Ionicons name="close-circle" size={19} color={colors.textSubtle} />
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.searchRow}>
        <SearchBar
          value={search.query}
          onChangeText={search.setQuery}
          placeholder="Search rivers, gauges and access points"
          // Gauges are matched locally, so the list has to exist before the
          // first keystroke rather than after the first gauge query.
          onFocus={ensureGauges}
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
            conditionCode={conditionCode}
            network={network.collection}
            networkBounds={network.bounds}
            onSelectRiverSlug={onSelectNetworkRiver}
            accessPoints={drawnAccessPoints}
            gauges={mappableGauges}
            referenceGauges={referencePins}
            publicLands={publicLands.features}
            dams={damPins}
            onViewportChange={setViewport}
            onZoomToCluster={(point) =>
              setFocus({
                slug: null,
                lng: point.lng,
                lat: point.lat,
                // Two levels in reliably splits a cluster at clusterRadius 50.
                zoom: Math.min(16, (viewport?.zoom ?? 10) + 2),
              })
            }
            hazards={drawnHazards}
            services={services ?? []}
            layers={layers}
            focus={activeFocus ?? openingFocus}
            // `locateAsked` first: the puck is a native location consumer of
            // its own, so it waits for an explicit ask rather than for a status
            // that can arrive on its own. See the state's declaration.
            showUserLocation={locateAsked && location.status === 'ready' && isFocused}
            planRoute={planner.plan?.route?.geometry ?? null}
            planEndpoints={
              planner.plan ? { putIn: planner.plan.putIn, takeOut: planner.plan.takeOut } : null
            }
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
              emptyMessage="Nothing matched. Try a river, a gauge or an access point."
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
            changed={!isDefaultLayers(layers)}
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
          style={[styles.bottomStack, sheetOpen ? controlsStyle : null]}
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
            long label back over the ornaments. */}
        {sheetOpen && sheet.detent === 'full' ? null : (
        <Animated.View
          style={[styles.planCluster, sheetOpen ? controlsStyle : null]}
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
              onSelectAccess={(point) => {
                const entry = drawnAccessPoints.find((e) => e.point.id === point.id);
                onSelectPin(mapAccessPointPin(point, entry?.riverSlug ?? riverSheetData.slug));
              }}
              onPlanPair={(putIn, takeOut) => {
                planner.choosePutIn(putIn);
                planner.chooseTakeOut(takeOut);
                setPlanOpen(true);
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
              // Closing a callout drops the pin's camera override without
              // handing the camera to anything else. It used to null the
              // focus, which on a map with no river selected woke the opening
              // focus and flew you to your own position for having shut a
              // gauge bubble. See heldCamera.
              onClose={() => {
                setSelectedPin(null);
                setFocus(heldCamera());
              }}
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
                      })
                  : null
              }
              onPlanTo={(nearby) => {
                if (pinAccessPoint) onPlanToNearby(nearby, pinAccessPoint);
              }}
              campableIds={campableAccessIds}
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
        renderLayerDetail={(key, on) => {
          // ── The one layer a downloaded river cannot carry ──────────────
          // Radar streams PNGs from a third party. An offline pack holds the
          // basemap and our own geometry and nothing else, so switching this
          // on with no signal draws precisely nothing — which reads as broken
          // rather than as absent. Said on the row, while the switch is under
          // the thumb that flipped it.
          if (key === 'weatherRadar' && on) {
            return (
              <LayerNote
                text="Where it is raining now · needs a connection"
                attribution={RADAR_ATTRIBUTION}
              />
            );
          }
          // ── The caveat, on the control ────────────────────────────────
          // Not only in the callout, because the fill is visible without
          // anyone ever tapping a parcel — and what the fill does NOT mean is
          // the entire reason this layer is allowed to draw. One sentence,
          // written once, shared with the website (@eddy/types) so the two
          // maps cannot say different things about the same boundaries.
          if (key === 'publicLand' && on) {
            return (
              <LayerNote
                text={`${PUBLIC_LAND_OWNERSHIP_NOTE} ${PUBLIC_LAND_ATTRIBUTION}.`}
              />
            );
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
        onSelectRiver={(river) => {
          setSelectedPin(null);
          setPickedSlug(river.slug);
        }}
        onClearRiver={() => {
          planner.reset();
          setPickedSlug(null);
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
