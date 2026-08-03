// eddy-ios/app/storage.tsx
// What Eddy keeps on this phone, and the one button that takes it back off.
//
// ── Why this exists ─────────────────────────────────────────────────────────
//
// The app had no in-app answer to "what are you storing and how do I get rid of
// it". That was tolerable when nothing here was large; it stopped being so the
// moment someone asked, and it is a question App Review and privacy-minded
// users both ask directly.
//
// The screen it replaces was about downloaded maps, which no longer exist. What
// is left is the half nobody ever chose to download and which does the actual
// work: every river's put-ins, hazards, line and last reading, refreshed from
// one conditional request on every launch with a connection. That is what makes
// Eddy readable at a put-in with no bars, and it happens for all 25 rivers
// whether or not anyone asks.
//
// ── Why clearing it is the quiet button ─────────────────────────────────────
//
// Pressing it makes the app WORSE offline and frees well under a megabyte. It
// is here so the answer to "can I get rid of it" is yes rather than because
// anyone should — which is why it is a bordered secondary, not a destructive
// primary, and why the copy says plainly what is lost and what is not.
//
// Colour convention, as everywhere in this app: StyleSheet.create holds layout
// and type only — it runs once at import, so a colour written into it would be
// frozen at whichever scheme the app launched with.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatBytes } from '@eddy/geo';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { cacheFootprint, clearCache, type CacheFootprint } from '@/lib/riverCache';
import { goBack } from '@/lib/nav';

export default function StorageScreen() {
  const { colors, elevation } = useTheme();
  const router = useRouter();
  const [cache, setCache] = useState<CacheFootprint | null>(null);
  const [busy, setBusy] = useState(false);

  // Measured on open rather than held in a hook: it reads every cached value
  // off disk, which is fine for a screen someone chose to look at and wrong on
  // a path any render can reach.
  const measure = useCallback(() => {
    void cacheFootprint().then(setCache);
  }, []);
  useEffect(measure, [measure]);

  const confirmClear = useCallback(() => {
    Alert.alert(
      'Clear saved river data?',
      'Put-ins, hazards, river lines and the last readings are removed from this phone. Eddy fetches them again the next time it opens with a connection — until then, rivers will be blank with no signal. Your favorites and saved floats are not affected.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            void clearCache()
              .then(measure)
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  }, [measure]);

  const empty = cache !== null && cache.entries === 0;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navRow}>
        <Pressable onPress={() => goBack(router)} hitSlop={12} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Storage</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            What Eddy keeps on this phone.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>Saved river data</Text>
          <Text style={[styles.note, { color: colors.textMuted }]}>
            Eddy keeps every river&apos;s put-ins, hazards, line and last reading here, refreshed
            whenever it has a connection. This is what lets a river open with no signal, and it
            happens for all of them automatically.
          </Text>

          <View style={styles.totalRow}>
            <Text style={[styles.total, { color: colors.text }]}>
              {cache ? formatBytes(cache.bytes) : '—'}
            </Text>
            <Text style={[styles.totalNote, { color: colors.textSubtle }]}>
              {cache
                ? `${cache.entries} item${cache.entries === 1 ? '' : 's'}`
                : 'Measuring…'}
            </Text>
          </View>

          <Pressable
            onPress={confirmClear}
            disabled={busy || cache === null || empty}
            style={[
              styles.secondary,
              { borderColor: colors.border, opacity: busy || cache === null || empty ? 0.6 : 1 },
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.secondaryText, { color: colors.textMuted }]}>
              {busy ? 'Clearing…' : 'Clear saved river data'}
            </Text>
          </Pressable>

          <Text style={[styles.legal, { color: colors.textSubtle }]}>
            Favorites, saved floats and your settings are kept separately and are not cleared by
            this button.
          </Text>
        </View>

        {/* Said here because it is the question this screen invites, and because
            the app used to have an answer that no longer exists. Someone who
            downloaded a river before will come looking for it. */}
        <Info muted={colors.textMuted} subtle={colors.textSubtle}>
          Eddy no longer downloads map backgrounds. Maps need a connection to draw, but everything
          else on a river — put-ins, hazards, the line and the last reading — works without one.
        </Info>
      </ScrollView>
    </SafeAreaView>
  );
}

function Info({
  muted,
  subtle,
  children,
}: {
  muted: string;
  subtle: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.info}>
      <Ionicons name="information-circle-outline" size={16} color={subtle} />
      <Text style={[styles.infoText, { color: muted }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  navRow: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 2 },
  content: { padding: 20, paddingBottom: 48 },
  header: { gap: 4, marginBottom: 20 },
  title: { ...t['3xl'], fontFamily: fonts.heading },
  subtitle: { ...t.sm, fontFamily: fonts.body },
  card: { borderRadius: 14, padding: 16, gap: 12 },
  rowTitle: { ...t.base, fontFamily: fonts.semibold },
  note: { ...t.sm, fontFamily: fonts.body },
  totalRow: { gap: 2 },
  total: { ...t.xl, fontFamily: fonts.heading },
  totalNote: { ...t.xs, fontFamily: fonts.body },
  secondary: { borderWidth: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  secondaryText: { ...t.sm, fontFamily: fonts.medium },
  legal: { ...t.xs, fontFamily: fonts.body },
  info: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 20 },
  infoText: { ...t.xs, fontFamily: fonts.body, flex: 1 },
});
