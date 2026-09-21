import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, useAnimatedValue, useColorScheme, View } from 'react-native';
import { completeLaunch, isLaunchComplete } from '@/lib/bootstrap';

/** Stays mounted across font readiness; the real app renders under the exit
 * animation. Nothing in the app's mounting or data loading waits on animation.
 */
export function LaunchSplash({ ready, children }: { ready: boolean; children: ReactNode }) {
  const scheme = useColorScheme();
  const [finished, setFinished] = useState(isLaunchComplete);
  const [contentLaidOut, setContentLaidOut] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const scale = useAnimatedValue(1);
  const opacity = useAnimatedValue(1);
  const dismiss = useCallback(() => {
    completeLaunch();
    setFinished(true);
  }, []);

  useEffect(() => {
    if (finished) return;
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      changed = true;
      if (active) setReduceMotion(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (active && !changed) setReduceMotion(value);
    }).catch(() => {
      if (active && !changed) setReduceMotion(true);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [finished]);

  // A decorative asset, accessibility query or animation callback must never
  // strand a ready app. This deadline includes the animation itself.
  useEffect(() => {
    if (!ready || !contentLaidOut || finished) return;
    const timer = setTimeout(dismiss, 700);
    return () => clearTimeout(timer);
  }, [ready, contentLaidOut, finished, dismiss]);

  useEffect(() => {
    if (!ready || !contentLaidOut || finished) return;
    if (imageFailed) {
      // Schedule outside the effect body, also avoiding a blank-image handoff.
      const frame = requestAnimationFrame(dismiss);
      return () => cancelAnimationFrame(frame);
    }
    if (!imageLoaded || reduceMotion === null) return;

    // The native screen and overlay start at the same size and opacity. Lift
    // native artwork only once both the icon and the underlying app are ready.
    // Keep the overlay mounted until its own exit finishes, even on fast boots.
    completeLaunch();
    const animation = reduceMotion
      ? Animated.timing(opacity, {
        toValue: 0, duration: 180, useNativeDriver: true, isInteraction: false,
      })
      : Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.045, duration: 180, easing: Easing.out(Easing.cubic),
            useNativeDriver: true, isInteraction: false,
          }),
          Animated.timing(scale, {
            toValue: 1, duration: 180, easing: Easing.inOut(Easing.quad),
            useNativeDriver: true, isInteraction: false,
          }),
        ]),
        Animated.sequence([
          Animated.delay(120),
          Animated.timing(opacity, {
            toValue: 0, duration: 240, useNativeDriver: true, isInteraction: false,
          }),
        ]),
      ]);
    // Give the native splash a frame to leave before starting visible motion.
    const frame = requestAnimationFrame(() => animation.start(({ finished: completed }) => {
      if (completed) dismiss();
    }));
    return () => {
      cancelAnimationFrame(frame);
      animation.stop();
    };
  }, [ready, contentLaidOut, finished, imageLoaded, imageFailed, reduceMotion, opacity, scale, dismiss]);

  return (
    <View style={styles.container}>
      {ready && (
        <View style={styles.container} onLayout={() => setContentLaidOut(true)}>
          {children}
        </View>
      )}
      {!finished && (
        <Animated.View
          style={[styles.overlay, {
            backgroundColor: scheme === 'dark' ? '#1A1814' : '#F7F6F3', opacity,
          }]}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Animated.Image
            source={require('../../assets/splash-icon-polished.png')}
            resizeMode="contain"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageFailed(true)}
            style={[styles.icon, { transform: [{ scale }] }]}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 220, height: 220 },
});
