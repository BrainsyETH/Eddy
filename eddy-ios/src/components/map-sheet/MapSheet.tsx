// eddy-ios/src/components/map-sheet/MapSheet.tsx
// The draggable shell. Knows about detents, gestures and safe areas, and
// nothing whatsoever about pins — what it shows is entirely `children`, which
// is what lets the same sheet carry an access point, a gauge, a dam or a river.
//
// ── It moves by TRANSFORM, never by height ────────────────────────────────
// The website's two sheets animate `height`, because in CSS that is cheap. In
// React Native it forces a layout pass every frame, on the heaviest screen in
// the app. So the container is laid out ONCE at its full height and slid up and
// down with translateY, which is a transform the compositor can run on the UI
// thread without touching layout at all.
//
// ── Nothing per-frame crosses into React ──────────────────────────────────
// `translateY` is a shared value written on the UI thread. React only ever
// hears about the detent the sheet SETTLED on, once, through runOnJS.
//
// ── The detent is state, and it does not reset when the content changes ───
// It used to. The snap effect depended on the whole detents object, which is
// derived from the measured content height — so a sheet the reader had dragged
// open collapsed the moment the detail request landed or they swiped to a taller
// tab. A new SELECTION resets the sheet; new content does not.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GestureType } from 'react-native-gesture-handler';
import { useTheme } from '@/theme/ThemeProvider';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  applyRubberBand,
  CONTENT_BOTTOM_PAD,
  DRAG_DEAD_ZONE,
  GRABBER_BLOCK,
  pageBudget,
  REDUCED_SETTLE,
  resolveDetents,
  SETTLE_SPRING,
  settleTarget,
  type Detent,
} from './sheetGeometry';
import { SheetScrollContext } from './sheetScroll';

interface Props {
  /**
   * Identity of what is being shown. When it changes the sheet returns to its
   * smallest detent — a new selection is a new question, and inheriting the
   * previous one's height would answer it before it was asked. rail.tsx:219.
   *
   * THE ONLY THING THAT RESETS THE SHEET. See the header.
   */
  resetKey: string;
  onClose: () => void;
  /**
   * Fired on SETTLE only, never during a drag. The map reads this to decide how
   * much bottom padding its camera needs; a per-frame version would re-render
   * the map screen sixty times a second for no benefit.
   */
  onDetentChange?: (detent: Detent, height: number) => void;
  /**
   * What a GLANCE shows, and the thing peek is measured against.
   *
   * Kept a separate slot rather than the first part of children so the split is
   * declared rather than inferred from a pixel count. Whatever goes here is
   * what the sheet is at rest: an identity, the one fact that decides whether
   * you care, and the action you would take. Tabs, chips and detail belong
   * below it — they are what dragging is FOR, and a sheet that already shows
   * them at rest has spent the gesture before the reader made it.
   */
  peek: React.ReactNode;
  /** Absent for a sheet that is all glance — a hazard, an outfitter. */
  children?: React.ReactNode;
}

export function MapSheet({ resetKey, onClose, onDetentChange, peek, children }: Props) {
  const { colors, elevation } = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  // Measured rather than assumed: the sheet lives inside the map's overlay
  // stack, not the window, and the two differ by the tab bar and both insets.
  const [available, setAvailable] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [peekHeight, setPeekHeight] = useState(0);
  const [detent, setDetent] = useState<Detent>('peek');

  // The grabber is added back on because the sheet has to be tall enough for
  // BOTH: it sits inside the card and outside the measured content, so a
  // detent sized to the content alone clipped its last 16pt at every height,
  // including the tallest.
  const detents = useMemo(
    () =>
      resolveDetents(
        available,
        contentHeight > 0 ? contentHeight + GRABBER_BLOCK : 0,
        peekHeight,
      ),
    [available, contentHeight, peekHeight],
  );

  // translateY is the DISTANCE THE SHEET IS PUSHED DOWN from fully open, so 0
  // means "occupying the whole available height". Height is therefore
  // `available - translateY`, which is the form every rule in sheetGeometry
  // is written against.
  const translateY = useSharedValue(0);
  const dragStart = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const entered = useSharedValue(false);

  // Handed to the pages so each can declare ITSELF simultaneous with this pan.
  // Nothing native ever enters the context this way — see sheetScroll.
  const panRef = useRef<GestureType | undefined>(undefined);

  const largest = detents.order[detents.order.length - 1];
  const largestHeight = detents.height[largest];
  const smallestHeight = detents.height[detents.order[0]];
  const atFull = detent === largest;

  const commit = useCallback(
    (next: Detent) => {
      setDetent(next);
      onDetentChange?.(next, detents.height[next]);
    },
    [detents, onDetentChange],
  );

  /**
   * Move without a finger.
   *
   * The pan worklet owns gesture releases. VoiceOver's adjustable actions run
   * on the JS thread, so they need the same visible settle and the same single
   * detent commit without pretending to be a gesture or inventing a velocity.
   */
  const settleTo = useCallback(
    (next: Detent) => {
      const target = detents.available - detents.height[next];
      translateY.value = reducedMotion
        ? withTiming(target, REDUCED_SETTLE)
        : withSpring(target, SETTLE_SPRING);
      commit(next);
    },
    [commit, detents, reducedMotion, translateY],
  );

  const hasExpansion = detents.order.length > 1;
  const onGrabberAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      const action = event.nativeEvent.actionName;
      if (action === 'escape') {
        onClose();
        return;
      }
      const index = detents.order.indexOf(detent);
      if (action === 'increment') {
        const next = detents.order[index + 1];
        if (next) settleTo(next);
        return;
      }
      if (action === 'decrement') {
        const next = detents.order[index - 1];
        if (next) settleTo(next);
        else onClose();
      }
    },
    [detent, detents.order, onClose, settleTo],
  );

  // ── A NEW SELECTION resets the sheet ────────────────────────────────────
  // Keyed on resetKey and nothing else. `available` is in the deps only
  // because the first measurement arrives after mount and the sheet cannot be
  // placed before it; once measured it does not change without a rotation.
  useEffect(() => {
    if (available <= 0) return;
    const smallest = detents.order[0];
    const target = detents.available - detents.height[smallest];
    // The pages this sheet is about to show are new ones (they are keyed by
    // resetKey), so nothing is scrolled. Saying so keeps the pan's hand-off
    // rule honest for the one frame before the first scroll event lands.
    scrollY.value = 0;
    if (!entered.value) {
      // First paint: start off-screen and rise, so it reads as arriving.
      translateY.value = detents.available;
      entered.value = true;
    }
    translateY.value = reducedMotion
      ? withTiming(target, REDUCED_SETTLE)
      : withSpring(target, SETTLE_SPRING);
    setDetent(smallest);
    onDetentChange?.(smallest, detents.height[smallest]);
    // detents is deliberately absent: it changes whenever the content is
    // remeasured, and re-running this would collapse a sheet the reader had
    // opened. See the file header.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, available, reducedMotion]);

  // ── New CONTENT keeps the reader where they are ─────────────────────────
  // The detent the reader chose survives, but the pixel height behind it may
  // have moved — a tab that measured taller, or detail that filled one out. So
  // the sheet follows its own detent to wherever that detent now is, rather
  // than snapping back to the smallest.
  useEffect(() => {
    if (available <= 0 || !entered.value) return;
    // A detent that no longer exists (content shrank) falls back to the tallest
    // one that does, which is the closest thing to where the reader was.
    const held = detents.order.includes(detent) ? detent : detents.order[detents.order.length - 1];
    const target = detents.available - detents.height[held];
    translateY.value = reducedMotion
      ? withTiming(target, REDUCED_SETTLE)
      : withTiming(target, { duration: 180 });
    if (held !== detent) commit(held);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detents, available, reducedMotion]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Below the dead zone this is a tap, and the buttons inside the sheet
        // must still get it. rail.tsx:230.
        .activeOffsetY([-DRAG_DEAD_ZONE, DRAG_DEAD_ZONE])
        // A horizontal drag belongs to the tab pager. Stating both axes means
        // the first gesture to cross its own threshold wins and the other
        // fails, with no diagonal ambiguity and no relation to declare.
        .failOffsetX([-12, 12])
        // Runs ALONGSIDE the content scroller rather than instead of it; the
        // worklet below decides which of the two a given frame belongs to.
        // The relation is declared on the SCROLLER instead — a page always
        // mounts after this exists, whereas this cannot name pages that do not
        // exist yet. See sheetScroll.panRef.
        .withRef(panRef as never)
        .onBegin(() => {
          'worklet';
          dragStart.value = translateY.value;
        })
        .onUpdate((event) => {
          'worklet';
          const notFull = translateY.value > detents.available - largestHeight + 0.5;
          const atTop = scrollY.value <= 0;
          // The content gets the drag only when it is open all the way AND has
          // somewhere left to go in that direction.
          const sheetTakesIt = notFull || (atTop && event.translationY > 0);
          if (!sheetTakesIt) {
            // RE-ANCHOR. Without this the sheet lurches by however far the
            // finger had already travelled the instant the scroller reaches
            // its top mid-gesture. rail.tsx:246.
            dragStart.value = translateY.value - event.translationY;
            return;
          }
          const raw = detents.available - (dragStart.value + event.translationY);
          translateY.value = detents.available - applyRubberBand(raw, largestHeight);
        })
        .onEnd((event) => {
          'worklet';
          const height = detents.available - translateY.value;
          const target = settleTarget(detents, height, event.velocityY);
          if (target === null) {
            translateY.value = reducedMotion
              ? withTiming(detents.available, REDUCED_SETTLE, () => runOnJS(onClose)())
              : withSpring(
                  detents.available,
                  { ...SETTLE_SPRING, velocity: event.velocityY },
                  () => runOnJS(onClose)(),
                );
            return;
          }
          const settled = detents.available - detents.height[target];
          translateY.value = reducedMotion
            ? withTiming(settled, REDUCED_SETTLE)
            : withSpring(settled, { ...SETTLE_SPRING, velocity: event.velocityY });
          runOnJS(commit)(target);
        }),
    [
      detents,
      largestHeight,
      reducedMotion,
      commit,
      onClose,
      dragStart,
      translateY,
      scrollY,
      panRef,
    ],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Only ever drawn once there is a detent tall enough to warrant it: at the
  // glance the map has to stay both visible AND tappable, because tapping a
  // different pin is how you change the selection. rail.tsx:139-142.
  const scrimStyle = useAnimatedStyle(() => {
    if (largestHeight <= smallestHeight) return { opacity: 0 };
    const height = detents.available - translateY.value;
    // To 1, not to a fraction: colors.scrim is ALREADY rgba(0,0,0,0.22), so
    // full opacity here is exactly the scrim every modal in the app uses.
    return {
      opacity: interpolate(height, [smallestHeight, largestHeight], [0, 1], Extrapolation.CLAMP),
    };
  });

  const onRootLayout = useCallback((event: LayoutChangeEvent) => {
    setAvailable(Math.round(event.nativeEvent.layout.height));
  }, []);

  const onContentLayout = useCallback((event: LayoutChangeEvent) => {
    setContentHeight(Math.round(event.nativeEvent.layout.height));
  }, []);

  // Includes the grabber row above it, because that is on screen at rest too.
  // GRABBER_BLOCK comes from sheetGeometry now rather than being restated here.
  const onPeekLayout = useCallback((event: LayoutChangeEvent) => {
    setPeekHeight(Math.round(event.nativeEvent.layout.height) + GRABBER_BLOCK);
  }, []);

  const budget = useMemo(() => pageBudget(available, insets.bottom), [available, insets.bottom]);

  const scrollContext = useMemo(
    () => ({ scrollY, panRef, detent, atFull, pageBudget: budget, resetKey }),
    [scrollY, panRef, detent, atFull, budget, resetKey],
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" onLayout={onRootLayout}>
      {/* Not a Pressable: at every detent this sheet offers, tapping the map
          behind it should reach the MAP — selecting another pin, panning — and
          a scrim that swallowed those taps would turn the glance into a modal.
          It is a tint, and nothing else. */}
      <Animated.View
        style={[styles.scrim, scrimStyle, { backgroundColor: colors.scrim }]}
        pointerEvents="none"
      />

      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            styles.sheet,
            { height: available, backgroundColor: colors.card },
            elevation(2),
            sheetStyle,
          ]}
        >
          {/* The whole card is the drag surface, which is the Maps contract —
              you should not have to find a handle to move a sheet. The grabber
              is the AFFORDANCE for that, not the only way in. */}
          <View
            style={styles.grabberRow}
            accessible={hasExpansion}
            accessibilityRole={hasExpansion ? 'adjustable' : undefined}
            accessibilityLabel={hasExpansion ? 'Map details sheet' : undefined}
            accessibilityHint={
              hasExpansion ? 'Swipe up or down to expand or collapse the sheet' : undefined
            }
            accessibilityValue={
              hasExpansion
                ? {
                    text:
                      detent === 'peek'
                        ? 'Collapsed'
                        : detent === 'half'
                          ? 'Half expanded'
                          : 'Fully expanded',
                  }
                : undefined
            }
            accessibilityActions={
              hasExpansion
                ? [
                    { name: 'increment', label: 'Expand' },
                    { name: 'decrement', label: 'Collapse' },
                    { name: 'escape', label: 'Close' },
                  ]
                : undefined
            }
            onAccessibilityAction={onGrabberAccessibilityAction}
          >
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          </View>

          <SheetScrollContext.Provider value={scrollContext}>
            <View
              onLayout={onContentLayout}
              style={{ paddingBottom: insets.bottom + CONTENT_BOTTOM_PAD }}
            >
              <View onLayout={onPeekLayout}>{peek}</View>
              {children}
            </View>
          </SheetScrollContext.Provider>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  // 8 + 4 + 4 = GRABBER_BLOCK. Change one and change the other: the detent
  // heights and the page budget are both sized around that constant.
  grabberRow: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  // 36x4 with a full radius, matching MapLayersSheet — the app already has a
  // grabber and a second dialect of the same control would read as a different
  // kind of sheet.
  grabber: { width: 36, height: 4, borderRadius: 999 },
});
