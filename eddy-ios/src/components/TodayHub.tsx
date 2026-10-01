import type { TodayRiverFilter } from '@/lib/todayNavigation';
import { TodayCamping } from '@/components/TodayCamping';
import { BestRiverNotices } from '@/components/BestRiverNotices';
import { TodayRiverConditions } from '@/components/TodayRiverConditions';
import { takePreloadedToday } from '@/lib/firstRunPreload';
import { radii } from '@/theme/layout';
import { Children, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  useWindowDimensions,
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { ControlIcon } from '@/components/ControlIcon';
import { Image as CachedImage } from 'expo-image';
import { compareReadRivers, selectReadRail, readRailState } from '@/lib/readRail';
import { useFocusEffect, useRouter } from 'expo-router';
import type {
  FavoriteFloatSummary,
  HighWaterEntry,
  MapGauge,
  RiverAlert,
  RiverListItem,
} from '@eddy/types';
import type { Coords } from '@eddy/geo';
import {
  ApiError,
  fetchLocationWeather,
} from '@/api/client';
import { EddyReadCard, EddyReadPlaceholder } from '@/components/EddyReadCard';
import { useAccount } from '@/hooks/useAccount';
import { onForeground } from '@/lib/foreground';
import { seedLocationForecast } from '@/lib/locationForecast';
import { TodayRiverPhoto } from '@/components/TodayRiverPhoto';
import { PaywallSheet } from '@/components/PaywallSheet';
import { canOfferReadPremium } from '@/lib/readPremiumAccess';
import { EddyScene } from '@/components/EddyScene';
import { Otter, otterForCondition } from '@/components/Otter';
import { TodaySummary, TodayWeather } from '@/components/TodaySummary';
import { useSession } from '@/hooks/useSession';
import { type LocationStatus } from '@/hooks/useLocation';
import { useStarredRivers } from '@/hooks/useStarredRivers';
import { readFavoriteFloats, writeFavoriteFloats } from '@/lib/favoriteFloatCache';
import { favoriteFloatMeta } from '@/lib/favoriteFloatCopy';
import { formatReading, primaryReading, readingAge } from '@/lib/readingCopy';
import { dailyFavoriteFloats } from '@/lib/todayFloats';
import {
  chooseTodayRecommendations,
  TODAY_RADIUS_MILES,
  type TodayRecommendation,
} from '@/lib/todayRecommendation';
import { railSelectionIndex, railIndexAtOffset } from '@/lib/railSelection';
import { readRecommendation, writeRecommendation } from '@/lib/todayPreferences';
import type { EddySays } from '@/lib/eddySays';
import { riverMilesByGauge } from '@/lib/riverDistance';
import { currentAlertsSummary, defaultCurrentAlertsFilter } from '@/lib/todaySafety';
import {
  conditionBg,
  conditionChipBorder,
  conditionInk,
  conditionLabel,
  floatableRank,
} from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles, type as t } from '@/theme/typography';

interface Props {
  rivers: RiverListItem[];
  gauges: MapGauge[] | null;
  ensureGauges: () => Promise<MapGauge[]>;
  location: {
    coords: Coords | null;
    status: LocationStatus;
    request: () => Promise<Coords | null>;
  };
  refreshRevision: number;
  suppressNetworkNotice: boolean;
  statewide: {
    headline: string | null;
    prose: string | null;
    generatedAt: string | null;
  };
  reads: TodayRead[];
  readsLoading: boolean;
  readsError: boolean;
  onRetryReads: () => void;
  conditionCounts: Record<'floatable' | 'low' | 'high' | 'unknown', number>;
  onBrowseReads: () => void;
  onBrowseRivers: (filter: TodayRiverFilter) => void;
}

export type { TodayRiverFilter } from '@/lib/todayNavigation';

export interface TodayRead {
  river: RiverListItem;
  says: EddySays;
}

const CARD_GAP = 12;
// Selection belongs to this mounted screen and account, never a process-global index.
function CardRail({ label, cardWidth, children }: {
  label: string;
  cardWidth: number;
  children: ReactNode;
}) {
  const { session } = useSession();
  const scope = session?.user.id ?? 'signed-out';
  const [selection, setSelection] = useState<{ scope: string; id: string } | null>(null);
  const { width, fontScale } = useWindowDimensions();
  const items = Children.toArray(children);
  const ids = items.map((item, index) => typeof item === 'object' && item !== null && 'key' in item
    ? String(item.key) : String(index));
  const initialIndex = railSelectionIndex(ids, selection, scope);
  const effectiveWidth = Math.min(cardWidth, Math.max(1, width - 48));
  const vertical = fontScale >= 1.3;
  if (!items.length) return null;
  return (
    <RailViewport
      key={JSON.stringify([scope, ids, effectiveWidth, vertical])}
      label={label}
      items={items}
      initialIndex={initialIndex}
      cardWidth={effectiveWidth}
      viewportWidth={width}
      vertical={vertical}
      onSelect={(index) => setSelection((current) => current?.scope === scope && current.id === ids[index]
        ? current : { scope, id: ids[index] })}
    />
  );
}

function RailViewport({ label, items, initialIndex, cardWidth, viewportWidth, vertical, onSelect }: {
  label: string;
  items: ReactNode[];
  initialIndex: number;
  cardWidth: number;
  viewportWidth: number;
  vertical: boolean;
  onSelect: (index: number) => void;
}) {
  const { colors } = useTheme();
  const scroll = useRef<ScrollView>(null);
  const positionInitialized = useRef(false);
  const [visibleIndex, setVisibleIndex] = useState(initialIndex);
  const [openingIndex] = useState(initialIndex);
  const interval = cardWidth + CARD_GAP;
  const count = items.length;
  // Called during dragging AND snapping: slow releases need no momentum event.
  const trackPosition = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = railIndexAtOffset(event.nativeEvent.contentOffset.x, interval, count);
    setVisibleIndex(next);
    onSelect(next);
  };
  const move = (delta: number) => {
    const next = Math.min(count - 1, Math.max(0, visibleIndex + delta));
    scroll.current?.scrollTo({ x: next * interval, animated: false });
    setVisibleIndex(next);
    onSelect(next);
    AccessibilityInfo.announceForAccessibility(`${label}, ${next + 1} of ${count}`);
  };
  if (vertical) return <View style={{ gap: CARD_GAP }}>{items}</View>;
  return (
    <View>
      <ScrollView
        ref={scroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.cardRail, { paddingRight: 16 + Math.max(0, viewportWidth - 32 - cardWidth) }]}
        style={styles.cardRailViewport}
        contentOffset={{ x: openingIndex * interval, y: 0 }}
        onLayout={() => {
          if (!positionInitialized.current) {
            positionInitialized.current = true;
            onSelect(openingIndex);
          }
        }}
        decelerationRate="fast"
        snapToInterval={interval}
        snapToAlignment="start"
        disableIntervalMomentum
        onScroll={trackPosition}
        onScrollEndDrag={trackPosition}
        onMomentumScrollEnd={trackPosition}
        scrollEventThrottle={16}
      >
        {items.map((item, index) => <View key={index} style={{ width: cardWidth }}>{item}</View>)}
      </ScrollView>
      <View style={styles.railControls}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Previous ${label} card`}
          accessibilityState={{ disabled: visibleIndex === 0 }} disabled={visibleIndex === 0}
          onPress={() => move(-1)} style={styles.railButton}>
          <ControlIcon name="chevron-back" size={20} color={visibleIndex === 0 ? colors.textSubtle : colors.interactive} />
        </Pressable>
        <Text style={[styles.railPosition, { color: colors.textSubtle }]}
          accessibilityRole="adjustable" accessibilityLabel={label}
          accessibilityValue={{ min: 1, max: count, now: visibleIndex + 1, text: `${visibleIndex + 1} of ${count}` }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={({ nativeEvent }) => {
            if (nativeEvent.actionName === 'increment') move(1);
            if (nativeEvent.actionName === 'decrement') move(-1);
          }}>
          {visibleIndex + 1} of {count}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Next ${label} card`}
          accessibilityState={{ disabled: visibleIndex === count - 1 }} disabled={visibleIndex === count - 1}
          onPress={() => move(1)} style={styles.railButton}>
          <ControlIcon name="chevron-forward" size={20} color={visibleIndex === count - 1 ? colors.textSubtle : colors.interactive} />
        </Pressable>
      </View>
    </View>
  );
}

function SectionHead({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionHead}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <Text style={[styles.sectionAction, { color: colors.interactive }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ConditionPill({ river, centered = false }: { river: RiverListItem; centered?: boolean }) {
  const code = river.currentCondition?.code ?? 'unknown';
  return (
    <View style={[styles.pill, centered ? { alignSelf: 'center' } : null, { backgroundColor: conditionBg(code), borderColor: conditionChipBorder(code) }]}>
      <Text style={[styles.pillText, { color: conditionInk(code) }]} numberOfLines={1}>
        {conditionLabel(code)}
      </Text>
    </View>
  );
}

function FloatPreviewCard({
  item,
  onPlan,
}: {
  item: FavoriteFloatSummary;
  onPlan: () => void;
}) {
  const { colors, elevation } = useTheme();
  return (
    <View style={[styles.floatPreview, { backgroundColor: colors.card }, elevation(1)]}>
      {item.photoUrl ? (
        <Image source={{ uri: item.photoUrl }} style={styles.floatPreviewPhoto} />
      ) : (
        <View style={[styles.floatFallback, { backgroundColor: colors.selectionBg }]}>
          <View style={[styles.routeDot, styles.routeDotStart, { backgroundColor: colors.accent }]} />
          <View style={[styles.routeLine, { borderColor: colors.interactive }]} />
          <View style={[styles.routeDot, styles.routeDotEnd, { backgroundColor: colors.interactive }]} />
          <EddyScene name="routePlanning" size={104} style={styles.floatEddy} />
        </View>
      )}
      <View style={styles.floatPreviewBody}>
        <Text style={[styles.floatRiver, { color: colors.accent }]}>{item.riverName.toUpperCase()}</Text>
        <Text style={[styles.floatPreviewTitle, { color: colors.text }]} numberOfLines={2}>{item.tagline}</Text>
        <Text style={[styles.floatEndpoints, { color: colors.textMuted }]} numberOfLines={2}>{item.putInName} → {item.takeOutName}</Text>
        <Text style={[styles.floatMeta, { color: colors.textMuted }]} numberOfLines={2}>{favoriteFloatMeta(item)}</Text>
        <Pressable
          onPress={onPlan}
          style={({ pressed }) => [styles.floatPlan, { backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
          accessibilityRole="button"
          accessibilityLabel={`Plan ${item.putInName} to ${item.takeOutName}`}
        >
          <ControlIcon name="map-outline" size={17} color={colors.onAccent} />
          <Text style={[styles.floatPlanText, { color: colors.onAccent }]}>Plan this float</Text>
        </Pressable>
      </View>
    </View>
  );
}

function BestRiverCard({
  recommendation,
  photoUrl,
  onOpen,
  onPlan,
  standalone = false,
}: {
  recommendation: TodayRecommendation;
  photoUrl?: string | null;
  onOpen: () => void;
  onPlan: () => void;
  standalone?: boolean;
}) {
  const { colors, elevation } = useTheme();
  const condition = recommendation.river.currentCondition;
  if (!condition) return (
    <View style={[styles.bestPreview, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.bestName, { color: colors.text }]}>{recommendation.river.name}</Text>
      <Text style={[styles.heroMeta, { color: colors.textMuted }]}>Conditions unavailable</Text>
      <Pressable onPress={onOpen} accessibilityRole="button" style={styles.secondaryButton}>
        <Text style={[styles.secondaryButtonText, { color: colors.interactive }]}>View river</Text>
      </Pressable>
    </View>
  );

  const reading = primaryReading(condition);
  const facts = [
    reading ? formatReading(reading.value, reading.unit) : null,
    condition.trend?.label ?? null,
  ].filter(Boolean).join(' · ');
  const age = readingAge(condition.readingAgeHours);

  return (
    <View
      style={[
        styles.bestPreview,
        standalone ? styles.bestStandalone : null,
        { backgroundColor: conditionBg(condition.code), borderColor: conditionChipBorder(condition.code) },
        elevation(1),
      ]}
    >
      <TodayRiverPhoto uri={photoUrl} name={recommendation.river.name} />
      <View style={styles.bestTop}>
        <View style={styles.heroCopy}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>EDDY&apos;S PICK</Text>
          <Text style={[styles.bestName, { color: colors.text }]} >{recommendation.river.name}</Text>
          <Text style={[styles.bestReason, { color: colors.textMuted }]} numberOfLines={2}>{recommendation.reason}</Text>
          <View style={styles.heroPill}><ConditionPill river={recommendation.river} /></View>
        </View>
        <Otter mood={otterForCondition(condition.code)} size={82} style={styles.bestPreviewOtter} />
      </View>
      {facts || age ? (
        <View style={[styles.factRow, { backgroundColor: colors.card }]}>
          <ControlIcon name="pulse-outline" size={17} color={conditionInk(condition.code)} />
          <View style={styles.flex}>
            {facts ? <Text style={[styles.factText, { color: colors.text }]} numberOfLines={1}>{facts}</Text> : null}
            {age ? <Text style={[styles.factAge, { color: colors.textMuted }]} numberOfLines={1}>{age}</Text> : null}
          </View>
        </View>
      ) : null}
      <View style={styles.bestFooter}>
        <BestRiverNotices notices={recommendation.notices} riverName={recommendation.river.name} />
        <View style={styles.actions}>
          <Pressable
            onPress={onPlan}
            style={({ pressed }) => [styles.primaryButton, { backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
            accessibilityRole="button"
          >
            <ControlIcon name="map-outline" size={17} color={colors.onAccent} />
            <Text style={[styles.primaryButtonText, { color: colors.onAccent }]}>Plan this river</Text>
          </Pressable>
          <Pressable
            onPress={onOpen}
            style={({ pressed }) => [styles.viewLink, { opacity: pressed ? 0.6 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
            accessibilityRole="button"
          >
            <Text style={[styles.viewLinkText, { color: colors.interactive }]}>View river</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function TodayHub({
  rivers,
  gauges,
  ensureGauges,
  location,
  refreshRevision,
  suppressNetworkNotice,
  statewide,
  reads,
  readsLoading,
  readsError,
  onRetryReads,
  conditionCounts,
  onBrowseReads,
  onBrowseRivers,
}: Props) {
  const router = useRouter();
  const { colors, elevation } = useTheme();
  const { starred, ready: starsReady } = useStarredRivers();
  const { session, ready: sessionReady } = useSession();
  const account = useAccount();
  const premiumUserId = account.loaded && !account.error && account.entitlement?.isActive && account.profile?.id === session?.user.id
    ? session?.user.id ?? null : null;
  const canUnlockRead = canOfferReadPremium({
    sessionReady,
    userId: session?.user.id ?? null,
    loaded: account.loaded,
    error: account.error,
    profileId: account.profile?.id ?? null,
    isActive: account.entitlement?.isActive ?? false,
  });
  const [paywallRiver, setPaywallRiver] = useState<string | null>(null);
  // Clear the intent as well as hiding the sheet so a later account error or
  // sign-out cannot resurrect a purchase offer the subscriber already passed.
  useEffect(() => {
    if (premiumUserId) setPaywallRiver(null);
  }, [premiumUserId]);
  const { refresh: refreshAccount } = account;
  const focusedOnce = useRef(false);
  useFocusEffect(useCallback(() => {
    if (focusedOnce.current) void refreshAccount();
    focusedOnce.current = true;
  }, [refreshAccount]));
  useEffect(() => onForeground(() => { void refreshAccount(); }), [refreshAccount]);
  const openRead = (slug: string) => router.push({ pathname: '/river/[slug]', params: { slug, focus: 'read' } });

  const [floats, setFloats] = useState<FavoriteFloatSummary[] | null>(null);
  const [safety, setSafety] = useState<{
    high: HighWaterEntry[] | null;
    notices: RiverAlert[] | null;
  }>({ high: null, notices: null });
  const [floatFailure, setFloatFailure] = useState(false);
  const [safetyFailure, setSafetyFailure] = useState({ high: false, notices: false });
  const [incumbentState, setIncumbentState] = useState<{
    ready: boolean;
    riverId: string | null;
  }>({ ready: false, riverId: null });
  const [localWeather, setLocalWeather] = useState<{
    data: Awaited<ReturnType<typeof fetchLocationWeather>>;
    coordsKey: string;
  } | null>(null);
  const [weatherFailedKey, setWeatherFailedKey] = useState<string | null>(null);
  const [weatherRetry, setWeatherRetry] = useState(0);

  useEffect(() => {
    void ensureGauges();
    void readRecommendation().then((riverId) => setIncumbentState({ ready: true, riverId }));
  }, [ensureGauges]);

  useEffect(() => {
    let current = true;
    void readFavoriteFloats().then((cached) => {
      if (current && cached) setFloats(cached);
    });
    const controller = new AbortController();
    void takePreloadedToday('floats', controller.signal)
      .then((live) => {
        if (!current) return;
        setFloats(live);
        setFloatFailure(false);
        writeFavoriteFloats(live);
      })
      .catch((error) => {
        if (!current || (error instanceof ApiError && error.message === 'Request cancelled')) return;
        setFloatFailure(true);
        setFloats((value) => value ?? []);
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [refreshRevision]);

  useEffect(() => {
    const controller = new AbortController();

    void takePreloadedToday('highWater', controller.signal).then(
      (entries) => {
        if (controller.signal.aborted) return;
        setSafety((current) => ({ ...current, high: entries }));
        setSafetyFailure((current) => ({ ...current, high: false }));
      },
      () => {
        if (!controller.signal.aborted) setSafetyFailure((current) => ({ ...current, high: true }));
      },
    );
    void takePreloadedToday('notices', controller.signal).then(
      (entries) => {
        if (controller.signal.aborted) return;
        setSafety((current) => ({ ...current, notices: entries }));
        setSafetyFailure((current) => ({ ...current, notices: false }));
      },
      () => {
        if (!controller.signal.aborted) setSafetyFailure((current) => ({ ...current, notices: true }));
      },
    );
    return () => controller.abort();
  }, [refreshRevision]);

  const weatherCoordsKey = location.coords
    ? `${Math.round(location.coords.lat / 0.05)}:${Math.round(location.coords.lng / 0.05)}`
    : null;
  const weatherCoords = useMemo(() => {
    if (!weatherCoordsKey) return null;
    const [latBucket, lngBucket] = weatherCoordsKey.split(':').map(Number);
    return { lat: latBucket * 0.05, lng: lngBucket * 0.05 };
  }, [weatherCoordsKey]);
  useEffect(() => {
    if (!weatherCoords || !weatherCoordsKey) return;
    const controller = new AbortController();
    void fetchLocationWeather(weatherCoords, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setLocalWeather({ data, coordsKey: weatherCoordsKey });
          setWeatherFailedKey(null);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setWeatherFailedKey(weatherCoordsKey);
      });
    return () => controller.abort();
  }, [refreshRevision, weatherCoords, weatherCoordsKey, weatherRetry]);

  const favoriteIds = useMemo(
    () => new Set(starred.filter((item) => item.kind === 'river').map((item) => item.entityId)),
    [starred],
  );
  const recommendations = useMemo(
    () => incumbentState.ready ? chooseTodayRecommendations({
      rivers,
      gauges: gauges ?? [],
      favoriteRiverIds: favoriteIds,
      notices: safety.notices,
      coords: location.coords,
      incumbentRiverId: incumbentState.riverId,
    }) : [],
    [favoriteIds, gauges, incumbentState, location.coords, rivers, safety.notices],
  );
  const recommendation = recommendations[0] ?? null;

  useEffect(() => {
    if (!incumbentState.ready || !recommendation || recommendation.river.id === incumbentState.riverId) return;
    const next = recommendation.river.id;
    void writeRecommendation(next).then(() => setIncumbentState({ ready: true, riverId: next }));
  }, [incumbentState, recommendation]);

  const openPlan = useCallback((riverSlug: string, putInId?: string, takeOutId?: string) => {
    router.push({
      pathname: '/',
      params: { focusRiver: riverSlug, openPlan: '1', planPutIn: putInId, planTakeOut: takeOutId },
    });
  }, [router]);

  const safetyFilter = defaultCurrentAlertsFilter(starred);
  const activeSafety = currentAlertsSummary(
    starsReady ? safety.high : null,
    starsReady ? safety.notices : null,
    safetyFilter,
    starred,
    safetyFailure,
  );
  const safetyCount = activeSafety.count;
  const detailFailure = floatFailure || safetyFailure.high || safetyFailure.notices;
  const safetyFilterLabel = safetyFilter === 'favorites' ? 'Favorites' : 'All Alerts';
  const topNotice = useMemo(() => {
    const rank = { warning: 0, watch: 1, notice: 2 } as const;
    return [...activeSafety.notices].sort((a, b) => rank[a.severity] - rank[b.severity])[0] ?? null;
  }, [activeSafety.notices]);
  const ordinaryTopHigh = useMemo(
    () => [...activeSafety.high].sort((a, b) => Number(b.conditionCode === 'dangerous') - Number(a.conditionCode === 'dangerous'))[0] ?? null,
    [activeSafety.high],
  );
  const topHigh = ordinaryTopHigh;
  const photos = useMemo(() => {
    const result = new Map<string, string>();
    for (const river of rivers) if (river.photoUrl) result.set(river.slug, river.photoUrl);
    for (const item of floats ?? []) if (item.photoUrl && !result.has(item.riverSlug)) result.set(item.riverSlug, item.photoUrl);
    return result;
  }, [floats, rivers]);
  const featuredFloat = useMemo(() => dailyFavoriteFloats(floats ?? [])[0] ?? null, [floats]);
  const previewDistances = useMemo(
    () => location.coords && gauges ? riverMilesByGauge(gauges, location.coords) : null,
    [gauges, location.coords],
  );
  // Ranked exactly as the validated Reads will be (minus prose age, which is
  // unknown until they land), so early Premium cards and photo prefetches
  // name the rivers the settled rail shows. Best River cards no longer contain
  // Reads, so their rivers stay eligible for this dedicated rail too.
  const readCandidates = useMemo(() => selectReadRail(
    [...rivers].sort((a, b) => compareReadRivers(a, b, {
      isFavorite: (id) => favoriteIds.has(id),
      distances: previewDistances,
    })),
    new Set<string>(), (river) => river.id,
  ), [rivers, favoriteIds, previewDistances]);
  const readPreviews = useMemo(() => {
    // Premium requests still start before the public index; these candidates
    // have already been selected, so do not filter or truncate them again.
    if (!reads.length && premiumUserId && (readsLoading || readsError)) {
      return readCandidates.map((river) => ({ river, says: { text: '', generatedAt: '' } }));
    }
    return selectReadRail(reads, new Set<string>(), ({ river }) => river.id);
  }, [reads, premiumUserId, readsLoading, readsError, readCandidates]);
  const readState = readRailState(readPreviews.length, readsLoading, readsError);
  // Warm only the first rail's likely photos while the public index is in flight.
  // Rendering and prefetching use the same Expo cache. Failed prefetches never
  // block cards, and may be retried when the candidates change or on refresh.
  const readPhotoKey = JSON.stringify(Array.from(new Set(
    (readPreviews.length ? readPreviews.map(({ river }) => river) : readCandidates)
      .map((river) => photos.get(river.slug)).filter((url): url is string => Boolean(url)),
  )));
  const prefetchedPhotos = useRef(new Set<string>());
  useEffect(() => {
    const urls: string[] = JSON.parse(readPhotoKey);
    for (const url of urls) {
      if (prefetchedPhotos.current.has(url)) continue;
      prefetchedPhotos.current.add(url);
      void CachedImage.prefetch(url, { cachePolicy: 'memory-disk' })
        .then((ok) => { if (!ok) prefetchedPhotos.current.delete(url); })
        .catch(() => { prefetchedPhotos.current.delete(url); });
    }
  }, [readPhotoKey, refreshRevision]);
  // This quick conditions list still includes relevant rivers featured elsewhere
  // on Today. Loading Reads must not remove a favorite or shuffle these rows.
  const conditionPreviews = useMemo(() => [...rivers]
    .sort((a, b) => {
      const favoriteOrder = Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id));
      if (favoriteOrder !== 0) return favoriteOrder;
      if (previewDistances) {
        const distanceOrder = (previewDistances.get(a.id) ?? Infinity) - (previewDistances.get(b.id) ?? Infinity);
        if (distanceOrder !== 0) return distanceOrder;
      }
      const conditionOrder = floatableRank(a.currentCondition?.code ?? 'unknown') - floatableRank(b.currentCondition?.code ?? 'unknown');
      if (conditionOrder !== 0) return conditionOrder;
      return (a.currentCondition?.readingAgeHours ?? Infinity) - (b.currentCondition?.readingAgeHours ?? Infinity);
    })
    .slice(0, 3), [favoriteIds, previewDistances, rivers]);
  const activeWeather = weatherCoordsKey && localWeather?.coordsKey === weatherCoordsKey
    ? localWeather.data
    : null;
  const localWeatherFailed = Boolean(weatherCoordsKey && weatherFailedKey === weatherCoordsKey);
  const requestLocalWeather = location.coords
    ? localWeatherFailed
      ? () => {
          setWeatherFailedKey(null);
          setWeatherRetry((value) => value + 1);
        }
      : null
    : () => {
        if (location.status === 'denied') void Linking.openSettings();
        else void location.request();
      };
  const locationActionLabel = localWeatherFailed
    ? 'Retry local weather'
    : location.status === 'locating'
      ? 'Finding your location…'
      : location.status === 'denied'
        ? 'Open Settings for local weather'
        : 'Use my location for local weather';
  return (
    <View style={styles.hub}>
      {!suppressNetworkNotice && detailFailure ? (
        <View style={[styles.notice, { backgroundColor: colors.cardRaised, borderColor: colors.border }]}>
          <ControlIcon name="cloud-offline-outline" size={16} color={colors.textMuted} />
          <Text style={[styles.noticeText, { color: colors.textMuted }]}>Some live details could not refresh. Showing what Eddy has.</Text>
        </View>
      ) : null}

      <View style={styles.summaryTop}>
        {statewide.headline ? (
          <TodaySummary
            headline={statewide.headline}
            prose={statewide.prose}
            generatedAt={statewide.generatedAt}
            loading={readsLoading}
            error={readsError}
            onRetry={onRetryReads}
          />
        ) : null}
        <View style={styles.weatherAlerts}>
          <View style={styles.compactColumn}>
            <TodayWeather compact locationEnabled={Boolean(location.coords)}
              onOpen={() => {
                if (!weatherCoords || !activeWeather) return;
                seedLocationForecast(JSON.stringify([weatherCoords.lat, weatherCoords.lng]), activeWeather);
                router.push({ pathname: '/weather', params: { lat: String(weatherCoords.lat), lng: String(weatherCoords.lng) } });
              }}
              weather={activeWeather?.days[0] ?? null}
              weatherLocation={activeWeather?.city ?? null}
              weatherLoading={Boolean(location.coords && !activeWeather && !localWeatherFailed)}
              onRequestLocation={requestLocalWeather}
              locationActionLabel={locationActionLabel}
            />
          </View>
          <View style={styles.compactColumn}>
            <View style={[styles.alertCard, { backgroundColor: colors.card, borderColor: colors.border }, elevation(1)]}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Current alerts. ${activeSafety.label}. ${safetyFilterLabel}. ${activeSafety.detail ?? ''} ${topNotice?.title ?? (topHigh ? `${topHigh.name}: ${conditionLabel(topHigh.conditionCode)}` : '')}`} onPress={() => router.push({ pathname: '/current-alerts', params: { filter: safetyFilter } })} style={styles.alertMain}>
                <View style={styles.compactHeading}>
                  <ControlIcon name={safetyCount ? 'warning-outline' : 'notifications-outline'} size={28} color={safetyCount ? conditionInk(topHigh?.conditionCode === 'dangerous' || topNotice?.severity === 'warning' ? 'dangerous' : 'high') : colors.interactive} />
                </View>
                <Text style={[styles.compactValue, { color: colors.text }, safetyCount ? styles.alertCount : null]}>{activeSafety.label}</Text>
                {activeSafety.detail ? <Text style={[styles.alertStatus, { color: colors.textMuted }]}>{activeSafety.detail}</Text> : null}
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <SectionHead title="Eddy’s Reads" action={reads.length > 0 ? 'See all' : undefined} onAction={onBrowseReads} />
        {readPreviews.length > 1 ? (
          <CardRail label="Eddy's Reads" cardWidth={286}>
            {readPreviews.map(({ river, says }) => (
              <EddyReadCard
                key={river.id}
                river={river}
                says={{ generatedAt: says.generatedAt }}
                compact
                photoUrl={photos.get(river.slug)}
                premiumUserId={premiumUserId}
                onUnlock={canUnlockRead ? () => setPaywallRiver(river.name) : undefined}
                refreshRevision={refreshRevision}
                onPress={() => openRead(river.slug)}
              />
            ))}
          </CardRail>
        ) : readPreviews.length === 1 ? (
          <EddyReadCard
            river={readPreviews[0].river}
            says={{ generatedAt: readPreviews[0].says.generatedAt }}
            standalone
            photoUrl={photos.get(readPreviews[0].river.slug)}
            premiumUserId={premiumUserId}
            onUnlock={canUnlockRead ? () => setPaywallRiver(readPreviews[0].river.name) : undefined}
            refreshRevision={refreshRevision}
            onPress={() => openRead(readPreviews[0].river.slug)}
          />
        ) : readState === 'error' ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ color: colors.textMuted }}>Couldn’t load Eddy’s Reads.</Text>
            <Pressable onPress={onRetryReads} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.interactive }}>Retry Reads</Text></Pressable>
          </View>
        ) : readState === 'loading' ? (
          <CardRail label="Eddy's Reads" cardWidth={286}>
            {[0, 1, 2].map((index) => <EddyReadPlaceholder key={index} />)}
          </CardRail>
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: colors.selectionBg, borderColor: colors.border }]}>
            <View style={styles.flex}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Eddy is between reads</Text>
              <Text style={[styles.emptyBody, { color: colors.textMuted }]}>New reads appear when current conditions are available.</Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <SectionHead title={location.coords ? 'Best Near You' : 'Best Right Now'} />
        {!gauges || !incumbentState.ready ? (
          <View style={styles.loading}><ActivityIndicator color={colors.interactive} /></View>
        ) : recommendations.length > 1 ? (
          <CardRail label={location.coords ? 'Best Near You' : 'Best Right Now'} cardWidth={300}>
            {recommendations.map((item) => (
              <BestRiverCard
                key={item.river.id}
                recommendation={item}
                photoUrl={photos.get(item.river.slug)}
                onOpen={() => router.push(`/river/${item.river.slug}`)}
                onPlan={() => openPlan(item.river.slug)}
              />
            ))}
          </CardRail>
        ) : recommendations.length === 1 ? (
          <BestRiverCard
            recommendation={recommendations[0]}
            photoUrl={photos.get(recommendations[0].river.slug)}
            onOpen={() => router.push(`/river/${recommendations[0].river.slug}`)}
            onPlan={() => openPlan(recommendations[0].river.slug)}
            standalone
          />
        ) : (
          <View style={[styles.emptyBest, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {location.coords ? `No fresh floatable pick within ${TODAY_RADIUS_MILES} miles` : 'No fresh floatable reading yet'}
            </Text>
          </View>
        )}
      </View>

      <TodayCamping revision={refreshRevision} />

      <View style={styles.section}>
        <TodayRiverConditions
          rivers={conditionPreviews}
          total={rivers.length}
          counts={conditionCounts}
          photos={photos}
          onBrowse={onBrowseRivers}
          onOpenRiver={(slug) => router.push(`/river/${slug}`)}
        />
      </View>

      {featuredFloat ? (
        <View style={styles.section}>
          <SectionHead title="Featured float" action="See all" onAction={() => router.push('/favorite-floats')} />
          <FloatPreviewCard
            item={featuredFloat}
            onPlan={() => openPlan(featuredFloat.riverSlug, featuredFloat.putInId, featuredFloat.takeOutId)}
          />
        </View>
      ) : null}

      <PaywallSheet
        visible={paywallRiver !== null && !premiumUserId}
        riverName={paywallRiver ?? undefined}
        onClose={() => setPaywallRiver(null)}
        onPurchased={() => { void refreshAccount(); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hub: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 18 },
  flex: { flex: 1, minWidth: 0 },
  notice: { borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  noticeText: { ...t.sm, fontFamily: fonts.body, flex: 1 },
  weatherAlerts: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  compactColumn: { flex: 1, minWidth: 0 },
  alertCard: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 12, minHeight: 120 },
  alertMain: { flex: 1, minHeight: 44, gap: 6, alignItems: 'center', justifyContent: 'center' },
  compactHeading: { minHeight: 29, alignItems: 'center', justifyContent: 'center' },
  alertStatus: { ...t.xs, textAlign: 'center' },
  alertCount: { ...t['3xl'], fontFamily: fonts.semibold },
  compactValue: { ...t.xl, minHeight: 38, lineHeight: 38, fontFamily: fonts.semibold, textAlign: 'center' },
  summaryTop: { marginBottom: 14, gap: 10 },
  section: { marginBottom: 24 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 2 },
  sectionTitle: { ...textStyles.sectionTitle },
  sectionAction: { ...t.sm, fontFamily: fonts.semibold },
  heroCopy: { flex: 1, minWidth: 0, zIndex: 1 },
  eyebrow: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 0.9, marginBottom: 3 },
  heroMeta: { ...t.sm, fontFamily: fonts.body, marginTop: 4 },
  heroPill: { alignSelf: 'flex-start', marginTop: 9 },
  pill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  pillText: { ...t.xs, fontFamily: fonts.semibold },
  emptyCard: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  emptyBest: { borderWidth: 1, borderRadius: radii.card, padding: 18 },
  emptyTitle: { ...t.base, fontFamily: fonts.semibold },
  emptyBody: { ...t.sm, fontFamily: fonts.body, marginTop: 3 },
  loading: { height: 150, alignItems: 'center', justifyContent: 'center' },
  // Rail wrappers stretch to the tallest sibling; let each card fill its wrapper
  // while keeping intrinsic height for standalone and large-text stacked cards.
  bestPreview: { width: '100%', flexGrow: 1, borderWidth: 1, borderRadius: radii.feature, padding: 16 },
  bestStandalone: { width: 'auto', height: 'auto' },
  bestTop: { flexDirection: 'row', alignItems: 'center', minHeight: 112 },
  bestName: { ...t['2xl'], fontFamily: fonts.display },
  bestReason: { ...t.sm, fontFamily: fonts.body, marginTop: 4 },
  bestPreviewOtter: { marginRight: -10, marginLeft: 2 },
  factRow: { minHeight: 44, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  factText: { ...t.sm, fontFamily: fonts.mono, flex: 1 },
  factAge: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  bestFooter: { marginTop: 'auto' },
  actions: { flexWrap: 'wrap', flexDirection: 'row', alignItems: 'center', gap: 9, paddingTop: 15 },
  secondaryButton: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { ...t.sm, fontFamily: fonts.semibold },
  primaryButton: { minHeight: 46, borderRadius: 12, paddingHorizontal: 16, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  primaryButtonText: { ...t.sm, fontFamily: fonts.semibold, flexShrink: 1 },
  viewLink: { minHeight: 46, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  viewLinkText: { ...t.sm, fontFamily: fonts.semibold },
  flexButton: { flex: 1 },
  railControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  railButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  cardRailViewport: { marginHorizontal: -16 },
  cardRail: { paddingHorizontal: 16, paddingBottom: 2, gap: CARD_GAP, alignItems: 'stretch' },
  railPosition: { ...t.xs, fontFamily: fonts.mono, textAlign: 'right', marginTop: 5, paddingRight: 2 },
  floatPreview: { width: '100%', borderRadius: 18, overflow: 'hidden' },
  floatPreviewPhoto: { width: '100%', height: 126 },
  floatFallback: { width: '100%', height: 126, overflow: 'hidden' },
  routeDot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, zIndex: 2 },
  routeDotStart: { left: 26, top: 35 },
  routeDotEnd: { left: 104, top: 87 },
  routeLine: { position: 'absolute', left: 35, top: 43, width: 77, height: 50, borderLeftWidth: 3, borderBottomWidth: 3, borderBottomLeftRadius: 22, transform: [{ rotate: '-10deg' }] },
  floatEddy: { position: 'absolute', right: 8, bottom: -9 },
  floatPreviewBody: { padding: 14 },
  floatRiver: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 0.8 },
  floatPreviewTitle: { ...t.lg, fontFamily: fonts.heading, marginTop: 3 },
  floatEndpoints: { ...t.sm, fontFamily: fonts.body, marginTop: 5 },
  floatMeta: { ...t.xs, fontFamily: fonts.mono, marginTop: 7 },
  floatPlan: { minHeight: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 12 },
  floatPlanText: { ...t.sm, fontFamily: fonts.semibold },
});
