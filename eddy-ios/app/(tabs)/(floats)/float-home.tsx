// eddy-ios/app/(tabs)/(floats)/float-home.tsx
// The Floats tab: start tracking, build or find a route, and revisit saved
// routes and completed trips.
//
// ── Why this route is not /floats ─────────────────────────────────────────
// /floats is the public saved-float list, shared by every tab stack and
// reachable from links. Expo Router would see two `floats` routes if the tab
// root reused the name, so the tab's own landing page is float-home and the
// list stays exactly where links expect it.
//
// ── What it deliberately does not show ────────────────────────────────────
// No float times on saved cards (see SavedFloatRow). Start Float and Resume
// Float appear only where the floatMode flag is on (development and preview
// builds, or the server flag; see floatModeFeature.ts), and so do the offline
// lines on saved floats, read from the same rules as each trip's own card. Featured Floats are the first three of the
// curated picks in the same daily rotation Today used, swiped one at a time.

import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { FavoriteFloatSummary } from '@eddy/types';
import { ApiError, fetchFavoriteFloats } from '@/api/client';
import { ControlIcon } from '@/components/ControlIcon';
import { EddyScene } from '@/components/EddyScene';
import { FeaturedFloatCard } from '@/components/FeaturedFloatCard';
import { LazyTabScreen } from '@/components/LazyTabScreen';
import { SavedFloatRow } from '@/components/SavedFloatRow';
import { SectionHead } from '@/components/SectionHead';
import { useSavedFloats } from '@/hooks/useSavedFloats';
import { useCachedRiverPhotos } from '@/hooks/useCachedRiverPhotos';
import { useAppConfig } from '@/hooks/useAppConfig';
import { useFloatSession } from '@/hooks/useFloatSession';
import { useOfflineBadges } from '@/float/useOfflineBadges';
import { readFavoriteFloats, writeFavoriteFloats } from '@/lib/favoriteFloatCache';
import { dailyFavoriteFloats } from '@/lib/todayFloats';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles, type as t } from '@/theme/typography';
import { floatPlanDestination } from '@/lib/planRequest';
import { useNavigationAction } from '@/hooks/useNavigationAction';

/** Enough to recognise your recent floats; See all has the rest. */
const SAVED_PREVIEW_COUNT = 3;

/** Featured picks to swipe through; See all has the rest. */
const FEATURED_COUNT = 3;
const FEATURED_GAP = 12;

export default function FloatHomeScreen() {
  return (
    <LazyTabScreen>
      <FloatHomeContent />
    </LazyTabScreen>
  );
}

function FloatHomeContent() {
  const router = useRouter();
  const navigate = useNavigationAction();
  const { colors, elevation } = useTheme();
  const { floats: saved, ready, forget } = useSavedFloats();
  const { features } = useAppConfig();
  const activeFloat = useFloatSession();
  const savedPreview = saved.slice(0, SAVED_PREVIEW_COUNT);
  const photos = useCachedRiverPhotos();
  const offline = useOfflineBadges(
    savedPreview.map((item) => item.shortCode),
    features.floatMode,
  );
  const [curated, setCurated] = useState<FavoriteFloatSummary[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Cache first, then the network: the curated list Today loads at launch is
  // usually already on disk, and an offline open still shows yesterday's pick.
  const loadCurated = useCallback(async (signal?: AbortSignal) => {
    const cached = await readFavoriteFloats();
    if (signal?.aborted) return;
    if (cached) setCurated((current) => current ?? cached);
    try {
      const live = await fetchFavoriteFloats(signal);
      setCurated(live);
      writeFavoriteFloats(live);
    } catch (error) {
      if (error instanceof ApiError && error.message === 'Request cancelled') return;
      // No featured pick is an acceptable outcome; the section simply hides.
      setCurated((current) => current ?? []);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadCurated is the external API synchronization for this route.
    void loadCurated(controller.signal);
    return () => controller.abort();
  }, [loadCurated]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadCurated();
    setRefreshing(false);
  }, [loadCurated]);

  const featured = curated ? dailyFavoriteFloats(curated).slice(0, FEATURED_COUNT) : [];

  const openPlanner = useCallback(
    (params: Record<string, string> = {}) => navigate(() => router.push(floatPlanDestination(params))),
    [navigate, router],
  );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.interactive} />
        }
      >
        <View style={[styles.gutter, styles.welcome]}>
          <EddyScene name="routePlanning" size={60} />
          <View style={styles.welcomeText}>
            <Text style={[styles.title, { color: colors.text }]}>Float with Eddy</Text>
          </View>
        </View>

        <View style={[styles.gutter, styles.actions]}>
          {features.floatMode ? (
            <Pressable
              onPress={() => navigate(() => router.push(activeFloat ? '/float-mode' : '/float-start'))}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.findCard,
                { backgroundColor: colors.accentFill, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <ControlIcon name="navigate-outline" size={24} color={colors.onAccent} />
              <View style={styles.welcomeText}>
                <Text style={[styles.findTitle, { color: colors.onAccent }]}>
                  {activeFloat ? 'Resume Float' : 'Start a Float'}
                </Text>
                <Text style={[styles.subtitle, { color: colors.onAccent }]}>
                  {activeFloat
                    ? `${activeFloat.route.riverName} · to ${activeFloat.takeOut.name}`
                    : 'Track your trip on the river'}
                </Text>
              </View>
              <ControlIcon name="chevron-forward" size={17} color={colors.onAccent} />
            </Pressable>
          ) : null}
          <View style={styles.actionRow}>
            <Pressable
              onPress={() => openPlanner()}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.actionTile,
                { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <ControlIcon name="map-outline" size={22} color={colors.interactive} />
              <Text style={[styles.actionTitle, { color: colors.text }]}>Build a Route</Text>
              <Text style={[t.sm, { color: colors.textMuted }]}>Choose your put-in and take-out</Text>
            </Pressable>
            {features.floatSearch ? (
              <Pressable
                onPress={() => navigate(() => router.push('/find-float'))}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.actionTile,
                  { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <ControlIcon name="search-outline" size={22} color={colors.interactive} />
                <Text style={[styles.actionTitle, { color: colors.text }]}>Find a Route</Text>
                <Text style={[t.sm, { color: colors.textMuted }]}>
                  Get suggestions for your time and location
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.gutter}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Saved Floats and History. See all saved routes and completed trips"
              onPress={() => navigate(() => router.push('/floats'))}
              style={({ pressed }) => [styles.collectionLink, { opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={styles.welcomeText}>
                <Text style={[textStyles.sectionTitle, { color: colors.text }]}>
                  Saved Floats &amp; History
                </Text>
                <Text style={[t.sm, { color: colors.textMuted }]}>Saved routes and completed trips</Text>
              </View>
              <View style={styles.seeAll}>
                <Text style={[t.sm, { color: colors.interactive }]}>See all</Text>
                <ControlIcon name="chevron-forward" size={16} color={colors.interactive} />
              </View>
            </Pressable>
          </View>
          {savedPreview.map((item) => (
            <SavedFloatRow
              key={item.shortCode}
              float={item}
              riverPhotoUrl={photos.get(item.riverSlug)}
              offline={offline.get(item.shortCode)}
              onOpen={() => navigate(() => router.push(`/float/${item.shortCode}`))}
              onForget={() => forget(item.shortCode)}
              elevation={elevation(1)}
            />
          ))}
          {ready && saved.length === 0 ? (
            <View style={[styles.gutter, styles.emptyRow]}>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                Keep a route you like, and it will be here for your next trip.
              </Text>
            </View>
          ) : null}
        </View>

        {featured.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.gutter}>
              <SectionHead
                title="Featured Floats"
                action="See all"
                onAction={() => navigate(() => router.push('/favorite-floats'))}
              />
            </View>
            <FeaturedCarousel
              items={featured}
              photos={photos}
              onPlan={(item) =>
                openPlanner({
                  focusRiver: item.riverSlug,
                  planPutIn: item.putInId,
                  planTakeOut: item.takeOutId,
                })
              }
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * One featured pick per page, the next one peeking in so it reads as
 * swipeable, with dots for where you are. Pages snap; the card keeps its own
 * single action.
 */
function FeaturedCarousel({
  items,
  photos,
  onPlan,
}: {
  items: FavoriteFloatSummary[];
  photos: ReadonlyMap<string, string>;
  onPlan: (item: FavoriteFloatSummary) => void;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const single = items.length === 1;
  // 16 pt gutter on the left; the next card peeks 24 pt in on the right.
  const cardWidth = width > 0 ? (single ? width - 32 : width - 16 - FEATURED_GAP - 24) : 0;
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (cardWidth <= 0) return;
    const next = Math.round(event.nativeEvent.contentOffset.x / (cardWidth + FEATURED_GAP));
    setPage(Math.max(0, Math.min(items.length - 1, next)));
  };

  return (
    <View onLayout={onLayout}>
      {cardWidth > 0 ? (
        <ScrollView
          horizontal
          directionalLockEnabled
          scrollEnabled={!single}
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={cardWidth + FEATURED_GAP}
          snapToAlignment="start"
          disableIntervalMomentum
          onScroll={onScroll}
          scrollEventThrottle={32}
          contentContainerStyle={styles.carousel}
        >
          {items.map((item) => (
            <View key={item.id} style={{ width: cardWidth }}>
              <FeaturedFloatCard
                item={item}
                riverPhotoUrl={photos.get(item.riverSlug)}
                onPlan={() => onPlan(item)}
              />
            </View>
          ))}
        </ScrollView>
      ) : null}
      {items.length > 1 ? (
        <View style={styles.dots} importantForAccessibility="no-hide-descendants">
          {items.map((item, index) => (
            <View
              key={item.id}
              style={[styles.dot, { backgroundColor: index === page ? colors.interactive : colors.border }]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingTop: 12, paddingBottom: 24 },
  gutter: { paddingHorizontal: 16 },
  welcome: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  welcomeText: { flex: 1, minWidth: 0 },
  title: { ...textStyles.pageTitle },
  subtitle: { ...t.sm, fontFamily: fonts.body, marginTop: 4 },
  actions: { gap: 12 },
  findCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: 18,
    minHeight: 82,
  },
  findTitle: { ...t.lg, fontFamily: fonts.heading },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionTile: { flex: 1, minWidth: 140, padding: 16, borderRadius: 16, gap: 5 },
  actionTitle: { ...t.base, fontFamily: fonts.semibold, marginTop: 4 },
  collectionLink: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, marginBottom: 10 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  section: { marginTop: 24 },
  emptyRow: { paddingVertical: 4 },
  emptyText: { ...t.sm, fontFamily: fonts.body },
  carousel: { paddingHorizontal: 16, gap: FEATURED_GAP, alignItems: 'stretch' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
