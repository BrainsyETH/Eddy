import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { GaugeHistoryReading } from '@eddy/types';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/** Keep units and columns visible while the readings scroll beneath them. */
export function GaugeHistoryTable({ readings }: { readings: readonly GaugeHistoryReading[] }) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const formatters = useMemo(() => ({
    date: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    time: new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }),
  }), []);

  return (
    <View style={styles.section}>
      <View style={[styles.frame, { borderColor: colors.border }]} onLayout={(event) => setWidth(event.nativeEvent.layout.width - 2)}>
        {/* At large text sizes, allow horizontal scrolling instead of squeezing
            numbers into narrow columns or reducing the user's chosen font. */}
        <ScrollView horizontal nestedScrollEnabled>
          <View style={{ width: Math.max(width, 280 * fontScale) }}>
            <View style={[styles.row, styles.header, { backgroundColor: colors.cardRaised, borderBottomColor: colors.border }]}>
              <Text accessibilityRole="header" style={[styles.timeCell, styles.heading, { color: colors.textMuted }]}>Time</Text>
              <Text accessibilityRole="header" style={[styles.numberCell, styles.heading, { color: colors.textMuted }]}>{'Height\n(ft)'}</Text>
              <Text accessibilityRole="header" style={[styles.numberCell, styles.heading, { color: colors.textMuted }]}>{'Flow\n(cfs)'}</Text>
            </View>
            <ScrollView style={styles.body} nestedScrollEnabled>
              {readings.map((reading, index) => {
                const date = new Date(reading.timestamp);
                const height = reading.gaugeHeightFt == null ? '—' : reading.gaugeHeightFt.toFixed(2);
                const flow = reading.dischargeCfs == null ? '—' : Math.round(reading.dischargeCfs).toLocaleString('en-US');
                return (
                  <View key={reading.timestamp} style={[styles.row, styles.dataRow, { backgroundColor: index % 2 ? colors.cardRaised : colors.card, borderBottomColor: colors.border }]}>
                    <View style={styles.timeCell}>
                      <Text selectable style={[styles.date, { color: colors.text }]}>{formatters.date.format(date)}</Text>
                      <Text selectable style={[styles.time, { color: colors.textMuted }]}>{formatters.time.format(date)}</Text>
                    </View>
                    <Text selectable accessibilityLabel={reading.gaugeHeightFt == null ? 'Height unavailable' : `Height ${height} feet`} style={[styles.numberCell, styles.number, { color: colors.text }]}>{height}</Text>
                    <Text selectable accessibilityLabel={reading.dischargeCfs == null ? 'Flow unavailable' : `Flow ${flow} cubic feet per second`} style={[styles.numberCell, styles.number, { color: colors.text }]}>{flow}</Text>
                  </View>
                );
              })}
              {readings.length === 0 ? <Text style={[styles.empty, { color: colors.textMuted }]}>No readings in this date range.</Text> : null}
            </ScrollView>
          </View>
        </ScrollView>
      </View>
      <Text style={[styles.caption, { color: colors.textSubtle }]}>Times shown in your local time zone</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 4, marginBottom: 12 },
  frame: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10 },
  header: { paddingVertical: 10, borderBottomWidth: 1 },
  body: { maxHeight: 280 },
  dataRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  timeCell: { flex: 1.5, minWidth: 0 },
  numberCell: { flex: 1, minWidth: 0, textAlign: 'right' },
  heading: { ...t.xs, fontFamily: fonts.semibold },
  date: { ...t.xs, fontFamily: fonts.medium },
  time: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  number: { ...t.sm, fontFamily: fonts.mono, fontVariant: ['tabular-nums'] },
  empty: { ...t.sm, fontFamily: fonts.body, textAlign: 'center', padding: 16 },
  caption: { ...t.xs, fontFamily: fonts.body, textAlign: 'center', marginTop: 6 },
});
