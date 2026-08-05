// eddy-ios/src/components/map-sheet/SheetPager.tsx
// Horizontally paged tab content, and the shared value that both it and the tab
// bar are driven by.
//
// ── Why this is a Pan gesture and not a paging ScrollView ─────────────────
// A ScrollView with pagingEnabled is simpler and gives momentum and bounce for
// free. It loses on the one point that decides it here: this pager sits INSIDE
// a vertically-dragged sheet, and each page holds its own vertical
// scroller. That is three nested native recognisers with no priority
// API between them, and iOS resolves a slightly-diagonal drag by handing it to
// the horizontal scroller — which is exactly the failure src/components/
// SwipeRow.tsx documents about rows inside a FlatList.
//
// With Gesture.Pan the priority is STATED: this claims the gesture only once
// horizontal travel crosses its threshold, and fails outright the moment
// vertical travel crosses the sheet's. The two thresholds are mirror images, so
// the first axis to move wins and the other stands down — no relation to
// declare, no diagonal ambiguity.
//
// ── `progress` is the single source of truth ──────────────────────────────
// Both a drag and a tab TAP write the same shared value, so the indicator
// tracks a finger and animates on a tap through one code path rather than two
// that have to be kept looking alike.
import { useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';
import { useSheetScroll } from './sheetScroll';
import Animated, {
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/** Horizontal travel that claims the gesture for the pager. */
const ACTIVATE_X = 12;
/** Vertical travel that hands it to the sheet instead. */
const FAIL_Y = 8;
/** Past this, a flick turns the page regardless of how far it travelled. */
const PAGE_FLICK_VELOCITY = 450;
/** Resistance either side of the first and last page. */
const EDGE_RUBBER_BAND = 0.3;

const PAGE_SPRING = { damping: 26, stiffness: 220, mass: 0.8 } as const;
const TAP_TIMING = { duration: 240 } as const;

interface Props {
  /** How many pages. Reads better at the call site than children.length. */
  count: number;
  index: number;
  onIndexChange: (index: number) => void;
  /** 0..count-1, continuous. The tab bar's indicator interpolates over this. */
  progress: SharedValue<number>;
  width: number;
  /** One element per page, already in tab order. */
  children: React.ReactNode[];
  /**
   * A stable id per page, in tab order.
   *
   * Pages are keyed by these and NOT by position. The tab set grows while the
   * sheet is open and the order is fixed, so a late arrival inserts rather
   * than appends — Camping moves from 1 to 3 when Conditions and Floats
   * qualify. Keyed by index, the scroller that had been Camping's would stay
   * mounted and become Details', carrying Camping's native scroll offset with
   * it.
   */
  pageKeys: string[];
  /**
   * How much room the sheet's chrome — its header and tab bar — already takes.
   * Subtracted from the page budget to cap a page, so a long one scrolls
   * instead of running off the bottom of the screen.
   */
  chromeHeight: number;
}

export function SheetPager({
  count,
  index,
  onIndexChange,
  progress,
  width,
  children,
  pageKeys,
  chromeHeight,
}: Props) {
  const reducedMotion = useReducedMotion();
  const sheet = useSheetScroll();
  const translateX = useSharedValue(0);
  const dragStart = useSharedValue(0);

  // A tap on the tab bar, or a tab set that shrank under the active index.
  // Not driven from the gesture — that settles itself and reports afterwards.
  useEffect(() => {
    const target = -index * width;
    if (width <= 0) return;
    translateX.value = reducedMotion
      ? withTiming(target, { duration: 0 })
      : withTiming(target, TAP_TIMING);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, width, reducedMotion]);

  // Kept in step with the transform every frame, on the UI thread. The tab bar
  // reads this and nothing else, so it cannot fall out of sync with the pages.
  // useDerivedValue rather than a style hook doing it as a side effect: this is
  // a value that follows another value, which is exactly what it is for.
  useDerivedValue(() => {
    progress.value = width > 0 ? -translateX.value / width : 0;
  });

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-ACTIVATE_X, ACTIVATE_X])
        .failOffsetY([-FAIL_Y, FAIL_Y])
        .onBegin(() => {
          'worklet';
          dragStart.value = translateX.value;
        })
        .onUpdate((event) => {
          'worklet';
          const raw = dragStart.value + event.translationX;
          const min = -(count - 1) * width;
          // Resisted past either end, so the pager admits it has run out of
          // pages rather than silently refusing to move.
          if (raw > 0) translateX.value = raw * EDGE_RUBBER_BAND;
          else if (raw < min) translateX.value = min + (raw - min) * EDGE_RUBBER_BAND;
          else translateX.value = raw;
        })
        .onEnd((event) => {
          'worklet';
          if (width <= 0) return;
          const current = -translateX.value / width;
          let next = Math.round(current);
          // A flick moves exactly one page: a deliberate throw should turn the
          // page it was aimed at, not skid across three.
          if (event.velocityX <= -PAGE_FLICK_VELOCITY) next = Math.ceil(current);
          else if (event.velocityX >= PAGE_FLICK_VELOCITY) next = Math.floor(current);
          next = Math.min(count - 1, Math.max(0, next));

          const target = -next * width;
          translateX.value = reducedMotion
            ? withTiming(target, { duration: 0 })
            : withSpring(target, { ...PAGE_SPRING, velocity: event.velocityX });
          runOnJS(onIndexChange)(next);
        }),
    [count, width, reducedMotion, onIndexChange, dragStart, translateX],
  );

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // maxHeight, not height: a SHORT page keeps its natural size, which is what
  // lets the sheet still measure it and offer one detent instead of a tall
  // mostly-empty card. Only a page with more to say than fits gets capped and
  // scrolls.
  const pageMaxHeight = Math.max(120, (sheet?.pageBudget ?? 0) - chromeHeight);

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.track, { width: width * count }, trackStyle]}>
        {children.map((page, i) => (
          // Keyed by the TAB and by the SELECTION, never by position. See the
          // pageKeys prop for the first; the second is because two access
          // points share tab keys, so without it a new pin inherits the last
          // one's scrollers — and a native scroll offset outlives a re-render.
          <SheetPage
            key={`${sheet?.resetKey ?? ''}:${pageKeys[i] ?? i}`}
            active={i === index}
            width={width}
            maxHeight={pageMaxHeight}
            panRef={sheet?.panRef}
            published={sheet?.scrollY ?? null}
            // Only at the tallest detent. Below it a vertical drag is how you
            // OPEN the sheet, and a scroller that ate it would strand the
            // reader at the glance.
            scrollEnabled={sheet?.atFull ?? false}
          >
            {page}
          </SheetPage>
        ))}
      </Animated.View>
    </GestureDetector>
  );
}

interface PageProps {
  /** Whether this is the page in front. Only that one publishes its offset. */
  active: boolean;
  width: number;
  maxHeight: number;
  panRef: SheetPagerPanRef;
  /** The sheet's shared offset, or null when a page is rendered outside one. */
  published: SharedValue<number> | null;
  scrollEnabled: boolean;
  children: React.ReactNode;
}

type SheetPagerPanRef = React.MutableRefObject<GestureType | undefined> | undefined;

/**
 * One tab's scroller.
 *
 * ── Why each page owns its own handler ────────────────────────────────────
 * The pager used to build ONE useAnimatedScrollHandler and hand the same
 * WorkletEventHandler to every page. That is a supported-but-fragile shape in
 * Reanimated — one handler object registering itself against N view tags — and
 * more importantly it made every page write to the sheet's single offset
 * whether or not it was the page being touched. See SheetScroll.scrollY for
 * what that broke.
 *
 * ── Why a Native gesture and not `simultaneousHandlers` ───────────────────
 * The scroller has to run ALONGSIDE the sheet's pan rather than instead of it,
 * or the sheet could not be pulled shut from a page scrolled to its top. The
 * previous spelling of that was RNGH's own ScrollView (the only one taking a
 * `simultaneousHandlers` prop) wrapped in Animated.createAnimatedComponent —
 * an old-API native-view handler with Reanimated's animated-component
 * machinery stacked on top of it. Gesture.Native() states the same
 * relationship through the API the sheet's own pan already uses, and lets the
 * page go back to Reanimated's ScrollView, which is the component
 * useAnimatedScrollHandler is built for.
 */
function SheetPage({
  active,
  width,
  maxHeight,
  panRef,
  published,
  scrollEnabled,
  children,
}: PageProps) {
  // This page's OWN offset, kept whether or not it is the one in front, so
  // that becoming the front page can republish the truth about this page
  // rather than leaving the last page's number standing.
  const offset = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler(
    (event) => {
      'worklet';
      offset.value = event.contentOffset.y;
      if (active && published) published.value = event.contentOffset.y;
    },
    [active, offset, published],
  );

  useEffect(() => {
    if (active && published) published.value = offset.value;
  }, [active, published, offset]);

  const native = useMemo(
    () => (panRef ? Gesture.Native().simultaneousWithExternalGesture(panRef) : Gesture.Native()),
    [panRef],
  );

  return (
    <GestureDetector gesture={native}>
      <Animated.ScrollView
        style={{ width, maxHeight }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        scrollEnabled={scrollEnabled}
        // iOS rubber-band drives contentOffset.y negative, which makes "at the
        // top" ambiguous exactly when the hand-off to the sheet has to be
        // crisp. The sheet supplies the rubber band instead.
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </Animated.ScrollView>
    </GestureDetector>
  );
}

/**
 * Which pages are worth rendering for a given index.
 *
 * The neighbour either side, so a swipe reveals content rather than a blank.
 *
 * NO MEMORY of where you have been, deliberately. A version that kept every
 * visited page mounted would preserve per-tab scroll position — but it needs
 * state that survives renders, and the honest options were a ref written during
 * render (which the compiler lint rejects, correctly) or state written in an
 * effect (which paints one frame short after every swipe).
 *
 * What it costs, now that pages DO scroll: a page keeps its offset while it is
 * mounted — itself and either neighbour — and starts at the top again if the
 * reader wanders two tabs away and back. Every access tab reads from one
 * response already in memory, so nothing is refetched; only the place in a long
 * Details tab is lost, and only after passing two other tabs. That is the
 * moment to pay for the state if it ever reads as a regression.
 */
export function mountedPages(index: number, count: number): (i: number) => boolean {
  return (i) => i >= index - 1 && i <= index + 1 && i >= 0 && i < count;
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row' },
});
