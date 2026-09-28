import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
  useState,
} from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { createCampingScroll } from '@/lib/campingScroll';
import { support } from '@/theme/palette';
import { Pressable, StyleSheet, Text, View, ScrollView } from 'react-native';
import type { CampingOverview, TrackedCampground } from '@eddy/types';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import {
  campingRowNeedsUpdate,
  cellMark,
  currentNight,
  type HeatMark,
} from '@/lib/campingHeatmap';

export function CampingMark({ mark }: { mark: HeatMark }) {
  const { colors, isDark } = useTheme();
  // Match NightStrip: green openings, red booked-out outlines, neutral other states.
  const greens = isDark
    ? [support[500], support[300], support[100]]
    : [support[300], support[500], support[700]];
  const fill = greens[mark === 'open-1' ? 0 : mark === 'open-2' ? 1 : 2];
  return (
    <View
      style={[
        styles.cell,
        { borderColor: colors.textSubtle },
        mark.startsWith('open')
          ? {
              backgroundColor: fill,
              borderWidth: 0,
            }
          : mark === 'full'
            ? { borderWidth: 1, borderColor: colors.error }
            : {},
      ]}
    >
      {mark === 'full' ? (
        <Svg width="100%" height={12} viewBox="0 0 16 16">
          <Path
            d="M5 7V5a3 3 0 0 1 6 0v2"
            fill="none"
            stroke={colors.error}
            strokeWidth={1.5}
          />
          <Rect
            x={3}
            y={7}
            width={10}
            height={7}
            rx={1.5}
            fill="none"
            stroke={colors.error}
            strokeWidth={1.5}
          />
        </Svg>
      ) : null}
      {mark === 'closed' || mark === 'no-reservable' ? (
        <View style={[styles.dash, { backgroundColor: colors.textMuted }]} />
      ) : null}
      {mark === 'nyr' ? (
        <Svg width="100%" height={12} viewBox="0 0 16 16">
          <Circle
            cx={8}
            cy={8}
            r={6}
            fill="none"
            stroke={colors.textMuted}
            strokeWidth={1.5}
          />
          <Path
            d="M8 4v4l3 2"
            fill="none"
            stroke={colors.textMuted}
            strokeWidth={1.5}
          />
        </Svg>
      ) : null}
      {mark === 'unknown' ? (
        <Text style={[styles.symbol, { color: colors.textSubtle }]}>?</Text>
      ) : null}
    </View>
  );
}
const DATE_WIDTH = 28;
const DateScrollContext = createContext<ReturnType<
  typeof createCampingScroll
> | null>(null);

/** One date offset for the ruler and every row, including newly virtualized rows. */
export function CampingScrollGroup({ children }: { children: ReactNode }) {
  const [group] = useState(createCampingScroll);
  return (
    <DateScrollContext.Provider value={group}>
      {children}
    </DateScrollContext.Provider>
  );
}
function DateScroller({ children }: { children: ReactNode }) {
  const group = useContext(DateScrollContext);
  const ref = useRef<ScrollView>(null);
  useEffect(() => {
    const view = ref.current;
    if (!view || !group) return;
    return group.register(view);
  }, [group]);
  return (
    <ScrollView
      ref={ref}
      horizontal
      directionalLockEnabled
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      style={{ flex: 1 }}
      onContentSizeChange={() => group?.restore(ref.current)}
      onScrollBeginDrag={() => {
        group?.begin(ref.current);
      }}
      scrollEventThrottle={16}
      onScroll={(event) => {
        group?.scroll(ref.current, event.nativeEvent.contentOffset.x);
      }}
    >
      {children}
    </ScrollView>
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
              borderColor: [5, 6].includes(
                new Date(date + 'T12:00:00Z').getUTCDay(),
              )
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
            <CampingMark
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
      <DateScroller>
        <View>
          <View style={{ flexDirection: 'row' }}>
            {months.map((m) => (
              <Text
                key={m.label}
                style={{
                  width: m.count * DATE_WIDTH,
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
      </DateScroller>
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
      accessibilityLabel={`${row.name}. Open calendar and individual sites.${stale ? '. Needs an update' : ''}`}
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
      <DateScroller>
        <CampingGrid row={row} overview={overview} now={now} />
      </DateScroller>
    </Pressable>
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
});
const styles = StyleSheet.create({
  grid: { flexDirection: 'row' },
  column: {
    width: DATE_WIDTH,
    paddingHorizontal: 3,
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
});
