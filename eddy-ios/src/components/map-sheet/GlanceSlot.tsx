// eddy-ios/src/components/map-sheet/GlanceSlot.tsx
// The fixed box the peek's one decision fact lives in.
//
// Its whole job is to occupy the same height from the first frame to the last,
// so the sheet's top edge never moves while a request lands. WHICH fact it holds
// is peekSlot.ts's decision and is made before this renders; this file is only
// the geometry and the three states.
//
// ── Why the placeholder says what it is doing ─────────────────────────────
// An empty reserved box for half a second reads as a rendering bug, and a
// spinner over a sheet that is already fully usable — Directions and "Use as
// put-in" are live from the first frame — overstates how much is missing. One
// quiet line naming the thing being fetched is the smallest honest option, and
// it is the only text here that is ever replaced rather than added to.
//
// ── Opacity, not layout ───────────────────────────────────────────────────
// The crossfade animates opacity on a box whose height is already settled. That
// is the same rule MapSheet follows and for the same reason: a layout animation
// on this screen re-measures the peek, which is precisely the movement being
// prevented. Reduced motion drops the duration to zero rather than skipping the
// transition, so the content still arrives — it just arrives instantly.

import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { slotHeight, type DecisionSlot } from './peekSlot';

/** Short enough not to be a transition anyone waits through. */
const FADE_MS = 160;

/** What the slot is doing, named by the thing it is fetching. */
const PENDING_COPY: Record<Exclude<DecisionSlot, 'none'>, string> = {
  water: 'Checking water…',
  availability: 'Checking campsites…',
};

/**
 * What it says when the answer is "nothing".
 *
 * The water line is verbatim what AccessConditionsTab said before this replaced
 * it — the tab is gone, the sentence was right, and a reader who has seen it on
 * one surface should not meet a different wording of the same fact on another.
 */
const EMPTY_COPY: Record<Exclude<DecisionSlot, 'none'>, string> = {
  water: 'No gauge grades this stretch yet.',
  availability: 'Eddy has no live availability for this campground.',
};

export function GlanceSlot({
  slot,
  /** Null while the request is outstanding, false once it has resolved empty. */
  ready,
  children,
}: {
  slot: DecisionSlot;
  ready: boolean;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const opacity = useSharedValue(0);

  // Content is present, or it is not — there is no third target. The guard on
  // `ready` rather than on `children` is deliberate: a slot whose request
  // resolved empty renders the terminal line, which is also children.
  useEffect(() => {
    opacity.value = withTiming(1, { duration: reduced ? 0 : FADE_MS });
  }, [ready, opacity, reduced]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (slot === 'none') return null;

  const height = slotHeight(slot);

  return (
    <View style={[styles.slot, { minHeight: height }]}>
      {ready ? (
        <Animated.View style={style}>{children}</Animated.View>
      ) : (
        <Text style={[styles.pending, { color: colors.textSubtle }]} numberOfLines={1}>
          {PENDING_COPY[slot]}
        </Text>
      )}
    </View>
  );
}

/** The terminal line, for a slot whose request landed with nothing in it. */
export function GlanceSlotEmpty({ slot }: { slot: Exclude<DecisionSlot, 'none'> }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.pending, { color: colors.textMuted }]} numberOfLines={2}>
      {EMPTY_COPY[slot]}
    </Text>
  );
}

const styles = StyleSheet.create({
  // justifyContent rather than a fixed height on the child: the reservation is a
  // FLOOR, and content that comes in under it sits optically where the filled
  // state will, instead of pinning to the top of a box it does not fill.
  slot: { marginTop: 10, justifyContent: 'center' },
  pending: { ...t.sm, fontFamily: fonts.body },
});
