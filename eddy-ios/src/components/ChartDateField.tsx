import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { localChartDate, parseLocalChartDate } from '@/lib/gaugeChartDates';
import { useTheme } from '@/theme/ThemeProvider';
import { type as t } from '@/theme/typography';

export function ChartDateField({ label, value, onChange, error, minimumDate }: {
  label: string; value: string; onChange: (date: string) => void; error?: string; minimumDate?: Date;
}) {
  const { colors, isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const date = parseLocalChartDate(value) ?? new Date();
  return <View style={styles.field}>
    <View style={styles.row}>
      <Text style={[t.base, { color: colors.text }]}>{label}</Text>
      {Platform.OS === 'web' ? <TextInput accessibilityLabel={label} value={value} onChangeText={onChange}
        placeholder="YYYY-MM-DD" style={[t.base, { color: colors.text, minHeight: 44 }]} />
        : Platform.OS === 'ios' || open ? <DateTimePicker accessibilityLabel={label} value={date} mode="date"
          display={Platform.OS === 'ios' ? 'compact' : 'default'} minimumDate={minimumDate} maximumDate={new Date()}
          themeVariant={isDark ? 'dark' : 'light'} accentColor={colors.interactive}
          onChange={(event, selected) => {
            setOpen(false);
            if (event.type === 'set' && selected) onChange(localChartDate(selected));
          }} />
        : <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${date.toLocaleDateString()}`}
          onPress={() => setOpen(true)} style={styles.button}>
          <Text style={[t.base, { color: colors.interactive }]}>{date.toLocaleDateString()}</Text>
        </Pressable>}
    </View>
    {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[t.sm, { color: colors.error }]}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  field: { gap: 4 },
  row: { minHeight: 48, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
});
