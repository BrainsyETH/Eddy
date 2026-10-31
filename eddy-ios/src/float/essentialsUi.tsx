import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ComponentProps, ReactNode } from 'react';
import { EddySymbol, type EddySymbolName } from '@/components/EddySymbol';
import { ControlIcon } from '@/components/ControlIcon';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { sheetControl } from '@/theme/palette';
import { selectionFeedback } from '@/lib/haptics';
import { radii } from '@/theme/layout';

/**
 * One Float tools section. `symbol` puts the Eddy mark for what the section
 * is beside its heading; only where a mark means exactly that (a gauge for
 * conditions, the river for what lies ahead), never a near miss.
 */
export function EssentialsSection({ title, symbol, children, action, bare = false }: {
  title: string; symbol?: EddySymbolName; children: ReactNode; action?: ReactNode; bare?: boolean;
}) {
  const { colors, elevation } = useTheme();
  return <View style={[essentialsStyles.section, !bare && essentialsStyles.card,
    !bare && { backgroundColor: colors.card }, !bare && elevation(1)]}>
    <View style={essentialsStyles.headingRow}>
      {symbol ? <EddySymbol name={symbol} size={26} /> : null}
      <Text style={[essentialsStyles.heading, essentialsStyles.headingText, { color: colors.text }]} accessibilityRole="header">{title}</Text>
      {action}
    </View>
    {children}
  </View>;
}
export function EssentialsButton({ label, onPress, disabled = false, icon, symbol, plain = false, grow = false, accessibilityLabel }: {
  label: string; onPress: () => void; disabled?: boolean;
  icon?: ComponentProps<typeof ControlIcon>['name']; symbol?: EddySymbolName;
  plain?: boolean; grow?: boolean; accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return <Pressable onPress={() => { selectionFeedback(); onPress(); }} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }} accessibilityLabel={accessibilityLabel ?? label}
    style={({ pressed }) => [essentialsStyles.button, !plain && sheetControl(colors), plain && essentialsStyles.plainButton,
      grow && essentialsStyles.growButton, { opacity: disabled ? 0.5 : pressed ? 0.7 : 1 }]}>
    {symbol ? <EddySymbol name={symbol} size={24} /> : icon ? <ControlIcon name={icon} size={18} color={colors.interactive} /> : null}
    <Text style={[plain ? t.base : t.sm, essentialsStyles.buttonLabel, { color: colors.interactive, fontFamily: fonts.semibold }]}>{label}</Text>
  </Pressable>;
}
export const essentialsStyles = StyleSheet.create({
  section: { gap: 10 },
  card: { padding: 16, borderRadius: radii.feature },
  heading: { ...t.base, fontFamily: fonts.heading },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headingText: { flex: 1 },
  title: { ...t.base, fontFamily: fonts.semibold },
  body: { ...t.base, fontFamily: fonts.body },
  note: { ...t.sm, fontFamily: fonts.body },
  button: { minHeight: 48, maxWidth: '100%', borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center' },
  buttonLabel: { flexShrink: 1, textAlign: 'center' },
  plainButton: { minWidth: 44, minHeight: 44, borderWidth: 0, paddingHorizontal: 4 },
  growButton: { flexGrow: 1, flexBasis: 140 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
