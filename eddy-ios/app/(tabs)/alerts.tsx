// eddy-ios/app/(tabs)/alerts.tsx
// Two things under one tab: the alerts you set, and the water running high now.
//
// ── Why My alerts leads ─────────────────────────────────────────────────────
//
// A tab called Alerts opens on your alerts. That was not always the arrangement
// here: the second segment used to be a free, account-free CHANGE FEED, and
// leading with rules meant a large share of people met an empty list and a
// sign-in prompt where a working screen could have been.
//
// What changed is the second segment. High Water Alerts is not an inbox and not
// a log — it is a statewide safety readout — so it no longer competes with
// "mine" for the same slot, and the ordering that always read correctly
// (yours first, everyone's second) is now also the honest one. The empty state
// on the rules list is not a dead end either: it explains what an alert is and
// the Add alert button is right there.
//
// ── Why the second tab is a snapshot and not the old feed ──────────────────
//
// /api/alerts is a change LOG: one row per transition, bounded to seven days.
// It answers "what moved this week", which turns out not to be the question
// anybody opens this tab with. A river that crossed into flood nine days ago
// and has stayed there is absent from that log and very much present in the
// water; a good→flowing flicker is in it and means nothing.
//
// So this reads /api/high-water instead — every river, gauge and dam release
// Eddy grades that is sitting in high or flood RIGHT NOW, whether or not it
// moved today. The endpoint filters on RUNNING_HIGH so this screen never has to
// decide what "high" means; see shared/condition-system.ts.
//
// The ~14,000 national stations are absent by design. They carry no threshold
// ladder — nobody has decided where high starts on them — and their flow
// percentile says "wetter than usual for the date", which is a different claim.
//
// Free and account-free, like the feed it replaces. High water is safety
// information; it is never behind an account or a paywall.

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
import type { AlertRule, HighWaterEntry, HighWaterKind } from '@eddy/types';
import { ApiError, fetchHighWater } from '@/api/client';
import { conditionBg, conditionColor, conditionInk } from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { readingAge } from '@/lib/readingCopy';
import { EddyScene } from '@/components/EddyScene';
import { AlertRuleRow } from '@/components/AlertRuleRow';
import { useAlertRules } from '@/hooks/useAlertRules';
import { useRouter } from 'expo-router';

type Segment = 'high-water' | 'rules';

/** Section headings, in the order the list renders them. */
const KIND_LABEL: Record<HighWaterKind, string> = {
  river: 'Rivers',
  gauge: 'Gauges',
  dam: 'Dams',
};
const KIND_ORDER: HighWaterKind[] = ['river', 'gauge', 'dam'];

/** A heading or an entry — one flat list, so section headers scroll with rows. */
type HighWaterRow =
  | { type: 'heading'; key: string; label: string; count: number }
  | { type: 'entry'; key: string; entry: HighWaterEntry };

function toRows(entries: HighWaterEntry[]): HighWaterRow[] {
  return KIND_ORDER.flatMap((kind) => {
    const group = entries.filter((e) => e.kind === kind);
    if (group.length === 0) return [];
    return [
      { type: 'heading' as const, key: `heading:${kind}`, label: KIND_LABEL[kind], count: group.length },
      ...group.map((entry) => ({ type: 'entry' as const, key: entry.id, entry })),
    ];
  });
}

/**
 * The reading, in the unit its ladder is defined in and no other.
 *
 * Null unit means the station published nothing in the unit it is graded
 * against. That renders as no number rather than the other unit's — a cfs value
 * printed under a ft ladder is a number compared to the wrong thresholds.
 */
function readingLine(entry: HighWaterEntry): string | null {
  const parts: string[] = [];
  if (entry.readingValue !== null && entry.readingUnit) {
    const value =
      entry.readingUnit === 'ft'
        ? entry.readingValue.toFixed(2)
        : Math.round(entry.readingValue).toLocaleString();
    parts.push(`${value} ${entry.readingUnit}`);
  }
  const age = readingAge(entry.readingAgeHours);
  if (age) parts.push(age);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Room left under the lists so the last row clears the pinned CTA. */
const CTA_CLEARANCE = 84;

export default function AlertsScreen() {
  const [highWater, setHighWater] = useState<HighWaterEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Yours, by default. See the header — the second segment is a statewide
  // readout rather than a competing "mine", so this ordering is now both the
  // one people expect and the honest one.
  const [segment, setSegment] = useState<Segment>('rules');
  const [ruleError, setRuleError] = useState<string | null>(null);
  const { rules, ready: rulesReady, refresh: refreshRules, setEnabled } = useAlertRules();
  const { colors, elevation, floating } = useTheme();
  const router = useRouter();

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setError(null);
      setHighWater(await fetchHighWater(signal));
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

  // Headings interleaved with rows, so a section title scrolls with the group
  // it names rather than sticking. Above the early return because it is a hook.
  const highWaterRows = useMemo(() => toRows(highWater ?? []), [highWater]);

  const showingRules = segment === 'rules';

  // Only the high-water half waits on a request. Blocking the whole screen on
  // it would put a spinner over the rules list — which is the default segment
  // and needs no network at all.
  if (!showingRules && !highWater && !error) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.bg }]} edges={['top']}>
        <ActivityIndicator color={colors.interactive} />
      </SafeAreaView>
    );
  }

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

      {/* Yours first. */}
      <View style={styles.toggleRow}>
        {segmentButton('rules', 'My alerts')}
        {segmentButton('high-water', 'High water')}
      </View>

      {/* WHOSE rows these are, said out loud.
          Without this line the second list reads as "notifications I was sent"
          — a fair reading of a screen titled Alerts whose rows look like a
          notification list — and the first question that follows is how to
          delete them. There is nothing to delete: it is a readout of the state
          of the water, identical for everyone. Saying what it is costs one line
          and answers the question before it is asked. */}
      <Text style={[styles.caption, { color: colors.textSubtle }]}>
        {showingRules
          ? 'Alerts you have set. Only you receive these.'
          : 'Every river, gauge and dam Eddy grades that is running high or in flood right now.'}
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
          { backgroundColor: colors.accentFill, opacity: pressed ? 0.7 : 1 },
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
        data={highWaterRows}
        keyExtractor={(item) => item.key}
        refreshControl={refreshControl}
        contentContainerStyle={listPadding}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={styles.empty}>
            {/* Checking, not alarmed. Everything below this says "we looked and
                the water is where it should be", and the catalog's high-water
                scene would announce the opposite. */}
            <EddyScene name="checkingGauge" size={120} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Nothing running high</Text>
            <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
              No river, gauge or dam release Eddy grades is above its high-water
              mark right now. That&apos;s usually good news.
            </Text>
          </View>
        }
        ListFooterComponent={
          highWaterRows.length > 0 ? (
            // The honesty line. Every row above is a stored reading, and USGS
            // reporting lag plus the ingest cadence puts it up to about an hour
            // behind the river itself.
            <Text style={[styles.footnote, { color: colors.textSubtle }]}>
              Readings can lag the river by up to about an hour. Never judge a
              crossing from a number alone.
            </Text>
          ) : null
        }
        renderItem={({ item }) => {
          if (item.type === 'heading') {
            return (
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{item.label}</Text>
                <Text style={[styles.sectionCount, { color: colors.textSubtle }]}>{item.count}</Text>
              </View>
            );
          }

          const entry = item.entry;
          const reading = readingLine(entry);
          // A dam opens its own screen; everything else opens its river. Gauges
          // route by river rather than by /gauge/[siteId] on purpose — a station
          // that is high is a fact ABOUT that river, and the river screen shows
          // the chart, the access points and the hazards alongside it.
          const target = entry.damId
            ? `/dam/${entry.damId}`
            : entry.riverSlug
              ? `/river/${entry.riverSlug}`
              : entry.siteId
                ? `/gauge/${entry.siteId}`
                : null;

          return (
            <Pressable
              onPress={target ? () => router.push(target) : undefined}
              disabled={!target}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: colors.card, opacity: pressed && target ? 0.7 : 1 },
                elevation(1),
              ]}
              accessibilityRole={target ? 'button' : undefined}
              accessibilityLabel={`${entry.name}, ${entry.conditionLabel}`}
            >
              <View style={[styles.stripe, { backgroundColor: conditionColor(entry.conditionCode) }]} />
              <View style={styles.rowBody}>
                <Text style={[styles.riverName, { color: colors.text }]}>{entry.name}</Text>
                {/* ink, not `solid`. The solid is the marker/stripe colour and
                    is not a text colour — several of the ladder's fills fall
                    below 4.5:1 on white. */}
                <Text style={[styles.headline, { color: conditionInk(entry.conditionCode) }]}>
                  {entry.conditionLabel}
                </Text>
                <Text style={[styles.detail, { color: colors.textMuted }]}>
                  {[entry.subtitle, reading].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <View style={[styles.chip, { backgroundColor: conditionBg(entry.conditionCode) }]}>
                {/* Flood gets the warning mark, high gets the water mark. The
                    two are different instructions — "do not float" and "know
                    what you are doing" — and the stripe colour alone has to be
                    read against a scale to tell them apart. */}
                <Ionicons
                  name={entry.conditionCode === 'dangerous' ? 'warning-outline' : 'water-outline'}
                  size={16}
                  color={conditionInk(entry.conditionCode)}
                />
              </View>
            </Pressable>
          );
        }}
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 6,
  },
  sectionTitle: { ...t.xs, fontFamily: fonts.semibold, textTransform: 'uppercase' },
  sectionCount: { ...t.xs },
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
