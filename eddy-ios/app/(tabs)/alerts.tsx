// eddy-ios/app/(tabs)/alerts.tsx
// Three things under one tab: the alerts you set, the water running high now,
// and what the agencies have posted about the places you would put in.
//
// ── Why Mine leads ──────────────────────────────────────────────────────────
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
// on the rules list is not a dead end either: it explains what an alert is, and
// the + in the header is right there.
//
// ── The rules list is a TREE, not a list ────────────────────────────────────
//
// A river alert and the gauge alerts set on that river's other stations render
// as one card with the gauges indented under it. They used to be four
// top-level cards all titled "Current River", which is what a flat list makes
// of one alert plus three refinements to it.
//
// The nesting is a real relationship rather than a drawing: a child names its
// parent on the wire, the evaluator skips a child whose parent is paused, and
// deleting the parent cascades. So this screen writes ONE row for a group
// switch and issues ONE delete for a group, and a gated child is drawn
// unavailable because that is what it is. src/lib/alertGroups.ts has the
// argument and names the migration.
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
//
// ── Why there is a third segment ───────────────────────────────────────────
//
// High water is what EDDY says about the water. Notices is what everybody else
// says about the place: the Park Service closing a campground, the Weather
// Service issuing a flood warning. Those are not gradations of the same thing
// and they must not share a list — a row Eddy graded and a row Eddy is merely
// relaying carry different authority, and merging them would put Eddy's name on
// somebody else's call. Hence a segment rather than a section.
//
// It is also the half that answers a question the other two cannot: a river can
// be running perfectly and the access still be shut.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type {
  AlertRule,
  HighWaterEntry,
  HighWaterKind,
  RiverAlert,
  RiverAlertSeverity,
} from '@eddy/types';
import { ApiError, fetchHighWater, fetchRiverAlerts } from '@/api/client';
import { conditionBg, conditionColor, conditionInk } from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import type { Palette } from '@/theme/palette';
import { readingAge } from '@/lib/readingCopy';
import { EddyScene } from '@/components/EddyScene';
import { AlertRuleRow } from '@/components/AlertRuleRow';
import { QuietHoursRow } from '@/components/QuietHoursRow';
import { SwipeRow } from '@/components/SwipeRow';
import { groupAlertRules, isGatedByParent, type AlertRuleGroup } from '@/lib/alertGroups';
import { useAlertRules } from '@/hooks/useAlertRules';
import { useFocusEffect, useRouter } from 'expo-router';
import { asHref } from '@/lib/href';

type Segment = 'high-water' | 'rules' | 'notices';

/** Section headings for the notices list, loudest first. */
const SEVERITY_LABEL: Record<RiverAlertSeverity, string> = {
  warning: 'Warnings',
  watch: 'Closures and cautions',
  notice: 'Notices',
};
const SEVERITY_ORDER: RiverAlertSeverity[] = ['warning', 'watch', 'notice'];

/**
 * Grouped by SEVERITY, not by agency.
 *
 * Sorting by source would file a park closure under "NPS" and a flood warning
 * under "NWS", which is an org chart, not an answer. What a reader needs first
 * is how much it matters; who said it belongs on the row, where it is drawn as
 * a caption.
 */
type NoticeRow =
  | { type: 'heading'; key: string; label: string; count: number }
  | { type: 'entry'; key: string; alert: RiverAlert };

function toNoticeRows(alerts: RiverAlert[]): NoticeRow[] {
  return SEVERITY_ORDER.flatMap((severity) => {
    const group = alerts.filter((a) => a.severity === severity);
    if (group.length === 0) return [];
    return [
      {
        type: 'heading' as const,
        key: `heading:${severity}`,
        label: SEVERITY_LABEL[severity],
        count: group.length,
      },
      ...group.map((alert) => ({ type: 'entry' as const, key: alert.id, alert })),
    ];
  });
}

/** Warnings borrow the canonical danger red; nothing below them does. */
function noticeTint(severity: RiverAlertSeverity, colors: Palette): string {
  if (severity === 'warning') return conditionColor('dangerous');
  if (severity === 'watch') return colors.warm;
  return colors.textSubtle;
}

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

/**
 * WHOSE rows these are, said out loud, per segment.
 *
 * Without this line the lists read as "notifications I was sent" — a fair
 * reading of a screen titled Alerts whose rows look like a notification list —
 * and the first question that follows is how to delete them. There is nothing
 * to delete: two of the three are readouts, identical for everyone. Saying what
 * each is costs one line and answers the question before it is asked.
 */
const CAPTION: Record<Segment, string> = {
  // Empty on purpose — see where it renders.
  rules: '',
  'high-water':
    'Every river, gauge and dam Eddy grades that is running high or in flood right now.',
  notices:
    'Closures from the National Park Service and warnings from the National Weather Service. Not Eddy\u2019s call \u2014 theirs.',
};

export default function AlertsScreen() {
  const [highWater, setHighWater] = useState<HighWaterEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Yours, by default. See the header — the second segment is a statewide
  // readout rather than a competing "mine", so this ordering is now both the
  // one people expect and the honest one.
  const [segment, setSegment] = useState<Segment>('rules');
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [notices, setNotices] = useState<RiverAlert[] | null>(null);
  const [noticeError, setNoticeError] = useState<string | null>(null);
  const {
    rules,
    ready: rulesReady,
    refresh: refreshRules,
    setEnabled,
    remove,
  } = useAlertRules();
  const { colors, elevation } = useTheme();
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

  // Separate from load(), not folded into it: these are two agencies and one
  // being unreachable says nothing about the other. A single try/catch would
  // let an NPS outage blank the high-water list, which is the failure mode the
  // route itself is built to avoid.
  const loadNotices = useCallback(async (signal?: AbortSignal) => {
    try {
      setNoticeError(null);
      setNotices(await fetchRiverAlerts(undefined, signal));
    } catch (err) {
      if (err instanceof ApiError && err.message === 'Request cancelled') return;
      setNoticeError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    loadNotices(controller.signal);
    return () => controller.abort();
  }, [load, loadNotices]);

  /**
   * Re-read the rules every time this tab comes forward.
   *
   * The provider fetches on mount and on a change of user, and nothing else —
   * so a rule the SERVER changed was invisible until a pull-to-refresh or a
   * relaunch. That is not a rare case now that a delivered one-shot switches
   * itself off: the alert fires, the phone buzzes, the user opens the app to
   * look, and the row still says the rule is on.
   *
   * Only the rules. High water and notices are already refetched on mount and
   * change on the hour, so putting them on focus would be two wasted requests
   * every time somebody flicks between tabs.
   */
  useFocusEffect(
    useCallback(() => {
      void refreshRules();
    }, [refreshRules]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([load(), loadNotices(), refreshRules()]);
    setRefreshing(false);
  }, [load, loadNotices, refreshRules]);

  /**
   * A rule's switch — a river alert's, a gauge alert's, either.
   *
   * ── One write, including for a group ────────────────────────────────────
   *
   * A river alert's switch pauses its gauge alerts and touches none of them.
   * `gauge_alert_subscriptions.parent_subscription_id` names the parent, and the
   * evaluator skips a child whose parent is off — so pausing is one row, and
   * resuming hands every child back exactly as it was because nothing ever
   * changed them. See src/lib/alertGroups.ts and the migration it names.
   *
   * This screen used to cascade the pause across every rule in the group and
   * keep a local record of which children had already been off, so that
   * resuming could avoid sweeping them on. All of it existed to stand in for a
   * column that did not exist. The column exists; the workaround is gone.
   */
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

  /**
   * Delete, from the swipe.
   *
   * Same contract as the toggle: the hook removes the row optimistically and
   * puts it back if the write fails, so the only thing left here is to say
   * why it reappeared. Returns the promise so SwipeRow can close itself once
   * the round trip has settled rather than the instant the button is tapped.
   *
   * Deletes the CHILDREN with the parent, for the same reason the switch
   * cascades — and the confirmation names them, because a swipe that quietly
   * removes four alerts when the row says one is the exact failure this
   * grouping would otherwise introduce.
   */
  const removeGroup = useCallback(
    (group: AlertRuleGroup) => {
      setRuleError(null);
      // ONE request. The foreign key cascades, so deleting a river alert takes
      // its gauge alerts with it server-side — which is also what closes the
      // orphan this screen used to create: before the parent column, deleting a
      // river alert left its gauge rules firing about a river the user believed
      // they had stopped following.
      return remove(group.rule, group.children).catch(() =>
        setRuleError('Could not delete that alert.'),
      );
    },
    [remove],
  );

  // Headings interleaved with rows, so a section title scrolls with the group
  // it names rather than sticking. Above the early return because it is a hook.
  const highWaterRows = useMemo(() => toRows(highWater ?? []), [highWater]);
  const noticeRows = useMemo(() => toNoticeRows(notices ?? []), [notices]);
  // A river and the gauges on it are ONE row now — see src/lib/alertGroups.ts
  // for what was wrong with four cards all called "Current River".
  const ruleGroups = useMemo(() => groupAlertRules(rules ?? []), [rules]);

  const showingRules = segment === 'rules';
  const showingNotices = segment === 'notices';

  // Only the high-water half waits on a request. Blocking the whole screen on
  // it would put a spinner over the rules list — which is the default segment
  // and needs no network at all.
  // Each network-backed segment blocks only on ITS OWN request. Without the
  // per-segment guard a spinner would sit over whichever list the user is
  // actually looking at while a different one loads.
  if (showingNotices && !notices && !noticeError) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.bg }]} edges={['top']}>
        <ActivityIndicator color={colors.interactive} />
      </SafeAreaView>
    );
  }

  if (!showingRules && !showingNotices && !highWater && !error) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.bg }]} edges={['top']}>
        <ActivityIndicator color={colors.interactive} />
      </SafeAreaView>
    );
  }

  // THE HEADER + IS THE ONLY WAY IN, now.
  //
  // There was a second, floating "Add alert" pinned over the bottom of the
  // list, gated on holding no rules — onboarding rather than a permanent
  // control, which was a fair reading of it. Two buttons pointing at one route
  // is still two buttons: the pair was only ever met by somebody with no
  // alerts, which is to say by everybody exactly once, at the moment they are
  // least able to tell that both do the same thing. And because the gate was
  // on the rule count rather than on the segment, it also floated over the
  // High water and Notices readouts, where "Add alert" answers nothing.
  //
  // The header + is always there, on all three segments, and is where a
  // second alert gets created anyway — so it is the one that had to survive.

  /**
   * A segment, its size, and nothing else.
   *
   * THE COUNT IS THE POINT. A segmented control tells you three lists exist;
   * it does not tell you whether any of them has anything in it, so the only
   * way to find out there are two flood warnings up was to go and look. The
   * number does the work the caption underneath could not: it is visible
   * before the tap, and it is the reason to make one.
   *
   * `null` is not zero. A count only renders once its list has loaded — a
   * signed-out user has no rules to count, not zero rules, and an agency feed
   * that failed has not told us it is empty. The badge stays off in both
   * cases rather than reporting a request as a fact.
   *
   * Same badge the filter chips use, deliberately: one shape for "how many are
   * in here" across the app.
   */
  const segmentButton = (value: Segment, label: string, count: number | null) => {
    const on = segment === value;
    return (
      <Pressable
        onPress={() => setSegment(value)}
        style={[
          styles.toggle,
          { borderColor: colors.border },
          on && {
            backgroundColor: colors.selectionBg,
            borderColor: colors.interactive,
          },
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={count == null ? label : `${label}, ${count}`}
      >
        <Text style={[styles.toggleText, { color: on ? colors.selectionText : colors.textMuted }]}>
          {label}
        </Text>
        {count != null ? (
          <View
            style={[
              styles.toggleCount,
              { backgroundColor: on ? colors.interactive : colors.border },
            ]}
          >
            <Text
              style={[
                styles.toggleCountText,
                { color: on ? colors.onInteractive : colors.textMuted },
              ]}
            >
              {count}
            </Text>
          </View>
        ) : null}
      </Pressable>
    );
  };

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

      {/* Yours first, then what Eddy says, then what everyone else says.
          "Mine" rather than "My alerts": the screen is already called Alerts,
          so the second word was the title again, and the three labels only
          have to differ from each other. */}
      <View style={styles.toggleRow}>
        {segmentButton('rules', 'Mine', rulesReady ? (rules?.length ?? null) : null)}
        {segmentButton('high-water', 'Running high', highWater?.length ?? null)}
        {segmentButton('notices', 'Notices', notices?.length ?? null)}
      </View>

      {/* See CAPTION for why the remaining two lines exist. `rules` has no
          caption any more: "Alerts you have set. Only you receive these." was
          answering a question the label was creating, and a segment reading
          "Mine" on a screen called Alerts does not create it. The other two
          still do — a statewide readout and two federal agencies are not
          self-evident from two words — and the notices line in particular is
          load-bearing, because it is where Eddy disclaims authorship of
          somebody else's warning. */}
      {CAPTION[segment] ? (
        <Text style={[styles.caption, { color: colors.textSubtle }]}>{CAPTION[segment]}</Text>
      ) : null}

      {error && segment === 'high-water' ? (
        <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
      ) : null}
      {ruleError && showingRules ? (
        <Text style={[styles.errorText, { color: colors.error }]}>{ruleError}</Text>
      ) : null}
      {noticeError && showingNotices ? (
        <Text style={[styles.errorText, { color: colors.error }]}>{noticeError}</Text>
      ) : null}
    </View>
  );

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.interactive} />
  );

  if (showingRules) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <FlatList
          data={ruleGroups}
          keyExtractor={(item) => item.key}
          refreshControl={refreshControl}
          ListHeaderComponent={
            // ABOVE the rules, and only on this segment. Quiet hours govern
            // what your own alerts are allowed to do at 4am; they have no
            // bearing on the two statewide readouts, where the row would be a
            // setting floating over somebody else's data. It renders itself
            // away when signed out — see QuietHoursRow.
            <>
              {header}
              <QuietHoursRow />
            </>
          }
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
          renderItem={({ item }) => {
            const parent = item.rule;
            const name = parent.riverName ?? parent.gaugeName ?? 'this water';
            const count = item.children.length;
            const gated = isGatedByParent(item);
            return (
              // Swipe left to delete. The row's switch PAUSES an alert and the
              // screen behind it edits one; neither is how somebody gets rid of a
              // rule they no longer want, and until now that took three screens.
              // The confirmation is not ceremony — the rule is a server-side row
              // and re-creating it means finding the water and setting the
              // trigger again.
              //
              // The swipe acts on the GROUP, and the message counts what goes
              // with it. See removeGroup.
              <SwipeRow
                onAction={() => removeGroup(item)}
                actionLabel="Delete"
                // The red has to end exactly where the group does. A parent
                // alone ends on AlertRuleRow's 10pt bottom margin; a group ends
                // on its last CHILD's 8pt one, and the default would leave two
                // points of canvas showing under the action.
                bottomInset={count > 0 ? 8 : 10}
                accessibilityActionLabel={
                  count > 0
                    ? `Delete the alert for ${name} and its ${count} gauge alerts`
                    : `Delete the alert for ${name}`
                }
                confirm={{
                  title: count > 0 ? `Delete this alert and ${count} more?` : 'Delete this alert?',
                  message:
                    count > 0
                      ? `The ${count} gauge ${count === 1 ? 'alert' : 'alerts'} set on ${name} go with it. This cannot be undone.`
                      : 'You will stop being notified about it. This cannot be undone.',
                }}
              >
                <View>
                  <AlertRuleRow
                    rule={parent}
                    childCount={count}
                    // `source` rides along because the two tables are addressed
                    // differently on write — a gauge rule by its own id, a river
                    // subscription by riverId — and the edit screen must not have
                    // to guess which one it is holding.
                    onPress={() =>
                      router.push({
                        pathname: '/alerts/[id]',
                        params: { id: parent.id, source: parent.source },
                      })
                    }
                    onToggle={(enabled) => onToggleRule(parent, enabled)}
                  />

                  {/* The gauges, under the river they are on. Each keeps its own
                      switch and its own edit screen — they are still separate
                      rules, and a stretch somebody added deliberately has to be
                      removable without touching the river. What they lost is the
                      right to sit at the top level pretending to be a fifth
                      unrelated alert on the same water. */}
                  {item.children.map((child) => (
                    <AlertRuleRow
                      key={`${child.source}:${child.id}`}
                      rule={child}
                      nested
                      // Held off by the river alert above, with its own switch
                      // still reading on — because it IS on, and the gate is
                      // what stops it. Nothing else on the row could explain
                      // that, so the row says it.
                      gated={gated}
                      onPress={() =>
                        router.push({
                          pathname: '/alerts/[id]',
                          params: { id: child.id, source: child.source },
                        })
                      }
                      onToggle={(enabled) => onToggleRule(child, enabled)}
                    />
                  ))}
                </View>
              </SwipeRow>
            );
          }}
        />
      </SafeAreaView>
    );
  }

  if (showingNotices) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
        <FlatList
          data={noticeRows}
          keyExtractor={(item) => item.key}
          refreshControl={refreshControl}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <View style={styles.empty}>
              <EddyScene name="checkingGauge" size={120} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Nothing posted</Text>
              {/* Says what an empty list DOES NOT mean. "No closures" and "we
                  could not reach the agencies" look identical to a reader and
                  mean opposite things, and only one of them is safe to act on.
                  The Park Service also covers three of Eddy's rivers and no
                  others, which nobody would guess from a blank screen. */}
              <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
                No closures or weather warnings are posted for Eddy&apos;s rivers right now. Park
                closures only cover rivers inside a national park, and neither agency posts
                everything — check locally before you drive out.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            if (item.type === 'heading') {
              return (
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
                    {item.label}
                  </Text>
                  <Text style={[styles.sectionCount, { color: colors.textSubtle }]}>
                    {item.count}
                  </Text>
                </View>
              );
            }

            const alert = item.alert;
            const tint = noticeTint(alert.severity, colors);
            return (
              <Pressable
                onPress={
                  alert.url ? () => void Linking.openURL(alert.url as string) : undefined
                }
                disabled={!alert.url}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: colors.card, opacity: pressed && alert.url ? 0.7 : 1 },
                  elevation(1),
                ]}
                accessibilityRole={alert.url ? 'button' : undefined}
                accessibilityLabel={`${alert.category}, ${alert.riverName}, ${alert.title}`}
              >
                <View style={[styles.stripe, { backgroundColor: tint }]} />
                <View style={styles.rowBody}>
                  {/* The RIVER leads, not the headline. This list spans every
                      river, and "which of mine is this about" is the first
                      question — the agencies write headlines that name counties. */}
                  <Text style={[styles.riverName, { color: colors.text }]}>{alert.riverName}</Text>
                  <Text style={[styles.headline, { color: tint }]} numberOfLines={2}>
                    {alert.title}
                  </Text>
                  {/* WHO SAID IT, always. A closure Eddy is relaying and a
                      condition Eddy graded must never be mistakable, and this
                      caption is the only thing on the row that says which. */}
                  <Text style={[styles.detail, { color: colors.textMuted }]}>
                    {alert.category} · {alert.source === 'nps' ? 'National Park Service' : 'National Weather Service'}
                  </Text>
                </View>
                {alert.url ? (
                  <Ionicons name="open-outline" size={16} color={colors.textSubtle} />
                ) : null}
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <FlatList
        data={highWaterRows}
        keyExtractor={(item) => item.key}
        refreshControl={refreshControl}
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
            // Every row above is a stored reading. State the actual limitation
            // instead of substituting a generic safety disclaimer.
            <Text style={[styles.lagNote, { color: colors.textMuted }]}>
              Gauge readings can trail the river by up to about an hour. Check again before
              getting on the water.
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
              onPress={target ? () => router.push(asHref(target)) : undefined}
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
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  toggleText: { ...t.xs, fontFamily: fonts.semibold },
  // Same pill the filter chips draw their counts in — see FilterChips.
  toggleCount: { minWidth: 18, paddingHorizontal: 5, borderRadius: 999, alignItems: 'center' },
  toggleCountText: { ...t.xs, fontFamily: fonts.semibold, fontSize: 11 },
  caption: { ...t.xs, fontFamily: fonts.body, marginTop: 10, lineHeight: 16 },
  errorText: { ...t.sm, fontFamily: fonts.body, marginTop: 10 },
  empty: { alignItems: 'center', paddingHorizontal: 40, paddingTop: 30 },
  emptyTitle: { ...t.lg, fontFamily: fonts.semibold, marginTop: 10 },
  emptyBody: { ...t.sm, fontFamily: fonts.body, textAlign: 'center', marginTop: 8 },
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
  lagNote: {
    ...t.xs,
    fontFamily: fonts.body,
    textAlign: 'center',
    paddingHorizontal: 32,
    paddingTop: 6,
    paddingBottom: 24,
  },
});
