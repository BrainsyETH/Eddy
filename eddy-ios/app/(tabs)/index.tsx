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
// ── Everything else is layers ───────────────────────────────────────────────
// Access points, campgrounds, gauges, hazards and outfitters are independent
// toggles rather than a single "show detail" switch, and each one's data is
// fetched only once it is switched on. Two of them — access points and gauges —
// are on when the app opens, because "where do I get on" and "is there water in
// it" are the two questions the map exists to answer. The rest are one tap away
// in the layers sheet; see src/components/MapLayersSheet.tsx for why that stopped
// being a row of chips above the map.
//
// ── Changing river does not reload the screen ──────────────────────────────
// Geometry loads per river, and this screen used to blank the map to a spinner
// while the next one arrived — which on a fast tap reads as the app restarting.
// The previously loaded river therefore keeps drawing until the new one lands,
// and the only signal is a small pill over the map. Everything downstream of the
// map (the planner, the offline row, the line colour) is keyed off the river
// actually being DRAWN rather than the one selected, so nothing is ever a
// half-second out of step with what is on screen.
//
// ── Mapbox may be absent ────────────────────────────────────────────────────
// The native module cannot run in Expo Go, so instead of a red screen the tab
// explains itself and the other four tabs keep working — see src/map/runtime.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  MapGauge,
  RiverDetail,
  RiverListItem,
  RiverService,
  SearchResult,
} from '@eddy/types';
import { accessPointTypes, accessTypeLabel, hasCoordinates, isCampground } from '@eddy/types';
import {
  formatFloatTimeCeilingCompact,
  formatFloatTimeCompact,
} from '@eddy/conditions/float-time-format';
import {
  ApiError,
  fetchGauges,
  fetchHazards,
  fetchRiverAccessPoints,
  fetchRiverDetail,
  fetchRiverServices,
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
import { RiverMap, type MapPin } from '@/map/RiverMap';
import { mapUnavailableReason } from '@/map/runtime';
import {
  DEFAULT_LAYERS,
  MAP_LAYERS,
  OUTFITTER_SERVICE_TYPES,
  type LayerKey,
} from '@/map/layers';
import { useViewportGauges, type Viewport } from '@/hooks/useViewportGauges';
import { flowBandColor, flowBandLabel } from '@/theme/flow';
import { flowBandFor, flowMagnitude, flowReadingText } from '@/lib/gaugeFlow';
import { useOfflinePacks } from '@/map/useOfflinePacks';
import { useStarredRivers } from '@/hooks/useStarredRivers';
import { useEddySearch } from '@/hooks/useEddySearch';
import { useFloatPlan } from '@/hooks/useFloatPlan';
import { useAccount } from '@/hooks/useAccount';
import { useAppConfig } from '@/hooks/useAppConfig';
import { useLocation } from '@/hooks/useLocation';
import { useStatewideNetwork } from '@/hooks/useStatewideNetwork';
import { useRouter } from 'expo-router';
import { Otter } from '@/components/Otter';
import { SearchBar } from '@/components/SearchBar';
import { SearchResultsList } from '@/components/SearchResultsList';
import { MapLayersButton, MapLayersSheet, isDefaultLayers } from '@/components/MapLayersSheet';
import { ConditionFilterBar, ConditionFilterButton } from '@/components/ConditionFilterBar';
import { PlanSheet } from '@/components/PlanSheet';
import { OfflineMapRow } from '@/components/OfflineMapRow';
import { PaywallSheet } from '@/components/PaywallSheet';

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
  const [rivers, setRivers] = useState<RiverListItem[] | null>(null);
  const [pickedSlug, setPickedSlug] = useState<string | null>(null);
  const [detail, setDetail] = useState<RiverDetail | null>(null);
  const [accessPoints, setAccessPoints] = useState<MapAccessPoint[]>([]);
  // Null rather than [] until fetched, so the layers sheet can tell "this river
  // has none" from "we have not asked yet" and only claims a zero it knows.
  const [hazards, setHazards] = useState<RiverScoped<Hazard> | null>(null);
  const [services, setServices] = useState<RiverScoped<RiverService> | null>(null);
  const [gauges, setGauges] = useState<MapGauge[] | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Copied, not aliased: DEFAULT_LAYERS is a module constant and nothing should
  // be one `push` away from redefining what the app opens with.
  const [layers, setLayers] = useState<LayerKey[]>(() => [...DEFAULT_LAYERS]);
  const [layersOpen, setLayersOpen] = useState(false);
  // Which conditions the network is narrowed to. Empty = everything.
  //
  // NOT persisted, deliberately. "What is floatable" is a today question, and a
  // filter restored from last week reads as rivers having gone missing.
  const [conditionFilter, setConditionFilter] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [focus, setFocus] = useState<Focus | null>(null);
  // The camera, as of the last time it stopped moving. Only the national gauge
  // layer reads it — everything else on this screen loads a bounded set up front.
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const network = useStatewideNetwork();
  const { isStarred, toggleStar } = useStarredRivers();
  const packs = useOfflinePacks();
  const unavailable = mapUnavailableReason();
  const { colors, floating } = useTheme();
  const { features } = useAppConfig();
  const { entitlement, loaded: accountLoaded, error: accountError } = useAccount();
  const location = useLocation();
  const router = useRouter();

  useEffect(() => {
    const controller = new AbortController();
    fetchRivers(controller.signal)
      .then(setRivers)
      .catch((err) => {
        if (err instanceof ApiError && err.message === 'Request cancelled') return;
        setError(err instanceof ApiError ? err.message : 'Something went wrong');
      });
    return () => controller.abort();
  }, []);

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

  // Geometry is the heaviest response the app fetches — the Current River alone
  // is a 632-point LineString — so it loads one river at a time, on selection,
  // never eagerly for all thirteen.
  useEffect(() => {
    if (!selectedSlug) return;
    const controller = new AbortController();
    setLoadingDetail(true);
    // NOTHING is cleared here, deliberately. Blanking `detail` and
    // `accessPoints` is what made switching rivers look like a page reload: the
    // map unmounts, Mapbox tears down its view, and a spinner replaces a
    // perfectly good river for as long as the network takes. The old river keeps
    // drawing until the new one is ready to replace it in one frame.
    setSelectedPin(null);

    Promise.all([
      fetchRiverDetail(selectedSlug, controller.signal),
      // Access points are a nice-to-have for the MAP and a hard requirement for
      // the planner, but an empty list still leaves a usable map, so a failure
      // here must not blank the river.
      fetchRiverAccessPoints(selectedSlug, controller.signal).catch(() => []),
    ])
      .then(([river, points]) => {
        // Swapped together: the geometry and the pins drawn on it must never be
        // from two different rivers, not even for one frame.
        setDetail(river);
        setAccessPoints(points);
        setError(null);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.message === 'Request cancelled') return;
        setError(err instanceof ApiError ? err.message : 'Could not load this river');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingDetail(false);
      });

    return () => controller.abort();
  }, [selectedSlug]);

  /**
   * The river actually on screen, which is not always the one just tapped.
   *
   * Everything that describes what is being drawn — the line colour, the
   * planner, the offline row — reads from here rather than from `selected`, so a
   * river mid-load cannot lend its condition colour or its download state to the
   * river still visible underneath.
   */
  const drawnSlug = detail?.slug ?? null;
  const drawn = useMemo(
    () => ordered.find((r) => r.slug === drawnSlug) ?? null,
    [ordered, drawnSlug],
  );

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
    fetchGauges()
      .then(setGauges)
      .catch(() => setGauges([]));
  }, []);

  useEffect(() => {
    if (wantsGauges) ensureGauges();
  }, [wantsGauges, ensureGauges]);

  const wantsHazards = layers.includes('hazards');
  useEffect(() => {
    if (!wantsHazards || !selectedSlug) return;
    const slug = selectedSlug;
    const controller = new AbortController();
    fetchHazards(slug, controller.signal)
      .then((items) => setHazards({ slug, items }))
      .catch(() => {
        // A cancelled request must not be recorded as "this river has no
        // hazards" — that answer would then survive until the river changed.
        if (!controller.signal.aborted) setHazards({ slug, items: [] });
      });
    return () => controller.abort();
  }, [wantsHazards, selectedSlug]);

  const wantsServices = layers.includes('campgrounds') || layers.includes('outfitters');
  useEffect(() => {
    if (!wantsServices || !selectedSlug) return;
    const slug = selectedSlug;
    const controller = new AbortController();
    fetchRiverServices(slug, controller.signal)
      .then((items) => setServices({ slug, items }))
      .catch(() => {
        if (!controller.signal.aborted) setServices({ slug, items: [] });
      });
    return () => controller.abort();
  }, [wantsServices, selectedSlug]);

  // ── Search ──────────────────────────────────────────────────────
  const search = useEddySearch({ rivers, gauges });

  const clearSearch = search.clear;
  const onSelectResult = useCallback((result: SearchResult) => {
    clearSearch();
    setSelectedPin(null);

    if (result.riverSlug) setPickedSlug(result.riverSlug);

    // A gauge or an access point is a POINT, so the camera goes to it rather
    // than refitting the whole river — otherwise choosing "Cedar Grove Access"
    // and watching the map fit ninety miles of Current River is indistinguish-
    // able from nothing happening. Tagged with the slug so it cannot be applied
    // to a river it does not belong to.
    if (result.coordinates && result.riverSlug) {
      setFocus({ slug: result.riverSlug, lng: result.coordinates.lng, lat: result.coordinates.lat });
    } else {
      setFocus(null);
    }

    // Turn on the layer the result lives in, so what was searched for is
    // visible when the map arrives. Both are on by default; this covers the
    // person who switched one off earlier in the session and then searched for
    // exactly that kind of thing.
    if (result.kind === 'gauge') {
      setLayers((prev) => (prev.includes('gauges') ? prev : [...prev, 'gauges']));
    } else if (result.kind === 'access_point') {
      setLayers((prev) => (prev.includes('access') ? prev : [...prev, 'access']));
    }
  }, [clearSearch]);

  // ── Float plan ──────────────────────────────────────────────────
  // Keyed off the DRAWN river, so the plan's river id and its access points can
  // never come from two different rivers while one is still loading — the two are
  // swapped in together, and an access point belongs to exactly one river.
  const planner = useFloatPlan(detail?.id ?? null, accessPoints);

  const accessPointForPin = useCallback(
    (pin: MapPin | null): MapAccessPoint | null => {
      if (!pin || pin.layer !== 'access') return null;
      return accessPoints.find((p) => `access:${p.id}` === pin.id) ?? null;
    },
    [accessPoints],
  );

  const toggleLayer = useCallback((key: LayerKey) => {
    setLayers((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }, []);

  const resetLayers = useCallback(() => setLayers([...DEFAULT_LAYERS]), []);

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

  /**
   * Reference gauges as map pins.
   *
   * Curated gauges are dropped here rather than drawn twice: /api/gauges/map
   * returns them too (they are gauges in the viewport), but the curated layer
   * already paints them in their condition colour, and a second dot underneath
   * in a flow-band colour would be the same station wearing two different
   * verdicts a pixel apart.
   */
  const referencePins = useMemo<MapPin[]>(
    () =>
      referenceGauges.gauges
        .filter((g) => !g.curated && hasCoordinates(g))
        .map((g) => {
          const band = flowBandFor(g);
          return {
            id: `refgauge:${g.id}`,
            name: g.name,
            layer: 'allGauges' as LayerKey,
            subtitle: 'USGS gauge — not Eddy-rated',
            coordinates: g.coordinates,
            color: flowBandColor(band),
            // No `code`: that field drives a CONDITION-tinted chip in the
            // callout, and this gauge has no condition. codeLabel carries the
            // band's words instead, which is a comparison, not a verdict.
            codeLabel: flowBandLabel(band),
            value: flowReadingText(g),
            magnitude: flowMagnitude(g),
          };
        }),
    [referenceGauges.gauges],
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
    const riverHazards = hazards?.slug === drawnSlug ? hazards.items : null;
    const riverServices = services?.slug === drawnSlug ? services.items : null;
    const placed =
      riverServices?.filter((s) => s.latitude != null && s.longitude != null) ?? null;
    return {
      access: accessPoints.length,
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
      hazards: riverHazards?.filter(hasCoordinates).length,
      campgrounds: placed
        ? accessPoints.filter(isCampground).length +
          placed.filter((s) => s.type === 'campground').length
        : undefined,
      outfitters: placed?.filter((s) => OUTFITTER_SERVICE_TYPES.includes(s.type)).length,
    };
  }, [
    accessPoints,
    gauges,
    mappableGauges,
    hazards,
    services,
    drawnSlug,
    layers,
    referenceGauges.belowMinZoom,
    referenceGauges.loading,
    referencePins,
  ]);

  const conditionCode = drawn?.currentCondition?.code ?? 'unknown';
  const headerCode = selected?.currentCondition?.code ?? 'unknown';
  const activeFocus = focus && focus.slug === selectedSlug ? focus : null;

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
  const downloadProgress =
    packs.active && packs.active.riverSlug === drawnSlug ? packs.active.percent : null;

  const onDownload = useCallback(async () => {
    if (!detail) return;
    const result = await packs.download(detail);
    if (!result.ok && result.error) setError(result.error);
  }, [detail, packs]);

  const onRemove = useCallback(async () => {
    if (!drawnSlug) return;
    await packs.remove(drawnSlug);
  }, [packs, drawnSlug]);

  // Asks for permission the first time, then recentres. A denial is not
  // re-prompted — iOS would suppress the dialog anyway — so the button simply
  // goes quiet rather than becoming a trap.
  // Multi-select union: tapping Flowing and then Good shows both, the way the
  // website's legend chips work. Tapping a live one turns it back off.
  const onToggleCondition = useCallback((code: string) => {
    setConditionFilter((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  const onSetConditions = useCallback((codes: string[]) => {
    setConditionFilter(new Set(codes));
  }, []);

  const onClearConditions = useCallback(() => {
    setConditionFilter(new Set());
  }, []);

  // Tapping a river on the network selects it, which is the whole point of
  // drawing it: the map is now a way of CHOOSING a river, not just of looking
  // at one you already chose. Any open callout belongs to the old river.
  const onSelectNetworkRiver = useCallback((slug: string) => {
    setPickedSlug(slug);
    setSelectedPin(null);
    setFocus(null);
  }, []);

  const onLocate = useCallback(async () => {
    const coords = await location.request();
    if (coords) setFocus({ slug: selectedSlug, lng: coords.lng, lat: coords.lat });
  }, [location, selectedSlug]);

  const pinAccessPoint = accessPointForPin(selectedPin);

  // The gauge behind a tapped gauge pin. Looked up rather than carried on
  // MapPin, which is a presentation struct — growing it a per-layer field for
  // every layer that wants one is how it stops being that.
  const pinGauge = useMemo(() => {
    if (!selectedPin || selectedPin.layer !== 'gauges') return null;
    const id = selectedPin.id.replace(/^gauge:/, '');
    return (gauges ?? []).find((g) => g.id === id) ?? null;
  }, [selectedPin, gauges]);

  // FAILS OPEN, deliberately. An unreachable /api/me/profile means we do not
  // know whether this person is subscribed — and telling a paying customer on
  // one bar of signal that their offline maps are locked is a far worse outcome
  // than letting an unsubscribed one press a button that needs a connection
  // anyway. Null means "unknown"; the row shows no lock and no upsell.
  const entitled = accountLoaded && !accountError ? Boolean(entitlement?.isActive) : null;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Map</Text>
        {selected ? (
          <Pressable
            onPress={() => router.push(`/river/${selected.slug}`)}
            style={styles.headerMeta}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${selected.name} details`}
          >
            <View style={[styles.dot, { backgroundColor: conditionColor(headerCode) }]} />
            <Text style={[styles.headerMetaText, { color: colors.textMuted }]}>
              {selected.name} · {conditionLabel(headerCode)}
            </Text>
            <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
          </Pressable>
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

      {/* Open on demand, gone again on the next tap. It sits ABOVE the map
          rather than over it: a filter panel that covers the thing it filters
          makes you close it to see what you did. */}
      {filterOpen && !unavailable && network.collection.features.length > 0 ? (
        <ConditionFilterBar
          counts={network.counts}
          active={conditionFilter}
          onToggle={onToggleCondition}
          onSetAll={onSetConditions}
          onClear={onClearConditions}
        />
      ) : null}

      <View style={styles.mapArea}>
        {unavailable ? (
          <MapUnavailable reason={unavailable} />
        ) : !detail && !network.collection.features.length ? (
          // The spinner is for a COLD map — neither the network nor a river has
          // arrived. Once either has, the map draws: switching rivers keeps the
          // one already on screen until the next lands, and a river loading over
          // an already-drawn network needs no spinner at all.
          <View style={styles.centered}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <RiverMap
            river={detail}
            conditionCode={conditionCode}
            network={network.collection}
            conditionFilter={conditionFilter}
            networkBounds={network.bounds}
            onSelectRiverSlug={onSelectNetworkRiver}
            accessPoints={accessPoints}
            gauges={mappableGauges}
            referenceGauges={referencePins}
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
            hazards={hazards?.items ?? []}
            services={services?.items ?? []}
            layers={layers}
            focus={activeFocus ?? openingFocus}
            showUserLocation={location.status === 'ready'}
            planRoute={planner.plan?.route?.geometry ?? null}
            planEndpoints={
              planner.plan ? { putIn: planner.plan.putIn, takeOut: planner.plan.takeOut } : null
            }
            onSelectPin={setSelectedPin}
          />
        )}

        {/* The whole signal that a different river is on its way. A pill over a
            live map, rather than a spinner where the map used to be. */}
        {!unavailable && detail && loadingDetail && selected && drawnSlug !== selectedSlug ? (
          <View style={styles.loadingPillWrap} pointerEvents="none">
            <View style={[styles.loadingPill, floating(), { backgroundColor: colors.card }]}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={[styles.loadingPillText, { color: colors.text }]} numberOfLines={1}>
                {selected.name}
              </Text>
            </View>
          </View>
        ) : null}

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

        {/* Condition filter, tucked under the layers button. Only offered once
            the network has actually arrived — a filter over nothing is a
            control that cannot do anything. */}
        {!unavailable && !search.active && network.collection.features.length > 0 ? (
          <View style={styles.filterButtonWrap}>
            <ConditionFilterButton
              onPress={() => {
                // Clearing the pin is not tidiness. The filter bar renders
                // ABOVE the map and shrinks it by ~100pt, while the bottom
                // stack can reach 379pt with a worst-case gauge callout — on a
                // small phone the plan button would then clip against
                // mapArea's overflow:'hidden'. Selecting a network river
                // already drops the pin for a similar reason.
                setSelectedPin(null);
                setFilterOpen((open) => !open);
              }}
              filtering={conditionFilter.size > 0}
            />
          </View>
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
                onOpenRiver={(slug) => {
                  setSelectedPin(null);
                  router.push(`/river/${slug}`);
                }}
                onClose={() => {
                  setSelectedPin(null);
                  setFocus(null);
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
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Ionicons
                  name={location.status === 'ready' ? 'locate' : 'locate-outline'}
                  size={19}
                  color={location.status === 'denied' ? colors.textSubtle : colors.accent}
                />
              )}
            </Pressable>
          ) : null}

            {/* Pushes the plan button to the right edge. A spacer rather
                than justifyContent: 'space-between', because both buttons are
                conditional and space-between would left-align a lone one. */}
            <View style={styles.controlSpacer} pointerEvents="none" />

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
          {!unavailable && detail && !search.active ? (
            <Pressable
              onPress={() => setPlanOpen(true)}
              style={({ pressed }) => [
                styles.planButton,
                // A floating control needs its own separation from the map behind
                // it; the shared elevation() helper is tuned for cards on a flat
                // canvas and is border-only on dark.
                floating(),
                { backgroundColor: pressed ? colors.accentPressed : colors.accent },
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
      </View>

      {error ? (
        <Text style={[styles.errorText, { color: colors.error }]} numberOfLines={2}>
          {error}
        </Text>
      ) : null}

      {/* Quiet by design — see the note at the top of OfflineMapRow for why this
          stopped being a button. Hidden entirely when the server has switched
          offline downloads off, or when there is no native map to download. */}
      {features.offlineDownloads && !unavailable ? (
        <OfflineMapRow
          river={detail}
          downloaded={drawnSlug ? packs.isDownloaded(drawnSlug) : false}
          progressPercent={downloadProgress}
          budget={packs.budget}
          entitled={entitled}
          onDownload={() => void onDownload()}
          onRemove={() => void onRemove()}
          onUpgrade={() => setPaywallOpen(true)}
        />
      ) : null}

      <MapLayersSheet
        visible={layersOpen}
        onClose={() => setLayersOpen(false)}
        active={layers}
        onToggle={toggleLayer}
        onReset={resetLayers}
        counts={layerCounts}
      />

      {/* The plan flow is deliberately a sibling of the map rather than a child
          of the button that opens it: the plan outlives the sheet, and the map
          keeps drawing the route after this closes. */}
      <PlanSheet
        visible={planOpen}
        onClose={() => setPlanOpen(false)}
        riverName={detail?.name ?? 'this river'}
        state={planner}
        // Passed, never requested from inside the sheet. The locate button on
        // the map is the one place that spends the permission prompt.
        userCoords={location.coords}
      />

      <PaywallSheet
        visible={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        riverName={detail?.name}
        onPurchased={() => {
          // They paid to get this river onto the phone. Finish the thing they
          // asked for rather than making them find the row again.
          void onDownload();
        }}
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
  onClose: () => void;
  starred?: boolean;
  /** Null for anything that cannot be starred, which is everything but gauges. */
  onToggleStar?: (() => void) | null;
}) {
  const { colors, elevation, isDark } = useTheme();
  const layer = MAP_LAYERS.find((l) => l.key === pin.layer);

  return (
    <View style={[styles.callout, { backgroundColor: colors.card }, elevation(2)]}>
      <View style={styles.calloutHead}>
        <View
          style={[styles.calloutDot, { backgroundColor: pin.color ?? layer?.color(colors) ?? colors.accent }]}
        />
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
        {/* IN THE HEAD, not in calloutActions. Those buttons are flex:1 and
            would resize "Put in here" on access-point callouts to make room for
            something only gauges have. The star belongs to the OBJECT, which is
            what this row names — the same relationship RiverRow expresses by
            giving the star its own column beside the name. */}
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
        </View>
      ) : null}

      {/* The reading and its verdict on one line: a gauge's number means nothing
          without the band it sits in, and the band means less without the
          number. Same rule the river row is built on. */}
      {pin.value || pin.codeLabel ? (
        <View style={styles.calloutReadingRow}>
          {pin.value ? (
            <Text style={[styles.calloutReading, { color: conditionText(pin.code ?? 'unknown', isDark) }]}>
              {pin.value}
            </Text>
          ) : null}
          {pin.codeLabel && pin.code ? (
            <View
              style={[
                styles.calloutChip,
                { backgroundColor: conditionBg(pin.code), borderColor: conditionChipBorder(pin.code) },
              ]}
            >
              <Text style={[styles.calloutChipText, { color: conditionInk(pin.code) }]}>
                {pin.codeLabel}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {pin.body ? (
        // Capped at four lines. A callout that grows to a hazard's full seasonal
        // notes covers the river it is describing; the river screen has room.
        <Text style={[styles.calloutBody, { color: colors.textMuted }]} numberOfLines={4}>
          {pin.body}
        </Text>
      ) : null}

      {accessPoint || pin.link || pin.riverSlug ? (
        <View style={styles.calloutActions}>
          {accessPoint ? (
            <>
              <Pressable
                onPress={onSetPutIn}
                style={({ pressed }) => [
                  styles.calloutAction,
                  { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
                ]}
                accessibilityRole="button"
              >
                <Text style={[styles.calloutActionText, { color: colors.text }]}>Put in here</Text>
              </Pressable>
              {canSetTakeOut ? (
                <Pressable
                  onPress={onSetTakeOut}
                  style={({ pressed }) => [
                    styles.calloutAction,
                    { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
                  ]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.calloutActionText, { color: colors.text }]}>
                    Take out here
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : null}

          {pin.link ? (
            <Pressable
              onPress={() => Linking.openURL(pin.link!.url)}
              style={({ pressed }) => [
                styles.calloutAction,
                { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.calloutActionText, { color: colors.text }]} numberOfLines={1}>
                {pin.link.label}
              </Text>
            </Pressable>
          ) : null}

          {/* A gauge belongs to a river, and the river screen is where its
              history, its scale and Eddy's read on it live. */}
          {pin.riverSlug ? (
            <Pressable
              onPress={() => onOpenRiver(pin.riverSlug!)}
              style={({ pressed }) => [
                styles.calloutAction,
                { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.calloutActionText, { color: colors.text }]}>View river</Text>
            </Pressable>
          ) : null}
        </View>
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12 },
  title: { ...t['3xl'], fontFamily: fonts.display },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
  dot: { width: 9, height: 9, borderRadius: 999 },
  headerMetaText: { ...t.sm, fontFamily: fonts.body },
  searchRow: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
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
  loadingPillText: { ...t.xs, fontFamily: fonts.semibold },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  unavailableTitle: { ...t.lg, fontFamily: fonts.semibold, marginTop: 10 },
  unavailableBody: { ...t.sm, fontFamily: fonts.body, textAlign: 'center', marginTop: 8 },
  // Bottom-anchored column. MAP_CHROME_BOTTOM clears the Mapbox ornaments,
  // which are a legal obligation and now sit at the map's bottom edge.
  bottomStack: { position: 'absolute', left: 0, right: 0, bottom: MAP_CHROME_BOTTOM, gap: 12 },
  controlRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  controlSpacer: { flex: 1 },
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
  calloutText: { flex: 1, minWidth: 0 },
  calloutName: { ...t.sm, fontFamily: fonts.semibold },
  calloutMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 1 },
  // Wraps, because six types is the ceiling and three is common. Quieter than
  // calloutChip — a condition chip is a verdict, these are labels.
  calloutTypes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 },
  calloutType: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  calloutTypeText: { ...t.xs, fontFamily: fonts.medium },
  calloutReadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9 },
  calloutReading: { ...t.lg, fontFamily: fonts.mono },
  calloutChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  calloutChipText: { ...t.xs, fontFamily: fonts.semibold },
  calloutBody: { ...t.xs, fontFamily: fonts.body, marginTop: 9 },
  // Wraps: an outfitter can carry a call button next to a website button, and a
  // put-in inside a plan carries two of its own.
  calloutActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 11 },
  calloutAction: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  calloutActionText: { ...t.xs, fontFamily: fonts.semibold },
  planButton: {
    flexDirection: 'row',
    // Never wider than most of the row, so a long label cannot crowd the
    // controls to its left.
    maxWidth: '62%',
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
  filterButtonWrap: { position: 'absolute', top: 76, right: 16 },
  locateButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: { ...t.xs, fontFamily: fonts.body, paddingHorizontal: 20, paddingTop: 8 },
});
