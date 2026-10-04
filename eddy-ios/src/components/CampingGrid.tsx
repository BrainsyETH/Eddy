import {
  createContext,
  useContext,
  useMemo,
  useCallback,
  useState,
  memo,
  forwardRef,
  type ReactNode,
} from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  cancelAnimation,
  withDecay,
  withDelay,
  withTiming,
  ReduceMotion,
  useAnimatedReaction,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { CampgroundThumbnail } from './CampgroundThumbnail';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { campingVisibleMonthLabel, campingRenderWindow, visibleCampingColumns } from '@/lib/campingScroll';
import { support } from '@/theme/palette';
import { Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewProps } from 'react-native';
import { Gesture, GestureDetector, type NativeGesture } from 'react-native-gesture-handler';
import type { CampingOverview, TrackedCampground } from '@eddy/types';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import {
  campingDate,
  campingRowNeedsUpdate,
  campingRowSummary,
  campingCoverageLabel,
  cellMark,
  campingOpenCount,
  currentNight,
  type HeatMark,
} from '@/lib/campingHeatmap';

export function CampingMark({ mark, openCount }: { mark: HeatMark; openCount?: number | null }) {
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
      {mark.startsWith('open') && openCount != null ? (
        <Text
          numberOfLines={1}
          // This mark is a miniature chart; its parent announces the full count
          // and large-text readers get the campsite list instead.
          maxFontSizeMultiplier={1.2}
          adjustsFontSizeToFit
          minimumFontScale={0.9}
          style={[
            styles.count,
            { color: !isDark && mark === 'open-3' ? colors.onAccent : colors.campingCountInk },
          ]}
        >
          {openCount}
        </Text>
      ) : null}
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
  columnCount: number;
  offset: SharedValue<number>;
  viewportWidth: SharedValue<number>;
  verticalGesture: NativeGesture;
} | null>(null);
// Only date cells subscribe to window changes, not labels, thumbnails or gestures.
const DateRenderWindowContext = createContext<{ first: number; end: number } | null>(null);

/** One UI-thread position drives every row; no per-row scrollTo fan-out. */
export function CampingScrollGroup({ children, dateWidth = DATE_WIDTH, thumbnails = false, columnCount }: {
  children: ReactNode;
  dateWidth?: number;
  thumbnails?: boolean;
  columnCount: number;
}) {
  const offset = useSharedValue(0);
  const viewportWidth = useSharedValue(0);
  const verticalGesture = useMemo(() => Gesture.Native(), []);
  const [renderWindow, setRenderWindow] = useState(() => campingRenderWindow(0, 0, dateWidth, columnCount));
  useAnimatedReaction(
    () => campingRenderWindow(offset.get(), viewportWidth.get(), dateWidth, columnCount),
    (next, previous) => {
      if (next.first !== previous?.first || next.end !== previous?.end) runOnJS(setRenderWindow)(next);
    },
  );
  // A shorter horizon or wider device must not strand the grid beyond its end.
  useAnimatedReaction(
    () => Math.max(0, columnCount * dateWidth - viewportWidth.get()),
    (max) => { if (offset.get() > max) { cancelAnimation(offset); offset.set(max); } },
  );
  const group = useMemo(() => ({ offset, viewportWidth, dateWidth, thumbnails, columnCount, verticalGesture }),
    [offset, viewportWidth, dateWidth, thumbnails, columnCount, verticalGesture]);
  return <DateScrollContext.Provider value={group}>
    <DateRenderWindowContext.Provider value={renderWindow}>
      {children}
    </DateRenderWindowContext.Provider>
  </DateScrollContext.Provider>;
}

/** The RN ScrollView supplied through FlatList.renderScrollComponent is the
 * detector's direct child, so date pans can explicitly arbitrate its gesture.
 * Keep the plain RN component: RNGH's ScrollView already has a native handler.
 * https://docs.swmansion.com/react-native-gesture-handler/docs/2.x/gestures/native-gesture/ */
export const CampingVerticalScrollView = forwardRef<ScrollView, ScrollViewProps>(function CampingVerticalScrollView(props, ref) {
  const { verticalGesture } = useContext(DateScrollContext)!;
  return <GestureDetector gesture={verticalGesture}><ScrollView {...props} ref={ref} /></GestureDetector>;
});

function DateScroller({ children, onPress, indicator = false }: { children: ReactNode; onPress?: () => void; indicator?: boolean }) {
  const { offset, viewportWidth, dateWidth, columnCount, verticalGesture } = useContext(DateScrollContext)!;
  const { colors } = useTheme();
  const start = useSharedValue(0);
  const pressed = useSharedValue(0);
  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .activeOffsetX([-8, 8])
      .failOffsetY([-8, 8])
      .blocksExternalGesture(verticalGesture)
      .onBegin(() => { cancelAnimation(offset); })
      .onStart(() => { cancelAnimation(pressed); pressed.set(0); start.set(offset.get()); })
      .onUpdate(event => {
        const max = Math.max(0, columnCount * dateWidth - viewportWidth.get());
        offset.set(Math.min(max, Math.max(0, start.get() - event.translationX)));
      })
      .onEnd(event => {
        offset.set(withDecay({ velocity: -event.velocityX,
          clamp: [0, Math.max(0, columnCount * dateWidth - viewportWidth.get())] }));
      });
    const tap = Gesture.Tap().maxDistance(8)
      // This delay disambiguates touch intent, even with Reduce Motion enabled.
      .onBegin(() => { if (onPress) pressed.set(withDelay(130, withTiming(0.16, { duration: 0 }), ReduceMotion.Never)); })
      .onEnd((_event, success) => { if (success && onPress) runOnJS(onPress)(); })
      .onFinalize(() => { cancelAnimation(pressed); pressed.set(0); });
    return Gesture.Exclusive(pan, tap);
  }, [offset, viewportWidth, dateWidth, columnCount, start, onPress, pressed, verticalGesture]);
  const translate = useAnimatedStyle(() => ({ transform: [{ translateX: -offset.get() }] }));
  const feedback = useAnimatedStyle(() => ({ opacity: pressed.get() }));
  const thumb = useAnimatedStyle(() => {
    const viewport = viewportWidth.get();
    const content = columnCount * dateWidth;
    const width = content > 0 ? Math.min(viewport, Math.max(18, viewport * viewport / content)) : 0;
    const maxOffset = Math.max(0, content - viewport);
    const x = maxOffset ? Math.min(maxOffset, Math.max(0, offset.get())) / maxOffset * (viewport - width) : 0;
    return { width, opacity: maxOffset > 0 ? 1 : 0, transform: [{ translateX: x }] };
  });
  return <GestureDetector gesture={gesture}>
    <View style={{ flex: 1, minWidth: 0, overflow: 'hidden', minHeight: 44, justifyContent: 'center', paddingBottom: indicator ? 6 : 0 }}
      onLayout={event => viewportWidth.set(event.nativeEvent.layout.width)}
      accessible={false}>
      <Animated.View style={[{ width: columnCount * dateWidth }, translate]}>{children}</Animated.View>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.interactive }, feedback]} />
      {indicator ? <View pointerEvents="none" style={styles.scrollTrack}>
        <Animated.View style={[styles.scrollThumb, { backgroundColor: colors.textSubtle }, thumb]} />
      </View> : null}
    </View>
  </GestureDetector>;
}
export const CampingGrid = memo(function CampingGrid({
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
  const group = useContext(DateScrollContext);
  const dateWidth = group?.dateWidth ?? DATE_WIDTH;
  const window = useContext(DateRenderWindowContext);
  const range = window ?? { first: 0, end: overview.horizon.nights.length };
  const today = campingDate(now);

  return (
    <View
      style={[
        styles.grid,
        { width: overview.horizon.nights.length * dateWidth, paddingLeft: range.first * dateWidth },
      ]}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {overview.horizon.nights.slice(range.first, range.end).map((date) => {
        const night = row && !headings
          ? currentNight(row, date, overview.maxObservationAgeSeconds, now)
          : undefined;
        return (
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
                      numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  style={{ fontSize: 12, color: colors.textMuted }}
                >
                  {date === today
                    ? 'Today'
                    : new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
                        weekday: 'short',
                        timeZone: 'UTC',
                      })}
                </Text>
                <Text
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
                mark={cellMark(night)}
                openCount={campingOpenCount(night)}
              />
            )}
          </View>
        );
      })}
    </View>
  );
});
/** Shared label width keeps every row aligned with the pinned date ruler. */
export function CampingTableHeader({
  overview,
  now,
}: {
  overview: CampingOverview;
  now: number;
}) {
  const { colors } = useTheme();
  const { offset, dateWidth, thumbnails, viewportWidth } = useContext(DateScrollContext)!;
  const [visibleColumns, setVisibleColumns] = useState({ first: 0, last: 0 });
  const count = overview.horizon.nights.length;
  // Only bridge date-column changes, never synchronize scrollers through JS.
  useAnimatedReaction(
    () => visibleCampingColumns(offset.get(), viewportWidth.get(), dateWidth, count),
    (columns, previous) => {
      if (columns.first !== previous?.first || columns.last !== previous?.last) {
        runOnJS(setVisibleColumns)(columns);
      }
    },
  );
  const month = campingVisibleMonthLabel(
    overview.horizon.nights[Math.min(visibleColumns.first, count - 1)],
    overview.horizon.nights[Math.min(visibleColumns.last, count - 1)],
  );
  return (
    <View
      style={[table.row, table.header, { backgroundColor: colors.bg, borderColor: colors.border }]}
      accessible
      accessibilityRole="header"
      accessibilityLabel={`${month.accessibilityLabel}. ${campingCoverageLabel(overview)}. Highlights mark Fridays and Saturdays.`}
    >
      <View style={[table.name, thumbnails && { width: '44%' }]}>
        <Text style={[table.month, { color: colors.text }]}>{month.label}</Text>
      </View>
      <DateScroller indicator>
        <CampingGrid overview={overview} now={now} headings />
      </DateScroller>
    </View>
  );
}

export const CampingTableRow = memo(function CampingTableRow({
  row,
  overview,
  now,
  onOpen,
}: {
  row: TrackedCampground;
  overview: CampingOverview;
  now: number;
  onOpen: (facilityId: string) => void;
}) {
  const { colors } = useTheme();
  const thumbnails = useContext(DateScrollContext)?.thumbnails ?? false;
  const stale = campingRowNeedsUpdate(row, overview, now);
  const onPress = useCallback(() => onOpen(row.facilityId), [onOpen, row.facilityId]);
  return (
    <View style={[table.row, table.item, { borderColor: colors.border }]}>
      <Pressable
        style={({ pressed }) => [
          table.name,
          { opacity: pressed ? 0.6 : 1 },
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
            <Text style={{ fontSize: 12, color: colors.textMuted }}>
              Needs update
            </Text>
          ) : null}
        </View>
      </Pressable>
      <DateScroller onPress={onPress}>
        <CampingGrid row={row} overview={overview} now={now} />
      </DateScroller>
    </View>
  );
});

const table = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  header: { minHeight: 44, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  month: { fontFamily: fonts.semibold, fontSize: 13 },
  item: {
    minHeight: 48,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: { width: '32%', flexShrink: 0 },
});
const styles = StyleSheet.create({
  scrollTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3 },
  scrollThumb: { height: 3, borderRadius: 2 },
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
  count: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 13, fontVariant: ['tabular-nums'] },
  dash: { height: 2, width: '75%' },
  unknownDash: { height: 1, width: '50%' },
  date: { fontSize: 12, fontFamily: fonts.mono },
});
