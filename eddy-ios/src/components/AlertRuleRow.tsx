// eddy-ios/src/components/AlertRuleRow.tsx
// One alert in the manage list.
//
// The row shows WHAT is being watched and WHEN it will fire, on two lines, in
// that order. Both are needed: someone with three rules on the Meramec cannot
// tell them apart by the river name, and someone with one rule per river cannot
// tell what it does from "above 3.00 ft" alone.
//
// The trigger sentence comes from describeAlertRule in @eddy/types, shared with
// the push body so the notification and this row cannot describe the same rule
// differently.
//
// ── A river alert speaks for the gauges folded into it ──────────────────────
//
// A gauge switched on from a river alert's edit screen is that alert extended
// to another station, so it is named on the river's row (`coverage`) rather
// than drawn as a second alert. The row then answers for all of them: when any
// of them last fired, and whether one of them has stopped reporting.
//
// ── Two sizes, for the child that is no longer the same alert ──────────────
//
// `nested` draws the same row as a CHILD of the river above it: indented,
// unelevated, titled by its station rather than by the river whose name the
// parent already carries. Only a child that differs from its parent gets one —
// paused by hand, or given its own trigger. See src/lib/alertGroups.ts for the
// split, and app/(tabs)/alerts.tsx for the writes that make the parent's switch
// mean what nesting says it means.

import { memo } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { describeAlertRule, type AlertRule } from '@eddy/types';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { lastSentNote, staleReadingNote } from '@/lib/alertCopy';
import { stationShortName } from '@/lib/alertGroups';
import { EddySymbol } from '@/components/EddySymbol';

interface Props {
  rule: AlertRule;
  onPress: () => void;
  onToggle: (enabled: boolean) => void;
  /**
   * Drawn as a child of the river row above it.
   *
   * Indented, unelevated and without the river's name — the parent already
   * carries it, and repeating it on four consecutive rows is the duplication
   * the grouping exists to remove. See src/lib/alertGroups.ts.
   */
  nested?: boolean;
  /**
   * Which gauges this river alert covers — "Main gauge + Sullivan".
   *
   * The stations switched on from its edit screen that still follow its
   * setting. They have no rows of their own, so this line is where the list
   * says they exist. From coverageLine in src/lib/alertGroups.ts.
   */
  coverage?: string | null;
  /** How many stations `coverage` names, for the switch's spoken label. */
  coveredCount?: number;
  /**
   * A folded-in station that met its trigger more recently than this alert
   * last sent. Reported as a crossing, never as a send: only the river alert's
   * own time records a notification going out. See groupLastActivity.
   */
  coveredTrigger?: { station: string; at: string } | null;
  /**
   * A folded-in station the alert engine cannot currently read. It is armed
   * and cannot fire, and it has no row of its own to say so.
   */
  staleStation?: AlertRule | null;
  /**
   * How many gauge alerts are drawn as rows UNDER this one, for its hint.
   *
   * Stated because the parent's switch governs them: a switch whose reach is
   * larger than the row it sits on has to say so before it is flicked.
   */
  separateCount?: number;
  /**
   * Held off by the river alert above it.
   *
   * The rule's own `enabled` is untouched — the server gates a child whose
   * parent is paused rather than pausing it, which is what lets resuming the
   * parent hand every child back as it was. So this row is the ONLY place that
   * can explain an alert that is on and will not fire, and it draws itself
   * unavailable and says why.
   *
   * NO SWITCH AT ALL while gated. It used to be shown on and disabled, on the
   * reasoning that off would misstate stored state. But nobody reads a switch
   * as stored state: they read it as "will this fire", and a disabled iOS
   * switch barely dims, so the brightest thing in a paused group said ON. A
   * switch that can change nothing is removed rather than explained; it comes
   * back, in whatever position it was left, when the river alert resumes.
   */
  gated?: boolean;
}

/** A spent one-shot: it has already fired and will not fire again unarmed. */
function isSpent(rule: AlertRule): boolean {
  return rule.oneShot && rule.firedAt != null;
}

function sentenceCase(text: string): string {
  return text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text;
}

function AlertRuleRowInner({
  rule,
  onPress,
  onToggle,
  nested = false,
  coverage = null,
  coveredCount = 0,
  coveredTrigger = null,
  staleStation = null,
  separateCount = 0,
  gated = false,
}: Props) {
  const { colors, elevation } = useTheme();

  // NESTED ROWS ARE ABOUT THE STATION, not the river. The parent above already
  // says which water this is; a child repeating it would be the duplication the
  // grouping removes, drawn one indent to the right.
  const title = nested
    ? (rule.gaugeName ?? 'This gauge')
    : (rule.riverName ?? rule.gaugeName ?? 'Alert');
  // Named only when it adds something. On a river alert graded by its own
  // primary gauge, printing the station too is noise — and on a nested row the
  // station IS the title.
  const subtitle =
    !nested && rule.scope === 'gauge' && rule.riverName && rule.gaugeName
      ? rule.gaugeName
      : null;

  const spent = isSpent(rule);
  const dimmed = !rule.enabled || spent || gated;
  const sentNote = lastSentNote(rule, undefined, coveredTrigger);
  // Its own station first. A paused river alert is not waiting on anything, so
  // a folded-in station's silence is only worth a line while the alert is on.
  const staleNote =
    staleReadingNote(rule) ??
    (staleStation && rule.enabled
      ? staleReadingNote(staleStation, undefined, stationShortName(staleStation.gaugeName))
      : null);

  // ONE status line, chosen once, so the row and its spoken label cannot
  // disagree about which of these outranks which.
  //
  // The gate wins because it says the same thing plus what to do about it:
  // "Met its trigger 2d ago" on a rule that cannot currently fire is true and
  // useless. A spent one-shot wins over the history for the same reason, and a
  // silent station outranks the history because the rule is armed and cannot
  // fire until it reports again.
  const statusNote = gated
    ? 'Paused with the river alert above'
    : spent
      ? 'Already sent — tap to set it again'
      : (staleNote ?? sentNote);
  const reachNote =
    separateCount > 0 && rule.enabled
      ? separateCount === 1
        ? 'Also pauses the gauge alert below'
        : `Also pauses the ${separateCount} gauge alerts below`
      : null;
  const triggerText = sentenceCase(describeAlertRule(rule));

  // The Pressable's label replaces its children for VoiceOver, so everything
  // the row prints has to be in it. It used to announce only the title, which
  // left the covered stations and a silent gauge unspoken.
  const rowLabel = [
    `Edit alert for ${title}`,
    triggerText,
    subtitle,
    // "+" is read as "plus", which is what the line means.
    coverage,
    reachNote,
    statusNote,
  ]
    .filter(Boolean)
    .join('. ');

  // What the switch reaches, for VoiceOver — the same reach the row prints.
  const others = coveredCount + separateCount;
  const switchTarget =
    others > 0
      ? `the alert for ${title} and ${others} other ${others === 1 ? 'gauge' : 'gauges'}`
      : `alert for ${title}`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        nested ? styles.nestedRow : null,
        {
          backgroundColor: nested ? colors.cardRaised : colors.card,
          opacity: pressed ? 0.7 : 1,
        },
        // No elevation on a child: it sits ON the group rather than beside it,
        // and a second shadow inside the first reads as two stacked cards.
        nested ? { borderLeftWidth: 2, borderLeftColor: colors.border } : elevation(1),
      ]}
      accessibilityRole="button"
      accessibilityLabel={rowLabel}
    >
      <View
        style={[
          styles.icon,
          nested ? styles.nestedIcon : null,
          { backgroundColor: nested ? colors.card : colors.cardRaised, opacity: dimmed ? 0.48 : 1 },
        ]}
      >
        {/* THE RIVER GETS THE RIVER MARK. It used to get `alertWatch` — the
            binoculars — which said "this is an alert" on a screen where every
            row is an alert, and made a river indistinguishable from a dam or a
            gauge at a glance. `gauge` and `river` are the same two marks
            KindMark hands the rest of the app, so a river on the Alerts tab now
            looks like a river everywhere else. */}
        <EddySymbol
          name={rule.scope === 'gauge' ? 'gauge' : 'river'}
          size={nested ? 20 : 25}
        />
      </View>

      <View style={styles.body}>
        <Text
          style={[
            nested ? styles.nestedTitle : styles.title,
            { color: dimmed ? colors.textMuted : colors.text },
          ]}
        >
          {title}
        </Text>
        <Text style={[styles.trigger, { color: colors.textMuted }]}>
          {/* Capitalised here rather than in the shared helper, because the push
              body embeds the same fragment mid-sentence. First character only —
              an earlier version matched the specific openings it expected and
              left "on any condition change" lowercase, which is the one a
              condition rule uses. */}
          {triggerText}
        </Text>
        {subtitle ? (
          <Text style={[styles.meta, { color: colors.textSubtle }]}>
            {subtitle}
          </Text>
        ) : null}
        {/* WHICH GAUGES, on a river alert that covers more than its main one.
            These used to be rows of their own, each repeating the sentence
            above; they are the same alert on more of the river, so they are
            named here once. */}
        {coverage ? (
          <Text style={[styles.meta, { color: colors.textSubtle }]}>{coverage}</Text>
        ) : null}
        {/* THE SWITCH'S REACH, said before it is flicked — and only then. A
            parent whose toggle silently holds off other rows is a control that
            does more than it looks like it does.

            It used to read "paused together" whether the alert was on or off,
            which on a live alert looked like a status. Once the parent IS
            paused, each row below says so itself. */}
        {reachNote ? (
          <Text style={[styles.meta, { color: colors.textSubtle }]}>{reachNote}</Text>
        ) : null}
        {statusNote ? (
          <Text style={[styles.meta, { color: colors.textSubtle }]}>{statusNote}</Text>
        ) : null}
      </View>

      {gated ? null : (
        <Switch
          value={rule.enabled}
          onValueChange={onToggle}
          trackColor={{ true: colors.interactive, false: colors.border }}
          accessibilityLabel={`${rule.enabled ? 'Pause' : 'Resume'} ${switchTarget}`}
        />
      )}
    </Pressable>
  );
}

export const AlertRuleRow = memo(AlertRuleRowInner);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
  },
  // Indented to the parent's icon column, and pulled up so the group reads as
  // one object with a rule between its parts rather than as separate cards.
  nestedRow: {
    marginLeft: 40,
    marginTop: -4,
    marginBottom: 8,
    paddingVertical: 11,
    borderRadius: 12,
  },
  icon: { width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  nestedIcon: { width: 28, height: 28 },
  body: { flex: 1 },
  title: { ...t.base, fontFamily: fonts.semibold },
  nestedTitle: { ...t.sm, fontFamily: fonts.semibold },
  trigger: { ...t.sm, fontFamily: fonts.body, marginTop: 2 },
  meta: { ...t.xs, fontFamily: fonts.body, marginTop: 3 },
});
