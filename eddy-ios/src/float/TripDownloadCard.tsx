// eddy-ios/src/float/TripDownloadCard.tsx
// "Download for offline" for one trip, and its honest state.
//
// Optional: a float starts and tracks without it. What it adds is a complete
// trip on the phone: the route package (saved first, outside the cache that
// "clear saved river data" removes) and the background map. "Ready offline" is
// shown only when tripReadiness says so (src/lib/tripDownload.ts): package
// saved, current map style, every chunk complete, and the style pack loaded
// cleanly. Re-read from storage each time, never remembered.
//
// Downloads run while Eddy is open; iOS pauses them in the background. The
// card says so rather than implying a download will finish on its own.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatBytes } from '@eddy/geo';
import { ControlIcon } from '@/components/ControlIcon';
import { indexRoute, type FloatRoute } from '@/lib/floatSession';
import {
  TRIP_PACKAGE_VERSION,
  planTripChunks,
  tripReadiness,
  type TripChunk,
  type TripReadiness,
} from '@/lib/tripDownload';
import { getOfflineManager } from '@/map/runtime';
import { radii } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import {
  TRIP_STYLE_URL,
  readTripPackage,
  readTripPacks,
  removeTripDownload,
  saveTripPackage,
  startTripDownload,
} from './tripDownloads';

const POLL_MS = 2_000;

function chunksFor(route: FloatRoute, tripKey: string, fromId: string, toId: string): TripChunk[] {
  const built = indexRoute(route);
  const from = route.anchors.find((a) => a.id === fromId)?.lngLat;
  const to = route.anchors.find((a) => a.id === toId)?.lngLat;
  return built.ok && from && to ? planTripChunks(built.index, tripKey, from, to) : [];
}

export function TripDownloadCard({
  tripKey,
  route,
  fromId,
  toId,
  protectedByActiveFloat = false,
}: {
  tripKey: string;
  /** The route to package if none is saved yet. A saved package's own route wins. */
  route: FloatRoute;
  fromId: string;
  toId: string;
  /** The active float uses this map; removing it is refused. */
  protectedByActiveFloat?: boolean;
}) {
  const { colors, elevation } = useTheme();
  const available = getOfflineManager() != null;
  const fallbackChunks = useMemo(() => chunksFor(route, tripKey, fromId, toId), [route, tripKey, fromId, toId]);

  const [state, setState] = useState<TripReadiness | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  // Whether the download run in progress has reported any error; a clean run
  // that completes the tiles is the evidence the style pack loaded.
  const runErrored = useRef(false);
  // A run started from this card is in progress (until ready or an error).
  const runActive = useRef(false);
  useEffect(() => () => void (mounted.current = false), []);

  const refresh = useCallback(async () => {
    let pkg = await readTripPackage(tripKey);
    const packs = await readTripPacks(tripKey);
    let next = tripReadiness(pkg, TRIP_STYLE_URL, packs, fallbackChunks.map((c) => c.name));
    if (pkg && !pkg.styleVerified && runActive.current && !runErrored.current) {
      const tilesDone = tripReadiness({ ...pkg, styleVerified: true }, TRIP_STYLE_URL, packs, []);
      if (tilesDone.kind === 'ready') {
        pkg = { ...pkg, styleVerified: true };
        try {
          await saveTripPackage(pkg);
          next = tilesDone;
        } catch {
          // Stays partial; the next refresh tries again.
        }
      }
    }
    if (!mounted.current) return;
    setState(next);
    if (next.kind === 'ready') {
      runActive.current = false;
      setDownloading(false);
    }
  }, [tripKey, fallbackChunks]);

  useEffect(() => {
    if (!available || fallbackChunks.length === 0) return;
    void refresh();
  }, [available, fallbackChunks, refresh]);

  // Poll while a download runs, so progress moves.
  useEffect(() => {
    if (!downloading) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [downloading, refresh]);

  const start = useCallback(async () => {
    setError(null);
    runErrored.current = false;
    // The package first: an offline start depends on it, tiles or not. A
    // package already saved keeps its route, so a resume downloads exactly
    // what it planned.
    let pkg = await readTripPackage(tripKey);
    if (!pkg || pkg.styleURL !== TRIP_STYLE_URL) {
      pkg = {
        version: TRIP_PACKAGE_VERSION,
        tripKey,
        route,
        fromId,
        toId,
        styleURL: TRIP_STYLE_URL,
        chunkNames: fallbackChunks.map((c) => c.name),
        savedAt: new Date().toISOString(),
        styleVerified: false,
      };
      try {
        await saveTripPackage(pkg);
      } catch {
        setError('Eddy couldn’t save this trip on your phone. Free up some storage and try again.');
        return;
      }
    }
    const chunks = chunksFor(pkg.route, tripKey, pkg.fromId, pkg.toId);
    setDownloading(true);
    runActive.current = true;
    try {
      await startTripDownload(chunks, (message) => {
        runErrored.current = true;
        runActive.current = false;
        if (!mounted.current) return;
        setError(message);
        setDownloading(false);
      });
    } catch (err) {
      runErrored.current = true;
      runActive.current = false;
      setError(err instanceof Error ? err.message : 'Download could not start.');
      setDownloading(false);
    }
    void refresh();
  }, [tripKey, route, fromId, toId, fallbackChunks, refresh]);

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

  if (!available || fallbackChunks.length === 0) return null;

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
      ) : state.kind === 'outdated' ? (
        <>
          <Text style={[styles.note, { color: colors.textMuted }]}>
            This map was saved for an older version of Eddy’s map. Remove it and download again.
          </Text>
          <Pressable onPress={remove} accessibilityRole="button" style={styles.link}>
            <Text style={[styles.linkText, { color: colors.error }]}>Remove download</Text>
          </Pressable>
        </>
      ) : state.kind === 'partial' || downloading ? (
        <>
          <Text style={[styles.body, { color: colors.text }]}>
            {downloading ? 'Downloading' : 'Not finished'} · {Math.round((state.kind === 'partial' ? state.fraction : 0) * 100)}%
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
            Save this trip and its map so both work with no signal. Optional: Float Mode tracks without it.
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
