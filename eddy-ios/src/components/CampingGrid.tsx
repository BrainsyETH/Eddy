import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { CampingOverview, TrackedCampground } from '@eddy/types';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import {
  campingRowNeedsUpdate,
  cellMark,
  currentNight,
  weekendLine,
  type HeatMark,
} from '@/lib/campingHeatmap';

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
          ? {
              backgroundColor: colors.success,
              opacity: fillOpacity,
              borderWidth: 0,
            }
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
  const { width, fontScale } = useWindowDimensions();
  const sparseDates = width < 360 || fontScale > 1.3;
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
              {!sparseDates || index % 2 === 0 ? Number(date.slice(8)) : ' '}
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
/** Shared label width keeps every row aligned with the pinned date ruler. */
export function CampingTableHeader({
  overview,
  now,
}: {
  overview: CampingOverview;
  now: number;
}) {
  const { colors } = useTheme();
  const months = overview.horizon.nights.reduce<
    { label: string; count: number }[]
  >((groups, date) => {
    const label = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(date + 'T12:00:00Z'));
    if (groups.at(-1)?.label === label) groups[groups.length - 1].count++;
    else groups.push({ label, count: 1 });
    return groups;
  }, []);
  return (
    <View
      style={table.row}
      accessible
      accessibilityLabel={overview.horizon.nights
        .map((d) =>
          new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC',
          }),
        )
        .join(', ')}
    >
      <View style={table.name} />
      <View style={table.dates}>
        <View style={{ flexDirection: 'row' }}>
          {months.map((m) => (
            <Text
              key={m.label}
              style={{
                flex: m.count,
                fontFamily: fonts.medium,
                fontSize: 10,
                color: colors.textMuted,
              }}
            >
              {m.label}
            </Text>
          ))}
        </View>
        <CampingGrid overview={overview} now={now} headings />
      </View>
    </View>
  );
}
export function CampingTableRow({
  row,
  overview,
  now,
  onPress,
}: {
  row: TrackedCampground;
  overview: CampingOverview;
  now: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const stale = campingRowNeedsUpdate(row, overview, now);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${row.name}. ${weekendLine(row, overview, now)}${stale ? '. Needs an update' : ''}`}
      style={[table.row, table.item, { borderColor: colors.border }]}
    >
      <View style={table.name}>
        <Text
          numberOfLines={2}
          style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.text }}
        >
          {row.name.replace(/ Campground$/, '')}
        </Text>
        {stale ? (
          <Text style={{ fontSize: 10, color: colors.textMuted }}>
            Needs update
          </Text>
        ) : null}
      </View>
      <View style={table.dates}>
        <CampingGrid row={row} overview={overview} now={now} />
      </View>
    </Pressable>
  );
}
export function CampingLegend() {
  const { colors } = useTheme();
  return (
    <View style={styles.legend}>
      <Text style={[styles.label, { color: colors.textMuted }]}>Open</Text>
      {(
        [
          ['open-1', '1–2'],
          ['open-2', '3–9'],
          ['open-3', '10+'],
          ['full', 'Full'],
        ] as const
      ).map(([mark, label]) => (
        <View key={mark} style={styles.legendItem}>
          <View style={{ width: 12 }}>
            <Mark mark={mark} />
          </View>
          <Text style={[styles.label, { color: colors.textMuted }]}>
            {label}
          </Text>
        </View>
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="About camping availability"
        hitSlop={4}
        style={{
          minHeight: 44,
          minWidth: 44,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onPress={() =>
          Alert.alert(
            'Camping availability',
            `Green: reservable sites open. Red outline: fully booked.

— Closed
··· Not yet released
/ No reservable sites
? Not checked

Highlighted dates are Friday and Saturday. Counts are per night, not a guarantee of the same site for a whole stay. First-come sites are not included.`,
          )
        }
      >
        <Text
          style={{
            color: colors.interactive,
            borderColor: colors.interactive,
            borderWidth: 1,
            borderRadius: 9,
            width: 18,
            height: 18,
            textAlign: 'center',
            fontFamily: fonts.semibold,
            fontSize: 12,
          }}
        >
          i
        </Text>
      </Pressable>
    </View>
  );
}
const table = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  item: {
    minHeight: 48,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: { width: '32%', flexShrink: 0 },
  dates: { flex: 1 },
});
const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: 2 },
  column: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 3,
    borderBottomWidth: 2,
  },
  cell: {
    width: '100%',
    minWidth: 0,
    height: 16,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dash: { height: 2, width: '75%' },
  symbol: { fontSize: 12, fontFamily: fonts.mono },
  date: { fontSize: 10, fontFamily: fonts.mono },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { fontSize: 11, fontFamily: fonts.body, flexShrink: 1 },
});
