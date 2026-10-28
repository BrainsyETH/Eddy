import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { sheetControl } from '@/theme/palette';
import { selectionFeedback } from '@/lib/haptics';

export function EssentialsSection({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useTheme();
  return <View style={[essentialsStyles.section, { borderColor: colors.border }]}>
    <Text style={[essentialsStyles.heading, { color: colors.text }]} accessibilityRole="header">{title}</Text>
    {children}
  </View>;
}
export function EssentialsButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return <Pressable onPress={() => { selectionFeedback(); onPress(); }} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }}
    style={({ pressed }) => [essentialsStyles.button, sheetControl(colors), { opacity: disabled ? 0.5 : pressed ? 0.7 : 1 }]}>
    <Text style={[t.base, { color: colors.interactive, fontFamily: fonts.semibold }]}>{label}</Text>
  </Pressable>;
}
export const essentialsStyles = StyleSheet.create({
  section: { gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16 },
  heading: { ...t.lg, fontFamily: fonts.heading },
  title: { ...t.base, fontFamily: fonts.semibold },
  body: { ...t.base, fontFamily: fonts.body },
  note: { ...t.sm, fontFamily: fonts.body },
  button: { minHeight: 56, maxWidth: '100%', borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center', alignItems: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
