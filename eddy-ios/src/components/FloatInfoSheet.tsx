import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export type FloatInfoTopic = 'time' | 'distance';
export function FloatInfoSheet({ topic, onClose }: { topic: FloatInfoTopic; onClose: () => void }) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const title = topic === 'time' ? 'About float times' : 'About distance';
  return (
    <Modal
      visible
      presentationStyle="pageSheet"
      animationType={reducedMotion ? 'none' : 'slide'}
      allowSwipeDismissal
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        <SafeAreaView
          style={[styles.screen, { backgroundColor: colors.sheet }]}
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
        >
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
              {title}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={`Close ${title}`}
              style={[styles.done, { backgroundColor: colors.cardRaised }]}
            >
              <Text style={[t.sm, { color: colors.interactive }]}>Done</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body}>
            {(topic === 'time'
              ? [
                  'Eddy uses published trip times when available. Otherwise, estimates use your vessel, route distance, and available river data.',
                  'River flow can change your pace. Eddy uses current readings when available; estimates based on typical conditions are labeled.',
                  'Trip times allow for typical stops. Your paddling pace and longer breaks can make the trip shorter or longer. A time range is a guide, not an arrival time.',
                  'Opening a float checks the route again, so its estimate can change as new information comes in.',
                ]
              : [
                  'Search distance is measured in a straight line from your starting location to the put-in. The drive may be longer.',
                  'River miles describe the distance you float between the put-in and take-out. They are separate from the search distance.',
                ]
            ).map((paragraph) => (
              <Text key={paragraph} style={[t.base, { color: colors.textMuted }]}>
                {paragraph}
              </Text>
            ))}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { padding: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { ...t.xl, fontFamily: fonts.heading, flex: 1 },
  done: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: 'center' },
  body: { paddingHorizontal: 20, paddingBottom: 32, gap: 18 },
});
