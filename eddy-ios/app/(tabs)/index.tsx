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
  Alert,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type {
  FloatPlan,
  Hazard,
  MapAccessPoint,
  DamSnapshot,
  MapGauge,
  RiverListItem,
  RiverService,
  SearchResult,
} from '@eddy/types';
import {
  accessPointTypes,
  accessTypeLabel,
  hasCoordinates,
  isCampground,
  PUBLIC_LAND_OWNERSHIP_NOTE,
} from '@eddy/types';
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
import {
  conditionBg,
  conditionChipBorder,
  conditionColor,
  conditionInk,
  conditionLabel,
  conditionText,
  floatableRank,
} from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { mapAccessPointPin, RiverMap, type MapPin } from '@/map/RiverMap';
import { mapUnavailableReason } from '@/map/runtime';
import {
  drawnAsAccessPoint,
  MAP_LAYERS,
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
import { driveToUrl, usgsGaugeUrl } from '@/lib/directions';
import { useStarredRivers } from '@/hooks/useStarredRivers';
import { useEddySearch } from '@/hooks/useEddySearch';
import { useFloatPlan } from '@/hooks/useFloatPlan';
import { milesBetween, useLocation } from '@/hooks/useLocation';
import { useStatewideNetwork } from '@/hooks/useStatewideNetwork';
import { riverBounds } from '@/lib/statewideNetwork';
import { warn } from '@/lib/monitoring';
import { useFocusEffect, useRouter } from 'expo-router';
import { asHref } from '@/lib/href';
import { Otter } from '@/components/Otter';
import { SearchBar } from '@/components/SearchBar';
import { SearchResultsList } from '@/components/SearchResultsList';
import { useAccessGaugeStatus } from '@/hooks/useAccessGaugeStatus';
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

/**
 * How far above the map's bottom edge everything floating has to sit.
 *
 * The Mapbox wordmark and the (i) attribution button live down there now, and
 * they are a legal obligation rather than decoration — the terms require them
 * visible and forbid hiding them. 53 is the top of the (i)'s 44x44 tap frame at
 * its current offset (see the ornament comment in RiverMap); the remaining 9
 * absorbs the floating shadow above it.
 *
 * This fixes an exposure rather than creating one. The callout is full-width at
 * the bottom and 115-251pt tall, so until now it covered the wordmark and the
 * attribution button outright whenever a pin was selected — and attribution you
 * have covered up is attribution you have not given.
 */
/**
 * Layers whose pins are somewhere you get in a car and go.
 *
 * The exclusions are the point — see the Directions button in PinCallout.
 */
const DRIVEABLE_LAYERS = new Set<LayerKey>(['access', 'campgrounds', 'outfitters']);

const MAP_CHROME_BOTTOM = 62;

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
          setRiversError(err instanceof ApiError ? err.message : 'Something went wrong');
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
          placeholder="Search rivers, gauges, and access points"
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
            showUserLocation={location.status === 'ready' && isFocused}
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
              emptyMessage="Nothing matched. Try a river, a gauge name, or a put-in."
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
        <View style={styles.bottomStack} pointerEvents="box-none">
          {selectedPin && !search.active ? (
            <View style={styles.calloutWrap} pointerEvents="box-none">
              {/* ── Going to look at something does not deselect it ──────────
                  onOpenRiver, onOpenGauge, onOpenDam and onOpenDetail below all
                  used to clear the pin on the way out, so tapping a put-in,
                  reading its screen and pressing Back landed you on a map with
                  nothing selected — the callout gone, the pin no longer ringed,
                  and no way to carry on with it but to find it among its
                  neighbours and tap it again. That is a round trip the app
                  asked for and then discarded the state of.

                  A selection is a place the user is standing. Only the two
                  things that genuinely leave it put it down: the close button,
                  and handing an access point to the planner, which replaces the
                  callout with the plan sheet. */}
              <PinCallout
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
              />
            </View>
          ) : null}

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
        </View>

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
        <View style={styles.planCluster} pointerEvents="box-none">
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
        </View>
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
 * What a tapped pin is, and — for an access point — what to do with it.
 *
 * The put-in / take-out buttons are the bridge between the map and the planner.
 * Without them the map is a picture and the plan is a form; with them, choosing
 * a stretch is something you do by pointing at the river.
 */
function PinCallout({
  pin,
  accessPoint,
  canSetTakeOut,
  onSetPutIn,
  onSetTakeOut,
  onOpenRiver,
  onOpenGauge,
  onOpenDam,
  onOpenDetail,
  onClose,
  starred = false,
  onToggleStar = null,
}: {
  pin: MapPin;
  accessPoint: MapAccessPoint | null;
  canSetTakeOut: boolean;
  onSetPutIn: () => void;
  onSetTakeOut: () => void;
  onOpenRiver: (slug: string) => void;
  onOpenGauge: (siteId: string) => void;
  onOpenDam: (damId: string) => void;
  /** Takes an already-built route. See MapPin.detailRoute for why it is a path. */
  onOpenDetail: (route: string) => void;
  onClose: () => void;
  starred?: boolean;
  /** Null for anything that cannot be starred, which is everything but gauges. */
  onToggleStar?: (() => void) | null;
}) {
  const { colors, elevation, isDark } = useTheme();
  const layer = MAP_LAYERS.find((l) => l.key === pin.layer);
  // Access points only, and only ones with a detail route — the hook returns
  // null for everything else, so no guard is needed here.
  const accessGauge = useAccessGaugeStatus(accessPoint ? pin.detailRoute : null);
  const accessGaugeReading = accessGauge
    ? accessGauge.cfs != null
      ? formatReading(accessGauge.cfs, 'cfs')
      : accessGauge.heightFt != null
        ? formatReading(accessGauge.heightFt, 'ft')
        : null
    : null;
  const planAsTakeOut = canSetTakeOut;
  const planActionLabel = planAsTakeOut ? 'Use as take-out' : 'Use as put-in';
  const performPlanAction = planAsTakeOut ? onSetTakeOut : onSetPutIn;

  // PLACES YOU DRIVE TO, and nothing else. Access points, campgrounds and
  // outfitters are destinations. A hazard is emphatically not one — a
  // Directions button under a strainer is an invitation — and a gauge is a
  // sensor on a bridge rail. See DRIVEABLE_LAYERS.
  const driveable = DRIVEABLE_LAYERS.has(pin.layer);
  // Coordinates, never the name: see src/lib/directions.ts.
  const openDirections = () =>
    void Linking.openURL(driveToUrl({ name: pin.name, coordinates: pin.coordinates }));

  const onPlanAction = () => {
    if (!accessPoint || accessPoint.isPublic) {
      performPlanAction();
      return;
    }

    const message = accessPoint.feeRequired
      ? 'This location is marked private and may require both permission and a fee. Review its access details before relying on it.'
      : 'This location is marked private and may require permission. Review its access details before relying on it.';
    if (pin.detailRoute) {
      Alert.alert('Private access', message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Review details', onPress: () => onOpenDetail(pin.detailRoute!) },
        { text: 'Use anyway', onPress: performPlanAction },
      ]);
      return;
    }
    Alert.alert('Private access', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Use anyway', onPress: performPlanAction },
    ]);
  };

  /**
   * WHAT THIS PIN IS FOR, resolved once.
   *
   * Exactly one promoted action, chosen by what the pin IS rather than by
   * whichever condition happens to be tested first in the JSX. An access point
   * is for floating from; a dam or a gauge is for reading; an outfitter or a
   * campground is somewhere you drive. A hazard is for none of those — it is
   * information, and its callout correctly offers nothing to do.
   *
   * Directions rides beside a promoted action as the quiet second, and takes
   * the slot itself only when nothing else claimed it. Resolved here, in one
   * place, so the button row and the list below can never both render the
   * same destination.
   *
   * Coral stays reserved for the float CTA — it is the app's one accent and it
   * means "this is what Eddy is for". Other primaries take the interactive
   * outline, which is the emphasis step this callout already used for Details
   * on an access point.
   */
  const calloutButtons: {
    key: string;
    label: string;
    icon?: React.ComponentProps<typeof Ionicons>['name'];
    tone: 'accent' | 'interactive' | 'neutral';
    onPress: () => void;
    accessibilityLabel?: string;
    hint?: string;
  }[] = [];

  if (accessPoint) {
    calloutButtons.push({
      key: 'plan',
      label: planActionLabel,
      icon: 'flag-outline',
      tone: 'accent',
      onPress: onPlanAction,
      hint: accessPoint.isPublic ? undefined : 'Private access confirmation required',
    });
  } else if (pin.damId) {
    calloutButtons.push({
      key: 'dam',
      label: 'Open dam',
      tone: 'interactive',
      onPress: () => onOpenDam(pin.damId!),
    });
  } else if (pin.siteId) {
    calloutButtons.push({
      key: 'gauge',
      label: 'Open gauge',
      tone: 'interactive',
      onPress: () => onOpenGauge(pin.siteId!),
    });
  } else if (driveable) {
    calloutButtons.push({
      key: 'directions',
      label: 'Directions',
      icon: 'navigate-outline',
      tone: 'interactive',
      onPress: openDirections,
      accessibilityLabel: `Directions to ${pin.name}`,
    });
  }

  if (driveable && !calloutButtons.some((b) => b.key === 'directions')) {
    calloutButtons.push({
      key: 'directions',
      label: 'Directions',
      icon: 'navigate-outline',
      tone: 'neutral',
      onPress: openDirections,
      accessibilityLabel: `Directions to ${pin.name}`,
    });
  }

  const promoted = new Set(calloutButtons.map((b) => b.key));

  /**
   * Everywhere else this pin can take you.
   *
   * Rows, not buttons, because that is what they are: navigation. Dressing a
   * destination as the peer of a call to action was the original error, and
   * the width it cost is what broke the row.
   */
  const calloutRows: {
    key: string;
    label: string;
    onPress: () => void;
    external?: boolean;
    accessibilityLabel?: string;
  }[] = [];

  // The dam screen is a different destination from the gauge one — Stockton
  // and Truman have a damId and no siteId at all, because they publish nothing
  // to CWMS and so have no gauge row to open. See MapPin.damId.
  if (pin.damId && !promoted.has('dam')) {
    calloutRows.push({ key: 'dam', label: 'Open dam', onPress: () => onOpenDam(pin.damId!) });
  }
  // BEFORE the river. A gauge callout is a number, and the question a number
  // provokes is "how did it get there" — which is a chart, not a river page.
  if (pin.siteId && !promoted.has('gauge')) {
    calloutRows.push({ key: 'gauge', label: 'Open gauge', onPress: () => onOpenGauge(pin.siteId!) });
  }
  if (pin.detailRoute) {
    calloutRows.push({
      key: 'details',
      // Spelled out now that it has a whole row. It was abbreviated to
      // "Details" only because it was a flex:1 pill sharing a row with up to
      // three others, which is the constraint this layout removed.
      label: accessPoint ? 'Access point details' : 'Details',
      onPress: () => onOpenDetail(pin.detailRoute!),
      accessibilityLabel: `Open ${pin.name}`,
    });
  }
  if (pin.link) {
    calloutRows.push({
      key: 'link',
      label: pin.link.label,
      onPress: () => void Linking.openURL(pin.link!.url),
      external: true,
    });
  }
  // A gauge belongs to a river, and the river screen is where its history, its
  // scale and Eddy's read on it live.
  if (pin.riverSlug) {
    calloutRows.push({
      key: 'river',
      label: 'View river',
      onPress: () => onOpenRiver(pin.riverSlug!),
    });
  }

  return (
    <View style={[styles.callout, { backgroundColor: colors.card }, elevation(2)]}>
      <View style={styles.calloutHead}>
        {accessPoint && pin.imageUrl ? (
          <View style={styles.calloutThumbWrap}>
            <Image
              source={{ uri: pin.imageUrl }}
              style={styles.calloutThumb}
              resizeMode="cover"
              accessibilityElementsHidden
              importantForAccessibility="no"
              accessibilityIgnoresInvertColors
            />
            <View
              style={[
                styles.calloutThumbDot,
                {
                  backgroundColor: pin.color ?? layer?.color(colors) ?? colors.interactive,
                  // White in BOTH schemes, and inline rather than in the
                  // StyleSheet so it is a stated exception rather than a frozen
                  // colour the theme guard has to allow. The ring separates the
                  // dot from a PHOTOGRAPH, which is neither light nor dark —
                  // the same reasoning as circleStrokeColor on the map layers.
                  borderColor: '#FFFFFF',
                },
              ]}
            />
          </View>
        ) : (
          <View
            style={[
              styles.calloutDot,
              { backgroundColor: pin.color ?? layer?.color(colors) ?? colors.interactive },
            ]}
          />
        )}
        <View style={styles.calloutText}>
          <Text style={[styles.calloutName, { color: colors.text }]} numberOfLines={2}>
            {pin.name}
          </Text>
          {pin.subtitle ? (
            <Text style={[styles.calloutMeta, { color: colors.textMuted }]} numberOfLines={1}>
              {pin.subtitle}
            </Text>
          ) : null}
        </View>
        {/* IN THE HEAD, not among the actions below. The star belongs to the
            OBJECT, which is what this row names — the same relationship
            RiverRow expresses by giving the star its own column beside the
            name. It was never an action on the same footing as "Put in here",
            and it would have taken width from one on the callouts that carry
            both. */}
        {onToggleStar ? (
          <Pressable
            onPress={onToggleStar}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={starred ? `Unstar ${pin.name}` : `Star ${pin.name}`}
          >
            <Ionicons
              name={starred ? 'star' : 'star-outline'}
              size={19}
              color={starred ? colors.warm : colors.textMuted}
            />
          </Pressable>
        ) : null}
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={19} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* WHAT THIS PLACE ACTUALLY IS. A point can carry several of the six
          types at once — a boat ramp you can also camp at is a different day
          out from a gravel bar — and until now the callout said only "Mile
          12.4", with the pin's colour standing in for a category it could only
          ever express one of.

          Resolved through accessPointTypes so the `types` array wins and a row
          that predates it still falls back to its single `type`. Rendered even
          when there is one, because "Access" is information: it is the type
          that means "somewhere to put a boat in and nothing more". */}
      {accessPoint ? (
        <View style={styles.calloutTypes}>
          {accessPointTypes(accessPoint).map((type) => (
            <View
              key={type}
              style={[styles.calloutType, { backgroundColor: colors.cardRaised }]}
            >
              <Text style={[styles.calloutTypeText, { color: colors.textMuted }]}>
                {accessTypeLabel(type)}
              </Text>
            </View>
          ))}
          {accessPoint.feeRequired ? (
            <View style={[styles.calloutType, { backgroundColor: colors.cardRaised }]}>
              <Text style={[styles.calloutTypeText, { color: colors.textMuted }]}>Fee required</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* The private notice, which is now the whole of the private signal at
          this zoom — the pin itself no longer carries a padlock. Kept as a
          NOTE rather than a lock: "permission may be required" is a thing to
          go and ask about, and a padlock reads as a thing that is shut. */}
      {accessPoint && !accessPoint.isPublic ? (
        <View style={[styles.calloutPrivate, { backgroundColor: colors.cardRaised }]}>
          <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.calloutPrivateText, { color: colors.textMuted }]}>
            Private access — permission may be required
          </Text>
        </View>
      ) : null}

      {/* The reading and its verdict on one line: a gauge's number means nothing
          without the band it sits in, and the band means less without the
          number. Same rule the river row is built on.

          THE CHIP NO LONGER REQUIRES A CONDITION CODE. It used to, and the one
          layer that carries a label without a code is the national gauge tier —
          deliberately, because a flow band is a comparison to a station's own
          history and never a verdict about floating. So the pin that most
          needed its label explained was the only one that never showed it, and
          a tapped reference gauge came back as a bare number. A code still
          buys the condition tint; without one the chip is drawn in the pin's
          own band colour, which is what the dot on the map is wearing. */}
      {pin.value || pin.codeLabel ? (
        <View style={styles.calloutReadingRow}>
          {pin.value ? (
            <Text
              style={[
                styles.calloutReading,
                { color: pin.code ? conditionText(pin.code, isDark) : colors.text },
              ]}
            >
              {pin.value}
            </Text>
          ) : null}
          {pin.codeLabel ? (
            <View
              style={[
                styles.calloutChip,
                pin.code
                  ? {
                      backgroundColor: conditionBg(pin.code),
                      borderColor: conditionChipBorder(pin.code),
                    }
                  : { backgroundColor: colors.cardRaised, borderColor: pin.color ?? colors.border },
              ]}
            >
              <Text
                style={[
                  styles.calloutChipText,
                  { color: pin.code ? conditionInk(pin.code) : colors.textMuted },
                ]}
              >
                {pin.codeLabel}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* ── The water at this put-in ────────────────────────────────
          Arrives after the callout is already open — see useAccessGaugeStatus
          for why it is late and why it never blocks the buttons below.

          Drawn in the SAME row a gauge pin uses, because it is the same kind
          of fact and must not look like a different one. What it adds is the
          station's name: this is the river's nearest at-or-upstream gauge
          applied to the reach, not a sensor at this ramp, and naming it is the
          difference between a reading and a measurement taken here. */}
      {accessGauge ? (
        <Pressable
          onPress={() => onOpenGauge(accessGauge.usgsId)}
          style={({ pressed }) => [styles.calloutAccessGauge, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={`${accessGauge.gaugeName}, ${accessGauge.label}. Open the gauge`}
        >
          <View style={styles.calloutReadingRow}>
            {accessGaugeReading ? (
              <Text
                style={[
                  styles.calloutReading,
                  { color: conditionText(accessGauge.level, isDark) },
                ]}
              >
                {accessGaugeReading}
              </Text>
            ) : null}
            <View
              style={[
                styles.calloutChip,
                {
                  backgroundColor: conditionBg(accessGauge.level),
                  borderColor: conditionChipBorder(accessGauge.level),
                },
              ]}
            >
              <Text style={[styles.calloutChipText, { color: conditionInk(accessGauge.level) }]}>
                {accessGauge.label}
              </Text>
            </View>
          </View>
          <Text style={[styles.calloutMeta, { color: colors.textMuted }]} numberOfLines={1}>
            at {accessGauge.gaugeName}
          </Text>
        </Pressable>
      ) : null}

      {pin.body ? (
        // Capped at four lines. A callout that grows to a hazard's full seasonal
        // notes covers the river it is describing; the river screen has room.
        <Text style={[styles.calloutBody, { color: colors.textMuted }]} numberOfLines={4}>
          {pin.body}
        </Text>
      ) : null}

      {/* ── One primary, one secondary, and rows for the rest ───────
          This was seven equal pills in one flex row. Once Directions joined
          them a typical access point carried four — flex 1/2/1/1 across a
          332pt card, which is about 62pt each, and "Directions" at 14pt is
          not 62pt wide. `flexWrap` could not rescue it either: flex:1 sets
          flexBasis to 0, so no child ever exceeds its basis and the row
          squeezes instead of wrapping.

          The fix is the hierarchy the row never had. A callout has ONE thing
          it is for — float from this put-in, read this gauge, drive to this
          outfitter — and everything else on it is a way to somewhere else.
          Actions get buttons; destinations get rows. Two buttons at flex 1
          are 162pt each and a row is full width, so nothing has to be
          abbreviated to fit, and both clear the 44pt touch floor the pills
          missed at 41 (DESIGN.md §6). */}
      {calloutButtons.length > 0 ? (
        <View style={styles.calloutPrimaryRow}>
          {calloutButtons.map((button) => {
            const filled = button.tone === 'accent';
            const ink = filled
              ? colors.onAccent
              : button.tone === 'interactive'
                ? colors.interactive
                : colors.text;
            return (
              <Pressable
                key={button.key}
                onPress={button.onPress}
                style={({ pressed }) => [
                  styles.calloutPrimary,
                  {
                    // accentFill, not accent: this is a SOLID CTA carrying
                    // `onAccent` text, and onAccent is white. White on
                    // accent[500] does not clear 4.5:1 — accentFill
                    // (accent[700]) is the fill the white was chosen against,
                    // and is what every other coral CTA in the app uses.
                    backgroundColor: filled
                      ? pressed
                        ? colors.accentFillPressed
                        : colors.accentFill
                      : 'transparent',
                    borderColor: filled
                      ? pressed
                        ? colors.accentFillPressed
                        : colors.accentFill
                      : button.tone === 'interactive'
                        ? colors.interactive
                        : colors.border,
                    opacity: !filled && pressed ? 0.6 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={button.accessibilityLabel}
                accessibilityHint={button.hint}
              >
                {button.icon ? <Ionicons name={button.icon} size={15} color={ink} /> : null}
                <Text style={[styles.calloutPrimaryText, { color: ink }]} numberOfLines={1}>
                  {button.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {calloutRows.length > 0 ? (
        <View style={styles.calloutLinks}>
          {calloutRows.map((row) => (
            <Pressable
              key={row.key}
              onPress={row.onPress}
              style={({ pressed }) => [styles.calloutLink, { opacity: pressed ? 0.6 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={row.accessibilityLabel}
            >
              <Text style={[styles.calloutLinkText, { color: colors.text }]} numberOfLines={1}>
                {row.label}
              </Text>
              {/* An arrow that leaves the app for one that stays in it. The
                  difference is worth a glyph: one of these opens Safari. */}
              <Ionicons
                name={row.external ? 'open-outline' : 'chevron-forward'}
                size={16}
                color={colors.textSubtle}
              />
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* ── When it was measured ────────────────────────────────────
          LAST, under the actions, in the quietest ink on the card. It is a
          qualifier on everything above it rather than another fact beside them,
          and putting it in the subtitle — where the curated tier used to keep
          it — made the identification line carry two unrelated jobs while the
          national tier carried neither.

          Absent, not "unknown", when the station never reported a timestamp.
          A row that says "Updated: unknown" is a row about the app. */}
      {pin.updatedAt ? (
        <Text style={[styles.calloutUpdated, { color: colors.textMuted }]} numberOfLines={1}>
          {pin.updatedAt}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The honest empty state. Expo Go genuinely cannot load a native map, and saying
 * so beats an infinite spinner that looks like a network problem.
 */
function MapUnavailable({ reason }: { reason: 'expo-go' | 'missing-token' | 'load-failed' }) {
  const { colors } = useTheme();
  const copy = {
    'expo-go': {
      title: 'Map needs a full build',
      body: 'Maps use a native module that Expo Go cannot load. Run a development build (eas build --profile development) to see the map. The other tabs work here.',
    },
    'missing-token': {
      title: 'Map key missing',
      body: 'Set EXPO_PUBLIC_MAPBOX_TOKEN to a Mapbox public token and rebuild.',
    },
    'load-failed': {
      title: 'Map failed to load',
      body: 'The map module could not start. Everything else still works.',
    },
  }[reason];

  return (
    <View style={styles.centered}>
      <Otter mood="flag" size={110} />
      <Text style={[styles.unavailableTitle, { color: colors.text }]}>{copy.title}</Text>
      <Text style={[styles.unavailableBody, { color: colors.textMuted }]}>{copy.body}</Text>
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
    bottom: 16,
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
  callout: { borderRadius: 14, padding: 13 },
  calloutHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  calloutDot: { width: 10, height: 10, borderRadius: 999 },
  calloutThumbWrap: { width: 64, height: 64 },
  calloutThumb: { width: 64, height: 64, borderRadius: 9 },
  // borderColor is applied INLINE at the call site, not here. StyleSheet.create
  // runs once at import, so a colour written into it is frozen at whichever
  // scheme the app launched with — the invariant app-theme.test.ts guards.
  calloutThumbDot: {
    position: 'absolute',
    left: 5,
    bottom: 5,
    width: 10,
    height: 10,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  calloutText: { flex: 1, minWidth: 0 },
  calloutName: { ...t.sm, fontFamily: fonts.semibold },
  calloutMeta: { ...t.sm, fontFamily: fonts.body, marginTop: 1 },
  // Wraps, because six types is the ceiling and three is common. Quieter than
  // calloutChip — a condition chip is a verdict, these are labels.
  calloutTypes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 },
  calloutType: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  calloutTypeText: { ...t.sm, fontFamily: fonts.medium },
  calloutPrivate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 9,
    marginTop: 9,
  },
  calloutPrivateText: { ...t.sm, fontFamily: fonts.medium, flex: 1 },
  calloutReadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9 },
  // The access-point reading is one tap target covering the number, the chip
  // and the station name, because all three are the same fact and they all
  // lead to the same screen.
  calloutAccessGauge: { marginTop: 0 },
  calloutReading: { ...t.lg, fontFamily: fonts.mono },
  calloutChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  calloutChipText: { ...t.sm, fontFamily: fonts.semibold },
  calloutBody: { ...t.sm, fontFamily: fonts.body, marginTop: 9 },
  calloutUpdated: { ...t.sm, fontFamily: fonts.body, marginTop: 10 },
  // At most two, equal width. On the narrowest phone that is ~162pt each,
  // which fits every label this callout has without abbreviating one.
  calloutPrimaryRow: { flexDirection: 'row', gap: 8, marginTop: 11 },
  calloutPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    // 44 is the touch floor from DESIGN.md §6 and is not negotiable. The pills
    // this replaced were 41.
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
  },
  calloutPrimaryText: { ...t.sm, fontFamily: fonts.semibold },
  calloutLinks: { marginTop: 4 },
  calloutLink: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  calloutLinkText: { ...t.sm, fontFamily: fonts.medium, flex: 1 },
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
