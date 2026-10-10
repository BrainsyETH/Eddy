// eddy-ios/src/float/TripDownloadCard.tsx
// "Download for offline" for one trip, and its honest state.
//
// Optional: a float starts and tracks without it (the river line and access
// points are always copied into the session). What it adds is the background
// map with no signal. "Ready offline" is shown only when every chunk reports
// complete, re-read from the native store, never remembered.
//
// Downloads run while Eddy is open; iOS pauses them in the background. The
// card says so rather than implying a download will finish on its own.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatBytes } from '@eddy/geo';
import { ControlIcon } from '@/components/ControlIcon';
import { indexRoute, type FloatRoute } from '@/lib/floatSession';
import { planTripChunks, type TripDownloadState } from '@/lib/tripDownload';
import { getOfflineManager } from '@/map/runtime';
import { radii } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { readTripDownload, removeTripDownload, startTripDownload } from './tripDownloads';

const POLL_MS = 2_000;

export function TripDownloadCard({
  tripKey,
  route,
  fromId,
  toId,
  protectedByActiveFloat = false,
}: {
  tripKey: string;
  route: FloatRoute;
  fromId: string;
  toId: string;
  /** The active float uses this map; removing it is refused. */
  protectedByActiveFloat?: boolean;
}) {
  const { colors, elevation } = useTheme();
  const available = getOfflineManager() != null;

  const chunks = useMemo(() => {
    const built = indexRoute(route);
    const from = route.anchors.find((a) => a.id === fromId)?.lngLat;
    const to = route.anchors.find((a) => a.id === toId)?.lngLat;
    return built.ok && from && to ? planTripChunks(built.index, tripKey, from, to) : [];
  }, [route, tripKey, fromId, toId]);

  const [state, setState] = useState<TripDownloadState | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);

  const refresh = useCallback(async () => {
    const next = await readTripDownload(tripKey, chunks);
    if (!mounted.current) return;
    setState(next);
    if (next.kind === 'ready') setDownloading(false);
  }, [tripKey, chunks]);

  useEffect(() => {
    if (!available || chunks.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh reads the native offline store, an external system.
    void refresh();
  }, [available, chunks, refresh]);

  // Poll while a download is running or left partial, so progress moves.
  useEffect(() => {
    if (!downloading) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [downloading, refresh]);

  const start = useCallback(async () => {
    setError(null);
    setDownloading(true);
    try {
      await startTripDownload(chunks, (message) => {
        if (!mounted.current) return;
        setError(message);
        setDownloading(false);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download could not start.');
      setDownloading(false);
    }
    void refresh();
  }, [chunks, refresh]);

  const remove = useCallback(() => {
    if (protectedByActiveFloat) {
      Alert.alert('In use', 'This map is being used by the float in progress. End the float first.');
      return;
    }
    Alert.alert('Remove offline map?', 'The saved float stays. You can download the map again later.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => void removeTripDownload(tripKey).then(refresh),
      },
    ]);
  }, [protectedByActiveFloat, tripKey, refresh]);

  if (!available || chunks.length === 0) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
      <View style={styles.head}>
        <ControlIcon name="cloud-download-outline" size={18} color={colors.interactive} />
        <Text style={[styles.title, { color: colors.text }]}>Offline map</Text>
      </View>

      {state == null ? (
        <ActivityIndicator color={colors.interactive} />
      ) : state.kind === 'ready' ? (
        <>
          <Text style={[styles.body, { color: colors.text }]}>Ready offline · {formatBytes(state.bytes)}</Text>
          <Pressable onPress={remove} accessibilityRole="button" style={styles.link}>
            <Text style={[styles.linkText, { color: colors.error }]}>Remove download</Text>
          </Pressable>
        </>
      ) : state.kind === 'partial' || downloading ? (
        <>
          <Text style={[styles.body, { color: colors.text }]}>
            {downloading ? 'Downloading' : 'Paused'} · {Math.round((state.kind === 'partial' ? state.fraction : 0) * 100)}%
          </Text>
          <Text style={[styles.note, { color: colors.textMuted }]}>
            Keep Eddy open to finish. Downloads pause when Eddy is in the background.
          </Text>
          {!downloading ? (
            <Pressable onPress={() => void start()} accessibilityRole="button" style={styles.link}>
              <Text style={[styles.linkText, { color: colors.interactive }]}>Resume download</Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <>
          <Text style={[styles.note, { color: colors.textMuted }]}>
            Save the map for this stretch so it shows with no signal. Optional: Float Mode tracks without it.
          </Text>
          <Pressable
            onPress={() => void start()}
            style={({ pressed }) => [styles.button, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
            accessibilityRole="button"
          >
            <Text style={[styles.linkText, { color: colors.interactive }]}>Download for offline</Text>
          </Pressable>
        </>
      )}

      {error ? <Text style={[styles.note, { color: colors.error }]}>{error} Try again with a signal.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: 14, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...t.base, fontFamily: fonts.semibold },
  body: { ...t.sm, fontFamily: fonts.semibold },
  note: { ...t.sm, fontFamily: fonts.body },
  button: { minHeight: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { ...t.base, fontFamily: fonts.semibold },
});
