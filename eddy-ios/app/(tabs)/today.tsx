import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type {
  AlertFeedEntry,
  DamSnapshot,
  FavoriteFloatSummary,
  MapGauge,
  RiverListItem,
  RiverOutlookResponse,
} from '@eddy/types';
import {
  ApiError,
  fetchAlerts,
  fetchDams,
  fetchFavoriteFloats,
  fetchGauges,
  fetchRiverOutlook,
  fetchRivers,
} from '@/api/client';
import { PaywallSheet } from '@/components/PaywallSheet';
import { ReadingScale } from '@/components/ReadingScale';
import { useAccount } from '@/hooks/useAccount';
import { useLocation } from '@/hooks/useLocation';
import { useStarredRivers, type StarredItem } from '@/hooks/useStarredRivers';
import { formatReading, readingAge } from '@/lib/readingCopy';
import { chooseTodayRecommendation } from '@/lib/todayRecommendation';
import {
  conditionBg,
  conditionChipBorder,
  conditionInk,
  conditionLabel,
  isFloatableNow,
} from '@/theme/conditions';
import { radius, spacing } from '@/theme/metrics';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

type GaugeThresholds = NonNullable<MapGauge['thresholds']>[number];

function thresholdsForRiver(gauges: MapGauge[], riverId: string): GaugeThresholds | null {
  let fallback: GaugeThresholds | null = null;
  for (const gauge of gauges) {
    for (const link of gauge.thresholds ?? []) {
      if (link.riverId !== riverId) continue;
      if (link.isPrimary) return link;
      fallback ??= link;
    }
  }
  return fallback;
}

function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
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

function ConditionPill({ code }: { code: string }) {
  return (
    <View
      style={[
        styles.conditionPill,
        { backgroundColor: conditionBg(code), borderColor: conditionChipBorder(code) },
      ]}
    >
      <Text style={[styles.conditionPillText, { color: conditionInk(code) }]}>
        {conditionLabel(code)}
      </Text>
    </View>
  );
}

export default function TodayScreen() {
  const router = useRouter();
  const { colors, elevation } = useTheme();
  const { starred, ready: starsReady } = useStarredRivers();
  const location = useLocation();
  const { entitlement, loaded: accountLoaded, error: accountError } = useAccount();

  const [rivers, setRivers] = useState<RiverListItem[] | null>(null);
  const [gauges, setGauges] = useState<MapGauge[]>([]);
  const [dams, setDams] = useState<DamSnapshot[]>([]);
  const [floats, setFloats] = useState<FavoriteFloatSummary[]>([]);
  const [alerts, setAlerts] = useState<AlertFeedEntry[]>([]);
  const [outlookAnswer, setOutlookAnswer] = useState<{
    slug: string;
    data: RiverOutlookResponse | null;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    const results = await Promise.allSettled([
      fetchRivers(signal),
      fetchGauges(signal),
      fetchDams(signal),
      fetchFavoriteFloats(signal),
      fetchAlerts(signal),
    ]);
    if (signal?.aborted) return;

    if (results[0].status === 'fulfilled') setRivers(results[0].value);
    else setRivers((current) => current ?? []);
    if (results[1].status === 'fulfilled') setGauges(results[1].value);
    if (results[2].status === 'fulfilled') setDams(results[2].value);
    if (results[3].status === 'fulfilled') setFloats(results[3].value);
    if (results[4].status === 'fulfilled') setAlerts(results[4].value);

    const failed = results.some((result) => result.status === 'rejected');
    if (failed) {
      const cancellation = results.some(
        (result) =>
          result.status === 'rejected' &&
          result.reason instanceof ApiError &&
          result.reason.message === 'Request cancelled',
      );
      if (!cancellation) setError('Some live details could not be refreshed. Showing what we have.');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const riverFavoriteIds = useMemo(
    () => new Set(starred.filter((item) => item.kind === 'river').map((item) => item.entityId)),
    [starred],
  );
  const recommendation = useMemo(
    () => chooseTodayRecommendation({
      rivers: rivers ?? [],
      gauges,
      favoriteRiverIds: riverFavoriteIds,
      coords: location.coords,
    }),
    [gauges, location.coords, riverFavoriteIds, rivers],
  );

  useEffect(() => {
    if (!recommendation) return;
    const controller = new AbortController();
    fetchRiverOutlook(recommendation.river.slug, controller.signal)
      .then((data) => setOutlookAnswer({ slug: recommendation.river.slug, data }))
      .catch(() => setOutlookAnswer({ slug: recommendation.river.slug, data: null }));
    return () => controller.abort();
  }, [recommendation]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const heroCondition = recommendation?.river.currentCondition ?? null;
  const heroReading = recommendation
    ? {
        value:
          heroCondition?.thresholdUnit === 'cfs'
            ? heroCondition.dischargeCfs
            : heroCondition?.gaugeHeightFt,
        unit: heroCondition?.thresholdUnit,
      }
    : null;
  const heroThresholds = recommendation
    ? thresholdsForRiver(gauges, recommendation.river.id)
    : null;
  const outlook =
    outlookAnswer && outlookAnswer.slug === recommendation?.river.slug ? outlookAnswer.data : null;
  const eddyRead = outlook?.fullRead || outlook?.sections?.eddyRead || null;
  const entitled = accountLoaded && !accountError ? Boolean(entitlement?.isActive) : null;
  const heroLabel =
    recommendation?.mode === 'favorite'
      ? 'BEST FROM YOUR FAVORITES'
      : recommendation?.mode === 'nearby'
        ? 'BEST NEAR YOU'
        : 'BEST RIGHT NOW';

  const starredRiverIds = riverFavoriteIds;
  const favoriteAlerts = alerts.filter((alert) => starredRiverIds.has(alert.riverId));
  const previewFavorites = starred
    .filter((item) => item.entityId !== recommendation?.river.id)
    .slice(0, 3);
  const floatableCount = (rivers ?? []).filter((river) =>
    isFloatableNow(river.currentCondition?.code ?? 'unknown'),
  ).length;
  const featuredFloat = floats.find((item) => item.riverSlug === recommendation?.river.slug) ?? floats[0];

  const riverById = useMemo(() => new Map((rivers ?? []).map((river) => [river.id, river])), [rivers]);
  const gaugeById = useMemo(() => new Map(gauges.map((gauge) => [gauge.id, gauge])), [gauges]);
  const damById = useMemo(() => new Map(dams.map((dam) => [dam.id, dam])), [dams]);

  const openFavorite = (item: StarredItem) => {
    if (item.kind === 'river' && item.slug) router.push(`/river/${item.slug}`);
    else if (item.kind === 'gauge' && item.usgsSiteId) router.push(`/gauge/${item.usgsSiteId}`);
    else if (item.kind === 'dam') router.push(`/dam/${item.entityId}`);
  };

  const planRiver = (slug: string, from?: string, to?: string) => {
    router.push({ pathname: '/(tabs)', params: { river: slug, plan: '1', from, to } });
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.interactive} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>Today</Text>
            <Text style={[styles.date, { color: colors.textMuted }]}>
              {new Intl.DateTimeFormat('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              }).format(new Date())}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/(tabs)/profile')}
            style={({ pressed }) => [
              styles.iconButton,
              { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.65 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
          >
            <Ionicons name="person-outline" size={20} color={colors.interactive} />
          </Pressable>
        </View>

        <Pressable
          onPress={() => router.push('/reports')}
          style={({ pressed }) => [
            styles.search,
            { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.72 : 1 },
            elevation(1),
          ]}
          accessibilityRole="search"
          accessibilityLabel="Search rivers, gauges, dams, and access points"
        >
          <Ionicons name="search" size={19} color={colors.textMuted} />
          <Text style={[styles.searchText, { color: colors.textMuted }]} numberOfLines={1}>
            Search rivers, gauges, dams, access…
          </Text>
        </Pressable>

        {error ? (
          <View style={[styles.notice, { backgroundColor: colors.cardRaised, borderColor: colors.border }]}>
            <Ionicons name="cloud-offline-outline" size={16} color={colors.textMuted} />
            <Text style={[styles.noticeText, { color: colors.textMuted }]}>{error}</Text>
          </View>
        ) : null}

        {favoriteAlerts.length > 0 ? (
          <Pressable
            onPress={() => router.push('/(tabs)/alerts')}
            style={[styles.alertBand, { backgroundColor: colors.anchorSurface }]}
            accessibilityRole="button"
          >
            <Ionicons name="notifications" size={18} color={colors.onAnchor} />
            <Text style={[styles.alertText, { color: colors.onAnchor }]}>
              {favoriteAlerts.length} favorite river {favoriteAlerts.length === 1 ? 'update' : 'updates'}
            </Text>
            <Ionicons name="chevron-forward" size={17} color={colors.onAnchor} />
          </Pressable>
        ) : null}

        {!rivers ? (
          <View style={styles.loading}><ActivityIndicator color={colors.interactive} /></View>
        ) : recommendation && heroCondition ? (
          <View style={[styles.hero, { backgroundColor: colors.card }, elevation(2)]}>
            <Text style={[styles.eyebrow, { color: colors.accent }]}>{heroLabel}</Text>
            <View style={styles.heroTitleRow}>
              <Pressable style={styles.flex} onPress={() => router.push(`/river/${recommendation.river.slug}`)}>
                <Text style={[styles.heroTitle, { color: colors.text }]} numberOfLines={2}>
                  {recommendation.river.name}
                </Text>
              </Pressable>
              <ConditionPill code={heroCondition.code} />
            </View>

            <View style={styles.readingRow}>
              <View style={styles.flex}>
                <Text style={[styles.reading, { color: colors.text }]}>
                  {heroReading?.value != null && heroReading.unit
                    ? formatReading(heroReading.value, heroReading.unit)
                    : 'Reading unavailable'}
                </Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>
                  {[heroCondition.trend?.label, readingAge(heroCondition.readingAgeHours)]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              {recommendation.distanceMiles != null ? (
                <View style={[styles.distance, { backgroundColor: colors.selectionBg }]}>
                  <Ionicons name="navigate-outline" size={14} color={colors.selectionText} />
                  <Text style={[styles.distanceText, { color: colors.selectionText }]}>
                    ~{Math.round(recommendation.distanceMiles)} mi
                  </Text>
                </View>
              ) : null}
            </View>

            {heroThresholds && heroReading?.value != null && heroReading.unit ? (
              <ReadingScale thresholds={heroThresholds} value={heroReading.value} unit={heroReading.unit} />
            ) : null}

            <Text style={[styles.reason, { color: colors.textMuted }]}>{recommendation.reason}</Text>

            {outlook?.sections ? (
              <Pressable
                onPress={() => (entitled === false ? setPaywallOpen(true) : router.push(`/river/${recommendation.river.slug}`))}
                style={[styles.eddyRead, { backgroundColor: colors.cardRaised, borderColor: colors.border }]}
                accessibilityRole="button"
              >
                <View style={styles.eddyReadHead}>
                  <Ionicons name={entitled === false ? 'lock-closed' : 'sparkles'} size={15} color={colors.accent} />
                  <Text style={[styles.eddyReadLabel, { color: colors.accent }]}>EDDY&apos;S READ</Text>
                  <Ionicons name="chevron-forward" size={15} color={colors.textSubtle} />
                </View>
                <Text style={[styles.eddyReadText, { color: colors.text }]} numberOfLines={3}>
                  {entitled === false
                    ? 'Unlock the full written report, updated daily for this river.'
                    : eddyRead ?? outlook.sections.bottomLine}
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={() => planRiver(recommendation.river.slug)}
              style={({ pressed }) => [styles.primaryButton, { backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill }]}
              accessibilityRole="button"
            >
              <Ionicons name="map-outline" size={18} color={colors.onAccent} />
              <Text style={[styles.primaryButtonText, { color: colors.onAccent }]}>Plan this river</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.emptyHero, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No fresh floatable reading yet</Text>
            <Text style={[styles.emptyBody, { color: colors.textMuted }]}>Browse all rivers to see the latest condition on each.</Text>
            <Pressable onPress={() => router.push('/reports')}><Text style={[styles.inlineLink, { color: colors.interactive }]}>Browse conditions</Text></Pressable>
          </View>
        )}

        {location.status !== 'ready' ? (
          <Pressable onPress={() => void location.request()} style={styles.locationPrompt} accessibilityRole="button">
            <Ionicons name="location-outline" size={16} color={colors.interactive} />
            <Text style={[styles.locationText, { color: colors.interactive }]}>
              {location.status === 'locating' ? 'Finding your location…' : 'Use my location for closer picks'}
            </Text>
          </Pressable>
        ) : null}

        {starsReady && previewFavorites.length > 0 ? (
          <View style={styles.section}>
            <SectionTitle title="Favorites" action="See all" onAction={() => router.push('/(tabs)/favorites')} />
            <View style={[styles.listCard, { backgroundColor: colors.card }, elevation(1)]}>
              {previewFavorites.map((item, index) => {
                const river = item.kind === 'river' ? riverById.get(item.entityId) : null;
                const gauge = item.kind === 'gauge' ? gaugeById.get(item.entityId) : null;
                const dam = item.kind === 'dam' ? damById.get(item.entityId) : null;
                const code = river?.currentCondition?.code;
                const reading = river?.currentCondition;
                const gaugeValue = gauge?.gaugeHeightFt != null
                  ? formatReading(gauge.gaugeHeightFt, 'ft')
                  : gauge?.dischargeCfs != null
                    ? formatReading(gauge.dischargeCfs, 'cfs')
                    : null;
                const detail = reading
                  ? reading.thresholdUnit === 'cfs' && reading.dischargeCfs != null
                    ? formatReading(reading.dischargeCfs, 'cfs')
                    : reading.gaugeHeightFt != null
                      ? formatReading(reading.gaugeHeightFt, 'ft')
                      : 'Conditions unavailable'
                  : gaugeValue ?? (dam ? (dam.generating == null ? 'Generation status unavailable' : dam.generating ? 'Generating now' : 'Not generating') : 'Saved for later');
                return (
                  <Pressable
                    key={`${item.kind}:${item.entityId}`}
                    onPress={() => openFavorite(item)}
                    style={[styles.favoriteRow, index > 0 && { borderTopColor: colors.border, borderTopWidth: 1 }]}
                  >
                    <View style={styles.favoriteIcon}>
                      <Ionicons name={item.kind === 'river' ? 'water-outline' : item.kind === 'gauge' ? 'speedometer-outline' : 'flash-outline'} size={18} color={colors.interactive} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                      <Text style={[styles.rowMeta, { color: colors.textMuted }]} numberOfLines={1}>{detail}</Text>
                    </View>
                    {code ? <ConditionPill code={code} /> : <Ionicons name="chevron-forward" size={17} color={colors.textSubtle} />}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {featuredFloat ? (
          <View style={styles.section}>
            <SectionTitle title="Eddy’s Favorite Floats" action="See all" onAction={() => router.push('/favorite-floats')} />
            <View style={[styles.floatCard, { backgroundColor: colors.card }, elevation(1)]}>
              {featuredFloat.photoUrl ? <Image source={{ uri: featuredFloat.photoUrl }} style={styles.floatPhoto} /> : null}
              <View style={styles.floatBody}>
                <Text style={[styles.floatRiver, { color: colors.accent }]}>{featuredFloat.riverName.toUpperCase()}</Text>
                <Text style={[styles.floatTitle, { color: colors.text }]} numberOfLines={2}>{featuredFloat.putInName} to {featuredFloat.takeOutName}</Text>
                <Text style={[styles.floatMeta, { color: colors.textMuted }]}>{featuredFloat.distanceMiles} mi · ~{featuredFloat.durationHours} hr · Class {featuredFloat.difficulty}</Text>
                <Text style={[styles.floatTagline, { color: colors.textMuted }]} numberOfLines={2}>{featuredFloat.tagline}</Text>
                <Pressable onPress={() => planRiver(featuredFloat.riverSlug, featuredFloat.fromSlug, featuredFloat.toSlug)} style={styles.planLink} accessibilityRole="button">
                  <Text style={[styles.planLinkText, { color: colors.interactive }]}>Plan this float</Text>
                  <Ionicons name="arrow-forward" size={16} color={colors.interactive} />
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        {rivers && rivers.length > 0 ? (
          <Pressable onPress={() => router.push('/reports')} style={[styles.statewide, { borderColor: colors.border }]}>
            <View>
              <Text style={[styles.statewideValue, { color: colors.text }]}>{floatableCount} rivers floatable now</Text>
              <Text style={[styles.statewideMeta, { color: colors.textMuted }]}>See the statewide condition report</Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color={colors.interactive} />
          </Pressable>
        ) : null}
      </ScrollView>

      <PaywallSheet visible={paywallOpen} onClose={() => setPaywallOpen(false)} riverName={recommendation?.river.name} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm, marginBottom: spacing.lg },
  title: { ...t['3xl'], fontFamily: fonts.displayBold },
  date: { ...t.sm, fontFamily: fonts.body, marginLeft: -3 },
  iconButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  search: { minHeight: 50, borderRadius: radius.control, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.lg },
  searchText: { ...t.base, fontFamily: fonts.body, flex: 1 },
  notice: { marginTop: spacing.md, borderWidth: 1, borderRadius: radius.control, padding: spacing.md, flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  noticeText: { ...t.sm, fontFamily: fonts.body, flex: 1 },
  alertBand: { marginTop: spacing.md, borderRadius: radius.control, padding: spacing.md, flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  alertText: { ...t.sm, fontFamily: fonts.semibold, flex: 1 },
  loading: { minHeight: 260, justifyContent: 'center' },
  hero: { marginTop: spacing.lg, borderRadius: radius.card, padding: spacing.lg },
  eyebrow: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 1.1, marginBottom: spacing.sm },
  heroTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  heroTitle: { ...t['2xl'], fontFamily: fonts.heading },
  flex: { flex: 1 },
  conditionPill: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  conditionPillText: { ...t.xs, fontFamily: fonts.semibold },
  readingRow: { marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  reading: { ...t.xl, fontFamily: fonts.monoMedium },
  meta: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  distance: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 4 },
  distanceText: { ...t.xs, fontFamily: fonts.semibold },
  reason: { ...t.sm, fontFamily: fonts.body, marginTop: spacing.md },
  eddyRead: { marginTop: spacing.lg, borderRadius: radius.inset, borderWidth: 1, padding: spacing.md },
  eddyReadHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  eddyReadLabel: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 0.7, flex: 1 },
  eddyReadText: { ...t.sm, fontFamily: fonts.body },
  primaryButton: { minHeight: 48, borderRadius: radius.control, marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  primaryButtonText: { ...t.base, fontFamily: fonts.semibold },
  emptyHero: { marginTop: spacing.lg, borderRadius: radius.card, borderWidth: 1, padding: spacing.xl },
  emptyTitle: { ...t.xl, fontFamily: fonts.heading },
  emptyBody: { ...t.sm, fontFamily: fonts.body, marginTop: spacing.sm },
  inlineLink: { ...t.sm, fontFamily: fonts.semibold, marginTop: spacing.md },
  locationPrompt: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: spacing.md },
  locationText: { ...t.sm, fontFamily: fonts.medium },
  section: { marginTop: spacing.xl },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing.md },
  sectionTitle: { ...t.xl, fontFamily: fonts.heading },
  sectionAction: { ...t.sm, fontFamily: fonts.semibold },
  listCard: { borderRadius: radius.card, overflow: 'hidden' },
  favoriteRow: { minHeight: 68, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  favoriteIcon: { width: 28, alignItems: 'center' },
  rowTitle: { ...t.base, fontFamily: fonts.semibold },
  rowMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 1 },
  floatCard: { borderRadius: radius.card, overflow: 'hidden' },
  floatPhoto: { width: '100%', height: 150 },
  floatBody: { padding: spacing.lg },
  floatRiver: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 0.8 },
  floatTitle: { ...t.xl, fontFamily: fonts.heading, marginTop: 3 },
  floatMeta: { ...t.sm, fontFamily: fonts.mono, marginTop: spacing.sm },
  floatTagline: { ...t.sm, fontFamily: fonts.body, marginTop: spacing.sm },
  planLink: { marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  planLinkText: { ...t.sm, fontFamily: fonts.semibold },
  statewide: { marginTop: spacing.xl, paddingTop: spacing.lg, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statewideValue: { ...t.base, fontFamily: fonts.semibold },
  statewideMeta: { ...t.sm, fontFamily: fonts.body, marginTop: 2 },
});
