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

import { memo } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { describeAlertRule, type AlertRule } from '@eddy/types';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

interface Props {
  rule: AlertRule;
  onPress: () => void;
  onToggle: (enabled: boolean) => void;
}

/** A spent one-shot: it has already fired and will not fire again unarmed. */
function isSpent(rule: AlertRule): boolean {
  return rule.oneShot && rule.firedAt != null;
}

function sentenceCase(text: string): string {
  return text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text;
}

function AlertRuleRowInner({ rule, onPress, onToggle }: Props) {
  const { colors, elevation } = useTheme();

  // The river when there is one, because that is what people call the water.
  // The station is the fallback and the ONLY option on the national tier.
  const title = rule.riverName ?? rule.gaugeName ?? 'Alert';
  // Named only when it adds something. On a river alert graded by its own
  // primary gauge, printing the station too is noise.
  const subtitle =
    rule.scope === 'gauge' && rule.riverName && rule.gaugeName ? rule.gaugeName : null;

  const spent = isSpent(rule);
  const dimmed = !rule.enabled || spent;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
        elevation(1),
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Edit alert for ${title}`}
    >
      <View
        style={[
          styles.icon,
          { backgroundColor: dimmed ? colors.cardRaised : colors.interactive },
        ]}
      >
        <Ionicons
          name={rule.scope === 'gauge' ? 'speedometer-outline' : 'water-outline'}
          size={16}
          color={dimmed ? colors.textSubtle : colors.onInteractive}
        />
      </View>

      <View style={styles.body}>
        <Text
          style={[styles.title, { color: dimmed ? colors.textMuted : colors.text }]}
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
        {spent ? (
          // A one-shot that has fired looks identical to a live one otherwise,
          // and the difference is the whole point of a one-shot.
          <Text style={[styles.meta, { color: colors.textSubtle }]}>
            Already sent — tap to set it again
          </Text>
        ) : null}
      </View>

      <Switch
        value={rule.enabled}
        onValueChange={onToggle}
        trackColor={{ true: colors.interactive, false: colors.border }}
        accessibilityLabel={`${rule.enabled ? 'Pause' : 'Resume'} alert for ${title}`}
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
  icon: { width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  title: { ...t.base, fontFamily: fonts.semibold },
  trigger: { ...t.sm, fontFamily: fonts.body, marginTop: 2 },
  meta: { ...t.xs, fontFamily: fonts.body, marginTop: 3 },
});
