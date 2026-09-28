import {
  createContext,
  useContext,
  useRef,
  useMemo,
  useId,
  type ReactNode,
} from 'react';
import Animated, {
  useSharedValue,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedReaction,
  scrollTo,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { createCampingTapGuard } from '@/lib/campingScroll';
import { support } from '@/theme/palette';
import { Pressable, StyleSheet, Text, View, ScrollView } from 'react-native';
import type { CampingOverview, TrackedCampground } from '@eddy/types';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import {
  campingRowNeedsUpdate,
  campingRowSummary,
  campingCoverageLabel,
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
        <View style={[styles.unknownDash, { backgroundColor: colors.border }]} />
      ) : null}
    </View>
  );
}
const DATE_WIDTH = 28;
const DateScrollContext = createContext<{
  offset: SharedValue<number>;
  driver: SharedValue<string>;
} | null>(null);

/** Native date offset shared by the ruler and virtualized rows, without JS fan-out. */
export function CampingScrollGroup({ children }: { children: ReactNode }) {
  const offset = useSharedValue(0);
  const driver = useSharedValue('');
  const group = useMemo(() => ({ offset, driver }), [offset, driver]);
  return (
    <DateScrollContext.Provider value={group}>
      {children}
    </DateScrollContext.Provider>
  );
}
function DateScroller({ children }: { children: ReactNode }) {
  const group = useContext(DateScrollContext)!;
  // Capture only shared values in worklets, never the context or a React ref registry.
  const { offset, driver } = group;
  const id = useId();
  const ref = useAnimatedRef<ScrollView>();
  const ready = useSharedValue(false);
  const handler = useAnimatedScrollHandler({
    onBeginDrag: () => {
      driver.set(id);
    },
    onScroll: (event) => {
      if (driver.get() === id)
        offset.set(Math.max(0, event.contentOffset.x));
    },
  });
  useAnimatedReaction(
    () => ({ x: offset.get(), active: driver.get(), ready: ready.get() }),
    (state) => {
      if (state.ready && state.active !== id) scrollTo(ref, state.x, 0, false);
    },
  );
  return (
    <Animated.ScrollView
      ref={ref}
      horizontal
      directionalLockEnabled
      nestedScrollEnabled
      bounces={false}
      canCancelContentTouches
      showsHorizontalScrollIndicator={false}
      style={{ flex: 1 }}
      onContentSizeChange={() => {
        ready.set(true);
      }}
      onScroll={handler}
      scrollEventThrottle={16}
    >
      {children}
    </Animated.ScrollView>
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
              maxFontSizeMultiplier={1.3}
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
      accessibilityLabel={`${campingCoverageLabel(overview)}. Highlights mark Fridays and Saturdays.`}
    >
      <View style={table.name} />
      <DateScroller>
        <View>
          <View style={{ flexDirection: 'row' }}>
            {months.map((m) => (
              <Text
                key={m.label}
                maxFontSizeMultiplier={1.3}
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
  const tap = useRef(createCampingTapGuard());
  return (
    <Pressable
      onTouchStart={(event) =>
        tap.current.start(event.nativeEvent.pageX, event.nativeEvent.pageY)
      }
      onTouchMove={(event) =>
        tap.current.move(event.nativeEvent.pageX, event.nativeEvent.pageY)
      }
      onTouchCancel={() => tap.current.cancel()}
      onPress={() => {
        if (tap.current.allowed()) onPress();
      }}
      onAccessibilityTap={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${row.name}. ${campingRowSummary(row, overview, now)} Open calendar and individual sites.${stale ? '. Needs an update' : ''}`}
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
  unknownDash: { height: 1, width: '50%' },
  date: { fontSize: 10, fontFamily: fonts.mono },
});
