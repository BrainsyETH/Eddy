import type { ReactNode } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useTheme } from '@/theme/ThemeProvider';

/** Map controls only. Ancestors must hide by display/unmount, never opacity. */
export function FloatingControlSurface({ children, style, interactive = true }: {
  children: ReactNode | ((glass: boolean) => ReactNode); style?: StyleProp<ViewStyle>; interactive?: boolean;
}) {
  const { colors, increaseContrast, reduceTransparency, floating } = useTheme();
  const glass = Platform.OS === 'ios' && !reduceTransparency && !increaseContrast
    && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  // Buttons use native press feedback on glass and explicit feedback on fallback.
  const content = typeof children === 'function' ? children(glass) : children;
  return glass ? <GlassView glassEffectStyle="regular" isInteractive={interactive} style={style}>{content}</GlassView>
    : <View style={[floating(), style, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>{content}</View>;
}
