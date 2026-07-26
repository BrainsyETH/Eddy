// eddy-ios/app/(tabs)/favorites.tsx
// Starred rivers, from the local-first store. Works with no account and no
// network — see src/hooks/useStarredRivers.tsx for why that matters.

import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { Otter } from '@/components/Otter';
import { useStarredRivers } from '@/hooks/useStarredRivers';

export default function FavoritesScreen() {
  const { starred, toggleStar, ready } = useStarredRivers();
  const { colors, elevation } = useTheme();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <FlatList
        data={starred}
        keyExtractor={(item) => item.riverId}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Favorites</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {starred.length === 0
                ? 'Stars are saved on this device'
                : `${starred.length} river${starred.length === 1 ? '' : 's'} starred`}
            </Text>
          </View>
        }
        ListEmptyComponent={
          ready ? (
            <View style={styles.empty}>
              <Otter mood="standard" size={128} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No starred rivers yet</Text>
              <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
                Tap the star on any river in River Reports. No account needed — stars are kept on
                this device and will sync when you sign in.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: colors.card }, elevation(1)]}>
            <View style={styles.rowBody}>
              <Text style={[styles.riverName, { color: colors.text }]}>{item.name}</Text>
              <Text style={[styles.riverMeta, { color: colors.textMuted }]}>{item.slug}</Text>
            </View>
            <Pressable
              onPress={() => toggleStar(item)}
              hitSlop={10}
              style={styles.starButton}
              accessibilityRole="button"
              accessibilityLabel={`Unstar ${item.name}`}
            >
              <Ionicons name="star" size={22} color={colors.warm} />
            </Pressable>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  title: { ...t['3xl'], fontFamily: fonts.heading },
  subtitle: { ...t.sm, fontFamily: fonts.body, marginTop: 4 },
  empty: { alignItems: 'center', paddingHorizontal: 40, paddingTop: 40 },
  emptyTitle: { ...t.lg, fontFamily: fonts.semibold, marginTop: 10 },
  emptyBody: { ...t.sm, fontFamily: fonts.body, textAlign: 'center', marginTop: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 16,
    borderRadius: 14,
  },
  rowBody: { flex: 1 },
  riverName: { ...t.base, fontFamily: fonts.semibold },
  riverMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  starButton: { paddingLeft: 8, paddingVertical: 4 },
});
