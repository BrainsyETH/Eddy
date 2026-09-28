import { StyleSheet, Text, View } from 'react-native';
import type { CampingOverview, TrackedCampground } from '@eddy/types';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import { cellMark, currentNight, type HeatMark } from '@/lib/campingHeatmap';

function Mark({ mark }: { mark: HeatMark }) {
  const { colors } = useTheme();
  // Match NightStrip: green openings, red booked-out outlines, neutral other states.
  const fillOpacity = mark === 'open-1' ? 0.45 : mark === 'open-2' ? 0.7 : 1;
  return (
    <View
      style={[
        styles.cell,
        { borderColor: colors.textSubtle },
        mark.startsWith('open')
          ? { backgroundColor: colors.success, opacity: fillOpacity, borderWidth: 0 }
          : mark === 'full'
            ? { borderWidth: 2, borderColor: colors.error }
            : {},
      ]}
    >
      {mark === 'closed' ? (
        <View style={[styles.dash, { backgroundColor: colors.textMuted }]} />
      ) : null}
      {mark === 'nyr' ? (
        <Text style={[styles.symbol, { color: colors.textMuted }]}>···</Text>
      ) : null}
      {mark === 'no-reservable' ? (
        <Text style={[styles.symbol, { color: colors.textMuted }]}>/</Text>
      ) : null}
      {mark === 'unknown' ? (
        <Text style={[styles.symbol, { color: colors.textSubtle }]}>?</Text>
      ) : null}
    </View>
  );
}
export function CampingGrid({
  row,
  overview,
  now,
  headings = false,
}: {
  row?: TrackedCampground;
  overview: CampingOverview;
  now: number;
  headings?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={styles.grid}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {overview.horizon.nights.map((date, index) => (
        <View
          key={date}
          style={[
            styles.column,
            {
              borderColor: overview.weekend.nights.includes(date)
                ? colors.interactive
                : colors.card,
            },
          ]}
        >
          {headings ? (
            <Text
              style={[
                styles.date,
                {
                  color: colors.textMuted,
                  fontFamily: index === 0 ? fonts.heading : fonts.body,
                },
              ]}
            >
              {Number(date.slice(8))}
            </Text>
          ) : (
            <Mark
              mark={cellMark(
                row
                  ? currentNight(
                      row,
                      date,
                      overview.maxObservationAgeSeconds,
                      now,
                    )
                  : undefined,
              )}
            />
          )}
        </View>
      ))}
    </View>
  );
}
export function CampingLegend() {
  const { colors } = useTheme();
  return (
    <View style={styles.legend}>
      {(
        [
          ['open-1', '1–2'],
          ['open-2', '3–9'],
          ['open-3', '10+'],
          ['full', 'Full'],
          ['no-reservable', 'No reservable sites'],
          ['closed', 'Closed'],
          ['nyr', 'Unreleased'],
          ['unknown', 'Not checked'],
        ] as const
      ).map(([mark, label]) => (
        <View key={mark} style={styles.legendItem}>
          <View style={{ width: 18 }}>
            <Mark mark={mark} />
          </View>
          <Text style={[styles.label, { color: colors.textMuted }]}>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: 3 },
  column: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 3,
    borderBottomWidth: 2,
  },
  cell: {
    width: '100%',
    minWidth: 12,
    height: 18,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dash: { height: 2, width: '75%' },
  symbol: { fontSize: 12, fontFamily: fonts.mono },
  date: { fontSize: 11 },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingVertical: 12,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5, width: 90 },
  label: { fontSize: 11, fontFamily: fonts.body, flexShrink: 1 },
});
