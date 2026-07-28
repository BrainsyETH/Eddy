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
// So Activity stays where it was, "My alerts" sits beside it, and the way you
// discover you can make one is the + in the header — plus the empty state,
// which now offers to create an alert instead of only telling you to go star
// something.
//
// ── Why "my rivers" is stars UNION subscriptions ─────────────────────────
//
// It used to be stars alone, and that quietly hid people's own alerts: a star is
// a free local bookmark, a subscription is the thing that actually pushes, and
// nothing ever made you do both. Someone who tapped the bell on a river without
// starring it would get a notification about a change that their own feed then
// refused to show them.
//
// Subscriptions need an account and a network, so they are strictly ADDITIVE
// here. Everything on this screen still works with no session at all, which is
// the reason the star store exists in the first place.

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { ALERT_LATENCY_NOTE, type AlertFeedEntry, type AlertRule } from '@eddy/types';
import { ApiError, fetchAlerts, fetchSubscriptions } from '@/api/client';
import { conditionBg, conditionColor, conditionInk } from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { alertDetail, alertHeadline } from '@/lib/alertCopy';
import { EddyScene } from '@/components/EddyScene';
import { AlertRuleRow } from '@/components/AlertRuleRow';
import { useStarredRivers } from '@/hooks/useStarredRivers';
import { useAlertRules } from '@/hooks/useAlertRules';
import { useSession } from '@/hooks/useSession';
import { useRouter } from 'expo-router';

type Segment = 'activity' | 'rules';

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState<AlertFeedEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [segment, setSegment] = useState<Segment>('activity');
  const [onlyStarred, setOnlyStarred] = useState(true);
  const [subscribedRiverIds, setSubscribedRiverIds] = useState<Set<string>>(new Set());
  const [ruleError, setRuleError] = useState<string | null>(null);
  const { isStarred, starred } = useStarredRivers();
  const { rules, ready: rulesReady, refresh: refreshRules, setEnabled } = useAlertRules();
  const { getAccessToken } = useSession();
  const { colors, elevation } = useTheme();
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

  // Additive only, and silent on failure: a rejected session or no network
  // leaves the filter exactly as it was before subscriptions existed.
  const loadSubscriptions = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;
    const subs = await fetchSubscriptions(token).catch(() => null);
    if (subs) setSubscribedRiverIds(new Set(subs.map((s) => s.riverId)));
  }, [getAccessToken]);

  useEffect(() => {
    void loadSubscriptions();
  }, [loadSubscriptions]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([load(), loadSubscriptions(), refreshRules()]);
    setRefreshing(false);
  }, [load, loadSubscriptions, refreshRules]);

  const visible = useMemo(() => {
    if (!alerts) return [];
    if (!onlyStarred) return alerts;
    return alerts.filter((a) => isStarred('river', a.riverId) || subscribedRiverIds.has(a.riverId));
  }, [alerts, onlyStarred, isStarred, subscribedRiverIds]);

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
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  // Subscriptions count too, or someone who only ever tapped the bell is told
  // to go star something — advice for a problem they do not have.
  const hasStars = starred.length > 0 || subscribedRiverIds.size > 0;
  const showingRules = segment === 'rules';

  const segmentButton = (value: Segment, label: string) => (
    <Pressable
      onPress={() => setSegment(value)}
      style={[
        styles.toggle,
        { borderColor: colors.border },
        segment === value && { backgroundColor: colors.accent, borderColor: colors.accent },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: segment === value }}
    >
      <Text
        style={[
          styles.toggleText,
          { color: segment === value ? colors.onAccent : colors.textMuted },
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
            { backgroundColor: colors.accent, opacity: pressed ? 0.7 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Create an alert"
        >
          <Ionicons name="add" size={22} color={colors.onAccent} />
        </Pressable>
      </View>

      <View style={styles.toggleRow}>
        {segmentButton('activity', 'Activity')}
        {segmentButton('rules', 'My alerts')}
      </View>

      {/* The feed's own filter, scoped to the feed. Showing it above the rule
          list would offer to filter something it does not apply to. */}
      {!showingRules ? (
        <View style={styles.toggleRow}>
          <Pressable
            onPress={() => setOnlyStarred(true)}
            style={[
              styles.subToggle,
              { borderColor: colors.border },
              onlyStarred && { backgroundColor: colors.cardRaised },
            ]}
          >
            <Text
              style={[
                styles.subToggleText,
                { color: onlyStarred ? colors.text : colors.textMuted },
              ]}
            >
              My rivers
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setOnlyStarred(false)}
            style={[
              styles.subToggle,
              { borderColor: colors.border },
              !onlyStarred && { backgroundColor: colors.cardRaised },
            ]}
          >
            <Text
              style={[
                styles.subToggleText,
                { color: !onlyStarred ? colors.text : colors.textMuted },
              ]}
            >
              All rivers
            </Text>
          </Pressable>
        </View>
      ) : null}

      {error && !showingRules ? (
        <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
      ) : null}
      {ruleError && showingRules ? (
        <Text style={[styles.errorText, { color: colors.error }]}>{ruleError}</Text>
      ) : null}
    </View>
  );

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
  );

  if (showingRules) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <FlatList
          data={rules ?? []}
          keyExtractor={(item) => `${item.source}:${item.id}`}
          refreshControl={refreshControl}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <View style={styles.empty}>
              {!rulesReady ? (
                <ActivityIndicator color={colors.accent} />
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
                  <Pressable
                    onPress={() => router.push('/alerts/new')}
                    style={({ pressed }) => [
                      styles.cta,
                      { backgroundColor: colors.accent, opacity: pressed ? 0.7 : 1 },
                    ]}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.ctaText, { color: colors.onAccent }]}>
                      Create an alert
                    </Text>
                  </Pressable>
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
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        refreshControl={refreshControl}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={styles.empty}>
            {/* Checking, not alarmed. Every string below this is a version of
                "we looked and nothing has changed", and the catalog's
                high-water scene would announce the opposite. */}
            <EddyScene name="checkingGauge" size={120} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {onlyStarred && !hasStars ? 'No starred rivers yet' : 'No recent changes'}
            </Text>
            <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
              {onlyStarred && !hasStars
                ? 'Star a river in Search to see its condition changes here — or set an alert and we will tell you.'
                : onlyStarred
                  ? "None of your starred rivers have changed condition recently. That's usually good news."
                  : 'No rivers have changed condition recently.'}
            </Text>
            {onlyStarred && !hasStars ? (
              <Pressable
                onPress={() => router.push('/alerts/new')}
                style={({ pressed }) => [
                  styles.cta,
                  { backgroundColor: colors.accent, opacity: pressed ? 0.7 : 1 },
                ]}
                accessibilityRole="button"
              >
                <Text style={[styles.ctaText, { color: colors.onAccent }]}>Create an alert</Text>
              </Pressable>
            ) : null}
          </View>
        }
        ListFooterComponent={
          visible.length > 0 ? (
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
  subToggle: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  subToggleText: { ...t.xs, fontFamily: fonts.body },
  errorText: { ...t.sm, fontFamily: fonts.body, marginTop: 10 },
  empty: { alignItems: 'center', paddingHorizontal: 40, paddingTop: 30 },
  emptyTitle: { ...t.lg, fontFamily: fonts.semibold, marginTop: 10 },
  emptyBody: { ...t.sm, fontFamily: fonts.body, textAlign: 'center', marginTop: 8 },
  cta: { marginTop: 18, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 999 },
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
