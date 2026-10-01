import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { qualifierText, type ChartDataRow } from '@eddy/conditions/chart-model';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

const PAGE_SIZE = 8;

/** Page long histories without dropping any rows from the table or export. */
export function GaugeHistoryTable({ rows }: { rows: readonly ChartDataRow[] }) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const [requestedPage, setPage] = useState(0);
  const page = Math.min(requestedPage, Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1));
  const formatters = useMemo(() => ({
    date: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    time: new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
  }), []);
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <ScrollView horizontal nestedScrollEnabled>
      <View style={{ width: Math.max(width, 320 * fontScale) }}>
        <View style={[styles.row, styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.timeCell, styles.heading, { color: colors.textMuted }]}>Time</Text>
          <Text style={[styles.numberCell, styles.heading, { color: colors.textMuted }]}>{'Flow\n(cfs)'}</Text>
          <Text style={[styles.numberCell, styles.heading, { color: colors.textMuted }]}>{'Height\n(ft)'}</Text>
          <Text style={[styles.sourceCell, styles.heading, { color: colors.textMuted }]}>Source</Text>
        </View>
        {rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((reading, index) => {
          const date = new Date(reading.timestamp);
          const valid = Number.isFinite(date.getTime());
          const codes = reading.qualifiers?.join(', ');
          const decoded = qualifierText(reading.qualifiers ?? []);
          const qualifiers = decoded ? `${decoded} (${codes})` : codes;
          const height = reading.gaugeHeightFt == null ? '—' : reading.gaugeHeightFt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 20 });
          const flow = reading.dischargeCfs == null ? '—' : reading.dischargeCfs.toLocaleString(undefined, { maximumFractionDigits: 20 });
          return <View key={`${reading.kind}-${reading.timestamp}-${index}`} style={[styles.row, styles.dataRow, { borderBottomColor: colors.border }]}>
            <View style={styles.timeCell}>
              <Text selectable style={[styles.copy, { color: colors.text }]}>{valid ? formatters.date.format(date) : reading.timestamp}</Text>
              {valid ? <Text selectable style={[styles.copy, { color: colors.textMuted }]}>{formatters.time.format(date)}</Text> : null}
            </View>
            <Text selectable accessibilityLabel={`Flow ${flow === '—' ? 'unavailable' : `${flow} cubic feet per second`}`} style={[styles.numberCell, styles.number, { color: colors.text }]}>{flow}</Text>
            <Text selectable accessibilityLabel={`Gauge height ${height === '—' ? 'unavailable' : `${height} feet`}`} style={[styles.numberCell, styles.number, { color: colors.text }]}>{height}</Text>
            <View style={styles.sourceCell}>
              <Text selectable style={[styles.copy, { color: colors.text }]}>{reading.kind === 'forecast' ? 'NWS forecast' : 'Observed'}</Text>
              {qualifiers ? <Text selectable style={[styles.copy, { color: colors.textMuted }]}>{qualifiers}</Text> : null}
              {reading.gapBefore?.length ? <Text style={[styles.copy, { color: colors.textMuted }]}>Gap before: {reading.gapBefore.map(unit => unit === 'cfs' ? 'flow' : 'height').join(', ')}</Text> : null}
            </View>
          </View>;
        })}
      </View>
    </ScrollView>
    {rows.length ? <View style={styles.pager}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous readings" disabled={page === 0} accessibilityState={{ disabled: page === 0 }}
        onPress={() => setPage(page - 1)} style={[styles.pageButton, { opacity: page === 0 ? 0.4 : 1 }]}>
        <Text style={[styles.copy, { color: colors.interactive }]}>Previous</Text>
      </Pressable>
      <Text accessibilityLiveRegion="polite" style={[styles.pageCount, { color: colors.textMuted }]}>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, rows.length)} of {rows.length}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Next readings" disabled={(page + 1) * PAGE_SIZE >= rows.length} accessibilityState={{ disabled: (page + 1) * PAGE_SIZE >= rows.length }}
        onPress={() => setPage(page + 1)} style={[styles.pageButton, { opacity: (page + 1) * PAGE_SIZE >= rows.length ? 0.4 : 1 }]}>
        <Text style={[styles.copy, { color: colors.interactive }]}>Next</Text>
      </Pressable>
    </View> : <Text style={[styles.empty, { color: colors.textMuted }]}>No readings in this view.</Text>}
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  header: { paddingVertical: 8, borderBottomWidth: 1 },
  dataRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  timeCell: { flex: 1.5, minWidth: 0 },
  numberCell: { flex: 1, minWidth: 0, textAlign: 'right' },
  sourceCell: { flex: 1.2, minWidth: 0 },
  heading: { ...t.xs, fontFamily: fonts.semibold },
  copy: { ...t.xs },
  number: { ...t.sm, fontFamily: fonts.mono, fontVariant: ['tabular-nums'] },
  pager: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginTop: 8 },
  pageButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', padding: 8 },
  pageCount: { ...t.xs, fontVariant: ['tabular-nums'], flexShrink: 1, textAlign: 'center' },
  empty: { ...t.sm, paddingVertical: 16, textAlign: 'center' },
});
