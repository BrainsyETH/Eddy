import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/** A separate native presentation, sharing the inline chart's live controller.
 * The source page stays mounted, including its scroll position and map pin.
 * This modal and its chart panels permit landscape; UIKit restores the
 * presenting portrait controller on dismissal. No imperative orientation locks
 * to race on cleanup. */
export function GaugeChartFullscreen({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: (availableHeight: number) => ReactNode;
}) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const [availableHeight, setAvailableHeight] = useState(0);
  return (
    <Modal visible presentationStyle="fullScreen" supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}
      animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={onClose}>
      {/* RN Modals have their own native gesture and safe-area hierarchies. */}
      <GestureHandlerRootView style={[styles.screen, { backgroundColor: colors.card }]}>
        <SafeAreaProvider>
          <SafeAreaView style={styles.screen} accessibilityViewIsModal onAccessibilityEscape={onClose}>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
              <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{title}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close expanded chart" onPress={onClose}
                style={({ pressed }) => [styles.done, { opacity: pressed ? 0.65 : 1 }]}>
                <Text style={[styles.doneText, { color: colors.interactive }]}>Done</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.screen} contentContainerStyle={styles.body}
              onLayout={event => setAvailableHeight(event.nativeEvent.layout.height)}>
              {children(availableHeight)}
            </ScrollView>
          </SafeAreaView>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { ...t.sm, fontFamily: fonts.semibold, flex: 1 },
  done: { minWidth: 60, minHeight: 44, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center' },
  doneText: { ...t.base, fontFamily: fonts.semibold },
  body: { flexGrow: 1 },
});
