import { StyleSheet, Switch, Text, View } from 'react-native';
import { ReminderPermission } from '../ReminderPermission';
import { HAZARD_LEAD_MILES, TAKE_OUT_LEAD_MILES, type FloatReminderChoices } from '@/lib/floatReminders';
import { CardHeading } from './ui';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

// The same two rows River Mode's own Reminders card shows, before the float
// starts. Each row says what it does in its note (how far ahead; what counts
// as a hazard), because "near" and "mapped hazards" are Eddy's words and the
// person reading them has not floated with Eddy yet. Nothing else: the
// heading says these are reminders, the switches say they are on.

export function ReminderChoices({ value, onChange, disabled, hazards }: {
  value: FloatReminderChoices;
  onChange: (value: FloatReminderChoices) => void;
  disabled: boolean;
  /**
   * Reminded hazards on the chosen stretch, or null before there is one. At
   * zero the hazard row keeps its place and says so, with nothing to switch:
   * a toggle for a reminder that cannot fire is a promise the river won't keep.
   */
  hazards: number | null;
}) {
  const hazardsOn = value.hazards !== false;
  return <View style={styles.card}>
    <CardHeading title="Reminders" symbol="alertWatch" />
    <Row title="Take-out" note={`${TAKE_OUT_LEAD_MILES} mi ahead`} on={value.takeOut} disabled={disabled}
      accessibilityLabel="Take-out reminder" onChange={on => onChange({ ...value, takeOut: on })} />
    <Row title="Mapped hazards"
      note={hazards === 0 ? 'None on this stretch' : `Dams, portages and serious hazards · ${HAZARD_LEAD_MILES} mi ahead`}
      on={hazards === 0 ? null : hazardsOn} disabled={disabled}
      accessibilityLabel="Mapped hazard reminders" onChange={on => onChange({ ...value, hazards: on })} />
    <ReminderPermission enabled={value.takeOut || (hazardsOn && hazards !== 0)} disabled={disabled} />
  </View>;
}

function Row({ title, note, on, disabled, accessibilityLabel, onChange }: {
  title: string; note: string; on: boolean | null; disabled: boolean; accessibilityLabel: string; onChange: (on: boolean) => void;
}) {
  const { colors } = useTheme();
  return <View style={styles.row}>
    <View style={styles.text}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.note, { color: colors.textMuted }]}>{note}</Text>
    </View>
    {on == null ? null : <Switch value={on} disabled={disabled} onValueChange={onChange} accessibilityLabel={accessibilityLabel} />}
  </View>;
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, gap: 2 },
  title: { ...t.base, fontFamily: fonts.semibold },
  note: { ...t.sm, fontFamily: fonts.body },
});
