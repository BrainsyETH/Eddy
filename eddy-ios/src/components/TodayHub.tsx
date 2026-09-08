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
  fetchRiverAlerts,
  fetchRiverOutlook,
} from '@/api/client';
import { PaywallSheet } from '@/components/PaywallSheet';
import { EddyScene } from '@/components/EddyScene';
import { Otter, otterForCondition } from '@/components/Otter';
import { TodaySummary } from '@/components/TodaySummary';
import { useAccount } from '@/hooks/useAccount';
import { type LocationStatus } from '@/hooks/useLocation';
import { useStarredRivers, type StarredItem } from '@/hooks/useStarredRivers';
import { readFavoriteFloats, writeFavoriteFloats } from '@/lib/favoriteFloatCache';
import { favoriteFloatMeta } from '@/lib/favoriteFloatCopy';
import { formatReading, primaryReading, readingAge } from '@/lib/readingCopy';
import { dailyFavoriteFloats } from '@/lib/todayFloats';
import {
  chooseTodayRecommendation,
  TODAY_RADIUS_MILES,
} from '@/lib/todayRecommendation';
import { readRecommendation, writeRecommendation } from '@/lib/todayPreferences';
import { chooseTodaySafetyScope, filterTodaySafety } from '@/lib/todaySafety';
import {
  conditionBg,
  conditionChipBorder,
  conditionInk,
  conditionLabel,
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

function FavoriteTile({ item, river, onPress }: { item: StarredItem; river: RiverListItem | null; onPress: () => void }) {
  const { colors } = useTheme();
  const detail = favoriteDetail(item, river);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.favoriteTile,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.62 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={[item.name, river?.currentCondition?.label, detail].filter(Boolean).join(', ')}
    >
      <View style={[styles.tileIcon, { backgroundColor: colors.selectionBg }]}>
        <Ionicons
          name={item.kind === 'river' ? 'water-outline' : item.kind === 'gauge' ? 'speedometer-outline' : 'flash-outline'}
          size={19}
          color={colors.interactive}
        />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.tileName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[styles.tileMeta, { color: colors.textMuted }]} numberOfLines={1}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={15} color={colors.textSubtle} />
    </Pressable>
  );
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
}: Props) {
  const router = useRouter();
  const { colors, elevation } = useTheme();
  const { starred, ready: starsReady } = useStarredRivers();
  const { entitlement, loaded: accountLoaded, error: accountError, refresh: refreshAccount } = useAccount();
  const [floats, setFloats] = useState<FavoriteFloatSummary[] | null>(null);
  const [safety, setSafety] = useState<{
    scopeKey: string;
    high: HighWaterEntry[];
    notices: RiverAlert[];
  } | null>(null);
  const [floatFailure, setFloatFailure] = useState(false);
  const [safetyFailureScope, setSafetyFailureScope] = useState<string | null>(null);
  const [incumbentState, setIncumbentState] = useState<{
    ready: boolean;
    riverId: string | null;
  }>({ ready: false, riverId: null });
  const [outlook, setOutlook] = useState<{ slug: string; data: RiverOutlookResponse | null } | null>(null);
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
    favoriteRiverSlugs,
    rivers,
    gauges: gauges ?? [],
    coords: location.coords,
  }), [favoriteRiverSlugs, gauges, location.coords, rivers]);

  useEffect(() => {
    if (!starsReady || (location.coords && !gauges && favoriteRiverSlugs.size === 0)) return;
    const controller = new AbortController();
    void Promise.allSettled([fetchHighWater(controller.signal), fetchRiverAlerts(undefined, controller.signal)])
      .then(([highResult, noticeResult]) => {
        if (controller.signal.aborted) return;
        const filtered = filterTodaySafety(
          highResult.status === 'fulfilled' ? highResult.value : [],
          noticeResult.status === 'fulfilled' ? noticeResult.value : [],
          safetyScope,
        );
        const { high, notices } = filtered;
        setSafety({ scopeKey: safetyScope.key, high, notices });
        setSafetyFailureScope(
          highResult.status === 'rejected' || noticeResult.status === 'rejected'
            ? safetyScope.key
            : null,
        );
      });
    return () => controller.abort();
  }, [favoriteRiverSlugs.size, gauges, location.coords, refreshRevision, safetyScope, starsReady]);

  const favoriteIds = useMemo(
    () => new Set(starred.filter((item) => item.kind === 'river').map((item) => item.entityId)),
    [starred],
  );
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
    ?? starred.find((item) => item.kind === 'river' && item.slug)?.slug
    ?? null;
  useEffect(() => {
    if (!outlookSlug) return;
    const controller = new AbortController();
    void fetchRiverOutlook(outlookSlug, controller.signal)
      .then((data) => setOutlook({ slug: outlookSlug, data }))
      .catch(() => setOutlook({ slug: outlookSlug, data: null }));
    return () => controller.abort();
  }, [outlookSlug, refreshRevision]);

  const riverById = useMemo(() => new Map(rivers.map((river) => [river.id, river])), [rivers]);
  const previewFavorites = useMemo(
    () => [...starred].sort((a, b) => Number(b.kind === 'river') - Number(a.kind === 'river')).slice(0, 3),
    [starred],
  );
  const primaryFavorite = previewFavorites[0] ?? null;
  const primaryFavoriteRiver = primaryFavorite?.kind === 'river'
    ? riverById.get(primaryFavorite.entityId) ?? null
    : null;
  const secondaryFavorites = previewFavorites.slice(1);
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

  const activeSafety = safety?.scopeKey === safetyScope.key ? safety : null;
  const safetyCount = (activeSafety?.high.length ?? 0) + (activeSafety?.notices.length ?? 0);
  const detailFailure = floatFailure || safetyFailureScope === safetyScope.key;
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
  const condition = recommendation?.river.currentCondition ?? null;
  const reading = condition ? primaryReading(condition) : null;
  const liveOutlook = outlook && outlook.slug === recommendation?.river.slug ? outlook.data : null;
  const weatherOutlook = outlook && outlook.slug === outlookSlug ? outlook.data : null;
  const eddyRead = liveOutlook?.fullRead ?? liveOutlook?.sections?.eddyRead ?? liveOutlook?.sections?.bottomLine ?? null;
  const entitled = accountLoaded && !accountError ? Boolean(entitlement?.isActive) : null;
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

      {statewide.headline ? (
        <View style={styles.summaryTop}>
          <TodaySummary
            headline={statewide.headline}
            prose={statewide.prose}
            generatedAt={statewide.generatedAt}
            weather={weatherOutlook?.days[0]?.weather ?? null}
            weatherLocation={weatherOutlook?.weatherLocation ?? null}
          />
        </View>
      ) : null}

      {safetyCount > 0 ? (
        <View style={styles.safetySection}>
          <View style={styles.safetyRows}>
            {topNotice ? (
              <SafetyRow
                kicker="BEFORE YOU LAUNCH"
                title={topNotice.title}
                meta={`${topNotice.source.toUpperCase()} · ${activeSafety?.notices.length ?? 0} agency ${(activeSafety?.notices.length ?? 0) === 1 ? 'notice' : 'notices'} ${safetyScopeLabel}`}
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
                meta={`${activeSafety?.high.length ?? 0} high-water ${(activeSafety?.high.length ?? 0) === 1 ? 'reading' : 'readings'} ${safetyScopeLabel}`}
                icon="water-outline"
                ink={conditionInk(topHigh.conditionCode)}
                surface={conditionBg(topHigh.conditionCode)}
                onPress={() => router.push({ pathname: '/alerts', params: { segment: 'high-water' } })}
              />
            ) : null}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHead title="Favorites" action={previewFavorites.length ? 'See all' : undefined} onAction={() => router.push('/favorites')} />
        {starsReady && primaryFavorite ? (
          <>
            <View
              style={[
                styles.favoriteHero,
                {
                  backgroundColor: primaryFavoriteRiver
                    ? conditionBg(primaryFavoriteRiver.currentCondition?.code ?? 'unknown')
                    : colors.selectionBg,
                  borderColor: primaryFavoriteRiver
                    ? conditionChipBorder(primaryFavoriteRiver.currentCondition?.code ?? 'unknown')
                    : colors.border,
                },
                elevation(1),
              ]}
            >
              <View style={styles.favoriteHeroTop}>
                <View style={styles.heroCopy}>
                  <Text style={[styles.eyebrow, { color: colors.accent }]}>YOUR FAVORITE</Text>
                  <Text style={[styles.heroName, { color: colors.text }]} numberOfLines={2}>{primaryFavorite.name}</Text>
                  <Text style={[styles.heroMeta, { color: colors.textMuted }]} numberOfLines={2}>
                    {favoriteDetail(primaryFavorite, primaryFavoriteRiver)}
                  </Text>
                  {primaryFavoriteRiver ? <View style={styles.heroPill}><ConditionPill river={primaryFavoriteRiver} /></View> : null}
                </View>
                {primaryFavoriteRiver ? (
                  <Otter mood={otterForCondition(primaryFavoriteRiver.currentCondition?.code ?? 'unknown')} size={96} style={styles.heroOtter} />
                ) : (
                  <EddyScene name="heart" size={92} style={styles.heroOtter} />
                )}
              </View>
              <View style={styles.actions}>
                <Pressable
                  onPress={() => openFavorite(primaryFavorite)}
                  style={({ pressed }) => [styles.secondaryButton, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.65 : 1 }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.secondaryButtonText, { color: colors.interactive }]}>View details</Text>
                </Pressable>
                {primaryFavoriteRiver?.slug ? (
                  <Pressable
                    onPress={() => openPlan(primaryFavoriteRiver.slug)}
                    style={({ pressed }) => [styles.primaryButton, { backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill }]}
                    accessibilityRole="button"
                  >
                    <Ionicons name="map-outline" size={17} color={colors.onAccent} />
                    <Text style={[styles.primaryButtonText, { color: colors.onAccent }]}>Plan a float</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
            {secondaryFavorites.length ? (
              <View style={styles.favoriteTiles}>
                {secondaryFavorites.map((item) => (
                  <FavoriteTile
                    key={`${item.kind}:${item.entityId}`}
                    item={item}
                    river={item.kind === 'river' ? riverById.get(item.entityId) ?? null : null}
                    onPress={() => openFavorite(item)}
                  />
                ))}
              </View>
            ) : null}
          </>
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
            <Text style={[styles.emptyBody, { color: colors.textMuted }]}>The complete condition list is just below.</Text>
          </View>
        )}
        {!location.coords ? (
          <Pressable
            onPress={() => location.status === 'denied' ? void Linking.openSettings() : void location.request()}
            disabled={location.status === 'locating'}
            style={({ pressed }) => [styles.location, { opacity: pressed ? 0.62 : 1 }]}
            accessibilityRole="button"
          >
            <Ionicons name="location-outline" size={16} color={colors.interactive} />
            <Text style={[styles.locationText, { color: colors.interactive }]}>
              {location.status === 'locating' ? 'Finding your location…' : location.status === 'denied' ? 'Open Settings for location' : 'Use my location for a closer pick'}
            </Text>
          </Pressable>
        ) : null}
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
  summaryTop: { marginBottom: 14 },
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
  favoriteTiles: { gap: 8, marginTop: 9 },
  favoriteTile: { minHeight: 66, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 10 },
  tileIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tileName: { ...t.sm, fontFamily: fonts.semibold },
  tileMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 1 },
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
  location: { minHeight: 44, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 },
  locationText: { ...t.sm, fontFamily: fonts.medium },
  floatRailViewport: { marginHorizontal: -16 },
  floatRail: { paddingHorizontal: 16, paddingBottom: 4, gap: 12 },
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
