// eddy-ios/app/(tabs)/(floats)/float-home.tsx
// The Floats tab: plan a float, reopen the ones you kept, or start from Eddy's
// featured pick.
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
// builds, or the server flag; see floatModeFeature.ts), and "Ready offline"
// not until downloads exist (#1448). Featured Float is the same curated pick
// Today used to show, with the same daily rotation.

import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { useAppConfig } from '@/hooks/useAppConfig';
import { useFloatSession } from '@/hooks/useFloatSession';
import { readFavoriteFloats, writeFavoriteFloats } from '@/lib/favoriteFloatCache';
import { dailyFavoriteFloats } from '@/lib/todayFloats';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles, type as t } from '@/theme/typography';

/** Enough to recognise your recent floats; See all has the rest. */
const SAVED_PREVIEW_COUNT = 3;

export default function FloatHomeScreen() {
  return <LazyTabScreen><FloatHomeContent /></LazyTabScreen>;
}

function FloatHomeContent() {
  const router = useRouter();
  const { colors, elevation } = useTheme();
  const { floats: saved, ready, forget } = useSavedFloats();
  const { features } = useAppConfig();
  const activeFloat = useFloatSession();
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

  const featured = curated ? dailyFavoriteFloats(curated)[0] ?? null : null;

  const openPlanner = useCallback((params: Record<string, string> = {}) => {
    router.push({ pathname: '/', params: { ...params, openPlan: '1' } });
  }, [router]);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.interactive} />}
      >
        <View style={[styles.gutter, styles.welcome]}>
          <EddyScene name="routePlanning" size={72} />
          <View style={styles.welcomeText}>
            <Text style={[styles.title, { color: colors.text }]}>Float with Eddy</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Plan a trip, keep the ones you like, and find your next stretch.
            </Text>
          </View>
        </View>

        {features.floatMode && activeFloat ? (
          <View style={[styles.gutter, styles.resumeWrap]}>
            <Pressable
              onPress={() => router.push('/float-mode')}
              style={({ pressed }) => [styles.resume, { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 }, elevation(1)]}
              accessibilityRole="button"
              accessibilityLabel={`Resume float on the ${activeFloat.route.riverName} to ${activeFloat.takeOut.name}`}
            >
              <ControlIcon name="navigate-outline" size={20} color={colors.interactive} />
              <View style={styles.welcomeText}>
                <Text style={[styles.resumeTitle, { color: colors.text }]}>Resume Float</Text>
                <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
                  {activeFloat.route.riverName} · to {activeFloat.takeOut.name}
                </Text>
              </View>
              <ControlIcon name="chevron-forward" size={16} color={colors.textSubtle} />
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.gutter, styles.actions]}>
          <Pressable
            onPress={() => openPlanner()}
            style={({ pressed }) => [
              styles.planButton,
              { backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill },
            ]}
            accessibilityRole="button"
          >
            <ControlIcon name="map-outline" size={18} color={colors.onAccent} />
            <Text style={[styles.planButtonText, { color: colors.onAccent }]}>Plan a Float</Text>
          </Pressable>
          {features.floatMode && !activeFloat ? (
            <Pressable
              onPress={() => router.push('/float-start')}
              style={({ pressed }) => [styles.startButton, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
              accessibilityRole="button"
            >
              <ControlIcon name="navigate-outline" size={18} color={colors.interactive} />
              <Text style={[styles.startText, { color: colors.interactive }]}>Start Float</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.section}>
          <View style={styles.gutter}>
            <SectionHead
              title="Saved floats"
              action={saved.length > 0 ? 'See all' : undefined}
              onAction={() => router.push('/floats')}
            />
          </View>
          {saved.slice(0, SAVED_PREVIEW_COUNT).map((item) => (
            <SavedFloatRow
              key={item.shortCode}
              float={item}
              onOpen={() => router.push(`/float/${item.shortCode}`)}
              onForget={() => forget(item.shortCode)}
              elevation={elevation(1)}
            />
          ))}
          {ready && saved.length === 0 ? (
            <View style={[styles.gutter, styles.emptyRow]}>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                Floats you save show up here. Plan one above, or start from Eddy’s featured pick below.
              </Text>
            </View>
          ) : null}
        </View>

        {featured ? (
          <View style={[styles.section, styles.gutter]}>
            <SectionHead title="Featured float" action="See all" onAction={() => router.push('/favorite-floats')} />
            <FeaturedFloatCard
              item={featured}
              onPlan={() => openPlanner({
                focusRiver: featured.riverSlug,
                planPutIn: featured.putInId,
                planTakeOut: featured.takeOutId,
              })}
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
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
  planButton: { minHeight: 48, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  planButtonText: { ...t.base, fontFamily: fonts.semibold },
  actions: { gap: 10 },
  startButton: { minHeight: 48, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  startText: { ...t.base, fontFamily: fonts.semibold },
  resumeWrap: { marginBottom: 12 },
  resume: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14 },
  resumeTitle: { ...t.base, fontFamily: fonts.semibold },
  section: { marginTop: 24 },
  emptyRow: { paddingVertical: 4 },
  emptyText: { ...t.sm, fontFamily: fonts.body },
});
