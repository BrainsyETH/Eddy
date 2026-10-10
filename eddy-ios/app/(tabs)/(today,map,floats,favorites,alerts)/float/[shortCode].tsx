// eddy-ios/app/float/[shortCode].tsx
// One saved float, re-read against today's river.
//
// Current conditions always come from the server. The saved logistics view is
// available offline or during slow requests, with historical cautions dated.
// Foreground refresh keeps the plan mounted without claiming old water is current.

import { NativeHeaderHome } from '@/components/NativeHeaderHome';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { FloatPlan } from '@eddy/types';
import { ApiError, fetchSavedPlan } from '@/api/client';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { Otter } from '@/components/Otter';
import { PlanResult } from '@/components/PlanResult';
import { useSavedFloats } from '@/hooks/useSavedFloats';
import { SavedFloatDetails } from '@/components/SavedFloatDetails';
import { createSavedFloatLoader, emptySavedFloatState } from '@/lib/savedFloatLoader';
import { onForeground } from '@/lib/foreground';
import { networkHintsOffline } from '@/lib/networkHint';
import { useAppConfig } from '@/hooks/useAppConfig';

export default function SavedFloatScreen() {
  const { shortCode } = useLocalSearchParams<{ shortCode: string }>();
  const { colors } = useTheme();
  const { floats, isSaved, remember, forgetPlan, updateLogistics } = useSavedFloats();

  const [state, setState] = useState(emptySavedFloatState<FloatPlan>);
  const { plan, loading, error, checkedAt, showSaved } = state.shortCode === shortCode
    ? state : emptySavedFloatState<FloatPlan>();

  const stub = floats.find((f) => f.shortCode === shortCode) ?? null;
  const router = useRouter();
  const { features } = useAppConfig();

  const loader = useMemo(() => createSavedFloatLoader({
    fetchPlan: fetchSavedPlan,
    isOffline: networkHintsOffline,
    publish: setState,
    onSuccess: updateLogistics,
    errorMessage: err => err instanceof ApiError && err.status === 404
      ? 'This float is no longer available. The link may have expired.'
      : 'Eddy needs a connection to read this float against today’s river.',
  }), [updateLogistics]);
  const load = useCallback(() => shortCode ? loader.load(shortCode) : Promise.resolve(), [loader, shortCode]);

  useEffect(() => {
    void load();
    const unsubscribe = onForeground(() => void load());
    return () => { loader.dispose(); unsubscribe(); };
  }, [load, loader]);

  const onShare = useCallback(async () => {
    const url = stub?.url ?? `https://eddy.guide/plan/${shortCode}`;
    const summary = plan
      ? `${plan.putIn.name} → ${plan.takeOut.name} on the ${plan.river.name} · ${plan.distance.formatted}`
      : `${stub?.putInName ?? 'A float'} → ${stub?.takeOutName ?? ''}`.trim();
    await Share.share({ message: `${summary}\n${url}` });
  }, [plan, stub, shortCode]);

  const saved = plan != null && isSaved(plan);

  /**
   * Keep this float, or stop keeping it.
   *
   * No round trip here, unlike the star in the planner: the server row already
   * exists — it is what this screen just read — so keeping it is purely a note
   * to ourselves that this code is one of ours.
   *
   * Which is what makes a shared link keepable at all. Someone who is sent a
   * float can now put it in their own Favorites, and the person who sent it no
   * longer has it filed there just for having sent it.
   */
  const onToggleSave = useCallback(() => {
    if (!plan || !shortCode) return;
    if (saved) {
      forgetPlan(plan);
      return;
    }
    remember(plan, { shortCode, url: stub?.url ?? `https://eddy.guide/plan/${shortCode}` });
  }, [plan, shortCode, saved, stub, remember, forgetPlan]);

  // Start Float works offline from the saved stub's ids; the live plan adds
  // its MOVING speed (not its headline time, which includes stops) when
  // today's conditions have just been read.
  const riverSlug = plan?.river.slug ?? stub?.riverSlug;
  const putInId = plan?.putIn.id ?? stub?.putInId;
  const takeOutId = plan?.takeOut.id ?? stub?.takeOutId;
  const plannerMph = plan && !error ? plan.floatTime?.speedMph : undefined;
  const canStart = features.floatMode && riverSlug && putInId && takeOutId;
  const onStart = useCallback(() => {
    if (!riverSlug || !putInId || !takeOutId) return;
    router.push({
      pathname: '/float-start',
      params: {
        riverSlug,
        putInId,
        takeOutId,
        ...(shortCode ? { shortCode } : {}),
        ...(plannerMph ? { plannerMph: String(plannerMph) } : {}),
      },
    });
  }, [router, riverSlug, putInId, takeOutId, shortCode, plannerMph]);

  // The heading belongs to the same scroll view as the current/offline body.
  // A fixed sibling would hide behind the transparent navigation bar.
  const heading = (
    <View style={styles.header}>
      <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
        {plan?.river.name ?? stub?.riverName ?? 'Saved float'}
      </Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>
        {plan && !loading && !error
          ? 'Re-read against the river right now'
          : plan ? `${plan.putIn.name} → ${plan.takeOut.name}` : stub
            ? `${stub.putInName} → ${stub.takeOutName}`
            : ' '}
      </Text>
      {canStart ? (
        <Pressable
          onPress={onStart}
          style={({ pressed }) => [styles.startButton, { backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill }]}
          accessibilityRole="button"
        >
          <Text style={[styles.startText, { color: colors.onAccent }]}>Start float</Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['left', 'right']}>
      <NativeHeaderHome />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="square.and.arrow.up"
          accessibilityLabel="Share this float"
          onPress={() => void onShare()}
        >
          Share
        </Stack.Toolbar.Button>
        {/* Saving needs the live plan's stretch identity, as before. */}
        {plan ? (
          <Stack.Toolbar.Button
            icon={saved ? 'star.fill' : 'star'}
            selected={saved}
            tintColor={saved ? colors.warm : colors.interactive}
            accessibilityLabel={saved ? 'Remove this float from Favorites' : 'Save this float to Favorites'}
            onPress={onToggleSave}
          >
            Favorite
          </Stack.Toolbar.Button>
        ) : null}
      </Stack.Toolbar>

      {plan ? (
        <PlanResult plan={plan} header={heading} contentInsetAdjustmentBehavior="automatic"
          verification={{ state: loading ? 'checking' : error ? 'unavailable' : 'current', checkedAt,
            error, onRetry: () => void load() }} />
      ) : stub && showSaved ? (
        <SavedFloatDetails header={heading} saved={stub} refreshing={loading} error={error} onRetry={() => void load()} />
      ) : loading ? (
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.emptyContent}>
          {heading}
          <View accessible accessibilityLabel="Loading current float plan" accessibilityState={{ busy: true }} style={styles.loadingPlan}>
            <View style={styles.loadingLabel}><ActivityIndicator color={colors.interactive} /><Text style={[styles.centeredText, { color: colors.textMuted }]}>Checking current conditions…</Text></View>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.loadingPlan}>
              {[112, 70, 190].map((height, index) => <View key={index} style={{ height, borderRadius: 14, backgroundColor: colors.card }} />)}
            </View>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.emptyContent}>
          {heading}
          <View style={styles.centered}>
            <Otter mood="flag" size={110} />
            <Text style={[styles.centeredText, { color: colors.text }]}>
              {error ?? 'Could not load this float'}
            </Text>
            <Pressable onPress={() => void load()} style={styles.retryButton} accessibilityRole="button">
              <Text style={[styles.link, { color: colors.interactive }]}>Try again</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingBottom: 12 },
  emptyContent: { flexGrow: 1, padding: 20 },
  loadingPlan: { gap: 16 },
  loadingLabel: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  retryButton: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  title: { ...t['2xl'], fontFamily: fonts.display },
  subtitle: { ...t.sm, fontFamily: fonts.body, marginTop: 2 },
  centered: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 32, gap: 12 },
  centeredText: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
  link: { ...t.sm, fontFamily: fonts.semibold },
  startButton: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  startText: { ...t.base, fontFamily: fonts.semibold },
});
