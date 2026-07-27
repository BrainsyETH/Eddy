// eddy-ios/app/floats.tsx
// Floats you have shared, so a plan is not something you can only make once.
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

import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { EddyScene } from '@/components/EddyScene';
import { useSavedFloats, type SavedFloat } from '@/hooks/useSavedFloats';

/** "3 days ago" — the precision a share history deserves and no more. */
function savedAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

export default function SavedFloatsScreen() {
  const { floats, ready, forget } = useSavedFloats();
  const { colors, elevation } = useTheme();
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navRow}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Saved floats</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {floats.length === 0
            ? 'Every float you share is kept here'
            : `${floats.length} float${floats.length === 1 ? '' : 's'} you have shared`}
        </Text>
      </View>

      <FlatList
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
                Plan a float on the Map tab and tap Share. The link goes to whoever is coming, and
                the float shows up here.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <SavedFloatRow
            float={item}
            onOpen={() => router.push(`/float/${item.shortCode}`)}
            onForget={() => forget(item.shortCode)}
            elevation={elevation(1)}
          />
        )}
      />
    </SafeAreaView>
  );
}

function SavedFloatRow({
  float,
  onOpen,
  onForget,
  elevation,
}: {
  float: SavedFloat;
  onOpen: () => void;
  onForget: () => void;
  elevation: object;
}) {
  const { colors } = useTheme();

  return (
    <View style={[styles.row, { backgroundColor: colors.card }, elevation]}>
      <Pressable
        onPress={onOpen}
        style={({ pressed }) => [styles.rowMain, { opacity: pressed ? 0.6 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={`${float.putInName} to ${float.takeOutName} on the ${float.riverName}`}
      >
        <Text style={[styles.rowRiver, { color: colors.textMuted }]} numberOfLines={1}>
          {float.riverName}
        </Text>
        <Text style={[styles.rowSegment, { color: colors.text }]} numberOfLines={2}>
          {float.putInName} → {float.takeOutName}
        </Text>
        <Text style={[styles.rowMeta, { color: colors.textSubtle }]} numberOfLines={1}>
          {float.distanceLabel} · {savedAgo(float.savedAt)}
        </Text>
      </Pressable>

      {/* A sibling of the open target, not a child of it, and a full-height
          column — the same rule the star follows on a river row, for the same
          reason: two overlapping touch targets make a tap ambiguous. */}
      <Pressable
        onPress={onForget}
        style={({ pressed }) => [styles.forget, { opacity: pressed ? 0.5 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${float.putInName} to ${float.takeOutName}`}
      >
        <Ionicons name="trash-outline" size={18} color={colors.textSubtle} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  navRow: { paddingHorizontal: 18, paddingTop: 6 },
  header: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 12 },
  title: { ...t['3xl'], fontFamily: fonts.display },
  subtitle: { ...t.sm, fontFamily: fonts.body, marginTop: 4 },
  list: { paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginHorizontal: 16,
    marginBottom: 9,
    borderRadius: 14,
    overflow: 'hidden',
  },
  rowMain: { flex: 1, minWidth: 0, padding: 13 },
  rowRiver: { ...t.xs, fontFamily: fonts.semibold },
  rowSegment: { ...t.sm, fontFamily: fonts.semibold, marginTop: 3 },
  rowMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 3 },
  forget: { width: 52, alignItems: 'center', justifyContent: 'center' },
  empty: { padding: 32, alignItems: 'center', gap: 12 },
  emptyText: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
});
