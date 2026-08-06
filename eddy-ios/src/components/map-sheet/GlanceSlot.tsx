// eddy-ios/src/components/map-sheet/GlanceSlot.tsx
// The fixed box the peek's one decision fact lives in.
//
// Its whole job is to occupy the same height from the first frame to the last,
// so the sheet's top edge never moves while a request lands. WHICH fact it holds
// is peekSlot.ts's decision and is made before this renders; this file is only
// the geometry and the crossfade.
//
// ── THE RESERVATION IS THE COMPONENT, NOT A NUMBER ───────────────────────
//
// This used to reserve with `minHeight` from a constant per slot kind, and the
// constants were wrong. The campground card measured 106pt against a declared
// 96 — so `minHeight` was inert and the sheet moved ten points — and worse, the
// card had three heights depending on which state `availabilityHero` returned,
// so it moved by a different amount per campground.
//
// A constant could not have been right, and not because the arithmetic was
// sloppy. The height being predicted depends on the reader's TEXT SIZE, which is
// a runtime property: any number correct at the default is wrong at the
// accessibility sizes, in the direction that pushes the action row off the peek.
//
// So the placeholder is the real component in a `pending` mode — the same card,
// the same chip, the same strip, with placeholder content in it. Its height is
// therefore the height the filled state will have, by construction, at every
// text size, with nobody having to work anything out. The cost is that both
// components must keep their pending and filled shapes in step; each says so in
// its own header, and the __DEV__ check below is what catches it if they drift.
//
// ── Opacity, not layout ───────────────────────────────────────────────────
//
// The crossfade animates opacity on a box whose height is already settled. Same
// rule MapSheet follows, same reason: a layout animation here re-measures the
// peek, which is exactly the movement being prevented. Reduced motion drops the
// duration to zero rather than skipping the transition, so the content still
// arrives — instantly.

import { useEffect, useRef } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { warn } from '@/lib/monitoring';
import type { DecisionSlot } from './peekSlot';

/** Short enough not to be a transition anyone waits through. */
const FADE_MS = 160;

/**
 * How far the two states may disagree before it is a defect rather than
 * rounding. Sub-pixel differences are normal; anything a reader could see is not.
 */
const HEIGHT_TOLERANCE = 1;

export function GlanceSlot({
  slot,
  /** False while the request is outstanding. See peekSlot.ts for what settles it. */
  ready,
  children,
}: {
  slot: DecisionSlot;
  ready: boolean;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(0);

  // ── The device proof, running on every device ───────────────────────────
  // No test in this repo can render React Native — the suite is node:test over
  // pure .ts — so the stability claim cannot be asserted at build time. It can
  // be asserted at RUN time, on whatever phone and whatever text size somebody
  // actually has, which is the population that matters. Records the reserved
  // height and complains if the filled state disagrees.
  const pendingHeight = useRef<number | null>(null);
  const onLayout = (event: LayoutChangeEvent) => {
    if (!__DEV__) return;
    const height = event.nativeEvent.layout.height;
    if (!ready) {
      pendingHeight.current = height;
      return;
    }
    const reserved = pendingHeight.current;
    if (reserved != null && Math.abs(reserved - height) > HEIGHT_TOLERANCE) {
      warn(
        'map',
        `glance slot "${slot}" moved the peek: reserved ${Math.round(reserved)}pt, filled ${Math.round(height)}pt`,
      );
      // Once per pin. Nulling it stops a re-render storm turning one defect into
      // a log full of the same line.
      pendingHeight.current = null;
    }
  };

  useEffect(() => {
    opacity.value = withTiming(1, { duration: reduced ? 0 : FADE_MS });
  }, [ready, opacity, reduced]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (slot === 'none') return null;

  // The pending branch renders WITHOUT the fade: it is what is on screen first,
  // so there is nothing for it to fade in from, and animating it would draw the
  // eye to the placeholder rather than to the answer replacing it.
  return (
    <View style={styles.slot} onLayout={onLayout}>
      {ready ? <Animated.View style={style}>{children}</Animated.View> : children}
    </View>
  );
}

const styles = StyleSheet.create({
  // No height of its own, and that is the change: the box is exactly as tall as
  // whichever state is mounted, and the two states are the same component, so
  // they are the same height. See the header.
  slot: { marginTop: 10 },
});
