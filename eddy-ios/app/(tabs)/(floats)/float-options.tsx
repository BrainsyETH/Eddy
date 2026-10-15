// eddy-ios/app/(tabs)/(floats)/float-options.tsx
// Float options: the settings a float needs now and then, kept off the Float
// Mode panel so End stays in reach. A sheet over Float Mode: tracking detail,
// the Lock Screen card, reminders, hazard reports sent from this river, and
// keep-awake. Closing it returns to the float; nothing here ends it.

import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { FloatActivityControl } from '@/float/FloatActivityControl';
import { FloatHazardReports } from '@/float/FloatHazardReports';
import { FloatReminders } from '@/float/FloatReminders';
import { useKeepAwakePreference } from '@/float/keepAwakePreference';
import { useTrackingLine } from '@/float/useTrackingLine';
import { useFloatSession } from '@/hooks/useFloatSession';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export default function FloatOptionsScreen() {
  const session = useFloatSession();
  const router = useRouter();
  const { colors } = useTheme();
  const tracking = useTrackingLine();
  const [keepAwake, setKeepAwake] = useKeepAwakePreference();

  // The float ended (automatically, say) while this sheet was open: go back,
  // and Float Mode shows the recap.
  useEffect(() => {
    if (!session && router.canGoBack()) router.back();
  }, [session, router]);

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Float options',
          presentation: 'formSheet',
          sheetAllowedDetents: [0.6, 1],
          sheetGrabberVisible: true,
          headerShown: false,
        }}
      />
      <ScrollView contentContainerStyle={styles.content} style={{ backgroundColor: colors.bg }}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
            Float options
          </Text>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
            <Text style={[styles.done, { color: colors.interactive }]}>Done</Text>
          </Pressable>
        </View>

        {tracking.line ? (
          <View style={styles.section}>
            <Text style={[styles.heading, { color: colors.text }]}>Tracking</Text>
            {tracking.line.action === 'info' ? (
              <Text style={[styles.note, { color: colors.textMuted }]}>
                {tracking.line.text}
                {tracking.line.detail ? ` ${tracking.line.detail}` : ''}
              </Text>
            ) : (
              <Pressable
                onPress={tracking.act}
                style={[styles.notice, { backgroundColor: colors.cardRaised, borderColor: colors.border }]}
                accessibilityRole="button"
              >
                <Text style={[styles.note, { color: colors.text }]}>{tracking.line.text}</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={[styles.heading, { color: colors.text }]}>Lock Screen</Text>
          <FloatActivityControl />
        </View>

        {session ? <FloatReminders session={session} /> : null}

        <View style={[styles.toggleRow, { borderColor: colors.border }]}>
          <View style={styles.toggleText}>
            <Text style={[styles.toggleTitle, { color: colors.text }]}>Keep screen awake</Text>
            <Text style={[styles.note, { color: colors.textMuted }]}>While Float Mode is open. Uses more battery.</Text>
          </View>
          <Switch value={keepAwake} onValueChange={setKeepAwake} accessibilityLabel="Keep screen awake" />
        </View>

        {session ? <FloatHazardReports session={session} /> : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...t.lg, fontFamily: fonts.heading },
  done: { ...t.base, fontFamily: fonts.semibold },
  section: { gap: 8 },
  heading: { ...t.base, fontFamily: fonts.semibold },
  note: { ...t.sm, fontFamily: fonts.body },
  notice: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  toggleText: { flex: 1 },
  toggleTitle: { ...t.base, fontFamily: fonts.semibold },
});
