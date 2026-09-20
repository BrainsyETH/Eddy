import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, useAnimatedValue, useColorScheme, View } from 'react-native';
import { revealLaunchSplash } from '@/lib/bootstrap';

/** A font-independent replacement for the native launch image while fonts load.
 * Unmounted as soon as the app is ready: animation completion never gates launch.
 */
export function LaunchSplash() {
  const scheme = useColorScheme();
  const [laidOut, setLaidOut] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const scale = useAnimatedValue(1);
  const opacity = useAnimatedValue(1);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (!laidOut || !imageLoaded || reduceMotion === null) return;

    // Match app.json's native image and background before lifting it. Keep the
    // bootstrap watchdog armed: showing artwork is not a completed app launch.
    scale.setValue(reduceMotion ? 1 : 0.96);
    opacity.setValue(0.8);
    revealLaunchSplash();

    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1, duration: 180, useNativeDriver: true, isInteraction: false,
      }),
      ...(reduceMotion ? [] : [Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.015, duration: 220, easing: Easing.out(Easing.cubic),
          useNativeDriver: true, isInteraction: false,
        }),
        Animated.timing(scale, {
          toValue: 1, duration: 140, easing: Easing.inOut(Easing.quad),
          useNativeDriver: true, isInteraction: false,
        }),
      ])]),
    ]);
    animation.start();
    return () => animation.stop();
  }, [laidOut, imageLoaded, reduceMotion, opacity, scale]);

  return (
    <View
      style={[styles.screen, { backgroundColor: scheme === 'dark' ? '#1A1814' : '#F7F6F3' }]}
      onLayout={() => setLaidOut(true)}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.Image
        source={require('../../assets/splash-icon-polished.png')}
        resizeMode="contain"
        onLoad={() => setImageLoaded(true)}
        style={[styles.icon, { opacity, transform: [{ scale }] }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 220, height: 220 },
});
