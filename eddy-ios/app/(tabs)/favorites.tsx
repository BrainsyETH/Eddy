// eddy-ios/app/(tabs)/favorites.tsx
// Starred rivers, from the local-first store. Works with no account and no
// network — see src/hooks/useStarredRivers.tsx for why that matters.

import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/theme/conditions';
import { useStarredRivers } from '@/hooks/useStarredRivers';

export default function FavoritesScreen() {
  const { starred, toggleStar, ready } = useStarredRivers();

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={starred}
        keyExtractor={(item) => item.riverId}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Favorites</Text>
            <Text style={styles.subtitle}>
              {starred.length === 0
                ? 'Stars are saved on this device'
                : `${starred.length} river${starred.length === 1 ? '' : 's'} starred`}
            </Text>
          </View>
        }
        ListEmptyComponent={
          ready ? (
            <View style={styles.empty}>
              <Ionicons name="star-outline" size={40} color={COLORS.textSubtle} />
              <Text style={styles.emptyTitle}>No starred rivers yet</Text>
              <Text style={styles.emptyBody}>
                Tap the star on any river in River Reports. No account needed — stars are kept on
                this device and will sync when you sign in.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowBody}>
              <Text style={styles.riverName}>{item.name}</Text>
              <Text style={styles.riverMeta}>{item.slug}</Text>
            </View>
            <Pressable
              onPress={() => toggleStar(item)}
              hitSlop={10}
              style={styles.starButton}
              accessibilityRole="button"
              accessibilityLabel={`Unstar ${item.name}`}
            >
              <Ionicons name="star" size={22} color={COLORS.warm} />
            </Pressable>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  title: { color: COLORS.text, fontSize: 30, fontWeight: '700' },
  subtitle: { color: COLORS.textMuted, fontSize: 15, marginTop: 4 },
  empty: { alignItems: 'center', paddingHorizontal: 40, paddingTop: 60 },
  emptyTitle: { color: COLORS.text, fontSize: 18, fontWeight: '600', marginTop: 14 },
  emptyBody: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 21,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rowBody: { flex: 1 },
  riverName: { color: COLORS.text, fontSize: 17, fontWeight: '600' },
  riverMeta: { color: COLORS.textMuted, fontSize: 13, marginTop: 2 },
  starButton: { paddingLeft: 8, paddingVertical: 4 },
});
