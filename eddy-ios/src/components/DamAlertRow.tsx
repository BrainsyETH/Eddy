// eddy-ios/src/components/DamAlertRow.tsx
// A dam generation alert, as a row on the Alerts tab's "Mine" list.
//
// Drawn to sit beside AlertRuleRow — same card, same icon well, same two
// lines — with one deliberate difference: no switch. A river or gauge rule has
// one on/off state and its row pauses it. This alert has two times and no
// paused state (both off means there is no alert), and one switch could only
// stand for one of them. So the row opens the dam screen, where the two real
// switches sit under the schedule they follow, and a swipe removes the alert.

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DamGenerationAlert } from '@eddy/types';
import { ControlIcon } from '@/components/ControlIcon';
import { EddySymbol } from '@/components/EddySymbol';
import { damAlertSummary } from '@/lib/damAlerts';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

interface Props {
  alert: DamGenerationAlert;
  onPress: () => void;
}

function DamAlertRowInner({ alert, onPress }: Props) {
  const { colors, elevation } = useTheme();
  const summary = damAlertSummary(alert);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
        elevation(1),
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${alert.damName}. ${summary}. Change this alert`}
    >
      <View style={[styles.icon, { backgroundColor: colors.cardRaised }]}>
        <EddySymbol name="dam" size={25} />
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.text }]}>{alert.damName}</Text>
        <Text style={[styles.trigger, { color: colors.textMuted }]}>{summary}</Text>
      </View>
      <ControlIcon name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

export const DamAlertRow = memo(DamAlertRowInner);

// The same measurements as AlertRuleRow, so the two kinds of row line up.
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
    minHeight: 60,
  },
  icon: { width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  title: { ...t.base, fontFamily: fonts.semibold },
  trigger: { ...t.sm, fontFamily: fonts.body, marginTop: 2 },
});
