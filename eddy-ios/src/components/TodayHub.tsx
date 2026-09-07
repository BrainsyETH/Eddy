import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { useAccount } from '@/hooks/useAccount';
import { type LocationStatus } from '@/hooks/useLocation';
import { useStarredRivers, type StarredItem } from '@/hooks/useStarredRivers';
import { readFavoriteFloats, writeFavoriteFloats } from '@/lib/favoriteFloatCache';
import { favoriteFloatMeta } from '@/lib/favoriteFloatCopy';
import { formatReading, primaryReading, readingAge } from '@/lib/readingCopy';
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
  conditionLongLabel,
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
      <Text style={[styles.pillText, { color: conditionInk(code) }]}>
        {river.currentCondition?.label ?? conditionLongLabel(code)}
      </Text>
    </View>
  );
}

function FavoriteRow({ item, river, onPress }: { item: StarredItem; river: RiverListItem | null; onPress: () => void }) {
  const { colors } = useTheme();
  const reading = river?.currentCondition ? primaryReading(river.currentCondition) : null;
  const detail = reading
    ? [formatReading(reading.value, reading.unit), readingAge(river?.currentCondition?.readingAgeHours)]
        .filter(Boolean)
        .join(' · ')
    : item.kind === 'river'
      ? 'Conditions unavailable'
      : item.kind === 'gauge'
        ? 'Saved gauge'
        : 'Saved dam';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.favoriteRow, { opacity: pressed ? 0.62 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={[item.name, river?.currentCondition?.label, detail].filter(Boolean).join(', ')}
    >
      <View style={[styles.favoriteMark, { backgroundColor: colors.selectionBg }]}>
        <Ionicons
          name={item.kind === 'river' ? 'water-outline' : item.kind === 'gauge' ? 'speedometer-outline' : 'flash-outline'}
          size={19}
          color={colors.interactive}
        />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.favoriteName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[styles.favoriteMeta, { color: colors.textMuted }]} numberOfLines={1}>{detail}</Text>
      </View>
      {river ? <ConditionPill river={river} /> : <Ionicons name="chevron-forward" size={17} color={colors.textSubtle} />}
    </Pressable>
  );
}

export function TodayHub({
  rivers,
  gauges,
  ensureGauges,
  location,
  refreshRevision,
  suppressNetworkNotice,
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

  const recommendationSlug = recommendation?.river.slug ?? null;
  useEffect(() => {
    if (!recommendationSlug) return;
    const controller = new AbortController();
    void fetchRiverOutlook(recommendationSlug, controller.signal)
      .then((data) => setOutlook({ slug: recommendationSlug, data }))
      .catch(() => setOutlook({ slug: recommendationSlug, data: null }));
    return () => controller.abort();
  }, [recommendationSlug, refreshRevision]);

  const riverById = useMemo(() => new Map(rivers.map((river) => [river.id, river])), [rivers]);
  const previewFavorites = useMemo(
    () => [...starred].sort((a, b) => Number(b.kind === 'river') - Number(a.kind === 'river')).slice(0, 3),
    [starred],
  );
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
  const featuredFloat = floats?.find((item) => item.riverSlug === recommendation?.river.slug) ?? floats?.[0] ?? null;
  const condition = recommendation?.river.currentCondition ?? null;
  const reading = condition ? primaryReading(condition) : null;
  const liveOutlook = outlook && outlook.slug === recommendation?.river.slug ? outlook.data : null;
  const eddyRead = liveOutlook?.fullRead ?? liveOutlook?.sections?.eddyRead ?? liveOutlook?.sections?.bottomLine ?? null;
  const entitled = accountLoaded && !accountError ? Boolean(entitlement?.isActive) : null;

  return (
    <View style={styles.hub}>
      {!suppressNetworkNotice && detailFailure ? (
        <View style={[styles.notice, { backgroundColor: colors.cardRaised, borderColor: colors.border }]}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.textMuted} />
          <Text style={[styles.noticeText, { color: colors.textMuted }]}>Some live details could not refresh. Showing what Eddy has.</Text>
        </View>
      ) : null}

      {safetyCount > 0 ? (
        <Pressable
          onPress={() => router.push('/alerts')}
          style={({ pressed }) => [styles.safetyBand, { backgroundColor: colors.anchorSurface, opacity: pressed ? 0.74 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={`${safetyCount} safety ${safetyCount === 1 ? 'item' : 'items'} ${safetyScopeLabel}`}
        >
          <Ionicons name="warning-outline" size={19} color={colors.onAnchor} />
          <View style={styles.flex}>
            <Text style={[styles.safetyTitle, { color: colors.onAnchor }]}>Check before you launch</Text>
            <Text style={[styles.safetyMeta, { color: colors.onAnchor }]} numberOfLines={1}>
              {activeSafety?.high.length ? `${activeSafety.high.length} high-water ${activeSafety.high.length === 1 ? 'reading' : 'readings'}` : ''}
              {activeSafety?.high.length && activeSafety.notices.length ? ' · ' : ''}
              {activeSafety?.notices.length ? `${activeSafety.notices.length} agency ${activeSafety.notices.length === 1 ? 'notice' : 'notices'}` : ''}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={colors.onAnchor} />
        </Pressable>
      ) : null}

      <View style={styles.section}>
        <SectionHead title="Favorites" action={previewFavorites.length ? 'See all' : undefined} onAction={() => router.push('/favorites')} />
        {starsReady && previewFavorites.length ? (
          <View style={[styles.favoriteCard, { backgroundColor: colors.card }, elevation(2)]}>
            {previewFavorites.map((item, index) => (
              <View key={`${item.kind}:${item.entityId}`}>
                {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
                <FavoriteRow item={item} river={item.kind === 'river' ? riverById.get(item.entityId) ?? null : null} onPress={() => openFavorite(item)} />
              </View>
            ))}
          </View>
        ) : starsReady ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="star-outline" size={24} color={colors.warm} />
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
          <View style={[styles.bestCard, { backgroundColor: colors.card }, elevation(1)]}>
            <View style={styles.bestTop}>
              <View style={styles.flex}>
                <Text style={[styles.bestName, { color: colors.text }]} numberOfLines={2}>{recommendation.river.name}</Text>
                <Text style={[styles.bestReason, { color: colors.textMuted }]}>{recommendation.reason}</Text>
              </View>
              <ConditionPill river={recommendation.river} />
            </View>
            {reading ? (
              <Text style={[styles.reading, { color: colors.text }]}>{formatReading(reading.value, reading.unit)}</Text>
            ) : null}
            {eddyRead ? (
              <Pressable
                onPress={() => entitled === false ? setPaywallOpen(true) : router.push(`/river/${recommendation.river.slug}`)}
                style={({ pressed }) => [styles.eddyRead, { backgroundColor: colors.cardRaised, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel={`Eddy's Read for ${recommendation.river.name}${entitled === false ? ', locked' : ''}`}
              >
                <View style={styles.readHead}>
                  <Ionicons name={entitled === false ? 'lock-closed' : 'sparkles'} size={15} color={colors.accent} />
                  <Text style={[styles.readLabel, { color: colors.accent }]}>EDDY&apos;S READ</Text>
                  <Ionicons name="chevron-forward" size={15} color={colors.textSubtle} />
                </View>
                <Text style={[styles.readCopy, { color: colors.text }]} numberOfLines={entitled === false ? 2 : 4}>
                  {entitled === false ? 'Unlock Eddy’s full written read for this river.' : eddyRead}
                </Text>
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

      {featuredFloat ? (
        <View style={styles.section}>
          <SectionHead title="Eddy’s Favorite Floats" action="See all" onAction={() => router.push('/favorite-floats')} />
          <View style={[styles.floatCard, { backgroundColor: colors.card }, elevation(1)]}>
            {featuredFloat.photoUrl ? <Image source={{ uri: featuredFloat.photoUrl }} style={styles.floatPhoto} /> : null}
            <View style={styles.floatBody}>
              <Text style={[styles.floatRiver, { color: colors.accent }]}>{featuredFloat.riverName.toUpperCase()}</Text>
              <Text style={[styles.floatTitle, { color: colors.text }]} numberOfLines={2}>{featuredFloat.putInName} to {featuredFloat.takeOutName}</Text>
              <Text style={[styles.floatMeta, { color: colors.textMuted }]}>{favoriteFloatMeta(featuredFloat)}</Text>
              <Text style={[styles.floatTagline, { color: colors.textMuted }]} numberOfLines={2}>{featuredFloat.tagline}</Text>
              <Pressable
                onPress={() => openPlan(featuredFloat.riverSlug, featuredFloat.putInId, featuredFloat.takeOutId)}
                style={({ pressed }) => [styles.floatLink, { opacity: pressed ? 0.62 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel={`Plan ${featuredFloat.putInName} to ${featuredFloat.takeOutName}`}
              >
                <Text style={[styles.floatLinkText, { color: colors.interactive }]}>Plan this float</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.interactive} />
              </Pressable>
            </View>
          </View>
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
  safetyBand: { minHeight: 58, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  safetyTitle: { ...t.sm, fontFamily: fonts.semibold },
  safetyMeta: { ...t.xs, fontFamily: fonts.body, opacity: 0.82, marginTop: 1 },
  section: { marginBottom: 24 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 2 },
  sectionTitle: { ...t.xl, fontFamily: fonts.heading },
  sectionAction: { ...t.sm, fontFamily: fonts.semibold },
  favoriteCard: { borderRadius: 16, overflow: 'hidden' },
  favoriteRow: { minHeight: 76, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 11 },
  favoriteMark: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  favoriteName: { ...t.base, fontFamily: fonts.semibold },
  favoriteMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 63 },
  pill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4, maxWidth: 104 },
  pillText: { ...t.xs, fontFamily: fonts.semibold },
  emptyCard: { borderWidth: 1, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  emptyBest: { borderWidth: 1, borderRadius: 16, padding: 18 },
  emptyTitle: { ...t.base, fontFamily: fonts.semibold },
  emptyBody: { ...t.sm, fontFamily: fonts.body, marginTop: 3 },
  loading: { height: 150, alignItems: 'center', justifyContent: 'center' },
  bestCard: { borderRadius: 18, padding: 17 },
  bestTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  bestName: { ...t['2xl'], fontFamily: fonts.heading },
  bestReason: { ...t.sm, fontFamily: fonts.body, marginTop: 4 },
  reading: { ...t.xl, fontFamily: fonts.mono, marginTop: 14 },
  eddyRead: { borderWidth: 1, borderRadius: 13, padding: 13, marginTop: 14 },
  readHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  readLabel: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 0.7, flex: 1 },
  readCopy: { ...t.sm, fontFamily: fonts.body, lineHeight: 20, marginTop: 7 },
  actions: { flexDirection: 'row', gap: 9, marginTop: 15 },
  secondaryButton: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { ...t.sm, fontFamily: fonts.semibold },
  primaryButton: { minHeight: 46, borderRadius: 12, paddingHorizontal: 16, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  primaryButtonText: { ...t.sm, fontFamily: fonts.semibold },
  location: { minHeight: 44, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 },
  locationText: { ...t.sm, fontFamily: fonts.medium },
  floatCard: { borderRadius: 16, overflow: 'hidden' },
  floatPhoto: { width: '100%', height: 150 },
  floatBody: { padding: 16 },
  floatRiver: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 0.8 },
  floatTitle: { ...t.xl, fontFamily: fonts.heading, marginTop: 3 },
  floatMeta: { ...t.sm, fontFamily: fonts.mono, marginTop: 7 },
  floatTagline: { ...t.sm, fontFamily: fonts.body, marginTop: 7 },
  floatLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 8 },
  floatLinkText: { ...t.sm, fontFamily: fonts.semibold },
});
