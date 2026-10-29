// eddy-ios/src/components/OnboardingMotion.tsx
// The motion vocabulary of first run, kept in one place so the three screens
// move like one product.
//
// ── What moves, and why only this ────────────────────────────────────────────
// Onboarding is the one place the app is introducing itself rather than
// reporting a river, so it is allowed to be lively: Eddy bobs on moving water,
// content rises in on a short stagger, and buttons give under a thumb. Nothing
// here animates DATA — a reading, a condition colour, a status line never
// slides or pulses, because motion on a fact reads as the fact changing.
//
// ── Reduced motion ──────────────────────────────────────────────────────────
// Every piece reads useReducedMotion and, when it is on, renders its resting
// state: no rise, no bob, no drifting water, no press bounce. Same rule the
// sheets and the map camera follow — see that hook's header.
//
// ── No layout animations ────────────────────────────────────────────────────
// Shared values and useAnimatedStyle only, no `entering=` presets. The app uses
// none anywhere else, and a list cell that mounts twice (FlatList re-keys when
// the column count changes) must simply animate again rather than meet a
// layout-animation edge case on device.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { EddyScene, type EddySceneName } from '@/components/EddyScene';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Fades and lifts its children into place once, `delay` ms after mount.
 *
 * `still` renders the resting state with no animation at all — for content
 * that mounts mid-scroll, where any delay shows as a blank slot.
 */
export function Rise({ delay = 0, distance = 16, still = false, style, children }: {
  delay?: number;
  distance?: number;
  still?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const rest = reduced || still;
  const progress = useSharedValue(rest ? 1 : 0);
  useEffect(() => {
    progress.set(rest
      ? 1
      : withDelay(delay, withTiming(1, { duration: 560, easing: Easing.out(Easing.cubic) })));
  }, [delay, rest, progress]);
  const animated = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: (1 - progress.get()) * distance }],
  }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/**
 * Eddy floating: springs up on arrival, then bobs and rocks on a slow loop.
 *
 * `water` draws the river line he sits in. The waves overlap the bottom of the
 * artwork on purpose, so he reads as floating IN the water rather than hovering
 * over a stripe.
 */
export function FloatingEddy({ name = 'wave', size = 160, water = true }: {
  name?: EddySceneName;
  size?: number;
  water?: boolean;
}) {
  const reduced = useReducedMotion();
  const arrive = useSharedValue(reduced ? 1 : 0);
  const bob = useSharedValue(0);
  const rock = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      cancelAnimation(bob);
      cancelAnimation(rock);
      arrive.set(1);
      bob.set(0);
      rock.set(0);
      return;
    }
    arrive.set(withSpring(1, { damping: 11, stiffness: 120, mass: 0.9 }));
    // Ease out to one extreme, then swing between the two forever. Repeating a
    // whole two-leg sequence in reverse would replay its 0 → -1 lead-in on every
    // other cycle, which shows as a hitch at the midpoint.
    const sine = Easing.inOut(Easing.sin);
    bob.set(withDelay(500, withSequence(
      withTiming(-1, { duration: 750, easing: sine }),
      withRepeat(withTiming(1, { duration: 1500, easing: sine }), -1, true),
    )));
    rock.set(withDelay(500, withSequence(
      withTiming(1, { duration: 1050, easing: sine }),
      withRepeat(withTiming(-1, { duration: 2100, easing: sine }), -1, true),
    )));
    return () => {
      cancelAnimation(bob);
      cancelAnimation(rock);
    };
  }, [reduced, arrive, bob, rock]);

  const eddy = useAnimatedStyle(() => ({
    opacity: Math.min(1, arrive.get() * 1.6),
    transform: [
      { translateY: (1 - arrive.get()) * 40 + bob.get() * size * 0.035 },
      { rotate: `${rock.get() * 3}deg` },
      { scale: 0.7 + arrive.get() * 0.3 },
    ],
  }));

  const waterHeight = Math.round(size * 0.26);
  return (
    <View style={[styles.hero, { height: size + (water ? Math.round(waterHeight * 0.35) : 0) }]}>
      <Animated.View style={eddy}>
        <EddyScene name={name} size={size} />
      </Animated.View>
      {water ? <RiverWaves height={waterHeight} style={styles.water} /> : null}
    </View>
  );
}

/**
 * Two layers of water drifting at different speeds, in the brand's water teal.
 *
 * Each layer is one wavelength wider than its frame and slides exactly one
 * wavelength before repeating, so the loop has no seam.
 */
export function RiverWaves({ height = 40, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  return (
    <View
      style={[{ height }, styles.waves, style]}
      onLayout={event => setWidth(Math.round(event.nativeEvent.layout.width))}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      {width ? (
        <>
          <WaveLayer width={width} height={height} wavelength={Math.max(90, width / 3)}
            amplitude={height * 0.16} top={0} color={colors.interactive} opacity={0.16} duration={5200} reverse />
          <WaveLayer width={width} height={height} wavelength={Math.max(70, width / 4)}
            amplitude={height * 0.14} top={height * 0.3} color={colors.interactive} opacity={0.28} duration={3800} />
        </>
      ) : null}
    </View>
  );
}

function WaveLayer({ width, height, wavelength, amplitude, top, color, opacity, duration, reverse = false }: {
  width: number; height: number; wavelength: number; amplitude: number; top: number;
  color: string; opacity: number; duration: number; reverse?: boolean;
}) {
  const reduced = useReducedMotion();
  const shift = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      cancelAnimation(shift);
      shift.set(0);
      return;
    }
    shift.set(0);
    shift.set(withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(shift);
  }, [reduced, duration, shift]);
  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: (reverse ? shift.get() - 1 : -shift.get()) * wavelength }],
  }));

  const layerWidth = width + wavelength * 2;
  const layerHeight = height - top;
  return (
    <Animated.View style={[styles.layer, { top, width: layerWidth, height: layerHeight }, animated]}>
      <Svg width={layerWidth} height={layerHeight}>
        <Path d={wavePath(layerWidth, wavelength, amplitude, layerHeight)} fill={color} fillOpacity={opacity} />
      </Svg>
    </Animated.View>
  );
}

/** A filled sine-like band: crests along the top, flat to the bottom edge. */
export function wavePath(width: number, wavelength: number, amplitude: number, height: number): string {
  const half = wavelength / 2;
  let path = `M 0 ${amplitude}`;
  for (let x = 0; x < width; x += wavelength) {
    path += ` q ${half / 2} ${-amplitude} ${half} 0 t ${half} 0`;
  }
  const end = Math.ceil(width / wavelength) * wavelength;
  return `${path} L ${end} ${height} L 0 ${height} Z`;
}

/** A Pressable that gives a little under the thumb and springs back. */
export function PressableScale({ style, children, onPressIn, onPressOut, ...props }: Omit<PressableProps, 'style' | 'children'> & {
  style?: PressableProps['style'];
  children: PressableProps['children'];
}) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Animated.View style={animated}>
      <Pressable
        {...props}
        style={style}
        onPressIn={event => {
          if (!reduced) scale.set(withTiming(0.97, { duration: 90 }));
          onPressIn?.(event);
        }}
        onPressOut={event => {
          if (!reduced) scale.set(withSpring(1, { damping: 12, stiffness: 260 }));
          onPressOut?.(event);
        }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

/**
 * A one-shot "pop" whenever `trigger` changes after mount — for a selection
 * landing or a button becoming available. Silent on the first render, so a
 * screen does not bounce at people just for appearing.
 */
export function usePop(trigger: unknown, amount = 0.06) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const last = useRef(trigger);
  useEffect(() => {
    if (Object.is(last.current, trigger)) return;
    last.current = trigger;
    if (reduced) return;
    scale.set(withSequence(
      withTiming(1 + amount, { duration: 110, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 9, stiffness: 220 }),
    ));
  }, [trigger, reduced, amount, scale]);
  return useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
}

const styles = StyleSheet.create({
  hero: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'flex-start' },
  water: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  waves: { overflow: 'hidden' },
  layer: { position: 'absolute', left: 0 },
});
