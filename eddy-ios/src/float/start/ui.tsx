// eddy-ios/src/float/start/ui.tsx
// The small pieces every Start a float page is built from, and their styles.

import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ControlIcon } from '@/components/ControlIcon';
import { radii } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles, type as t } from '@/theme/typography';

export function Shell({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['left', 'right', 'bottom']}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.content}
      >
        {children}
      </ScrollView>
      {footer ? <View style={[styles.footer, { borderTopColor: colors.border }]}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Card({ children, padded = true }: { children: React.ReactNode; padded?: boolean }) {
  const { colors, elevation } = useTheme();
  return (
    <View style={[styles.card, padded && styles.cardPadding, { backgroundColor: colors.card }, elevation(1)]}>
      {children}
    </View>
  );
}

export function RiverName({ name, large = false }: { name: string; large?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.inline}>
      <ControlIcon name="water-outline" size={22} color={colors.interactive} />
      <Text
        accessibilityRole={large ? 'header' : undefined}
        style={[
          large ? styles.cardTitle : styles.body,
          styles.flex,
          { color: large ? colors.text : colors.textMuted },
        ]}
      >
        {name}
      </Text>
    </View>
  );
}

export function SummaryLine({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.summaryLine}>
      <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  busy = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy || disabled, busy }}
      style={({ pressed }) => [
        styles.primary,
        {
          backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={colors.onAccent} />
      ) : (
        <Text style={[styles.primaryText, { color: colors.onAccent }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function TextButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={styles.link}
    >
      <Text style={[styles.linkText, { color: colors.interactive }]}>{label}</Text>
    </Pressable>
  );
}

export function Row({ title, detail, leading, onPress }: {
  title: string;
  detail?: string;
  leading?: React.ReactNode;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
    >
      {leading}
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
        {detail ? <Text style={[styles.body, { color: colors.textMuted }]}>{detail}</Text> : null}
      </View>
      <ControlIcon name="chevron-forward" size={16} color={colors.textSubtle} />
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 24 },
  footer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  title: { ...textStyles.pageTitle },
  cardTitle: { ...t['2xl'], fontFamily: fonts.heading },
  body: { ...t.sm },
  caption: { ...textStyles.caption },
  label: { ...t.sm, fontFamily: fonts.semibold },
  group: { gap: 10 },
  card: { borderRadius: radii.feature },
  cardPadding: { padding: 20, gap: 16 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1 },
  divider: { height: StyleSheet.hairlineWidth },
  summaryLine: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  summaryLabel: { ...t.base, minWidth: 44 },
  summaryValue: { ...t.base, fontFamily: fonts.semibold, flex: 1, minWidth: 120 },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, gap: 4 },
  rowTitle: { ...t.base, fontFamily: fonts.semibold },
  empty: { padding: 16 },
  primary: {
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radii.inset,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { ...t.base, fontFamily: fonts.semibold, textAlign: 'center' },
  link: { minHeight: 44, justifyContent: 'center', paddingVertical: 8 },
  linkText: { ...t.base, fontFamily: fonts.semibold, textAlign: 'center' },
  search: {
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.inset,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  searchInput: { ...t.base, flex: 1, paddingVertical: 12 },
});
