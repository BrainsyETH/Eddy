// eddy-ios/app/(tabs)/(today,map,floats,favorites,alerts)/lake/[slug].tsx
// One lake: its level, the wind, where to launch, and the water it belongs to.
//
// A lake is its own place, separate from the dam that holds it (ADR 0019). The
// dam screen answers "when do the units run"; this one answers what someone
// headed for the lake asks: is it up or down, is it blowing, where can I put
// in. Reading order follows that, and it is the web lake page's order: level,
// wind, launches, then the neighbours — each of which opens the river or dam
// screen Eddy already has instead of repeating it.
//
// The body is one request (fetchLake). Everything optional in it is optional
// here: no wind reading draws no wind card, no reviewed launches says so.
//
// Reached from a dam screen whose snapshot names a published lake. `name`
// rides along as a param so the title paints before the request answers.

import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import type { LakeSection } from '@eddy/conditions/lake-types';
import { ApiError, fetchLake } from '@/api/client';
import { NativeHeaderHome } from '@/components/NativeHeaderHome';
import { RiverPageHeader } from '@/components/RiverPageHeader';
import { LakeLaunchList } from '@/components/lake/LakeLaunchList';
import { LakeLevelCard } from '@/components/lake/LakeLevelCard';
import { LakeSystemCard } from '@/components/lake/LakeSystemCard';
import { LakeWindCard } from '@/components/lake/LakeWindCard';
import { useDamRefresh } from '@/hooks/useDamRefresh';
import { useObservationClock } from '@/hooks/useObservationClock';
import { useRiverHeaderTitle } from '@/hooks/useRiverHeaderTitle';
import { lakeHeaderPhoto } from '@/lib/lakeHeader';
import { shareLink } from '@/lib/share';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export default function LakeDetailScreen() {
  const { slug, name: nameParam } = useLocalSearchParams<{ slug: string; name?: string }>();
  const { colors } = useTheme();
  const headerHeight = useHeaderHeight();
  const topInset = Platform.OS === 'ios' ? headerHeight : 0;
  const header = useRiverHeaderTitle(slug, topInset);
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const selectedPhoto = lakeHeaderPhoto(slug);
  const photo = selectedPhoto?.url === failedPhoto ? null : selectedPhoto;

  // Held with the lake it describes, so a screen re-pointed at another lake
  // cannot show the previous one's level for a frame.
  const [held, setHeld] = useState<{ slug: string; lake: LakeSection } | null>(null);
  const lake = held?.slug === slug ? held.lake : null;
  // The slug whose FIRST load settled, succeeded or failed.
  const [settledFor, setSettledFor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const loadedFor = useRef<string | null>(null);
  // The observation clock: ages, staleness and cautions are phrased against it.
  const now = useObservationClock();

  const load = useCallback((signal: AbortSignal, primary: boolean) => {
    if (!slug) return;
    void (async () => {
      try {
        const next = await fetchLake(slug, signal);
        if (signal.aborted) return;
        setHeld({ slug, lake: next });
        setFailed(false);
      } catch (error) {
        if (signal.aborted) return;
        // A refresh failure must not blank a screen already showing a level;
        // the reading keeps its honest age instead. Only an arrival fails.
        //
        // A 404 is an answer, not an outage: the lake is not published (or the
        // slug is wrong), and "check your connection" with a retry that cannot
        // succeed would be the wrong thing to say.
        if (primary) setFailed(!(error instanceof ApiError && error.status === 404));
      } finally {
        if (!signal.aborted && primary) {
          setSettledFor(slug);
          loadedFor.current = slug;
        }
      }
    })();
  }, [slug]);

  // Focus, foreground and five-minute boundaries, as the dam screen refreshes.
  useDamRefresh(useCallback((signal: AbortSignal) => {
    load(signal, loadedFor.current !== slug);
    // Retry changes the callback and starts a new request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, slug, reloadNonce]));

  const retry = useCallback(() => {
    loadedFor.current = null;
    setSettledFor(null);
    setReloadNonce((n) => n + 1);
  }, []);

  const title = lake?.name ?? nameParam ?? 'Lake';
  const pending = settledFor !== slug;

  if (!lake) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['left', 'right']}>
        <Stack.Screen options={{ title, headerTitle: nameParam ? nameParam : '' }} />
        <NativeHeaderHome />
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.centre, styles.emptyBody]}>
          {pending ? (
            <ActivityIndicator size="large" color={colors.interactive} accessibilityLabel={`Loading ${title}`} />
          ) : (
            <>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{failed ? 'Lake unavailable' : 'Lake not found'}</Text>
              <Text style={[styles.emptyBodyText, { color: colors.textMuted }]}>
                {failed ? 'Couldn’t load this lake. Check your connection and try again.' : 'Eddy can’t find this lake.'}
              </Text>
              {failed ? (
                <Pressable onPress={retry} accessibilityRole="button"
                  style={({ pressed }) => [styles.button, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
                  <Text style={[styles.buttonText, { color: colors.text }]}>Try again</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const meta = [lake.states.join(' / '), lake.dam?.name].filter(Boolean).join(' · ');
  const hasSystem = Boolean(lake.system && lake.system.length > 0);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['left', 'right']}>
      <Stack.Screen options={{ title: lake.name, headerTitle: header.collapsed ? lake.name : '' }} />
      <NativeHeaderHome />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="square.and.arrow.up"
          accessibilityLabel={`Share ${lake.name}`}
          onPress={() => void shareLink(lake.name, `/lakes/${lake.slug}`)}
        >
          Share
        </Stack.Toolbar.Button>
      </Stack.Toolbar>

      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.body}
        onScroll={header.onScroll} scrollEventThrottle={32}>
        <RiverPageHeader key={`${slug}:${photo?.url ?? 'plain'}`} name={lake.name} meta={meta}
          photo={photo} topInset={topInset} horizontalInset={0} creditPlacement="overlay"
          onPhotoError={setFailedPhoto} onTitleBottom={header.onTitleBottom} />

        <View style={styles.section}>
          <LakeLevelCard lake={lake} now={now} />
        </View>
        {lake.weather ? (
          <View style={styles.section}>
            <LakeWindCard weather={lake.weather} now={now} />
          </View>
        ) : null}
        <View style={styles.section}>
          <LakeLaunchList lake={lake} now={now} />
        </View>
        {hasSystem ? (
          <View style={styles.section}>
            <LakeSystemCard rows={lake.system!} now={now} />
          </View>
        ) : null}

        {lake.sources.length > 0 ? (
          <Text style={[styles.sources, { color: colors.textSubtle }]}>Source: {lake.sources.join(' · ')}.</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centre: { alignItems: 'center', justifyContent: 'center' },
  emptyBody: { flexGrow: 1, padding: 32, gap: 10 },
  emptyTitle: { ...t.xl, fontFamily: fonts.heading, textAlign: 'center' },
  emptyBodyText: { ...t.sm, fontFamily: fonts.body, textAlign: 'center', flexShrink: 1 },
  body: { paddingTop: 12, paddingBottom: 40 },
  section: { paddingHorizontal: 16, marginBottom: 14 },
  button: { minHeight: 44, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  buttonText: { ...t.sm, fontFamily: fonts.medium, textAlign: 'center' },
  sources: { ...t.xs, paddingHorizontal: 20, marginTop: 4 },
});
