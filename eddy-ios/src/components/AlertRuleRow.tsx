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
// ── Two sizes, because the list is now a tree ───────────────────────────────
//
// `nested` draws the same row as a CHILD of the river above it: indented,
// unelevated, titled by its station rather than by the river whose name the
// parent already carries. See src/lib/alertGroups.ts for why gauge alerts stop
// being top-level cards, and app/(tabs)/alerts.tsx for the writes that make the
// parent's switch mean what nesting says it means.

import { memo } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { describeAlertRule, type AlertRule } from '@eddy/types';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { lastSentNote } from '@/lib/alertCopy';
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
   * How many gauge alerts hang off this one, for the row's own hint.
   *
   * Stated because the parent's switch governs them: a switch whose reach is
   * larger than the row it sits on has to say so before it is flicked.
   */
  childCount?: number;
}

/** A spent one-shot: it has already fired and will not fire again unarmed. */
function isSpent(rule: AlertRule): boolean {
  return rule.oneShot && rule.firedAt != null;
}

function sentenceCase(text: string): string {
  return text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text;
}

function AlertRuleRowInner({ rule, onPress, onToggle, nested = false, childCount = 0 }: Props) {
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
  const dimmed = !rule.enabled || spent;
  const sentNote = lastSentNote(rule);

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
      accessibilityLabel={`Edit alert for ${title}`}
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
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text style={[styles.trigger, { color: colors.textMuted }]} numberOfLines={2}>
          {/* Capitalised here rather than in the shared helper, because the push
              body embeds the same fragment mid-sentence. First character only —
              an earlier version matched the specific openings it expected and
              left "on any condition change" lowercase, which is the one a
              condition rule uses. */}
          {sentenceCase(describeAlertRule(rule))}
        </Text>
        {subtitle ? (
          <Text style={[styles.meta, { color: colors.textSubtle }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {/* THE SWITCH'S REACH, said before it is flicked. A parent whose toggle
            silently pauses three other rules is a control that does more than
            it looks like it does, which is the one thing a switch may never be.

            "Pausing this pauses them" and not "the switch covers all", because
            the two directions are no longer symmetrical: resuming restores each
            gauge to what it was rather than switching everything on. Claiming
            the symmetry would be promising to undo a choice the switch actually
            preserves. */}
        {childCount > 0 ? (
          <Text style={[styles.meta, { color: colors.textSubtle }]}>
            {childCount} {childCount === 1 ? 'gauge' : 'gauges'} on this river · pausing this
            pauses {childCount === 1 ? 'it' : 'them'} too
          </Text>
        ) : null}
        {spent ? (
          // A one-shot that has fired looks identical to a live one otherwise,
          // and the difference is the whole point of a one-shot. This wins the
          // slot over lastSentNote because it says the same thing plus what to
          // do about it — "Last sent 2d ago" on a rule that will never fire
          // again is true and useless.
          <Text style={[styles.meta, { color: colors.textSubtle }]}>
            Already sent — tap to set it again
          </Text>
        ) : sentNote ? (
          <Text style={[styles.meta, { color: colors.textSubtle }]}>{sentNote}</Text>
        ) : null}
      </View>

      <Switch
        value={rule.enabled}
        onValueChange={onToggle}
        trackColor={{ true: colors.interactive, false: colors.border }}
        accessibilityLabel={
          childCount > 0
            ? rule.enabled
              ? `Pause the alert for ${title} and its ${childCount} gauge alerts`
              : `Resume the alert for ${title} and the gauge alerts it paused`
            : `${rule.enabled ? 'Pause' : 'Resume'} alert for ${title}`
        }
      />
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
