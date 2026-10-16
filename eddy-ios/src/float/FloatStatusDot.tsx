import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/theme/ThemeProvider';

/** One pulse per fresh GPS fix. No looping animation when the signal stops. */
export function FloatStatusDot({ at, fresh }: { at: number | null; fresh: boolean }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = fresh && !reduced
      ? withSequence(withTiming(0.35, { duration: 120 }), withTiming(1, { duration: 600 })) : 1;
  }, [at, fresh, reduced, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View accessible={false} style={[styles.dot, { backgroundColor: fresh ? colors.interactive : colors.textSubtle }, style]} />;
}
const styles = StyleSheet.create({ dot: { width: 8, height: 8, borderRadius: 4 } });
