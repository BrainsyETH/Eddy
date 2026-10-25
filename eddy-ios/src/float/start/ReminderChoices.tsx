import { StyleSheet, Switch, Text, View } from 'react-native';
import { ReminderPermission } from '../ReminderPermission';
import type { FloatReminderChoices } from '@/lib/floatReminders';
import { useTheme } from '@/theme/ThemeProvider';
import { type as t } from '@/theme/typography';

export function ReminderChoices({ value, onChange, disabled }: {
  value: FloatReminderChoices; onChange: (value: FloatReminderChoices) => void; disabled: boolean;
}) {
  const { colors } = useTheme();
  return <View style={{ gap: 8 }}>
    <Text style={[t.base, { color: colors.text }]} accessibilityRole="header">Float reminders</Text>
    {(['takeOut', 'hazards'] as const).map(key => <View key={key} style={styles.row}>
      <Text style={[t.base, styles.label, { color: colors.text }]}>{key === 'takeOut' ? 'Near your take-out' : 'Mapped hazards ahead'}</Text>
      <Switch value={key === 'takeOut' ? value.takeOut : value.hazards !== false} disabled={disabled}
        onValueChange={on => onChange({ ...value, [key]: on })}
        accessibilityLabel={key === 'takeOut' ? 'Take-out reminders' : 'Mapped hazard reminders'} />
    </View>)}
    <ReminderPermission enabled={value.takeOut || value.hazards !== false} disabled={disabled} />
  </View>;
}
const styles = StyleSheet.create({ row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 }, label: { flex: 1 } });
