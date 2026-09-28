import {
  createContext,
  useContext,
  useRef,
  useMemo,
  useId,
  useState,
  type ReactNode,
} from 'react';
import Animated, {
  useSharedValue,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedReaction,
  scrollTo,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { CampgroundThumbnail } from './CampgroundThumbnail';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { createCampingTapGuard } from '@/lib/campingScroll';
import { support } from '@/theme/palette';
import { Pressable, StyleSheet, Text, View, ScrollView } from 'react-native';
import type { CampingOverview, TrackedCampground } from '@eddy/types';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import {
  campingDate,
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
        <View
          style={[styles.unknownDash, { backgroundColor: colors.border }]}
        />
      ) : null}
    </View>
  );
}
const DATE_WIDTH = 28;
const DateScrollContext = createContext<{
  thumbnails: boolean;
  dateWidth: number;
  offset: SharedValue<number>;
  driver: SharedValue<string>;
} | null>(null);

/** Native date offset shared by the ruler and virtualized rows, without JS fan-out. */
export function CampingScrollGroup({
  children,
  dateWidth = DATE_WIDTH,
  thumbnails = false,
}: {
  children: ReactNode;
  dateWidth?: number;
  thumbnails?: boolean;
}) {
  const offset = useSharedValue(0);
  const driver = useSharedValue('');
  const group = useMemo(
    () => ({ offset, driver, dateWidth, thumbnails }),
    [offset, driver, dateWidth, thumbnails],
  );
  return (
    <DateScrollContext.Provider value={group}>
      {children}
    </DateScrollContext.Provider>
  );
}
function DateScroller({
  children,
  indicator = false,
}: {
  children: ReactNode;
  indicator?: boolean;
}) {
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
      if (driver.get() === id) offset.set(Math.max(0, event.contentOffset.x));
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
      showsHorizontalScrollIndicator={indicator}
      alwaysBounceHorizontal={false}
      style={{ flex: 1, minWidth: 0 }}
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
  const dateWidth = useContext(DateScrollContext)?.dateWidth ?? DATE_WIDTH;
  const today = campingDate(now);

  return (
    <View
      style={[
        styles.grid,
        { width: overview.horizon.nights.length * dateWidth },
      ]}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {overview.horizon.nights.map((date) => (
        <View
          key={date}
          style={[
            styles.column,
            {
              width: dateWidth,
              flexShrink: 0,
              backgroundColor: [5, 6].includes(
                new Date(date + 'T12:00:00Z').getUTCDay(),
              )
                ? colors.selectionBg
                : 'transparent',
              borderColor: [5, 6].includes(
                new Date(date + 'T12:00:00Z').getUTCDay(),
              )
                ? colors.interactive
                : colors.card,
            },
          ]}
        >
          {headings ? (
            <>
              <Text
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={{ fontSize: 10, color: colors.textMuted }}
              >
                {date === today
                  ? 'Today'
                  : new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
                      weekday: 'short',
                      timeZone: 'UTC',
                    })}
              </Text>
              <Text
                maxFontSizeMultiplier={1.3}
                style={[
                  styles.date,
                  {
                    fontFamily: date === today ? fonts.heading : fonts.medium,
                    fontSize: 13,
                    color: date === today ? colors.interactive : colors.text,
                  },
                ]}
              >
                {Number(date.slice(8))}
              </Text>
            </>
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
  const { offset, dateWidth, thumbnails } = useContext(DateScrollContext)!;
  const [visibleIndex, setVisibleIndex] = useState(0);
  // Only bridge date-column changes, never synchronize scrollers through JS.
  useAnimatedReaction(
    () => Math.floor(offset.get() / dateWidth),
    (index, previous) => {
      if (index !== previous) runOnJS(setVisibleIndex)(index);
    },
  );
  const visibleDate =
    overview.horizon.nights[
      Math.min(visibleIndex, overview.horizon.nights.length - 1)
    ];
  const month = visibleDate
    ? new Date(visibleDate + 'T12:00:00Z').toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '';
  return (
    <View>
      <Text
        style={{
          color: colors.text,
          fontFamily: fonts.semibold,
          fontSize: 13,
          paddingVertical: 6,
        }}
      >
        {month}
      </Text>
      <View
        style={table.row}
        accessibilityLabel={`${campingCoverageLabel(overview)}. Highlights mark Fridays and Saturdays.`}
      >
        <View style={[table.name, thumbnails && { width: '44%' }]} />
        <DateScroller indicator>
          <CampingGrid overview={overview} now={now} headings />
        </DateScroller>
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
  const thumbnails = useContext(DateScrollContext)?.thumbnails ?? false;
  const stale = campingRowNeedsUpdate(row, overview, now);
  const tap = useRef(createCampingTapGuard());
  return (
    <View style={[table.row, table.item, { borderColor: colors.border }]}>
      <Pressable
        style={[
          table.name,
          { minHeight: 44, justifyContent: 'center' },
          thumbnails && {
            width: '44%',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          },
        ]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${row.name}. ${campingRowSummary(row, overview, now)} Open campground and individual sites.${stale ? ' Needs an update.' : ''}`}
      >
        {thumbnails ? <CampgroundThumbnail url={row.imageUrl} /> : null}
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={2}
            style={{
              fontFamily: fonts.medium,
              fontSize: 12,
              color: colors.text,
            }}
          >
            {row.name.replace(/ Campground$/, '')}
          </Text>
          {stale ? (
            <Text style={{ fontSize: 10, color: colors.textMuted }}>
              Needs update
            </Text>
          ) : null}
        </View>
      </Pressable>
      <DateScroller>
        <Pressable
          accessible={false}
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
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <CampingGrid row={row} overview={overview} now={now} />
        </Pressable>
      </DateScroller>
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
