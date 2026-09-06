// eddy-ios/app/float/[shortCode].tsx
// One saved float, re-read against today's river.
//
// ── This screen is not a cache ──────────────────────────────────────────────
// /api/plan/[shortCode] recalculates the whole plan from the two access points
// before answering — the same gauge read, the same shuttle drive, the same
// hazard sweep as a plan built a moment ago. That is the only correct behaviour
// here. A float saved in April and opened in July is the same stretch and
// completely different water, and a screen that replayed April's numbers under
// July's date would be dangerous rather than merely stale.
//
// Which is also why it needs a connection and says so plainly when it does not
// have one, rather than showing a skeleton of a plan.
//
// The rendering is PlanResult, shared with the sheet a plan is built in, so a
// shared float and the plan that produced it cannot read differently.

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { FloatPlan } from '@eddy/types';
import { ApiError, fetchSavedPlan } from '@/api/client';
import { planShareSummary } from '@/lib/planCopy';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { Otter } from '@/components/Otter';
import { PlanResult } from '@/components/PlanResult';
import { useSavedFloats } from '@/hooks/useSavedFloats';
import { goBack } from '@/lib/nav';

export default function SavedFloatScreen() {
  const { shortCode } = useLocalSearchParams<{ shortCode: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { floats, isSaved, remember, forgetPlan } = useSavedFloats();

  const [plan, setPlan] = useState<FloatPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The local stub, used only for the header while the real plan loads. It is
  // what makes this screen name the stretch instantly instead of showing a
  // spinner with no idea what it is loading.
  const stub = floats.find((f) => f.shortCode === shortCode) ?? null;

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!shortCode) return;
      setLoading(true);
      try {
        setPlan(await fetchSavedPlan(shortCode, signal));
        setError(null);
      } catch (err) {
        if (err instanceof ApiError && err.message === 'Request cancelled') return;
        setError(
          err instanceof ApiError && err.status === 404
            ? 'This float is no longer available. The link may have expired.'
            : 'Eddy needs a connection to read this float against today’s river.',
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [shortCode],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const onShare = useCallback(async () => {
    const url = stub?.url ?? `https://eddy.guide/plan/${shortCode}`;
    // The same line the planner shares, time included — a re-share used to
    // drop the float time, so the second recipient read less than the first.
    const summary = plan
      ? planShareSummary(plan)
      : `${stub?.putInName ?? 'A float'} → ${stub?.takeOutName ?? ''}`.trim();
    await Share.share({ message: `${summary}\n${url}`, url });
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

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navRow}>
        <Pressable onPress={() => goBack(router)} hitSlop={12} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={styles.navActions}>
          {/* Only once the plan is in hand: the star is keyed on the stretch,
              and there is nothing to keep until we know what it is. */}
          {plan ? (
            <Pressable
              onPress={onToggleSave}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityState={{ selected: saved }}
              accessibilityLabel={
                saved ? 'Remove this float from favorites' : 'Save this float to favorites'
              }
            >
              <Ionicons
                name={saved ? 'star' : 'star-outline'}
                size={22}
                color={saved ? colors.favorite : colors.textSubtle}
              />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => void onShare()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Share this float"
          >
            <Ionicons name="share-outline" size={22} color={colors.text} />
          </Pressable>
        </View>
      </View>

      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {plan?.river.name ?? stub?.riverName ?? 'Saved float'}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={2}>
          {plan
            ? 'Re-read against the river right now'
            : stub
              ? `${stub.putInName} → ${stub.takeOutName}`
              : ' '}
        </Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.interactive} />
          <Text style={[styles.centeredText, { color: colors.textMuted }]}>
            Reading the gauge and driving the shuttle…
          </Text>
        </View>
      ) : error || !plan ? (
        <View style={styles.centered}>
          <Otter mood="flag" size={110} />
          <Text style={[styles.centeredText, { color: colors.text }]}>
            {error ?? 'Could not load this float'}
          </Text>
          <Pressable onPress={() => void load()} hitSlop={10} accessibilityRole="button">
            <Text style={[styles.link, { color: colors.interactive }]}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <PlanResult plan={plan} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 6,
  },
  navActions: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  header: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 8 },
  title: { ...t['2xl'], fontFamily: fonts.display },
  subtitle: { ...t.sm, fontFamily: fonts.body, marginTop: 2 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  centeredText: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
  link: { ...t.sm, fontFamily: fonts.semibold },
});
