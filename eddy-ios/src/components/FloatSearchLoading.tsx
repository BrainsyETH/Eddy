import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { FLOAT_SEARCH_LOADING_TITLE, FLOAT_SEARCH_LOADING_DETAIL } from '@eddy/conditions/float-search';
import { EddyScene } from './EddyScene';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function FloatSearchLoading() {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reducedMotion) { opacity.setValue(1); return; }
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.35, duration: 800, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
    ]));
    pulse.start();
    return () => pulse.stop();
  }, [opacity, reducedMotion]);
  return (
    <View accessible accessibilityRole="text" accessibilityLiveRegion="polite"
      accessibilityLabel={`${FLOAT_SEARCH_LOADING_TITLE}. ${FLOAT_SEARCH_LOADING_DETAIL}`}
      style={[styles.panel, { backgroundColor: colors.selectionBg, borderColor: colors.border }]}>
      <EddyScene name="checkingGauge" size={164} />
      <Text style={[styles.title, { color: colors.text }]}>{FLOAT_SEARCH_LOADING_TITLE}</Text>
      <Text style={[t.sm, styles.centered, { color: colors.textMuted }]}>{FLOAT_SEARCH_LOADING_DETAIL}</Text>
      <Animated.View style={[styles.dots, { opacity }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {[0, 1, 2].map(i => <View key={i} style={[styles.dot, { backgroundColor: colors.interactive }]} />)}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, paddingVertical: 32, borderWidth: 1, borderRadius: 18 },
  title: { ...t['2xl'], fontFamily: fonts.display, textAlign: 'center' },
  centered: { textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 8, paddingVertical: 8 },
  dot: { height: 8, width: 8, borderRadius: 4 },
});
