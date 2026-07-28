// eddy-ios/app/(tabs)/alerts.tsx
// Two things under one tab: the condition-change feed, and the rules you set.
//
// ── Why Activity stays the default ──────────────────────────────────────────
//
// The obvious layout for a tab called Alerts is to open on your alerts. It is
// the wrong default here, because this feed is FREE and needs no account: the
// app signs you in anonymously and never makes you do more, so a large share of
// people opening this tab have no rules and cannot have any without signing in
// with Apple. Opening them on an empty list would replace a working screen with
// a sales pitch.
//
// ── The feed is not filtered ────────────────────────────────────────────────
//
// It used to carry a "My rivers / All rivers" toggle, defaulting to the former.
// That control was answering a question nobody had: /api/alerts reads
// river_condition_events, which is written only from river_gauges rows — the ~46
// curated stations across ~24 rivers — and every event is debounced and
// compare-and-swapped before it is recorded. What it filtered was two dozen
// rivers' worth of CHANGES, which on most days is a handful of rows, and halving
// a short list costs more attention than it saves. It also read as a second,
// competing "mine" directly under the My alerts segment.
//
// Removing it took a network call off this screen with it: the toggle was the
// only reason the tab fetched subscriptions or read the star store at all.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  ALERT_FEED_WINDOW_DAYS,
  ALERT_LATENCY_NOTE,
  type AlertFeedEntry,
  type AlertRule,
} from '@eddy/types';
import { ApiError, fetchAlerts } from '@/api/client';
import { conditionBg, conditionColor, conditionInk } from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { alertDetail, alertHeadline } from '@/lib/alertCopy';
import { EddyScene } from '@/components/EddyScene';
import { AlertRuleRow } from '@/components/AlertRuleRow';
import { useAlertRules } from '@/hooks/useAlertRules';
import { useRouter } from 'expo-router';

type Segment = 'activity' | 'rules';

/** Room left under the lists so the last row clears the pinned CTA. */
const CTA_CLEARANCE = 84;

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState<AlertFeedEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [segment, setSegment] = useState<Segment>('activity');
  const [ruleError, setRuleError] = useState<string | null>(null);
  const { rules, ready: rulesReady, refresh: refreshRules, setEnabled } = useAlertRules();
  const { colors, elevation, floating } = useTheme();
  const router = useRouter();

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setError(null);
      setAlerts(await fetchAlerts(signal));
    } catch (err) {
      if (err instanceof ApiError && err.message === 'Request cancelled') return;
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([load(), refreshRules()]);
    setRefreshing(false);
  }, [load, refreshRules]);

  const onToggleRule = useCallback(
    (rule: AlertRule, enabled: boolean) => {
      setRuleError(null);
      // The hook reverts its own optimistic update on failure; all this has to
      // do is say so, or the switch would spring back with no explanation.
      void setEnabled(rule, enabled).catch(() =>
        setRuleError(enabled ? 'Could not resume that alert.' : 'Could not pause that alert.'),
      );
    },
    [setEnabled],
  );

  if (!alerts && !error) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.bg }]} edges={['top']}>
        <ActivityIndicator color={colors.interactive} />
      </SafeAreaView>
    );
  }

  const showingRules = segment === 'rules';

  // ONBOARDING, not a permanent control. Someone who already holds an alert has
  // been through this flow and knows where it lives; a button covering the
  // bottom of every scroll forever to offer them something they have already
  // done is a banner. `ready` gates it so it does not flash on first load and
  // vanish, and a null `rules` — signed out, or no usable session — counts as
  // none, because that person has no alerts and this flow is exactly the one
  // they need. It ends at the sign-in sheet.
  const showCta = rulesReady && (rules?.length ?? 0) === 0;
  const listPadding = showCta ? { paddingBottom: CTA_CLEARANCE } : undefined;

  const segmentButton = (value: Segment, label: string) => (
    <Pressable
      onPress={() => setSegment(value)}
      style={[
        styles.toggle,
        { borderColor: colors.border },
        segment === value && {
          backgroundColor: colors.selectionBg,
          borderColor: colors.interactive,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: segment === value }}
    >
      <Text
        style={[
          styles.toggleText,
          { color: segment === value ? colors.selectionText : colors.textMuted },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );

  const header = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.text }]}>Alerts</Text>
        <Pressable
          onPress={() => router.push('/alerts/new')}
          hitSlop={12}
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: colors.interactive, opacity: pressed ? 0.7 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Create an alert"
        >
          <Ionicons name="add" size={22} color={colors.onInteractive} />
        </Pressable>
      </View>

      <View style={styles.toggleRow}>
        {segmentButton('activity', 'Activity')}
        {segmentButton('rules', 'My alerts')}
      </View>

      {/* WHOSE rows these are, said out loud.
          Without this line the feed reads as "notifications I was sent" — a
          fair reading of a screen titled Alerts whose rows look like a
          notification list — and the first question that follows is how to
          delete them. There is nothing to delete: every caller sees the same
          log, so removing a row would remove it for everyone. Saying what it is
          costs one line and answers the question before it is asked. */}
      <Text style={[styles.caption, { color: colors.textSubtle }]}>
        {showingRules
          ? 'Alerts you have set. Only you receive these.'
          : `Condition changes on every river Eddy tracks, from the last ${ALERT_FEED_WINDOW_DAYS} days.`}
      </Text>

      {error && !showingRules ? (
        <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
      ) : null}
      {ruleError && showingRules ? (
        <Text style={[styles.errorText, { color: colors.error }]}>{ruleError}</Text>
      ) : null}
    </View>
  );

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.interactive} />
  );

  const cta = showCta ? (
    // No safe-area inset added here. The tab bar is laid out in flow (its style
    // sets no `position`), so screen content ends at the top of the bar and the
    // bar already carries the home-indicator inset — adding it again would
    // float the button a thumb's width above where it belongs on a notched
    // phone and leave a gap on every other one.
    <View style={styles.ctaBar} pointerEvents="box-none">
      <Pressable
        onPress={() => router.push('/alerts/new')}
        style={({ pressed }) => [
          styles.ctaButton,
          floating(),
          { backgroundColor: colors.accent, opacity: pressed ? 0.7 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Add an alert"
      >
        <Ionicons name="add" size={18} color={colors.onAccent} />
        <Text style={[styles.ctaText, { color: colors.onAccent }]}>Add alert</Text>
      </Pressable>
    </View>
  ) : null;

  if (showingRules) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <FlatList
          data={rules ?? []}
          keyExtractor={(item) => `${item.source}:${item.id}`}
          refreshControl={refreshControl}
          contentContainerStyle={listPadding}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <View style={styles.empty}>
              {!rulesReady ? (
                <ActivityIndicator color={colors.interactive} />
              ) : (
                <>
                  <EddyScene name="checkingGauge" size={120} />
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>
                    {/* rules === null is an unusable session, not an empty
                        list. Telling someone signed out that they have no
                        alerts would be a claim we cannot make. */}
                    {rules === null ? 'Sign in to set alerts' : 'No alerts yet'}
                  </Text>
                  <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
                    {rules === null
                      ? 'Alerts are free, but they need an account so we know which phone to notify.'
                      : 'Get a notification when a river becomes floatable, turns dangerous, or hits a level you pick.'}
                  </Text>
                </>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <AlertRuleRow
              rule={item}
              // `source` rides along because the two tables are addressed
              // differently on write — a gauge rule by its own id, a river
              // subscription by riverId — and the edit screen must not have to
              // guess which one it is holding.
              onPress={() =>
                router.push({
                  pathname: '/alerts/[id]',
                  params: { id: item.id, source: item.source },
                })
              }
              onToggle={(enabled) => onToggleRule(item, enabled)}
            />
          )}
        />
        {cta}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <FlatList
        data={alerts ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={refreshControl}
        contentContainerStyle={listPadding}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={styles.empty}>
            {/* Checking, not alarmed. Every string below this is a version of
                "we looked and nothing has changed", and the catalog's
                high-water scene would announce the opposite. */}
            <EddyScene name="checkingGauge" size={120} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No recent changes</Text>
            <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
              {/* Empty is now a REACHABLE state rather than a theoretical one —
                  the feed is bounded to a week, so a quiet stretch genuinely
                  empties it. Which is the point: a log you cannot clear and
                  that never empties is indistinguishable from a broken inbox. */}
              No river has changed condition in the last {ALERT_FEED_WINDOW_DAYS} days. That&apos;s
              usually good news.
            </Text>
          </View>
        }
        ListFooterComponent={
          (alerts?.length ?? 0) > 0 ? (
            // The honesty line. Detection trails the real river by roughly
            // 20–75 minutes; measured at 31 minutes on the first live events.
            <Text style={[styles.footnote, { color: colors.textSubtle }]}>{ALERT_LATENCY_NOTE}</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/river/${item.riverSlug}`)}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
              elevation(1),
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${item.riverName} details`}
          >
            <View
              style={[styles.stripe, { backgroundColor: conditionColor(item.newConditionCode) }]}
            />
            <View style={styles.rowBody}>
              <Text style={[styles.riverName, { color: colors.text }]}>{item.riverName}</Text>
              {/* ink, not `solid`. The solid is the marker/stripe colour and is
                  not a text colour: lime-500 and yellow-500 fall below 4.5:1 on
                  white, so a "Good" or "Low" headline was failing contrast while
                  the icon two lines down already used ink correctly. */}
              <Text
                style={[styles.headline, { color: conditionInk(item.newConditionCode) }]}
              >
                {alertHeadline(item)}
              </Text>
              <Text style={[styles.detail, { color: colors.textMuted }]}>{alertDetail(item)}</Text>
            </View>
            <View
              style={[styles.chip, { backgroundColor: conditionBg(item.newConditionCode) }]}
            >
              <Ionicons
                name={item.kind === 'floatable' ? 'water-outline' : 'alert-circle-outline'}
                size={16}
                color={conditionInk(item.newConditionCode)}
              />
            </View>
          </Pressable>
        )}
      />
      {cta}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...t['3xl'], fontFamily: fonts.display },
  addButton: { width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  toggleRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  toggle: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  toggleText: { ...t.xs, fontFamily: fonts.semibold },
  caption: { ...t.xs, fontFamily: fonts.body, marginTop: 10, lineHeight: 16 },
  errorText: { ...t.sm, fontFamily: fonts.body, marginTop: 10 },
  empty: { alignItems: 'center', paddingHorizontal: 40, paddingTop: 30 },
  emptyTitle: { ...t.lg, fontFamily: fonts.semibold, marginTop: 10 },
  emptyBody: { ...t.sm, fontFamily: fonts.body, textAlign: 'center', marginTop: 8 },
  // box-none on the bar, not none: the bar itself must let taps through to the
  // list underneath while the button inside it stays tappable.
  ctaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 16,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 999,
  },
  ctaText: { ...t.sm, fontFamily: fonts.semibold },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    overflow: 'hidden',
  },
  stripe: { width: 4, alignSelf: 'stretch' },
  rowBody: { flex: 1, padding: 14 },
  riverName: { ...t.base, fontFamily: fonts.semibold },
  headline: { ...t.sm, fontFamily: fonts.semibold, marginTop: 3 },
  detail: { ...t.xs, fontFamily: fonts.body, marginTop: 3 },
  chip: { padding: 8, borderRadius: 999, marginRight: 14 },
  footnote: {
    ...t.xs,
    fontFamily: fonts.body,
    textAlign: 'center',
    paddingHorizontal: 32,
    paddingTop: 6,
    paddingBottom: 24,
  },
});
