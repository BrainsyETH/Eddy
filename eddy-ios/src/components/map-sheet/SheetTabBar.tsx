// eddy-ios/src/components/map-sheet/SheetTabBar.tsx
// The tab row, and the underline that follows your thumb.
//
// ── Why not ScopeSwitch ───────────────────────────────────────────────────
// src/components/ScopeSwitch.tsx is the app's segmented control and its header
// argues precisely this relationship: exactly one is live, they are not
// composable with each other, and everything below belongs to whichever is
// chosen. It is still the wrong control here, for three reasons.
//
//   THE INDICATOR HAS TO TRACK A DRAG. A filled pill cannot sit half way
//   between two segments without looking broken; an underline can, and a
//   swipe that moves the pages without moving the indicator is the thing this
//   whole file exists to avoid.
//
//   THE LABELS DO NOT FIT AT flex: 1. An access point can carry five, and on
//   a 375pt screen five equal segments are ~69pt each while "Conditions" at
//   the 14pt floor this screen uses (typography.ts, and the note about outdoor
//   legibility in the map screen) is wider than that on its own. Underline
//   tabs size to their label; segments cannot. They still overflow a narrow
//   phone, which is why the row scrolls — see below.
//
//   IT IS memo'd OVER PLAIN PROPS, with nowhere to take a SharedValue.
//
// What IS taken from it, deliberately and verbatim, is the contract: the
// accessibility roles, and the active/inactive ink and weight. A tab bar that
// announced itself differently from the app's other one-of-many control would
// be a second dialect for no gain.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { haptics } from '@/theme/haptics';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { fonts, type as t } from '@/theme/typography';

/**
 * The inset the scrolled content carries, so the first and last tab clear the
 * edges. A tab's measured x is relative to the row INSIDE that inset, so
 * anything working in scroll-offset coordinates has to add it back.
 */
const EDGE_INSET = 16;

interface Props {
  labels: string[];
  index: number;
  onSelect: (index: number) => void;
  /** Written by SheetPager every frame. 0..labels.length-1, continuous. */
  progress: SharedValue<number>;
}

export function SheetTabBar({ labels, index, onSelect, progress }: Props) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  // Measured, because the labels differ in width and the whole point of an
  // underline is that it is as wide as the word it underlines.
  const [spans, setSpans] = useState<{ x: number; width: number }[]>([]);
  const scroller = useRef<ScrollView>(null);
  const [viewport, setViewport] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);

  const onTabLayout = useCallback((i: number) => (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    setSpans((prev) => {
      const existing = prev[i];
      if (existing && existing.x === x && existing.width === width) return prev;
      const next = [...prev];
      next[i] = { x, width };
      return next;
    });
  }, []);

  // `labels.every`, not `spans.every`: setting next[2] on a one-element array
  // leaves a HOLE at index 1, and Array.prototype.every skips holes — so a row
  // whose tabs laid out back to front read as measured while one span was still
  // undefined, and the interpolation below reached into it.
  const measured =
    labels.length > 0 && spans.length === labels.length && labels.every((_, i) => Boolean(spans[i]));

  // Built here rather than inside the worklet. Three reasons, in order: the
  // worklet then captures plain number arrays instead of re-deriving them sixty
  // times a second; nothing sparse can reach it; and it keeps the interpolation
  // itself to one line.
  const ranges = useMemo(() => {
    if (!measured) return null;
    return {
      input: labels.map((_, i) => i),
      widths: labels.map((_, i) => spans[i].width),
      offsets: labels.map((_, i) => spans[i].x),
    };
  }, [measured, labels, spans]);

  // ── Keep the selected tab on screen ─────────────────────────────────────
  // The row scrolls, and a swipe of the PAGER moves the selection without
  // touching the row — so on a narrow phone the tab you had just swiped to,
  // and its underline, could sit entirely off the right edge. Centred rather
  // than merely revealed: at the edges the clamp turns centring back into
  // revealing, and in the middle it shows what is on either side of where you
  // are, which is the thing a tab strip is for.
  useEffect(() => {
    if (!ranges || viewport <= 0 || contentWidth <= viewport) return;
    const centre = EDGE_INSET + ranges.offsets[index] + ranges.widths[index] / 2;
    const target = Math.max(0, Math.min(centre - viewport / 2, contentWidth - viewport));
    scroller.current?.scrollTo({ x: target, animated: !reducedMotion });
  }, [index, ranges, viewport, contentWidth, reducedMotion]);

  // Whether the row is wider than the space it has. Read off the SAME two
  // measurements the centring uses, rather than a third derived from label
  // widths — one source, and it already accounts for the reader's type size.
  const overflows = viewport > 0 && contentWidth > viewport + 1;

  const indicatorStyle = useAnimatedStyle(() => {
    // One key set on every path. A style worklet that sometimes returns
    // `{ opacity }` and sometimes three properties leaves the two it dropped
    // at whatever the last frame set them to.
    if (!ranges) return { opacity: 0, width: 0, transform: [{ translateX: 0 }] };
    if (ranges.input.length < 2) {
      // interpolate needs two points to have a direction. A single tab has no
      // travel to describe, and PinSheet renders the plain callout rather than
      // a one-tab bar — but the bar should not be the thing that proves it.
      return { opacity: 1, width: ranges.widths[0], transform: [{ translateX: ranges.offsets[0] }] };
    }
    return {
      opacity: 1,
      width: interpolate(progress.value, ranges.input, ranges.widths),
      transform: [{ translateX: interpolate(progress.value, ranges.input, ranges.offsets) }],
    };
  });

  return (
    <View style={styles.bar}>
      {/* ── Scrollable, because five tabs do not fit ────────────────────────
          An access point can carry Overview, Conditions, Float trips, Camping
          and Details. At the 14pt floor this screen uses those labels are
          ~280pt of text before the gaps, and a 320pt phone has 288pt of usable
          width — so the last tab or two were simply clipped off the edge with
          nothing to say they were there.

          A horizontal ScrollView rather than shrinking the labels, because
          "Conditions" abbreviated is not a word. It sits ABOVE the pager as a
          sibling, not inside it, so its native scroll never competes with the
          pager's pan; and the sheet's own pan fails on horizontal travel, so
          it does not compete there either.

          The indicator lives INSIDE the scrolled content, so it travels with
          the tabs it is measuring rather than sliding off its own labels. */}
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        // A row that fits should not be able to drift sideways.
        alwaysBounceHorizontal={false}
        onLayout={(event) => setViewport(event.nativeEvent.layout.width)}
        onContentSizeChange={(w) => setContentWidth(w)}
      >
        <View style={styles.row}>
        {labels.map((label, i) => {
          const active = i === index;
          return (
            <Pressable
              key={label}
              onPress={() => {
                haptics.selection();
                onSelect(i);
              }}
              onLayout={onTabLayout(i)}
              style={styles.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[
                  styles.label,
                  {
                    color: active ? colors.selectionText : colors.textMuted,
                    fontFamily: active ? fonts.semibold : fonts.medium,
                  },
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
        </View>
        {/* Absolutely positioned so its width can be animated without the row
            re-laying out under it forty times a second. */}
        <Animated.View
          style={[styles.indicator, { backgroundColor: colors.interactive }, indicatorStyle]}
          pointerEvents="none"
        />
      </ScrollView>
      {/* ── The edge fade ─────────────────────────────────────────────────
          A scrollable row that ends flush at the screen edge looks like a row
          that ends. Bleeding the card colour over the last few points says
          there is more without spending a chevron on it.

          Drawn with react-native-svg, which is already a dependency — the app
          carries no gradient library and this is not worth adding one for.
          Shown only when the labels actually overflow: a fade over a row with
          nothing behind it is a promise of tabs that do not exist. */}
      {overflows ? (
        <Svg style={styles.fade} width={FADE_WIDTH} height="100%" pointerEvents="none">
          <Defs>
            <LinearGradient id="tabFade" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={colors.card} stopOpacity="0" />
              <Stop offset="1" stopColor={colors.card} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={FADE_WIDTH} height="100%" fill="url(#tabFade)" />
        </Svg>
      ) : null}
      <View style={[styles.rule, { backgroundColor: colors.border }]} pointerEvents="none" />
    </View>
  );
}

const FADE_WIDTH = 24;

const styles = StyleSheet.create({
  bar: { marginTop: 4 },
  fade: { position: 'absolute', right: 0, top: 0, bottom: 0 },
  // Padding lives on the content, so the first and last tab clear the edges
  // while the scrollable area itself still spans the full width. EDGE_INSET is
  // the same number, named for the reveal maths above.
  scrollContent: { paddingHorizontal: EDGE_INSET },
  row: { flexDirection: 'row', gap: 18 },
  // No flex: 1 — a tab is as wide as its label. Combined with the scroller
  // above, that is what lets five of them exist without abbreviating one.
  tab: { paddingVertical: 9, minHeight: 44, justifyContent: 'center' },
  label: { ...t.sm },
  // left: 0, NOT 16. Yoga positions an absolute child against its parent's
  // content box, and scrollContent already carries the 16pt inset — so the
  // indicator inherits it. Each tab's measured x is relative to the row inside
  // that same box, which is exactly what translateX consumes. Adding the inset
  // here too would slide every underline 16pt right of its own label.
  indicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 2,
    borderRadius: 999,
  },
  // Under the indicator, so the active tab reads as lifted off a continuous
  // line rather than as one of four disconnected marks.
  rule: { position: 'absolute', bottom: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth },
});
