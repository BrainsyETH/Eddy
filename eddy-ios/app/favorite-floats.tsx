import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { FavoriteFloatSummary } from '@eddy/types';
import { ApiError, fetchFavoriteFloats } from '@/api/client';
import { readFavoriteFloats, writeFavoriteFloats } from '@/lib/favoriteFloatCache';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export default function FavoriteFloatsScreen() {
  const router = useRouter();
  const { colors, elevation } = useTheme();
  const [floats, setFloats] = useState<FavoriteFloatSummary[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const cached = await readFavoriteFloats();
    if (signal?.aborted) return;
    if (cached) setFloats((current) => current ?? cached);
    try {
      const live = await fetchFavoriteFloats(signal);
      setFloats(live);
      setError(null);
      writeFavoriteFloats(live);
    } catch (err) {
      if (err instanceof ApiError && err.message === 'Request cancelled') return;
      setFloats((current) => current ?? []);
      setError(cached ? 'Offline — showing Eddy’s saved guide picks.' : 'Couldn’t load Eddy’s guide picks. Pull down to retry.');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load is the external API synchronization for this route.
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const plan = useCallback((item: FavoriteFloatSummary) => {
    router.push({
      pathname: '/',
      params: {
        focusRiver: item.riverSlug,
        openPlan: '1',
        planPutIn: item.putInId,
        planTakeOut: item.takeOutId,
      },
    });
  }, [router]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={23} color={colors.interactive} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={[styles.title, { color: colors.text }]}>Eddy’s Favorite Floats</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Hand-picked stretches from the river guides</Text>
        </View>
      </View>
      {!floats ? (
        <View style={styles.center}><ActivityIndicator color={colors.interactive} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.interactive} />}
        >
          {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
          {floats.length === 0 ? (
            <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>No guide picks available</Text>
              <Text style={[styles.bodyText, { color: colors.textMuted }]}>Pull down when you’re back online.</Text>
            </View>
          ) : floats.map((item) => (
            <View key={item.id} style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
              {item.photoUrl ? <Image source={{ uri: item.photoUrl }} style={styles.photo} /> : null}
              <View style={styles.body}>
                <Text style={[styles.river, { color: colors.accent }]}>{item.riverName.toUpperCase()}</Text>
                <Text style={[styles.cardTitle, { color: colors.text }]}>{item.putInName} to {item.takeOutName}</Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>{item.distanceMiles} mi · ~{item.durationHours} hr · Class {item.difficulty}</Text>
                <Text style={[styles.tagline, { color: colors.text }]}>{item.tagline}</Text>
                {item.bestFor ? <Text style={[styles.bodyText, { color: colors.textMuted }]}>Best for {item.bestFor}</Text> : null}
                <Pressable
                  onPress={() => plan(item)}
                  style={({ pressed }) => [styles.button, { backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Plan ${item.putInName} to ${item.takeOutName}`}
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
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { ...t['2xl'], fontFamily: fonts.display },
  subtitle: { ...t.sm, fontFamily: fonts.body, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 16 },
  error: { ...t.sm, fontFamily: fonts.body },
  card: { borderRadius: 16, overflow: 'hidden' },
  photo: { width: '100%', height: 170 },
  body: { padding: 16 },
  river: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 0.8 },
  cardTitle: { ...t.xl, fontFamily: fonts.heading, marginTop: 3 },
  meta: { ...t.sm, fontFamily: fonts.mono, marginTop: 7 },
  tagline: { ...t.base, fontFamily: fonts.medium, marginTop: 11 },
  bodyText: { ...t.sm, fontFamily: fonts.body, marginTop: 4 },
  button: { minHeight: 48, borderRadius: 12, marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { ...t.base, fontFamily: fonts.semibold },
  empty: { borderWidth: 1, borderRadius: 16, padding: 20 },
});
