// eddy-ios/app/floats.tsx
// Floats you have kept, so a plan is not something you can only make once.
//
// The list renders from a local stub — river, both ends, distance, date — and
// nothing else. No conditions, no float time, no gauge reading. Those are
// deliberately absent rather than cached: a float saved in April and opened in
// July describes the same stretch and completely different water, and printing
// April's "4h 30m" under a July date would be a lie with a timestamp on it. The
// numbers come back from the server, recalculated, when you open one.
//
// So this screen works offline and the one behind it does not, which is the
// honest split — the list is a memory, the plan is a measurement.

import { NativeHeaderHome } from '@/components/NativeHeaderHome';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { EddyScene } from '@/components/EddyScene';
import { useSavedFloats } from '@/hooks/useSavedFloats';
import { SavedFloatRow } from '@/components/SavedFloatRow';
import { newPlanRequest } from '@/lib/planRequest';
import { useOfflineBadges } from '@/float/useOfflineBadges';
import { useAppConfig } from '@/hooks/useAppConfig';

export default function SavedFloatsScreen() {
  const { floats, ready, forget } = useSavedFloats();
  const { features } = useAppConfig();
  const offline = useOfflineBadges(floats.map((item) => item.shortCode), features.floatMode);
  const { colors, elevation } = useTheme();
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['left', 'right']}>
      <NativeHeaderHome />

      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {floats.length === 0
                ? 'Save a float to keep it here'
                : `${floats.length} float${floats.length === 1 ? '' : 's'} you have saved`}
            </Text>
          </View>
        }
        data={floats}
        keyExtractor={(item) => item.shortCode}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          ready ? (
            <View style={styles.empty}>
              {/* The empty state's whole job is to send you to the Map to plan
                  one, so it shows Eddy planning. "yellow" was a condition mood
                  on a screen with no river to have a condition. */}
              <EddyScene name="routePlanning" size={110} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                Plan a float on the Map tab and tap Save. It shows up here, re-read against the
                river every time you open it.
              </Text>
              <Pressable
                onPress={() => router.push({ pathname: '/', params: { openPlan: '1', planRequest: newPlanRequest() } })}
                style={[styles.planButton, { backgroundColor: colors.accentFill }]}
                accessibilityRole="button"
              >
                <Text style={[styles.planButtonText, { color: colors.onAccent }]}>Plan your first float</Text>
              </Pressable>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <SavedFloatRow
            float={item}
            offline={offline.get(item.shortCode)}
            onOpen={() => router.push(`/float/${item.shortCode}`)}
            onForget={() => forget(item.shortCode)}
            elevation={elevation(1)}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
  subtitle: { ...t.sm, fontFamily: fonts.body, marginTop: 4 },
  list: { paddingBottom: 24 },
  empty: { padding: 32, alignItems: 'center', gap: 12 },
  planButton: { minHeight: 44, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12, justifyContent: 'center' },
  planButtonText: { ...t.base, fontFamily: fonts.semibold },
  emptyText: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
});
