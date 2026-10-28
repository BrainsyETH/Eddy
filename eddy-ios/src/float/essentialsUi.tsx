import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { EddySymbol, type EddySymbolName } from '@/components/EddySymbol';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { sheetControl } from '@/theme/palette';
import { selectionFeedback } from '@/lib/haptics';

/**
 * One Float tools section. `symbol` puts the Eddy mark for what the section
 * is beside its heading; only where a mark means exactly that (a gauge for
 * conditions, the river for what lies ahead), never a near miss.
 */
export function EssentialsSection({ title, symbol, children }: { title: string; symbol?: EddySymbolName; children: ReactNode }) {
  const { colors } = useTheme();
  return <View style={[essentialsStyles.section, { borderColor: colors.border }]}>
    <View style={essentialsStyles.headingRow}>
      {symbol ? <EddySymbol name={symbol} size={26} /> : null}
      <Text style={[essentialsStyles.heading, essentialsStyles.headingText, { color: colors.text }]} accessibilityRole="header">{title}</Text>
    </View>
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
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headingText: { flexShrink: 1 },
  title: { ...t.base, fontFamily: fonts.semibold },
  body: { ...t.base, fontFamily: fonts.body },
  note: { ...t.sm, fontFamily: fonts.body },
  button: { minHeight: 56, maxWidth: '100%', borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center', alignItems: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
