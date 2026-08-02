// eddy-ios/src/components/SwipeRow.tsx
// Swipe a row left, get the one destructive thing you can do to it.
//
// ── Why this exists ─────────────────────────────────────────────────────────
//
// Two lists in this app are lists of things the user made and will one day want
// gone: their alerts, and their favourites. Neither could be swiped. Removing a
// favourite meant finding the star buried in the row; deleting an alert meant
// opening it, scrolling to the bottom and confirming — three screens for the
// gesture every iOS user tries first.
//
// ── Why it is hand-rolled ───────────────────────────────────────────────────
//
// The obvious answer is react-native-gesture-handler's Swipeable, and it is the
// wrong one HERE. Gesture-handler and Reanimated are in this tree only as
// auto-installed PEERS of expo-router (see the "//overrides" note in
// package.json, and the README section on why --legacy-peer-deps silently
// removes them). Importing one directly makes a load-bearing dependency out of
// something nothing declares, and both are NATIVE: an OTA update that starts
// importing a native module lands on binaries that never linked it, which is
// the exact failure the README documents at length under
// `Unimplemented component: <RNSVGSvgView>`.
//
// PanResponder and Animated are React Native itself. No new dependency, no new
// native code, no new runtime fingerprint — and GaugeChart already scrubs with
// PanResponder, so the pattern is not new to this app either.
//
// ── The gesture has to lose ties to the list ───────────────────────────────
//
// These rows live in FlatLists. A responder that claims a touch too eagerly
// turns a scroll into a swipe on every slightly-diagonal flick, which is far
// more annoying than the missing feature was. So the claim needs BOTH a real
// horizontal distance and a horizontal-dominant direction, and it never claims
// on touch-down while closed — a tap must reach the row underneath.
//
// ── And it must exist for VoiceOver ────────────────────────────────────────
//
// A gesture nothing announces is a feature only sighted, dextrous users have.
// The wrapper carries an accessibilityAction, so the action is reachable from
// the rotor without any swiping at all.

import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/** How much of the row is given over to the action once it is open. */
const ACTION_WIDTH = 92;

/** Past this much of the action's width, releasing opens rather than closes. */
const OPEN_AT = ACTION_WIDTH * 0.5;

/** Below this the touch is a tap or a scroll, and never ours. */
const CLAIM_DISTANCE = 12;

interface Props {
  children: React.ReactNode;
  /** Runs when the action is taken. Awaited, so the row closes after it lands. */
  onAction: () => void | Promise<unknown>;
  /** The word on the button. "Delete", "Remove" — a verb, never "OK". */
  actionLabel: string;
  /** Announced by VoiceOver, e.g. "Delete the alert for the Meramec". */
  accessibilityActionLabel: string;
  /**
   * A confirmation, for actions that cannot be undone with one tap.
   *
   * Unstarring a river is reversible by starring it again and gets none.
   * Deleting an alert is a server-side row and a decision, and gets one.
   */
  confirm?: { title: string; message?: string };
  /** The row's own horizontal margin, so the action sits under it exactly. */
  horizontalInset?: number;
  /** The row's own bottom margin, so the action does not tint the gap below. */
  bottomInset?: number;
  /** The row's own corner radius. */
  radius?: number;
}

export function SwipeRow({
  children,
  onAction,
  actionLabel,
  accessibilityActionLabel,
  confirm,
  horizontalInset = 16,
  bottomInset = 10,
  radius = 14,
}: Props) {
  const { colors, isDark } = useTheme();
  /**
   * The ink on the red, computed rather than looked up.
   *
   * `error` is defined in the palette as an INK — a red for text on the canvas,
   * picked per scheme for contrast against it — and this is the one place that
   * uses it as a FILL. The two schemes therefore need opposite foregrounds:
   * light mode's red-600 carries white at 4.8:1, while dark mode's red-400 is a
   * pale red that white would sit on at about 2.4:1 and near-black stone reads
   * on comfortably. Hardcoding white would have failed exactly half the time.
   */
  const actionInk = isDark ? colors.bg : '#FFFFFF';
  // useMemo, not useRef().current: reading a ref during render is the same rule
  // the responder below had to be rewritten for, and an Animated.Value is a
  // stable external object rather than rendered state, which is exactly what a
  // never-recomputed memo is for.
  const translateX = useMemo(() => new Animated.Value(0), []);
  /**
   * Open-ness as STATE, and the responder is rebuilt whenever it changes.
   *
   * A ref would be the usual way to keep gesture handlers from closing over a
   * stale value, and it is the wrong instrument here: reading one during render
   * is what react-hooks/refs-during-render forbids, and the responder is built
   * during render. State is also what the backdrop has to key off anyway — an
   * action button mounted under every closed row would be forty invisible tap
   * targets in a list — so one source is both correct and simpler.
   *
   * Staleness cannot bite because this only ever changes when a gesture ENDS.
   * A responder that has already been granted keeps the handlers it was granted
   * with for the rest of that gesture, which is precisely the behaviour wanted.
   */
  const [open, setOpen] = useState(false);

  const settle = useCallback(
    (next: boolean) => {
      setOpen(next);
      Animated.spring(translateX, {
        toValue: next ? -ACTION_WIDTH : 0,
        useNativeDriver: true,
        bounciness: 0,
        speed: 18,
      }).start();
    },
    [translateX],
  );

  const run = useCallback(async () => {
    try {
      await onAction();
    } finally {
      // Closed either way. On success the row is usually gone with the data;
      // on failure the list puts it back, and it must not come back open.
      settle(false);
    }
  }, [onAction, settle]);

  const act = useCallback(() => {
    if (!confirm) {
      void run();
      return;
    }
    Alert.alert(confirm.title, confirm.message, [
      { text: 'Cancel', style: 'cancel', onPress: () => settle(false) },
      { text: actionLabel, style: 'destructive', onPress: () => void run() },
    ]);
  }, [confirm, run, settle, actionLabel]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Only when already open, and only so that a tap anywhere on the row
        // closes it instead of activating whatever is under the finger. A
        // closed row must let every touch through to its own controls.
        onStartShouldSetPanResponder: () => open,
        onMoveShouldSetPanResponder: (_event, gesture) => {
          const horizontal = Math.abs(gesture.dx);
          if (horizontal < CLAIM_DISTANCE) return false;
          // Comfortably horizontal, or the list keeps its scroll. 1.5 rather
          // than 1: at parity a mostly-vertical flick with a little sideways
          // drift still wins, and the list is what the user meant.
          if (horizontal < Math.abs(gesture.dy) * 1.5) return false;
          // Rightward only makes sense as "close what is open".
          return gesture.dx < 0 || open;
        },
        onPanResponderMove: (_event, gesture) => {
          const base = open ? -ACTION_WIDTH : 0;
          const next = base + gesture.dx;
          // Clamped at both ends: no rubber band past the action, and never
          // dragged right of home, where there is nothing to reveal.
          translateX.setValue(Math.min(0, Math.max(-ACTION_WIDTH, next)));
        },
        onPanResponderRelease: (_event, gesture) => {
          const base = open ? -ACTION_WIDTH : 0;
          const next = base + gesture.dx;
          // A flick counts even when it did not travel far — velocity is what
          // separates "I meant it" from "my thumb slipped".
          if (gesture.vx < -0.5) return settle(true);
          if (gesture.vx > 0.5) return settle(false);
          settle(next < -OPEN_AT);
        },
        // Back to where the gesture started. An interrupted swipe is not a
        // decision, and a row left halfway open is a row nobody chose.
        onPanResponderTerminate: () => settle(open),
      }),
    [open, settle, translateX],
  );

  const backdrop: ViewStyle = {
    left: horizontalInset,
    right: horizontalInset,
    bottom: bottomInset,
    borderRadius: radius,
    backgroundColor: colors.error,
  };

  return (
    <View
      accessibilityActions={[{ name: 'delete', label: accessibilityActionLabel }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'delete') act();
      }}
    >
      {open ? (
        <View style={[styles.backdrop, backdrop]} pointerEvents="box-none">
          <Pressable
            onPress={act}
            style={({ pressed }) => [styles.action, { opacity: pressed ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={accessibilityActionLabel}
          >
            <Ionicons name="trash-outline" size={18} color={actionInk} />
            <Text style={[styles.actionText, { color: actionInk }]}>{actionLabel}</Text>
          </Pressable>
        </View>
      ) : null}

      <Animated.View style={{ transform: [{ translateX }] }} {...responder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Absolute so the row slides OVER it. Insets come from the caller, because
  // every list in this app gives its rows their own margins and the action has
  // to end exactly where the row does.
  backdrop: {
    position: 'absolute',
    top: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  action: { width: ACTION_WIDTH, alignItems: 'center', justifyContent: 'center', gap: 3, height: '100%' },
  actionText: { ...t.xs, fontFamily: fonts.semibold },
});
