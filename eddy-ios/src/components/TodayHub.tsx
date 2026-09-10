import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type {
  FavoriteFloatSummary,
  HighWaterEntry,
  MapGauge,
  RiverAlert,
  RiverListItem,
  RiverOutlookResponse,
} from '@eddy/types';
import type { Coords } from '@eddy/geo';
import {
  ApiError,
  fetchFavoriteFloats,
  fetchHighWater,
  fetchLocationWeather,
  fetchRiverAlerts,
  fetchRiverOutlook,
} from '@/api/client';
import { PaywallSheet } from '@/components/PaywallSheet';
import { EddyReadCard } from '@/components/EddyReadCard';
import { EddyScene } from '@/components/EddyScene';
import { Otter, otterForCondition } from '@/components/Otter';
import { TodaySummary, TodayWeather } from '@/components/TodaySummary';
import { useAccount } from '@/hooks/useAccount';
import { useSession } from '@/hooks/useSession';
import { type LocationStatus } from '@/hooks/useLocation';
import { useStarredRivers, type StarredItem } from '@/hooks/useStarredRivers';
import { readFavoriteFloats, writeFavoriteFloats } from '@/lib/favoriteFloatCache';
import { favoriteFloatMeta } from '@/lib/favoriteFloatCopy';
import { formatReading, primaryReading, readingAge } from '@/lib/readingCopy';
import { dailyFavoriteFloats, dailyHighlightedFavorite } from '@/lib/todayFloats';
import {
  chooseTodayRecommendation,
  TODAY_RADIUS_MILES,
} from '@/lib/todayRecommendation';
import { readRecommendation, writeRecommendation } from '@/lib/todayPreferences';
import type { EddySays } from '@/lib/eddySays';
import { riverMilesByGauge } from '@/lib/riverDistance';
import { chooseTodaySafetyScope, filterTodaySafety } from '@/lib/todaySafety';
import {
  conditionBg,
  conditionChipBorder,
  conditionInk,
  conditionLabel,
  floatableRank,
} from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

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
  conditionCounts: Record<'floatable' | 'low' | 'high' | 'unknown', number>;
  onBrowseReads: () => void;
  onBrowseRivers: (filter: TodayRiverFilter) => void;
}

export type TodayRiverFilter = 'all' | 'floatable' | 'starred' | 'low' | 'high' | 'unknown';

export interface TodayRead {
  river: RiverListItem;
  says: EddySays;
}

const NO_FAVORITE_RIVERS = new Set<string>();

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

function ConditionPill({ river }: { river: RiverListItem }) {
  const code = river.currentCondition?.code ?? 'unknown';
  return (
    <View style={[styles.pill, { backgroundColor: conditionBg(code), borderColor: conditionChipBorder(code) }]}>
      <Text style={[styles.pillText, { color: conditionInk(code) }]} numberOfLines={1}>
        {conditionLabel(code)}
      </Text>
    </View>
  );
}

function CompactRiverRow({ river, onPress }: { river: RiverListItem; onPress: () => void }) {
  const { colors } = useTheme();
  const reading = river.currentCondition ? primaryReading(river.currentCondition) : null;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.compactRiver, { borderBottomColor: colors.border, opacity: pressed ? 0.65 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={`${river.name}, ${conditionLabel(river.currentCondition?.code ?? 'unknown')}`}
    >
      <View style={styles.flex}>
        <Text style={[styles.compactRiverName, { color: colors.text }]} numberOfLines={1}>{river.name}</Text>
        <Text style={[styles.compactRiverMeta, { color: colors.textMuted }]} numberOfLines={1}>
          {reading ? formatReading(reading.value, reading.unit) : 'No fresh reading'}
        </Text>
      </View>
      <ConditionPill river={river} />
      <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
    </Pressable>
  );
}

function favoriteDetail(item: StarredItem, river: RiverListItem | null): string {
  const reading = river?.currentCondition ? primaryReading(river.currentCondition) : null;
  return reading
    ? [formatReading(reading.value, reading.unit), readingAge(river?.currentCondition?.readingAgeHours)]
        .filter(Boolean)
        .join(' · ')
    : item.kind === 'river'
      ? 'Conditions unavailable'
      : item.kind === 'gauge'
        ? 'Saved gauge'
        : 'Saved dam';
}

function SafetyRow({
  kicker,
  title,
  meta,
  icon,
  ink,
  surface,
  onPress,
}: {
  kicker: string;
  title: string;
  meta: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  ink: string;
  surface: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.safetyRow,
        { backgroundColor: surface, borderColor: ink, opacity: pressed ? 0.72 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${meta}`}
    >
      <View style={[styles.safetyIcon, { backgroundColor: colors.card }]}>
        <Ionicons name={icon} size={19} color={ink} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.safetyKicker, { color: ink }]}>{kicker}</Text>
        <Text style={[styles.safetyRowTitle, { color: colors.text }]} numberOfLines={2}>{title}</Text>
        <Text style={[styles.safetyRowMeta, { color: colors.textMuted }]} numberOfLines={1}>{meta}</Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color={ink} />
    </Pressable>
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
          style={({ pressed }) => [styles.floatPlan, { backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill }]}
          accessibilityRole="button"
          accessibilityLabel={`Plan ${item.putInName} to ${item.takeOutName}`}
        >
          <Ionicons name="map-outline" size={17} color={colors.onAccent} />
          <Text style={[styles.floatPlanText, { color: colors.onAccent }]}>Plan this float</Text>
        </Pressable>
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
  conditionCounts,
  onBrowseReads,
  onBrowseRivers,
}: Props) {
  const router = useRouter();
  const { colors, elevation } = useTheme();
  const { starred, ready: starsReady } = useStarredRivers();
  const { entitlement, loaded: accountLoaded, error: accountError, refresh: refreshAccount } = useAccount();
  const { getAccessToken } = useSession();
  const entitled = accountLoaded && !accountError ? Boolean(entitlement?.isActive) : null;
  const requestPremiumOutlook = entitled === true;
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
  const [outlook, setOutlook] = useState<{ slug: string; data: RiverOutlookResponse | null } | null>(null);
  const [localWeather, setLocalWeather] = useState<{
    data: Awaited<ReturnType<typeof fetchLocationWeather>>;
    coordsKey: string;
  } | null>(null);
  const [weatherFailedKey, setWeatherFailedKey] = useState<string | null>(null);
  const [weatherRetry, setWeatherRetry] = useState(0);
  const [paywallOpen, setPaywallOpen] = useState(false);

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
    void fetchFavoriteFloats(controller.signal)
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

  const favoriteRiverSlugs = useMemo(
    () => new Set(starred.filter((item) => item.kind === 'river' && item.slug).map((item) => item.slug)),
    [starred],
  );
  const safetyScope = useMemo(() => chooseTodaySafetyScope({
    favoriteRiverSlugs: starsReady ? favoriteRiverSlugs : NO_FAVORITE_RIVERS,
    rivers,
    gauges: gauges ?? [],
    // Until favorites and the gauge geometry are ready, severe statewide
    // warnings are the honest progressive result. The same fetched arrays are
    // narrowed locally as soon as a personalized scope can be resolved.
    coords: starsReady && (!location.coords || gauges) ? location.coords : null,
  }), [favoriteRiverSlugs, gauges, location.coords, rivers, starsReady]);

  useEffect(() => {
    const controller = new AbortController();

    void fetchHighWater(controller.signal).then(
      (entries) => {
        if (controller.signal.aborted) return;
        setSafety((current) => ({ ...current, high: entries }));
        setSafetyFailure((current) => ({ ...current, high: false }));
      },
      () => {
        if (!controller.signal.aborted) setSafetyFailure((current) => ({ ...current, high: true }));
      },
    );
    void fetchRiverAlerts(undefined, controller.signal).then(
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
  useEffect(() => {
    if (!location.coords || !weatherCoordsKey) return;
    const controller = new AbortController();
    void fetchLocationWeather(location.coords, controller.signal)
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
  }, [location.coords, refreshRevision, weatherCoordsKey, weatherRetry]);

  const favoriteIds = useMemo(
    () => new Set(starred.filter((item) => item.kind === 'river').map((item) => item.entityId)),
    [starred],
  );
  const highlightedFavorite = useMemo(() => dailyHighlightedFavorite(starred), [starred]);
  const recommendation = useMemo(
    () => incumbentState.ready ? chooseTodayRecommendation({
      rivers,
      gauges: gauges ?? [],
      favoriteRiverIds: favoriteIds,
      coords: location.coords,
      incumbentRiverId: incumbentState.riverId,
    }) : null,
    [favoriteIds, gauges, incumbentState, location.coords, rivers],
  );

  useEffect(() => {
    if (!incumbentState.ready || !recommendation || recommendation.river.id === incumbentState.riverId) return;
    const next = recommendation.river.id;
    void writeRecommendation(next).then(() => setIncumbentState({ ready: true, riverId: next }));
  }, [incumbentState, recommendation]);

  const outlookSlug = recommendation?.river.slug
    ?? (highlightedFavorite?.kind === 'river' ? highlightedFavorite.slug : null)
    ?? null;
  useEffect(() => {
    if (!outlookSlug) return;
    const controller = new AbortController();
    void (async () => {
      const token = requestPremiumOutlook ? await getAccessToken() : null;
      return fetchRiverOutlook(outlookSlug, controller.signal, null, token);
    })()
      .then((data) => {
        if (!controller.signal.aborted) setOutlook({ slug: outlookSlug, data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setOutlook({ slug: outlookSlug, data: null });
      });
    return () => controller.abort();
  }, [getAccessToken, outlookSlug, refreshRevision, requestPremiumOutlook]);

  const riverById = useMemo(() => new Map(rivers.map((river) => [river.id, river])), [rivers]);
  const highlightedRiver = highlightedFavorite?.kind === 'river'
    ? riverById.get(highlightedFavorite.entityId) ?? null
    : null;
  const openFavorite = useCallback((item: StarredItem) => {
    if (item.kind === 'river' && item.slug) router.push(`/river/${item.slug}`);
    else if (item.kind === 'gauge' && item.usgsSiteId) router.push(`/gauge/${item.usgsSiteId}`);
    else if (item.kind === 'dam') router.push(`/dam/${item.entityId}`);
  }, [router]);
  const openPlan = useCallback((riverSlug: string, putInId?: string, takeOutId?: string) => {
    router.push({
      pathname: '/',
      params: { focusRiver: riverSlug, openPlan: '1', planPutIn: putInId, planTakeOut: takeOutId },
    });
  }, [router]);

  const filteredSafety = useMemo(
    () => filterTodaySafety(safety.high ?? [], safety.notices ?? [], safetyScope),
    [safety.high, safety.notices, safetyScope],
  );
  const activeSafety = {
    high: safety.high === null ? null : filteredSafety.high,
    notices: safety.notices === null ? null : filteredSafety.notices,
  };
  const safetyCount = (activeSafety?.high?.length ?? 0) + (activeSafety?.notices?.length ?? 0);
  const detailFailure = floatFailure || safetyFailure.high || safetyFailure.notices;
  const safetyScopeLabel = safetyScope.kind === 'favorites'
    ? 'on your favorite rivers'
    : safetyScope.kind === 'nearby'
      ? 'near you'
      : 'statewide';
  const topNotice = useMemo(() => {
    const rank = { warning: 0, watch: 1, notice: 2 } as const;
    return [...(activeSafety?.notices ?? [])].sort((a, b) => rank[a.severity] - rank[b.severity])[0] ?? null;
  }, [activeSafety?.notices]);
  const topHigh = useMemo(
    () => [...(activeSafety?.high ?? [])].sort((a, b) => Number(b.conditionCode === 'dangerous') - Number(a.conditionCode === 'dangerous'))[0] ?? null,
    [activeSafety?.high],
  );
  const floatPreviews = useMemo(() => dailyFavoriteFloats(floats ?? []).slice(0, 4), [floats]);
  const previewDistances = useMemo(
    () => location.coords && gauges ? riverMilesByGauge(gauges, location.coords) : null,
    [gauges, location.coords],
  );
  const readPreviews = useMemo(() => {
    const reserved = new Set<string>();
    if (highlightedFavorite?.kind === 'river') reserved.add(highlightedFavorite.entityId);
    if (recommendation) reserved.add(recommendation.river.id);
    const distinct = reads.filter(({ river }) => !reserved.has(river.id));
    return (distinct.length > 0 ? distinct : reads).slice(0, 3);
  }, [highlightedFavorite, reads, recommendation]);
  const previewReservedIds = useMemo(() => {
    const ids = new Set(readPreviews.map(({ river }) => river.id));
    if (highlightedFavorite?.kind === 'river') ids.add(highlightedFavorite.entityId);
    if (recommendation) ids.add(recommendation.river.id);
    return ids;
  }, [highlightedFavorite, readPreviews, recommendation]);
  const conditionPreviews = useMemo(() => [...rivers]
    .filter((river) => !previewReservedIds.has(river.id))
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
    .slice(0, 3), [favoriteIds, previewDistances, previewReservedIds, rivers]);
  const condition = recommendation?.river.currentCondition ?? null;
  const reading = condition ? primaryReading(condition) : null;
  const liveOutlook = outlook && outlook.slug === recommendation?.river.slug ? outlook.data : null;
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
  const eddyRead = liveOutlook?.fullRead ?? liveOutlook?.sections?.eddyRead ?? liveOutlook?.sections?.bottomLine ?? null;
  const recommendationFacts = condition
    ? [
        reading ? formatReading(reading.value, reading.unit) : null,
        condition.trend?.label ?? null,
      ].filter(Boolean).join(' · ')
    : '';
  const recommendationAge = condition ? readingAge(condition.readingAgeHours) : null;
  const publicRead = recommendation && condition
    ? `${recommendation.river.name} has ${conditionLabel(condition.code).toLowerCase()} water based on a fresh gauge reading.`
    : null;

  return (
    <View style={styles.hub}>
      {!suppressNetworkNotice && detailFailure ? (
        <View style={[styles.notice, { backgroundColor: colors.cardRaised, borderColor: colors.border }]}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.textMuted} />
          <Text style={[styles.noticeText, { color: colors.textMuted }]}>Some live details could not refresh. Showing what Eddy has.</Text>
        </View>
      ) : null}

      {safetyCount > 0 ? (
        <View style={styles.safetySection}>
          <View style={styles.safetyRows}>
            {topNotice ? (
              <SafetyRow
                kicker="BEFORE YOU LAUNCH"
                title={topNotice.title}
                meta={`${topNotice.source.toUpperCase()} · ${activeSafety?.notices?.length ?? 0} agency ${(activeSafety?.notices?.length ?? 0) === 1 ? 'notice' : 'notices'} ${safetyScopeLabel}`}
                icon={topNotice.severity === 'warning' ? 'warning-outline' : 'megaphone-outline'}
                ink={topNotice.severity === 'warning' ? conditionInk('dangerous') : colors.accent}
                surface={topNotice.severity === 'warning' ? conditionBg('dangerous') : colors.cardRaised}
                onPress={() => router.push({ pathname: '/alerts', params: { segment: 'notices' } })}
              />
            ) : null}
            {topHigh ? (
              <SafetyRow
                kicker="HIGH WATER"
                title={`${topHigh.name} is ${conditionLabel(topHigh.conditionCode).toLowerCase()}`}
                meta={`${activeSafety?.high?.length ?? 0} high-water ${(activeSafety?.high?.length ?? 0) === 1 ? 'reading' : 'readings'} ${safetyScopeLabel}`}
                icon="water-outline"
                ink={conditionInk(topHigh.conditionCode)}
                surface={conditionBg(topHigh.conditionCode)}
                onPress={() => router.push({ pathname: '/alerts', params: { segment: 'high-water' } })}
              />
            ) : null}
          </View>
        </View>
      ) : null}

      <View style={styles.summaryTop}>
        {statewide.headline ? (
          <TodaySummary
            headline={statewide.headline}
            prose={statewide.prose}
            generatedAt={statewide.generatedAt}
          />
        ) : null}
        <TodayWeather
          weather={activeWeather?.days[0] ?? null}
          weatherLocation={activeWeather?.city ?? null}
          weatherLoading={Boolean(location.coords && !activeWeather && !localWeatherFailed)}
          onRequestLocation={requestLocalWeather}
          locationActionLabel={locationActionLabel}
        />
      </View>

      <View style={styles.section}>
        <SectionHead title="Eddy’s Reads" action={reads.length > 0 ? 'See all' : undefined} onAction={onBrowseReads} />
        {readPreviews.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.readRail}
            style={styles.floatRailViewport}
            decelerationRate="fast"
          >
            {readPreviews.map(({ river, says }) => (
              <EddyReadCard
                key={river.id}
                river={river}
                says={says}
                compact
                onPress={() => router.push(`/river/${river.slug}`)}
              />
            ))}
          </ScrollView>
        ) : readsLoading ? (
          <View style={styles.loading}><ActivityIndicator color={colors.interactive} /></View>
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: colors.selectionBg, borderColor: colors.border }]}>
            <View style={styles.flex}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Eddy is between reads</Text>
              <Text style={[styles.emptyBody, { color: colors.textMuted }]}>Fresh summaries return when the latest water and written conditions agree.</Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <SectionHead title="Favorites" action={starred.length ? 'See all' : undefined} onAction={() => router.push('/favorites')} />
        {starsReady && highlightedFavorite ? (
          <View
              style={[
                styles.favoriteHero,
                {
                  backgroundColor: highlightedRiver
                    ? conditionBg(highlightedRiver.currentCondition?.code ?? 'unknown')
                    : colors.selectionBg,
                  borderColor: highlightedRiver
                    ? conditionChipBorder(highlightedRiver.currentCondition?.code ?? 'unknown')
                    : colors.border,
                },
                elevation(1),
              ]}
            >
              <View style={styles.favoriteHeroTop}>
                <View style={styles.heroCopy}>
                  <Text style={[styles.eyebrow, { color: colors.accent }]}>HIGHLIGHTED</Text>
                  <Text style={[styles.heroName, { color: colors.text }]} numberOfLines={2}>{highlightedFavorite.name}</Text>
                  <Text style={[styles.heroMeta, { color: colors.textMuted }]} numberOfLines={2}>
                    {favoriteDetail(highlightedFavorite, highlightedRiver)}
                  </Text>
                  {highlightedRiver ? <View style={styles.heroPill}><ConditionPill river={highlightedRiver} /></View> : null}
                </View>
                {highlightedRiver ? (
                  <Otter mood={otterForCondition(highlightedRiver.currentCondition?.code ?? 'unknown')} size={96} style={styles.heroOtter} />
                ) : (
                  <EddyScene name="heart" size={92} style={styles.heroOtter} />
                )}
              </View>
              <View style={styles.actions}>
                <Pressable
                  onPress={() => openFavorite(highlightedFavorite)}
                  style={({ pressed }) => [styles.secondaryButton, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.65 : 1 }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.secondaryButtonText, { color: colors.interactive }]}>View details</Text>
                </Pressable>
                {highlightedRiver?.slug ? (
                  <Pressable
                    onPress={() => openPlan(highlightedRiver.slug)}
                    style={({ pressed }) => [styles.primaryButton, { backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill }]}
                    accessibilityRole="button"
                  >
                    <Ionicons name="map-outline" size={17} color={colors.onAccent} />
                    <Text style={[styles.primaryButtonText, { color: colors.onAccent }]}>Plan a float</Text>
                  </Pressable>
                ) : null}
              </View>
          </View>
        ) : starsReady ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.selectionBg, borderColor: colors.border }]}>
            <EddyScene name="heart" size={76} />
            <View style={styles.flex}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Make Today yours</Text>
              <Text style={[styles.emptyBody, { color: colors.textMuted }]}>Star rivers, gauges, or dams and they’ll lead this page.</Text>
            </View>
          </View>
        ) : (
          <ActivityIndicator color={colors.interactive} />
        )}
      </View>

      <View style={styles.section}>
        <SectionHead title={location.coords ? 'Best Near You' : 'Best Right Now'} />
        {!gauges || !incumbentState.ready ? (
          <View style={styles.loading}><ActivityIndicator color={colors.interactive} /></View>
        ) : recommendation && condition ? (
          <View style={[styles.bestCard, { backgroundColor: conditionBg(condition.code), borderColor: conditionChipBorder(condition.code) }, elevation(1)]}>
            <View style={styles.bestTop}>
              <View style={styles.heroCopy}>
                <Text style={[styles.eyebrow, { color: colors.accent }]}>EDDY&apos;S PICK</Text>
                <Text style={[styles.bestName, { color: colors.text }]} numberOfLines={2}>{recommendation.river.name}</Text>
                <Text style={[styles.bestReason, { color: colors.textMuted }]} numberOfLines={2}>{recommendation.reason}</Text>
                <View style={styles.heroPill}><ConditionPill river={recommendation.river} /></View>
              </View>
              <Otter mood={otterForCondition(condition.code)} size={94} style={styles.bestOtter} />
            </View>
            {recommendationFacts || recommendationAge ? (
              <View style={[styles.factRow, { backgroundColor: colors.card }]}>
                <Ionicons name="pulse-outline" size={17} color={conditionInk(condition.code)} />
                <View style={styles.flex}>
                  {recommendationFacts ? (
                    <Text style={[styles.factText, { color: colors.text }]} numberOfLines={1}>{recommendationFacts}</Text>
                  ) : null}
                  {recommendationAge ? (
                    <Text style={[styles.factAge, { color: colors.textMuted }]} numberOfLines={1}>{recommendationAge}</Text>
                  ) : null}
                </View>
              </View>
            ) : null}
            {publicRead || eddyRead ? (
              <Pressable
                onPress={() => entitled === false ? setPaywallOpen(true) : router.push(`/river/${recommendation.river.slug}`)}
                style={({ pressed }) => [styles.eddyRead, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel={`Eddy's Read for ${recommendation.river.name}${entitled === false ? ', locked' : ''}`}
              >
                <View style={styles.readHead}>
                  <Ionicons name="sparkles" size={15} color={colors.accent} />
                  <Text style={[styles.readLabel, { color: colors.accent }]}>EDDY&apos;S READ</Text>
                  <Ionicons name="chevron-forward" size={15} color={colors.textSubtle} />
                </View>
                <Text style={[styles.readCopy, { color: colors.text }]} numberOfLines={2}>
                  {entitled === true && eddyRead ? eddyRead : publicRead}
                </Text>
                {entitled === false ? (
                  <View style={styles.unlockRow}>
                    <Ionicons name="lock-closed" size={13} color={colors.accent} />
                    <Text style={[styles.unlockText, { color: colors.accent }]}>Read Eddy’s full take</Text>
                  </View>
                ) : null}
              </Pressable>
            ) : null}
            <View style={styles.actions}>
              <Pressable
                onPress={() => router.push(`/river/${recommendation.river.slug}`)}
                style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.border, opacity: pressed ? 0.65 : 1 }]}
                accessibilityRole="button"
              >
                <Text style={[styles.secondaryButtonText, { color: colors.interactive }]}>View river</Text>
              </Pressable>
              <Pressable
                onPress={() => openPlan(recommendation.river.slug)}
                style={({ pressed }) => [styles.primaryButton, { backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill }]}
                accessibilityRole="button"
              >
                <Ionicons name="map-outline" size={17} color={colors.onAccent} />
                <Text style={[styles.primaryButtonText, { color: colors.onAccent }]}>Plan a float</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={[styles.emptyBest, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {location.coords ? `No fresh floatable pick within ${TODAY_RADIUS_MILES} miles` : 'No fresh floatable reading yet'}
            </Text>
            <Text style={[styles.emptyBody, { color: colors.textMuted }]}>River Conditions is just below.</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <SectionHead title="River Conditions" />
        <View style={styles.conditionSummary}>
          {([
            ['floatable', 'Floatable', conditionCounts.floatable],
            ['low', 'Low', conditionCounts.low],
            ['high', 'High', conditionCounts.high],
            ['unknown', 'No fresh reading', conditionCounts.unknown],
          ] as const).map(([key, label, count]) => (
            <Pressable
              key={key}
              onPress={() => onBrowseRivers(key)}
              style={({ pressed }) => [styles.conditionCount, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.65 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={`${label}, ${count} rivers`}
            >
              <Text style={[styles.conditionCountNumber, { color: colors.text }]}>{count}</Text>
              <Text style={[styles.conditionCountLabel, { color: colors.textMuted }]} numberOfLines={1}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={[styles.conditionPreviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {conditionPreviews.map((river) => (
            <CompactRiverRow key={river.id} river={river} onPress={() => router.push(`/river/${river.slug}`)} />
          ))}
          <Pressable
            onPress={() => onBrowseRivers('all')}
            style={({ pressed }) => [styles.browseAll, { opacity: pressed ? 0.65 : 1 }]}
            accessibilityRole="button"
          >
            <Text style={[styles.browseAllText, { color: colors.interactive }]}>Browse all {rivers.length} rivers</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.interactive} />
          </Pressable>
        </View>
      </View>

      {floatPreviews.length ? (
        <View style={styles.section}>
          <SectionHead title="Eddy’s Favorite Floats" action="See all" onAction={() => router.push('/favorite-floats')} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.floatRail}
            style={styles.floatRailViewport}
            decelerationRate="fast"
          >
            {floatPreviews.map((item) => (
              <FloatPreviewCard
                key={item.id}
                item={item}
                onPlan={() => openPlan(item.riverSlug, item.putInId, item.takeOutId)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <PaywallSheet
        visible={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        riverName={recommendation?.river.name}
        onPurchased={() => void refreshAccount()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hub: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 18 },
  flex: { flex: 1, minWidth: 0 },
  notice: { borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  noticeText: { ...t.sm, fontFamily: fonts.body, flex: 1 },
  summaryTop: { marginBottom: 14, gap: 10 },
  safetySection: { marginBottom: 20 },
  safetyKicker: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 0.7, marginBottom: 2 },
  safetyRows: { gap: 8 },
  safetyRow: { minHeight: 82, borderWidth: 1, borderLeftWidth: 4, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 10 },
  safetyIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  safetyRowTitle: { ...t.sm, fontFamily: fonts.semibold },
  safetyRowMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  section: { marginBottom: 24 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 2 },
  sectionTitle: { ...t.xl, fontFamily: fonts.heading },
  sectionAction: { ...t.sm, fontFamily: fonts.semibold },
  favoriteHero: { borderWidth: 1, borderRadius: 20, padding: 16, overflow: 'hidden' },
  favoriteHeroTop: { flexDirection: 'row', alignItems: 'center', minHeight: 116 },
  heroCopy: { flex: 1, minWidth: 0, zIndex: 1 },
  eyebrow: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 0.9, marginBottom: 3 },
  heroName: { ...t['2xl'], fontFamily: fonts.display },
  heroMeta: { ...t.sm, fontFamily: fonts.body, marginTop: 4 },
  heroPill: { alignSelf: 'flex-start', marginTop: 9 },
  heroOtter: { marginRight: -8, marginLeft: 2 },
  pill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  pillText: { ...t.xs, fontFamily: fonts.semibold },
  emptyCard: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  emptyBest: { borderWidth: 1, borderRadius: 16, padding: 18 },
  emptyTitle: { ...t.base, fontFamily: fonts.semibold },
  emptyBody: { ...t.sm, fontFamily: fonts.body, marginTop: 3 },
  loading: { height: 150, alignItems: 'center', justifyContent: 'center' },
  bestCard: { borderWidth: 1, borderRadius: 20, padding: 16, overflow: 'hidden' },
  bestTop: { flexDirection: 'row', alignItems: 'center', minHeight: 112 },
  bestName: { ...t['2xl'], fontFamily: fonts.display },
  bestReason: { ...t.sm, fontFamily: fonts.body, marginTop: 4 },
  bestOtter: { marginRight: -9, marginLeft: 2 },
  factRow: { minHeight: 44, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  factText: { ...t.sm, fontFamily: fonts.mono, flex: 1 },
  factAge: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  eddyRead: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 13, marginTop: 10 },
  readHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  readLabel: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 0.7, flex: 1 },
  readCopy: { ...t.sm, fontFamily: fonts.body, lineHeight: 20, marginTop: 7 },
  unlockRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  unlockText: { ...t.xs, fontFamily: fonts.semibold },
  actions: { flexDirection: 'row', gap: 9, marginTop: 15 },
  secondaryButton: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { ...t.sm, fontFamily: fonts.semibold },
  primaryButton: { minHeight: 46, borderRadius: 12, paddingHorizontal: 16, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  primaryButtonText: { ...t.sm, fontFamily: fonts.semibold },
  floatRailViewport: { marginHorizontal: -16 },
  floatRail: { paddingHorizontal: 16, paddingBottom: 4, gap: 12 },
  readRail: { paddingHorizontal: 16, paddingBottom: 4, gap: 12 },
  conditionSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 10 },
  conditionCount: { flexGrow: 1, flexBasis: '47%', minWidth: 0, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9 },
  conditionCountNumber: { ...t.lg, fontFamily: fonts.heading },
  conditionCountLabel: { ...t.xs, fontFamily: fonts.body, marginTop: 1 },
  conditionPreviewCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 13, overflow: 'hidden' },
  compactRiver: { minHeight: 58, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 9 },
  compactRiverName: { ...t.sm, fontFamily: fonts.semibold },
  compactRiverMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  browseAll: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  browseAllText: { ...t.sm, fontFamily: fonts.semibold },
  floatPreview: { width: 292, borderRadius: 18, overflow: 'hidden' },
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
