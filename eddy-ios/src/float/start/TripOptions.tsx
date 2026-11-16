import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ControlIcon } from '@/components/ControlIcon';
import type { FloatReminderChoices } from '@/lib/floatReminders';
import { tripOptionsSummary } from '@/lib/tripOptionsSummary';
import { useTheme } from '@/theme/ThemeProvider';
import { Card, CardHeading, styles } from './ui';
import { ReminderChoices } from './ReminderChoices';
import { ReminderPermission } from '../ReminderPermission';
import { PickupContact } from '../PickupContact';

export function TripOptions({ value, onChange, disabled, hazards }: {
  value: FloatReminderChoices; onChange: (value: FloatReminderChoices) => void;
  disabled: boolean; hazards: number | null;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const summary = tripOptionsSummary(value, hazards);
  return <Card>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open, disabled }} disabled={disabled}
      onPress={() => setOpen(v => !v)} style={local.toggle}>
      <View style={local.copy}>
        <Text style={[styles.cardHeading, { color: colors.text }]}>Trip options</Text>
        <Text style={[styles.caption, { color: colors.textMuted }]}>{summary} · Pickup contact</Text>
      </View>
      <ControlIcon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.interactive} />
    </Pressable>
    <ReminderPermission enabled={value.takeOut || (value.hazards !== false && hazards !== 0)} disabled={disabled} />
    {open ? <View style={local.options}>
      <ReminderChoices showPermission={false} value={value} onChange={onChange} disabled={disabled} hazards={hazards} />
      <View style={[local.contact, { borderTopColor: colors.border }]}>
        <CardHeading title="Pickup contact" />
        <PickupContact compact disabled={disabled} />
      </View>
    </View> : null}
  </Card>;
}
const local = StyleSheet.create({
  toggle: { minHeight: 44, flexDirection: 'row', gap: 12, alignItems: 'center' },
  copy: { flex: 1, gap: 4 },
  options: { gap: 16, marginTop: 12 },
  contact: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16, gap: 8 },
});
