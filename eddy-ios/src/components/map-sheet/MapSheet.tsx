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
// The consequence to know about: the content is always laid out for the full
// height, and at `peek` most of it is simply below the fold. Anything inside
// must therefore be cheap to render even when unseen — which is why tabs will
// mount lazily rather than all at once.
//
// ── Nothing per-frame crosses into React ──────────────────────────────────
// `translateY` is a shared value written on the UI thread. React only ever
// hears about the detent the sheet SETTLED on, once, through runOnJS. Writing
// this as an effect on the shared value would both defeat that and trip
// react-hooks/set-state-in-effect.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
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
import { useTheme } from '@/theme/ThemeProvider';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  applyRubberBand,
  DRAG_DEAD_ZONE,
  REDUCED_SETTLE,
  resolveDetents,
  SETTLE_SPRING,
  settleTarget,
  type Detent,
} from './sheetGeometry';

interface Props {
  /**
   * Identity of what is being shown. When it changes the sheet returns to its
   * smallest detent — a new selection is a new question, and inheriting the
   * previous one's height would answer it before it was asked. rail.tsx:219.
   */
  resetKey: string;
  onClose: () => void;
  /**
   * Fired on SETTLE only, never during a drag. The map reads this to decide how
   * much bottom padding its camera needs; a per-frame version would re-render
   * the map screen sixty times a second for no benefit.
   */
  onDetentChange?: (detent: Detent, height: number) => void;
  children: React.ReactNode;
}

export function MapSheet({ resetKey, onClose, onDetentChange, children }: Props) {
  const { colors, elevation } = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  // Measured rather than assumed: the sheet lives inside the map's overlay
  // stack, not the window, and the two differ by the tab bar and both insets.
  const [available, setAvailable] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  const detents = useMemo(
    () => resolveDetents(available, contentHeight),
    [available, contentHeight],
  );

  // translateY is the DISTANCE THE SHEET IS PUSHED DOWN from fully open, so 0
  // means "occupying the whole available height". Height is therefore
  // `available - translateY`, which is the form every rule in sheetGeometry
  // is written against.
  const translateY = useSharedValue(0);
  const dragStart = useSharedValue(0);
  const ready = useSharedValue(false);

  const settle = useCallback(
    (detent: Detent, velocity: number) => {
      'worklet';
      const target = detents.available - detents.height[detent];
      translateY.value = reducedMotion
        ? withTiming(target, REDUCED_SETTLE)
        : withSpring(target, { ...SETTLE_SPRING, velocity });
    },
    [detents, reducedMotion, translateY],
  );

  const commit = useCallback(
    (detent: Detent) => {
      onDetentChange?.(detent, detents.height[detent]);
    },
    [detents, onDetentChange],
  );

  // Entry, and the reset a new selection asks for. Deliberately an effect on
  // resetKey/geometry rather than on the shared value — see the file header.
  useEffect(() => {
    if (available <= 0) return;
    const smallest = detents.order[0];
    const target = detents.available - detents.height[smallest];
    if (!ready.value) {
      // First paint for this sheet: start fully off-screen and rise, so it
      // reads as arriving rather than as having always been there.
      translateY.value = detents.available;
      ready.value = true;
    }
    translateY.value = reducedMotion
      ? withTiming(target, REDUCED_SETTLE)
      : withSpring(target, SETTLE_SPRING);
    onDetentChange?.(smallest, detents.height[smallest]);
    // `commit` is intentionally not a dependency: it changes identity whenever
    // the caller re-renders, and re-running this would re-snap a sheet the user
    // had dragged open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, available, detents, reducedMotion]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Below the dead zone this is a tap, and the buttons inside the sheet
        // must still get it. rail.tsx:230.
        .activeOffsetY([-DRAG_DEAD_ZONE, DRAG_DEAD_ZONE])
        // A horizontal drag belongs to whatever is inside — the tab pager, once
        // there is one. Stating both axes means the first gesture to cross its
        // own threshold wins and the other fails, with no diagonal ambiguity
        // and no explicit relation to declare.
        .failOffsetX([-12, 12])
        .onBegin(() => {
          'worklet';
          dragStart.value = translateY.value;
        })
        .onUpdate((event) => {
          'worklet';
          const largest = detents.height[detents.order[detents.order.length - 1]];
          const raw = detents.available - (dragStart.value + event.translationY);
          translateY.value = detents.available - applyRubberBand(raw, largest);
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
          settle(target, event.velocityY);
          runOnJS(commit)(target);
        }),
    [detents, reducedMotion, settle, commit, onClose, dragStart, translateY],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Only ever drawn once there is a detent tall enough to warrant it: at the
  // glance the map has to stay both visible AND tappable, because tapping a
  // different pin is how you change the selection. rail.tsx:139-142.
  const largestHeight = detents.height[detents.order[detents.order.length - 1]];
  const smallestHeight = detents.height[detents.order[0]];
  const scrimStyle = useAnimatedStyle(() => {
    if (largestHeight <= smallestHeight) return { opacity: 0 };
    const height = detents.available - translateY.value;
    // To 1, not to a fraction: colors.scrim is ALREADY rgba(0,0,0,0.22), so
    // full opacity here is exactly the scrim every modal in the app uses.
    // Interpolating to 0.32 would have landed on an effective 0.07 — a tint so
    // faint it would read as a rendering bug rather than as a deliberate dim.
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
          <View style={styles.grabberRow}>
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          </View>

          <View onLayout={onContentLayout} style={{ paddingBottom: insets.bottom + 12 }}>
            {children}
          </View>
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
  grabberRow: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  // 36x4 with a full radius, matching MapLayersSheet — the app already has a
  // grabber and a second dialect of the same control would read as a different
  // kind of sheet.
  grabber: { width: 36, height: 4, borderRadius: 999 },
});
