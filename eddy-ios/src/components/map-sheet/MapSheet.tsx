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
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
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
  /**
   * What this sheet is about, for VoiceOver.
   *
   * The grabber is the control that resizes the sheet, and "adjustable" alone
   * announces as a slider with no subject. The name of the place is what makes
   * "Currently half open" mean something, so it is required rather than
   * defaulted to a generic word.
   */
  label: string;
  /**
   * Where the sheet is RIGHT NOW, written every frame on the UI thread.
   *
   * The companion to onDetentChange rather than a replacement for it, and the
   * split is the point. Anything that must not run per frame — the Mapbox
   * camera, the ornament positions, a React layout — reads the settled detent.
   * Anything that should follow a finger reads this, in its own worklet,
   * without waking React at all.
   *
   * `available` rides along because a consumer cannot otherwise tell how much
   * map is left above the sheet, and the sheet is the only thing that measured
   * it. Both in one value so they can never be read a frame apart.
   */
  metrics?: SharedValue<SheetMetrics>;
}

/** What a sheet publishes about itself every frame. See MapSheet.metrics. */
export interface SheetMetrics {
  /** Points of screen the sheet currently occupies, from the bottom up. */
  height: number;
  /** The whole band the sheet may occupy — the map area, as measured. */
  available: number;
}

/** How each resting place is announced. Words, not fractions. */
const DETENT_VALUE: Record<Detent, string> = {
  peek: 'Collapsed',
  half: 'Half open',
  full: 'Expanded',
};

export function MapSheet({
  resetKey,
  onClose,
  onDetentChange,
  peek,
  children,
  label,
  metrics,
}: Props) {
  const { colors, elevation } = useTheme();
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
  // No children means the peek slot is the whole sheet — the single-page
  // callout — and its measured height is then a fact about the content rather
  // than an authored glance. resolveDetents needs to know which it is being
  // handed; see its `wholeContentIsPeek`.
  const glanceOnly = children == null;

  /**
   * The air under the last row of the peek — the SAME expression the content
   * column pads with, deliberately.
   *
   * ── The peek had none, and it clipped its own primary button ────────────
   * The column's paddingBottom sits below `children`, which at the peek detent
   * is hundreds of points under the fold and therefore contributes nothing. So
   * the peek detent resolved to exactly grabber + peek subtree, putting the last
   * row — "Use as put-in", the one action the glance exists to offer — flush
   * against the card's bottom edge, which is the tab bar's top edge.
   *
   * Mirroring the column's expression rather than picking a number is what keeps
   * the peek and the tallest detent from disagreeing about how much air the
   * sheet owes its content.
   *
   * NO SAFE-AREA INSET. This read `insets.bottom + CONTENT_BOTTOM_PAD` while the
   * rest of this comment argued that the tab navigator had already consumed the
   * inset "so in practice this is CONTENT_BOTTOM_PAD alone" — a sum and a claim
   * that cannot both be right. useSafeAreaInsets() reports the WINDOW's inset
   * and a tab bar sitting in that band does not zero it, so on a home-indicator
   * phone this was 34pt over. `available` is measured from the map's overlay
   * stack, which already excludes the tab bar and both insets (see above), so
   * the sheet cannot reach the home indicator and owes it no clearance.
   */
  const peekBottomPad = CONTENT_BOTTOM_PAD;

  const detents = useMemo(
    () =>
      resolveDetents(
        available,
        contentHeight > 0 ? contentHeight + GRABBER_BLOCK : 0,
        peekHeight > 0 ? peekHeight + peekBottomPad : 0,
        glanceOnly,
      ),
    [available, contentHeight, peekHeight, peekBottomPad, glanceOnly],
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

  /* ── The same two moves, without a finger ─────────────────────────────────
     Everything above is driven by a pan, which VoiceOver never produces: it
     replaces direct manipulation with a role and a set of actions, so a sheet
     whose only way to change size is a drag is a sheet that cannot be opened at
     all with the screen reader on. The grabber becomes that control, and these
     are what it does.

     They animate through the same spring the gesture settles with, and commit
     through the same `commit`, so an adjusted sheet is in exactly the state a
     dragged one would be — including for the map, which reads the settled
     detent to pad its camera and lift the Mapbox ornaments. */

  const settleTo = useCallback(
    (next: Detent) => {
      const target = detents.available - detents.height[next];
      translateY.value = reducedMotion
        ? withTiming(target, REDUCED_SETTLE)
        : withSpring(target, SETTLE_SPRING);
      commit(next);
    },
    [detents, reducedMotion, commit, translateY],
  );

  /** One detent up (+1) or down (-1). Silent at either end, like a slider. */
  const stepDetent = useCallback(
    (direction: 1 | -1) => {
      const at = detents.order.indexOf(detent);
      const next = detents.order[Math.max(0, at) + direction];
      if (next) settleTo(next);
    },
    [detent, detents, settleTo],
  );

  const dismiss = useCallback(() => {
    translateY.value = reducedMotion
      ? withTiming(detents.available, REDUCED_SETTLE, () => runOnJS(onClose)())
      : withSpring(detents.available, SETTLE_SPRING, () => runOnJS(onClose)());
  }, [detents, reducedMotion, onClose, translateY]);

  // A sheet whose content fits inside the glance has one resting place, so
  // there is nothing to adjust and announcing it as adjustable would promise a
  // gesture that does nothing. It can still be dismissed.
  const adjustable = detents.order.length > 1;

  // A value that follows another value, which is what useDerivedValue is for —
  // and it runs wherever translateY is written, so a drag, a spring and a
  // VoiceOver adjustment all publish through the same line. No runOnJS: nothing
  // here crosses into React, which is the whole reason this exists beside
  // onDetentChange rather than instead of it.
  useDerivedValue(() => {
    if (!metrics) return;
    metrics.value = {
      height: Math.max(0, detents.available - translateY.value),
      available: detents.available,
    };
  });

  /**
   * ── A SHEET THAT IS GONE OCCUPIES NOTHING, AND HAS TO SAY SO ────────────
   *
   * The line above only runs while this component is mounted, so an unmount
   * left the last height standing in a value whose whole meaning is "how much
   * of the map the sheet is currently covering". Anything riding it — the map
   * screen lifts Locate and Plan a float by exactly this — stayed lifted for a
   * sheet that had closed, with nothing left to write it back down.
   *
   * On unmount rather than on close: dismissal is animated by the caller
   * unmounting us, and there is no later frame in which we could publish this.
   */
  useEffect(
    () => () => {
      if (metrics) metrics.value = { height: 0, available: 0 };
    },
    [metrics],
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

  // `peekHeight`, not `peekHeight + peekBottomPad`: the pad below the peek is
  // only on screen at the peek detent, and this budget is for the tallest one.
  //
  // No inset argument any more — pageBudget stopped taking one when the bottom
  // pad moved inside the pages. See CONTENT_BOTTOM_PAD.
  const budget = useMemo(() => pageBudget(available, peekHeight), [available, peekHeight]);

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
          // The two-finger scrub, which is what a VoiceOver user reaches for to
          // back out of anything. NOT accessibilityViewIsModal alongside it:
          // this sheet deliberately leaves the map behind it live, because
          // tapping another pin is how you change the selection, and claiming
          // modality would hide the whole map from the rotor to describe a
          // surface that never covered it.
          onAccessibilityEscape={dismiss}
        >
          {/* The whole card is the drag surface, which is the Maps contract —
              you should not have to find a handle to move a sheet. The grabber
              is the AFFORDANCE for that, not the only way in.

              ── AND THE ONLY WAY IN FOR VOICEOVER ─────────────────────────
              "The whole card is the drag surface" is a statement about fingers.
              A screen reader has no drag, so with it on there was no way to
              reach anything below the glance: the tabs, the conditions, the
              float trips and the details were all present, measured, and
              unreachable. Adjustable is the role iOS resizes sheets with, and
              its up/down swipes land on the same detents a drag settles to.

              Dismiss is spelled out as an action as well as bound to the escape
              gesture, because "swipe the sheet off the bottom of the screen" is
              the other thing a pan does that a rotor cannot guess at.

              ── A 44pt TARGET AROUND A 16pt ROW ───────────────────────────
              VoiceOver reaches this through the adjustable role, but Switch
              Control and a plain finger have to actually acquire it, and 16pt
              is well under the floor DESIGN.md §6 sets. The target is grown
              with padding and the growth is then given back with a negative
              margin, so the element is 44pt to the hit-tester and still spends
              GRABBER_BLOCK of the sheet.

              It has to be given back rather than absorbed: GRABBER_BLOCK is
              what resolveDetents adds to the measured peek, and 28 more points
              of real height on every sheet would come straight off the map. */}
          <View
            style={styles.grabberRow}
            accessible
            accessibilityRole={adjustable ? 'adjustable' : 'button'}
            accessibilityLabel={label}
            accessibilityValue={adjustable ? { text: DETENT_VALUE[detent] } : undefined}
            accessibilityHint={
              adjustable ? 'Swipe up or down with one finger to resize' : undefined
            }
            // increment/decrement are what VoiceOver's up and down swipes
            // produce on an adjustable, so they carry no label of their own —
            // the system names them. Dismiss does, because it is ours and
            // appears in the actions rotor as whatever we call it.
            accessibilityActions={
              adjustable
                ? [{ name: 'increment' }, { name: 'decrement' }, { name: 'dismiss', label: 'Dismiss' }]
                : [{ name: 'dismiss', label: 'Dismiss' }]
            }
            onAccessibilityAction={(event) => {
              const action = event.nativeEvent.actionName;
              // Up is bigger, which is the direction the finger would have
              // dragged to get the same result.
              if (action === 'increment') stepDetent(1);
              else if (action === 'decrement') stepDetent(-1);
              else if (action === 'dismiss') dismiss();
            }}
          >
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          </View>

          <SheetScrollContext.Provider value={scrollContext}>
            {/* ── THE BOTTOM PAD IS THE PAGES' NOW, NOT THE COLUMN'S ────────
                This column used to carry `paddingBottom: inset + PAD`, which
                put it BELOW the pager — so it was never air under the last row
                of a page, it was a permanent empty strip across the foot of the
                card that no amount of scrolling could fill. Each page pads its
                own scroll content instead (SheetPager), so the gap is where it
                claimed to be: at the end of what you are reading.

                The single-page callout still needs it here, because it has no
                scroller to put it in. */}
            <View
              onLayout={onContentLayout}
              style={glanceOnly ? { paddingBottom: peekBottomPad } : undefined}
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
  // ── 44pt of TARGET, GRABBER_BLOCK of SPACE ──────────────────────────────
  // The visible row is 8 + 4 + 4 = GRABBER_BLOCK, which is what resolveDetents
  // and pageBudget are both sized around — change one and change the other.
  //
  // The extra 28pt is padding, so the hit-tester sees 44; the matching negative
  // margins hand the layout back, so the sheet is no taller than it was. A tap
  // target is allowed to be bigger than what it looks like — the same move
  // PlaceHead's EDGE_BLEED and RiverHead's lastControl make horizontally.
  //
  // ── ALL OF THE GROWTH GOES DOWNWARD, and that is not arbitrary ──────────
  // Splitting it evenly would put 14pt of the target ABOVE the card's own top
  // edge, out over the map, where a view is outside its parent's bounds and
  // whether it receives a touch at all stops being something this file decides.
  // Growing down keeps the whole target on the sheet.
  //
  // It therefore overlaps the peek content by 28pt, which is harmless: iOS
  // hit-tests later siblings first, so PlaceHead's star and close — and every
  // other control in the header — keep every touch that lands on them. What is
  // left for the grabber is the header's dead space, where a drag already
  // resized the sheet because the whole card is the drag surface.
  grabberRow: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 32,
    marginBottom: -28,
  },
  // 36x4 with a full radius, matching MapLayersSheet — the app already has a
  // grabber and a second dialect of the same control would read as a different
  // kind of sheet.
  grabber: { width: 36, height: 4, borderRadius: 999 },
});
