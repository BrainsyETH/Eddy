import { Pressable, Text } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function PlaceAction({ label, onPress, disabled = false, variant = 'button', expanded }: { label: string; onPress: () => void; disabled?: boolean; variant?: 'button' | 'link'; expanded?: boolean }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled, expanded }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ minHeight: 56, maxWidth: '100%', padding: variant === 'link' ? 0 : 14, borderRadius: 12, borderWidth: variant === 'link' ? 0 : 1,
      borderColor: colors.border, justifyContent: 'center', opacity: disabled ? 0.5 : pressed ? 0.65 : 1 })}>
    <Text style={[t.base, { fontFamily: fonts.semibold, color: colors.interactive }]}>{label}</Text>
  </Pressable>;
}
