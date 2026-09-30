import type { ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useTheme } from '@/theme/ThemeProvider';
import { type as t } from '@/theme/typography';

interface Action {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}

/** The scrollable step and its persistent, keyboard-aware task actions. */
export function AlertCreationFrame({ children, primary, secondary, error }: {
  children: ReactNode;
  primary?: Action;
  secondary: Action;
  error?: string | null;
}) {
  const { colors } = useTheme();
  const headerHeight = useHeaderHeight();
  const { fontScale } = useWindowDimensions();
  const button = (action: Action, prominent: boolean) => (
    <Pressable
      onPress={action.onPress}
      disabled={action.disabled || action.busy}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      accessibilityState={{ disabled: action.disabled || action.busy, busy: action.busy }}
      style={({ pressed }) => [styles.button, fontScale > 1.3 ? styles.stackedButton : styles.rowButton, {
        backgroundColor: prominent ? colors.accentFill : colors.cardRaised,
        opacity: action.disabled ? 0.5 : pressed ? 0.75 : 1,
      }]}
    >
      {action.busy ? <ActivityIndicator color={prominent ? colors.onAccent : colors.interactive} /> : null}
      <Text style={[styles.label, { color: prominent ? colors.onAccent : colors.interactive }]}>{action.label}</Text>
    </Pressable>
  );
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.bg }]} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
        <View style={styles.fill}>{children}</View>
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          {error ? <ScrollView style={styles.error} keyboardShouldPersistTaps="handled">
            <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[t.sm, { color: colors.error }]}>{error}</Text>
          </ScrollView> : null}
          <View style={[styles.actions, fontScale > 1.3 && styles.stacked]}>
            {button(secondary, false)}
            {primary ? button(primary, true) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  footer: { padding: 16, gap: 12, borderTopWidth: StyleSheet.hairlineWidth },
  error: { maxHeight: 96 },
  actions: { flexDirection: 'row', gap: 12 },
  stacked: { flexDirection: 'column' },
  rowButton: { flex: 1 },
  stackedButton: { alignSelf: 'stretch' },
  button: { flexDirection: 'row', minHeight: 44, borderRadius: 12, padding: 12, gap: 8, alignItems: 'center', justifyContent: 'center' },
  label: { ...t.base, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
});
