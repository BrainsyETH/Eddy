import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { FavoriteFloatSummary } from '@eddy/types';
import { fetchFavoriteFloats } from '@/api/client';
import { radius, spacing } from '@/theme/metrics';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export default function FavoriteFloatsScreen() {
  const router = useRouter();
  const { colors, elevation } = useTheme();
  const [floats, setFloats] = useState<FavoriteFloatSummary[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setFloats(await fetchFavoriteFloats(signal));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color={colors.interactive} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.text }]}>Eddy’s Favorite Floats</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Field-tested routes from Eddy’s river guides</Text>
        </View>
      </View>

      {!floats ? (
        <View style={styles.center}><ActivityIndicator color={colors.interactive} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.interactive} />}
        >
          {floats.length === 0 ? (
            <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Float guides are resting at the put-in</Text>
              <Text style={[styles.emptyBody, { color: colors.textMuted }]}>Pull to refresh when you’re back online.</Text>
            </View>
          ) : floats.map((float) => (
            <View key={float.id} style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
              {float.photoUrl ? <Image source={{ uri: float.photoUrl }} style={styles.photo} /> : null}
              <View style={styles.body}>
                <Text style={[styles.river, { color: colors.accent }]}>{float.riverName.toUpperCase()}</Text>
                <Text style={[styles.cardTitle, { color: colors.text }]}>{float.putInName} to {float.takeOutName}</Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>{float.distanceMiles} mi · ~{float.durationHours} hr · Class {float.difficulty}</Text>
                <Text style={[styles.tagline, { color: colors.text }]}>{float.tagline}</Text>
                {float.bestFor ? <Text style={[styles.bestFor, { color: colors.textMuted }]}>Best for {float.bestFor}</Text> : null}
                <Pressable
                  onPress={() => router.push({
                    pathname: '/(tabs)',
                    params: { river: float.riverSlug, plan: '1', from: float.fromSlug, to: float.toSlug },
                  })}
                  style={({ pressed }) => [styles.button, { backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill }]}
                  accessibilityRole="button"
                >
                  <Ionicons name="map-outline" size={18} color={colors.onAccent} />
                  <Text style={[styles.buttonText, { color: colors.onAccent }]}>Plan this float</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  headerText: { flex: 1 },
  title: { ...t['2xl'], fontFamily: fonts.displayBold },
  subtitle: { ...t.sm, fontFamily: fonts.body, marginTop: 2 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 40, gap: spacing.lg },
  card: { borderRadius: radius.card, overflow: 'hidden' },
  photo: { width: '100%', height: 170 },
  body: { padding: spacing.lg },
  river: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 0.8 },
  cardTitle: { ...t.xl, fontFamily: fonts.heading, marginTop: 3 },
  meta: { ...t.sm, fontFamily: fonts.mono, marginTop: spacing.sm },
  tagline: { ...t.base, fontFamily: fonts.medium, marginTop: spacing.md },
  bestFor: { ...t.sm, fontFamily: fonts.body, marginTop: spacing.xs },
  button: { minHeight: 48, borderRadius: radius.control, marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  buttonText: { ...t.base, fontFamily: fonts.semibold },
  empty: { borderRadius: radius.card, borderWidth: 1, padding: spacing.xl },
  emptyTitle: { ...t.xl, fontFamily: fonts.heading },
  emptyBody: { ...t.sm, fontFamily: fonts.body, marginTop: spacing.sm },
});
