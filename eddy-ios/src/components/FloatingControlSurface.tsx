import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useTheme } from '@/theme/ThemeProvider';

/** Map controls only. Ancestors must hide by display/unmount, never opacity. */
export function FloatingControlSurface({ children, style, interactive = true }: {
  children: ReactNode; style?: StyleProp<ViewStyle>; interactive?: boolean;
}) {
  const { colors, increaseContrast, floating } = useTheme();
  // An opaque first frame respects accessibility before the async read settles.
  const [reduceTransparency, setReduceTransparency] = useState(true);
  useEffect(() => {
    let alive = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', value => {
      changed = true; if (alive) setReduceTransparency(value);
    });
    void AccessibilityInfo.isReduceTransparencyEnabled().then(value => {
      if (alive && !changed) setReduceTransparency(value);
    }).catch(() => {});
    return () => { alive = false; subscription.remove(); };
  }, []);
  const glass = Platform.OS === 'ios' && !reduceTransparency && !increaseContrast
    && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  return glass ? <GlassView glassEffectStyle="regular" isInteractive={interactive} style={style}>{children}</GlassView>
    : <View style={[floating(), style, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>{children}</View>;
}
