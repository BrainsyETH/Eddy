import { radii } from '@/theme/layout';
import { Children, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Alert,
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
import { Ionicons } from '@expo/vector-icons';
import { Image as CachedImage } from 'expo-image';
import { selectReadRail, readRailState } from '@/lib/readRail';
import { useFocusEffect, useRouter } from 'expo-router';
import type {
  DamSnapshot,
  FavoriteFloatSummary,
  HighWaterEntry,
  MapGauge,
  RiverAlert,
  RiverListItem,
} from '@eddy/types';
import type { Coords } from '@eddy/geo';
import {
  ApiError,
  fetchFavoriteFloats,
  fetchHighWater,
  fetchLocationWeather,
  fetchRiverAlerts,
} from '@/api/client';
import { BlurredReadPreview, EddyReadCard, EddyReadPlaceholder } from '@/components/EddyReadCard';
import { useAccount } from '@/hooks/useAccount';
import { useDams } from '@/hooks/useDams';
import { useTodaySnooze } from '@/hooks/useTodaySnooze';
import { onForeground } from '@/lib/foreground';
import { seedLocationForecast } from '@/lib/locationForecast';
import { generationNow, generationStatusLabel } from '@eddy/conditions/dam-generation';
import { relativeAge } from '@eddy/conditions/dam-schedule-copy';
import { EddySymbol } from '@/components/EddySymbol';
import { TodayRiverPhoto } from '@/components/TodayRiverPhoto';
import { PremiumReadPreview } from '@/components/PremiumReadPreview';
import { EddyScene } from '@/components/EddyScene';
import { Otter, otterForCondition } from '@/components/Otter';
import { TodaySummary, TodayWeather } from '@/components/TodaySummary';
import { useSession } from '@/hooks/useSession';
import { type LocationStatus } from '@/hooks/useLocation';
import { useStarredRivers, type StarredItem } from '@/hooks/useStarredRivers';
import { readFavoriteFloats, writeFavoriteFloats } from '@/lib/favoriteFloatCache';
import { favoriteFloatMeta } from '@/lib/favoriteFloatCopy';
import { formatReading, primaryReading, readingAge } from '@/lib/readingCopy';
import { dailyFavoriteFloats, dailyHighlightedFavorite } from '@/lib/todayFloats';
import {
  chooseTodayRecommendations,
  TODAY_RADIUS_MILES,
  type TodayRecommendation,
} from '@/lib/todayRecommendation';
import { railSelectionIndex, railIndexAtOffset } from '@/lib/railSelection';
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

export type TodayRiverFilter = 'all' | 'floatable' | 'starred' | 'low' | 'high' | 'unknown';

export interface TodayRead {
  river: RiverListItem;
  says: EddySays;
}

const NO_FAVORITE_RIVERS = new Set<string>();
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
          <Ionicons name="chevron-back" size={20} color={visibleIndex === 0 ? colors.textSubtle : colors.interactive} />
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
          <Ionicons name="chevron-forward" size={20} color={visibleIndex === count - 1 ? colors.textSubtle : colors.interactive} />
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
      <ConditionPill river={river} centered />
      <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
    </Pressable>
  );
}

function favoriteDetail(
  item: StarredItem,
  river: RiverListItem | null,
  gauge: MapGauge | null,
  dam: DamSnapshot | null,
  now: number,
): string {
  const reading = river?.currentCondition ? primaryReading(river.currentCondition) : null;
  if (reading) {
    return [formatReading(reading.value, reading.unit), readingAge(river?.currentCondition?.readingAgeHours)]
        .filter(Boolean)
        .join(' · ');
  }
  if (gauge) {
    const value = gauge.gaugeHeightFt != null
      ? formatReading(gauge.gaugeHeightFt, 'ft')
      : gauge.dischargeCfs != null
        ? formatReading(gauge.dischargeCfs, 'cfs')
        : null;
    return [value, readingAge(gauge.readingAgeHours)].filter(Boolean).join(' · ') || 'No fresh reading';
  }
  if (dam) {
    const state = generationNow(dam, now);
    if (state.kind !== 'unavailable') {
      const amount = state.kind === 'generating' ? `${Math.round(state.turbineCfs).toLocaleString()} cfs` : null;
      return [generationStatusLabel(state), amount, relativeAge(state.observedAt, now)].filter(Boolean).join(' · ');
    }
    const release = dam.metrics.release;
    return release ? `Release ${Math.round(release.value).toLocaleString()} cfs · ${relativeAge(release.at, now)}` : 'Generation data unavailable';
  }
  return item.kind === 'river'
    ? 'Conditions unavailable'
    : item.kind === 'gauge'
      ? 'No fresh reading'
      : 'Generation data unavailable';
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
          style={({ pressed }) => [styles.floatPlan, { backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
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

function FavoritePreviewCard({
  item,
  river,
  gauge,
  dam,
  now,
  onOpen,
  onPlan,
  standalone = false,
}: {
  item: StarredItem;
  river: RiverListItem | null;
  gauge: MapGauge | null;
  dam: DamSnapshot | null;
  now: number;
  onOpen: () => void;
  onPlan: (() => void) | null;
  standalone?: boolean;
}) {
  const { colors, elevation } = useTheme();
  const code = river?.currentCondition?.code ?? 'unknown';
  return (
    <View
      style={[
        styles.favoritePreview,
        standalone ? styles.favoriteStandalone : null,
        {
          backgroundColor: river ? conditionBg(code) : colors.selectionBg,
          borderColor: river ? conditionChipBorder(code) : colors.border,
        },
        elevation(1),
      ]}
    >
      <View style={styles.favoriteHeroTop}>
        <View style={styles.heroCopy}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>FAVORITE</Text>
          <Text style={[styles.favoritePreviewName, { color: colors.text }]} >{item.name}</Text>
          <Text style={[styles.heroMeta, { color: colors.textMuted }]} numberOfLines={item.kind === 'dam' ? undefined : 2}>
            {favoriteDetail(item, river, gauge, dam, now)}
          </Text>
          {river ? <View style={styles.heroPill}><ConditionPill river={river} /></View> : null}
        </View>
        {river ? (
          <Otter mood={otterForCondition(code)} size={78} style={styles.favoritePreviewOtter} />
        ) : item.kind === 'dam' ? (
          <EddySymbol name="dam" size={74} />
        ) : (
          <EddyScene name="heart" size={74} style={styles.favoritePreviewOtter} />
        )}
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={onOpen}
          style={({ pressed }) => [styles.secondaryButton, styles.flexButton, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.65 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
          accessibilityRole="button"
        >
          <Text style={[styles.secondaryButtonText, { color: colors.interactive }]}>View details</Text>
        </Pressable>
        {onPlan ? (
          <Pressable
            onPress={onPlan}
            style={({ pressed }) => [styles.primaryButton, { backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
            accessibilityRole="button"
          >
            <Ionicons name="map-outline" size={17} color={colors.onAccent} />
            <Text style={[styles.primaryButtonText, { color: colors.onAccent }]}>Plan</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function BestRiverCard({
  recommendation,
  photoUrl,
  premiumUserId,
  revision,
  onRead,
  onOpen,
  onPlan,
  standalone = false,
}: {
  recommendation: TodayRecommendation;
  photoUrl?: string | null;
  premiumUserId: string | null;
  revision: string;
  onRead: () => void;
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
          <Ionicons name="pulse-outline" size={17} color={conditionInk(condition.code)} />
          <View style={styles.flex}>
            {facts ? <Text style={[styles.factText, { color: colors.text }]} numberOfLines={1}>{facts}</Text> : null}
            {age ? <Text style={[styles.factAge, { color: colors.textMuted }]} numberOfLines={1}>{age}</Text> : null}
          </View>
        </View>
      ) : null}
      <Pressable
        onPress={onRead}
        style={({ pressed }) => [styles.eddyRead, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
        accessibilityRole="button"
        accessibilityLabel={`Open Eddy's Read for ${recommendation.river.name}`}
      >
        <View style={styles.readHead}>
          <Ionicons name="sparkles" size={15} color={colors.accent} />
          <Text style={[styles.readLabel, { color: colors.accent }]}>View full read</Text>
          <Ionicons name="chevron-forward" size={15} color={colors.textSubtle} />
        </View>
        {!premiumUserId ? <BlurredReadPreview lines={1} /> : null}
      </Pressable>
      {premiumUserId ? <PremiumReadPreview key={premiumUserId} slug={recommendation.river.slug} revision={revision} /> : null}
      {recommendation.notices.length > 0 ? (
        <Pressable onPress={onOpen} accessibilityRole="button" style={styles.factRow}>
          <Ionicons name="warning-outline" size={18} color={colors.text} />
          <Text style={[styles.factText, styles.flex, { color: colors.text }]}>
            {recommendation.notices[0].title} · View agency notice
          </Text>
        </Pressable>
      ) : null}
      <View style={styles.actions}>
        <Pressable
          onPress={onPlan}
          style={({ pressed }) => [styles.primaryButton, { backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
          accessibilityRole="button"
        >
          <Ionicons name="map-outline" size={17} color={colors.onAccent} />
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
  const { colors } = useTheme();
  const { starred, ready: starsReady } = useStarredRivers();
  const { session } = useSession();
  const account = useAccount();
  const premiumUserId = account.loaded && !account.error && account.entitlement?.isActive && account.profile?.id === session?.user.id
    ? session?.user.id ?? null : null;
  const { refresh: refreshAccount } = account;
  const focusedOnce = useRef(false);
  useFocusEffect(useCallback(() => {
    if (focusedOnce.current) void refreshAccount();
    focusedOnce.current = true;
  }, [refreshAccount]));
  const dams = useDams(starred.some((item) => item.kind === 'dam'));
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    const off = onForeground(() => { setNow(Date.now()); void refreshAccount(); });
    return () => { clearInterval(timer); off(); };
  }, [refreshAccount]);
  const openRead = (slug: string) => router.push({ pathname: '/river/[slug]', params: { slug, focus: 'read' } });
  const snoozeAll = () => Alert.alert('Snooze Today alerts', 'Hide all Today alerts until the snooze ends. You can still view them in Alerts.', [
    { text: '1 hour', onPress: () => snooze('hour') },
    { text: 'Rest of today', onPress: () => snooze('today') },
    { text: '24 hours', onPress: () => snooze('day') },
    { text: 'Cancel', style: 'cancel' },
  ]);

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
  const highlightedFavorite = useMemo(() => dailyHighlightedFavorite(starred), [starred]);
  const favoritePreviews = useMemo(() => {
    if (!highlightedFavorite) return [];
    return [
      highlightedFavorite,
      ...starred.filter(
        (item) =>
          item.kind !== highlightedFavorite.kind ||
          item.entityId !== highlightedFavorite.entityId,
      ),
    ].slice(0, 4);
  }, [highlightedFavorite, starred]);
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

  const riverById = useMemo(() => new Map(rivers.map((river) => [river.id, river])), [rivers]);
  const gaugeByFavoriteId = useMemo(() => {
    const index = new Map<string, MapGauge>();
    (gauges ?? []).forEach((gauge) => {
      index.set(gauge.id, gauge);
      if (gauge.usgsSiteId) index.set(gauge.usgsSiteId, gauge);
    });
    return index;
  }, [gauges]);
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

  const displayedRiverSlugs = useMemo(
    () => new Set(recommendations.map(({ river }) => river.slug)),
    [recommendations],
  );
  const filteredSafety = useMemo(
    () => filterTodaySafety(safety.high ?? [], safety.notices ?? [], safetyScope, displayedRiverSlugs),
    [safety.high, safety.notices, safetyScope, displayedRiverSlugs],
  );
  const activeSafety = {
    high: safety.high === null ? null : filteredSafety.high,
    notices: safety.notices === null ? null : filteredSafety.notices,
  };
  const { ready: snoozeReady, snoozed, snooze } = useTodaySnooze();
  const safetyCount = (activeSafety?.high?.length ?? 0) + (activeSafety?.notices?.length ?? 0);
  const detailFailure = floatFailure || safetyFailure.high || safetyFailure.notices;
  const safetyScopeLabel = safetyScope.kind === 'favorites'
    ? recommendations.length ? 'on your favorites and suggested rivers' : 'on your favorite rivers'
    : safetyScope.kind === 'nearby'
      ? 'near you'
      : 'statewide';
  const topNotice = useMemo(() => {
    const rank = { warning: 0, watch: 1, notice: 2 } as const;
    return [...(activeSafety?.notices ?? [])].sort((a, b) => rank[a.severity] - rank[b.severity])[0] ?? null;
  }, [activeSafety?.notices]);
  const ordinaryTopHigh = useMemo(
    () => [...(activeSafety?.high ?? [])].sort((a, b) => Number(b.conditionCode === 'dangerous') - Number(a.conditionCode === 'dangerous'))[0] ?? null,
    [activeSafety?.high],
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
  const reservedReadIds = useMemo(() => {
    const reserved = new Set(recommendations.map((item) => item.river.id));
    favoritePreviews.forEach((item) => {
      if (item.kind === 'river') reserved.add(item.entityId);
    });
    return reserved;
  }, [recommendations, favoritePreviews]);
  const readCandidates = useMemo(() => selectReadRail(
    [...rivers].sort((a, b) => Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id))),
    reservedReadIds, (river) => river.id,
  ), [rivers, favoriteIds, reservedReadIds]);
  const readPreviews = useMemo(() => {
    // Premium requests still start before the public index; these candidates
    // have already been selected, so do not filter or truncate them again.
    if (!reads.length && premiumUserId && (readsLoading || readsError)) {
      return readCandidates.map((river) => ({ river, says: { text: '', generatedAt: '' } }));
    }
    return selectReadRail(reads, reservedReadIds, ({ river }) => river.id);
  }, [reads, premiumUserId, readsLoading, readsError, readCandidates, reservedReadIds]);
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
  const previewReservedIds = useMemo(() => {
    const ids = new Set(readPreviews.map(({ river }) => river.id));
    favoritePreviews.forEach((item) => {
      if (item.kind === 'river') ids.add(item.entityId);
    });
    recommendations.forEach((item) => ids.add(item.river.id));
    return ids;
  }, [favoritePreviews, readPreviews, recommendations]);
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
          <Ionicons name="cloud-offline-outline" size={16} color={colors.textMuted} />
          <Text style={[styles.noticeText, { color: colors.textMuted }]}>Some live details could not refresh. Showing what Eddy has.</Text>
        </View>
      ) : null}

      {snoozeReady && !snoozed && safetyCount > 0 ? (
        <View style={styles.safetySection}>
          <Pressable onPress={snoozeAll} accessibilityRole="button" style={{ minHeight: 44, alignSelf: 'flex-end', justifyContent: 'center' }}><Text style={{ color: colors.interactive }}>Snooze alerts</Text></Pressable>
          <View style={styles.safetyRows}>
            {!snoozed && topNotice ? (
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
            loading={readsLoading}
            error={readsError}
            onRetry={onRetryReads}
          />
        ) : null}
        <TodayWeather
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
        <SectionHead title="Favorites" action={starred.length ? 'See all' : undefined} onAction={() => router.push('/favorites')} />
        {starsReady && favoritePreviews.length > 1 ? (
          <CardRail label="Favorites" cardWidth={286}>
            {favoritePreviews.map((item) => {
              const river = item.kind === 'river' ? riverById.get(item.entityId) ?? null : null;
              return (
                <FavoritePreviewCard
                  key={`${item.kind}:${item.entityId}`}
                  item={item}
                  dam={item.kind === 'dam' ? dams?.find((dam) => dam.id === item.entityId) ?? null : null}
                  now={now}
                  river={river}
                  gauge={item.kind === 'gauge'
                    ? gaugeByFavoriteId.get(item.entityId) ?? gaugeByFavoriteId.get(item.usgsSiteId ?? '') ?? null
                    : null}
                  onOpen={() => openFavorite(item)}
                  onPlan={river?.slug ? () => openPlan(river.slug) : null}
                />
              );
            })}
          </CardRail>
        ) : starsReady && favoritePreviews.length === 1 ? (
          <FavoritePreviewCard
            item={favoritePreviews[0]}
            dam={favoritePreviews[0].kind === 'dam' ? dams?.find((dam) => dam.id === favoritePreviews[0].entityId) ?? null : null}
            now={now}
            river={favoritePreviews[0].kind === 'river' ? riverById.get(favoritePreviews[0].entityId) ?? null : null}
            gauge={favoritePreviews[0].kind === 'gauge'
              ? gaugeByFavoriteId.get(favoritePreviews[0].entityId) ?? gaugeByFavoriteId.get(favoritePreviews[0].usgsSiteId ?? '') ?? null
              : null}
            onOpen={() => openFavorite(favoritePreviews[0])}
            onPlan={favoritePreviews[0].kind === 'river' && favoritePreviews[0].slug
              ? () => openPlan(favoritePreviews[0].slug)
              : null}
            standalone
          />
        ) : starsReady ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.selectionBg, borderColor: colors.border }]}>
            <EddyScene name="heart" size={76} />
            <View style={styles.flex}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Make Today yours</Text>
              <Text style={[styles.emptyBody, { color: colors.textMuted }]}>Star rivers, gauges, or dams to see them here.</Text>
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
        ) : recommendations.length > 1 ? (
          <CardRail label={location.coords ? 'Best Near You' : 'Best Right Now'} cardWidth={300}>
            {recommendations.map((item) => (
              <BestRiverCard
                key={item.river.id}
                recommendation={item}
                photoUrl={photos.get(item.river.slug)}
                premiumUserId={premiumUserId}
                revision={String(refreshRevision)}
                onRead={() => openRead(item.river.slug)}
                onOpen={() => router.push(`/river/${item.river.slug}`)}
                onPlan={() => openPlan(item.river.slug)}
              />
            ))}
          </CardRail>
        ) : recommendations.length === 1 ? (
          <BestRiverCard
            recommendation={recommendations[0]}
            photoUrl={photos.get(recommendations[0].river.slug)}
            premiumUserId={premiumUserId}
            revision={String(refreshRevision)}
            onRead={() => openRead(recommendations[0].river.slug)}
            onOpen={() => router.push(`/river/${recommendations[0].river.slug}`)}
            onPlan={() => openPlan(recommendations[0].river.slug)}
            standalone
          />
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

      {featuredFloat ? (
        <View style={styles.section}>
          <SectionHead title="Featured float" action="See all" onAction={() => router.push('/favorite-floats')} />
          <FloatPreviewCard
            item={featuredFloat}
            onPlan={() => openPlan(featuredFloat.riverSlug, featuredFloat.putInId, featuredFloat.takeOutId)}
          />
        </View>
      ) : null}

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
  safetyRow: { minHeight: 82, borderWidth: 1, borderLeftWidth: 4, borderRadius: radii.card, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 10 },
  safetyIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  safetyRowTitle: { ...t.sm, fontFamily: fonts.semibold },
  safetyRowMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  section: { marginBottom: 24 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 2 },
  sectionTitle: { ...textStyles.sectionTitle },
  sectionAction: { ...t.sm, fontFamily: fonts.semibold },
  favoritePreview: { width: '100%', minHeight: 252, borderWidth: 1, borderRadius: radii.feature, padding: 16 },
  favoriteStandalone: { width: 'auto', height: 'auto', minHeight: 252 },
  favoriteHeroTop: { flexDirection: 'row', alignItems: 'center', minHeight: 116 },
  heroCopy: { flex: 1, minWidth: 0, zIndex: 1 },
  eyebrow: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 0.9, marginBottom: 3 },
  favoritePreviewName: { ...t.xl, fontFamily: fonts.display },
  heroMeta: { ...t.sm, fontFamily: fonts.body, marginTop: 4 },
  heroPill: { alignSelf: 'flex-start', marginTop: 9 },
  favoritePreviewOtter: { marginRight: -9, marginLeft: 2 },
  pill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  pillText: { ...t.xs, fontFamily: fonts.semibold },
  emptyCard: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  emptyBest: { borderWidth: 1, borderRadius: radii.card, padding: 18 },
  emptyTitle: { ...t.base, fontFamily: fonts.semibold },
  emptyBody: { ...t.sm, fontFamily: fonts.body, marginTop: 3 },
  loading: { height: 150, alignItems: 'center', justifyContent: 'center' },
  bestPreview: { width: '100%', minHeight: 354, borderWidth: 1, borderRadius: radii.feature, padding: 16 },
  bestStandalone: { width: 'auto', height: 'auto', minHeight: 354 },
  bestTop: { flexDirection: 'row', alignItems: 'center', minHeight: 112 },
  bestName: { ...t['2xl'], fontFamily: fonts.display },
  bestReason: { ...t.sm, fontFamily: fonts.body, marginTop: 4 },
  bestPreviewOtter: { marginRight: -10, marginLeft: 2 },
  factRow: { minHeight: 44, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  factText: { ...t.sm, fontFamily: fonts.mono, flex: 1 },
  factAge: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  eddyRead: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.card, padding: 13, marginTop: 10 },
  readHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  readLabel: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 0.7, flex: 1 },
  actions: { flexWrap: 'wrap', flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 'auto', paddingTop: 15 },
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
  cardRail: { paddingHorizontal: 16, paddingBottom: 2, gap: CARD_GAP },
  railPosition: { ...t.xs, fontFamily: fonts.mono, textAlign: 'right', marginTop: 5, paddingRight: 2 },
  conditionSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 10 },
  conditionCount: { flexGrow: 1, flexBasis: '47%', minWidth: 0, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9 },
  conditionCountNumber: { ...t.lg, fontFamily: fonts.heading },
  conditionCountLabel: { ...t.xs, fontFamily: fonts.body, marginTop: 1 },
  conditionPreviewCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.card, paddingHorizontal: 13, overflow: 'hidden' },
  compactRiver: { minHeight: 58, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 9 },
  compactRiverName: { ...t.sm, fontFamily: fonts.semibold },
  compactRiverMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  browseAll: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  browseAllText: { ...t.sm, fontFamily: fonts.semibold },
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
