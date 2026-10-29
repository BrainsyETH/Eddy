import { NativeHeaderHome } from '@/components/NativeHeaderHome';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FeaturedFloatCard } from '@/components/FeaturedFloatCard';
import { FloatCollectionControls } from '@/components/FloatCollectionControls';
import { useCachedRiverPhotos } from '@/hooks/useCachedRiverPhotos';
import { useNavigationAction } from '@/hooks/useNavigationAction';
import { visibleFeaturedFloats } from '@/lib/floatCollection';
import { useRouter } from 'expo-router';
import type { FavoriteFloatSummary } from '@eddy/types';
import { ApiError, fetchFavoriteFloats } from '@/api/client';
import { readFavoriteFloats, writeFavoriteFloats } from '@/lib/favoriteFloatCache';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { floatPlanDestination } from '@/lib/planRequest';

export default function FavoriteFloatsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const photos = useCachedRiverPhotos();
  const navigate = useNavigationAction();
  const [river, setRiver] = useState('');
  const [sort, setSort] = useState<'default' | 'river'>('default');
  const [floats, setFloats] = useState<FavoriteFloatSummary[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const cached = await readFavoriteFloats();
    if (signal?.aborted) return;
    if (cached) setFloats((current) => current ?? cached);
    try {
      const live = await fetchFavoriteFloats(signal);
      setFloats(live);
      setError(null);
      writeFavoriteFloats(live);
    } catch (err) {
      if (err instanceof ApiError && err.message === 'Request cancelled') return;
      setFloats((current) => current ?? []);
      setError(
        cached
          ? 'Offline — showing Eddy’s saved guide picks.'
          : 'Couldn’t load Eddy’s guide picks. Pull down to retry.',
      );
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load is the external API synchronization for this route.
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const selectedRiver = floats?.some((item) => item.riverSlug === river) ? river : '';
  const displayed = visibleFeaturedFloats(floats ?? [], selectedRiver, sort);
  const plan = useCallback(
    (item: FavoriteFloatSummary) => {
      navigate(() =>
        router.push(
          floatPlanDestination({
            focusRiver: item.riverSlug,
            planPutIn: item.putInId,
            planTakeOut: item.takeOutId,
          }),
        ),
      );
    },
    [navigate, router],
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['left', 'right']}>
      <NativeHeaderHome />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        refreshControl={
          floats ? (
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.interactive} />
          ) : undefined
        }
      >
        <View>
          <Text style={[styles.title, { color: colors.text }]}>Featured floats</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Hand-picked stretches from the river guides
          </Text>
        </View>
        {!floats ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.interactive} accessibilityLabel="Loading guide picks" />
          </View>
        ) : (
          <>
            {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
            {floats.length === 0 ? (
              <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>No guide picks available</Text>
                <Text style={[styles.bodyText, { color: colors.textMuted }]}>
                  Pull down when you’re back online.
                </Text>
              </View>
            ) : (
              <>
                <FloatCollectionControls
                  items={floats}
                  river={selectedRiver}
                  onRiver={setRiver}
                  sort={sort}
                  onSort={setSort}
                  defaultOrder="Featured order"
                />
                {displayed.map((item) => (
                  <FeaturedFloatCard
                    key={item.id}
                    item={item}
                    riverPhotoUrl={photos.get(item.riverSlug)}
                    onPlan={() => plan(item)}
                    detailed
                  />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  title: { ...t['2xl'], fontFamily: fonts.display },
  subtitle: { ...t.sm, fontFamily: fonts.body, marginTop: 2 },
  center: { flexGrow: 1, paddingVertical: 32, alignItems: 'center', justifyContent: 'center' },
  content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40, gap: 16 },
  error: { ...t.sm, fontFamily: fonts.body },
  cardTitle: { ...t.xl, fontFamily: fonts.heading, marginTop: 3 },
  bodyText: { ...t.sm, fontFamily: fonts.body, marginTop: 4 },
  empty: { borderWidth: 1, borderRadius: 16, padding: 20 },
});
