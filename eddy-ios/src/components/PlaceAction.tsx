import { Pressable, Text } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function PlaceAction({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ minHeight: 56, maxWidth: '100%', padding: 14, borderRadius: 12, borderWidth: 1,
      borderColor: colors.border, justifyContent: 'center', opacity: disabled ? 0.5 : pressed ? 0.65 : 1 })}>
    <Text style={[t.base, { fontFamily: fonts.semibold, color: colors.interactive }]}>{label}</Text>
  </Pressable>;
}
