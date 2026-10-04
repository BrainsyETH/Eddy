import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/** Page sheets ignore supportedOrientations on iOS. Inside the expanded chart,
 * use a full-screen panel so its own orientation mask is respected. */
export function GaugeChartSheet({ title, onClose, children, expanded = false }: {
  title: string; onClose: () => void; children: ReactNode; expanded?: boolean;
}) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  return (
    <Modal visible presentationStyle={expanded ? 'fullScreen' : 'pageSheet'}
      supportedOrientations={expanded ? ['portrait', 'landscape-left', 'landscape-right'] : ['portrait']}
      animationType={reducedMotion ? 'none' : 'slide'} allowSwipeDismissal={!expanded} onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={[styles.sheet, { backgroundColor: colors.card }]}
          accessibilityViewIsModal onAccessibilityEscape={onClose}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Close ${title}`} onPress={onClose}
              style={({ pressed }) => [styles.done, { backgroundColor: colors.cardRaised, opacity: pressed ? 0.65 : 1 }]}>
              <Text style={[styles.doneText, { color: colors.interactive }]}>Done</Text>
            </Pressable>
          </View>
          <KeyboardAvoidingView style={styles.sheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { ...t.lg, fontFamily: fonts.semibold, flex: 1 },
  done: { minWidth: 60, minHeight: 44, borderRadius: 22, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center' },
  doneText: { ...t.sm, fontFamily: fonts.semibold },
  body: { padding: 16, paddingBottom: 32, gap: 12 },
});
