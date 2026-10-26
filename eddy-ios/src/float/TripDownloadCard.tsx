// eddy-ios/src/float/TripDownloadCard.tsx
// "Download for offline" for one trip, and its honest state.
//
// Optional: a float starts and tracks without it. What it adds is a complete
// trip on the phone: the route package (saved first, outside the cache that
// "clear saved river data" removes) and the background map. "Ready offline" is
// shown only when tripReadiness says so (src/lib/tripDownload.ts): package
// saved, current map style, every chunk complete, and the style pack
// POSITIVELY confirmed by the SDK's own counts (modules/eddy-style-pack; ADR
// 0011). Without that evidence it shows an incomplete or unconfirmed map.
// Re-read from storage each time, never remembered.
//
// Downloads run while Eddy is open; iOS pauses them in the background. The
// card says so rather than implying a download will finish on its own.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { formatBytes, type LngLat } from '@eddy/geo';
import { ControlIcon } from '@/components/ControlIcon';
import { indexRoute, type FloatRoute } from '@/lib/floatSession';
import {
  TRIP_PACKAGE_VERSION,
  planTripChunks,
  stylePackComplete,
  tripReadiness,
  type TripPackage,
  type TripChunk,
  type TripReadiness,
} from '@/lib/tripDownload';
import { getOfflineManager } from '@/map/runtime';
import { warn } from '@/lib/monitoring';
import { readStylePackInspection } from '../../modules/eddy-style-pack';
import type { StylePackRead } from '@/lib/stylePackRead';
import { onForeground } from '@/lib/foreground';
import { radii } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import {
  TRIP_STYLE_URL,
  bounded,
  readTripPackage,
  readTripPacks,
  removeTripDownload,
  saveTripPackage,
  startTripDownload,
} from './tripDownloads';

const POLL_MS = 2_000;
/**
 * Tiles can finish before the style pack (style, sprites, glyphs). Keep
 * checking this long for the style to follow before offering a recheck.
 */
const STYLE_WAIT_MS = 30_000;

function chunksFor(route: FloatRoute, tripKey: string, fromId: string, toId: string, fromLngLat?: LngLat): TripChunk[] {
  const built = indexRoute(route);
  const from = fromLngLat ?? route.anchors.find((a) => a.id === fromId)?.lngLat;
  const to = route.anchors.find((a) => a.id === toId)?.lngLat;
  return built.ok && from && to ? planTripChunks(built.index, tripKey, from, to) : [];
}

export function TripDownloadCard({
  tripKey,
  route,
  fromId,
  fromLngLat,
  toId,
  protectedByActiveFloat = false,
  compact = false,
  onPackageSaved,
}: {
  tripKey: string;
  /** The route to package if none is saved yet. A saved package's own route wins. */
  route: FloatRoute;
  fromId: string;
  /** A quick start's position on the river; wins over fromId. */
  fromLngLat?: LngLat;
  toId: string;
  /** The active float uses this map; removing it is refused. */
  protectedByActiveFloat?: boolean;
  /** Setup already explains the trip; keep the optional download brief. */
  compact?: boolean;
  /** Remember unfinished setup only after the package is durable. */
  onPackageSaved?: (pkg: TripPackage) => Promise<void>;
}) {
  const { colors, elevation } = useTheme();
  const available = getOfflineManager() != null;
  const fallbackChunks = useMemo(
    () => chunksFor(route, tripKey, fromId, toId, fromLngLat),
    [route, tripKey, fromId, toId, fromLngLat],
  );

  const [state, setState] = useState<TripReadiness | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [styleRead, setStyleRead] = useState<StylePackRead | null>(null);
  const [checking, setChecking] = useState(false);
  const mounted = useRef(true);
  const starting = useRef(false);
  const checkInFlight = useRef<Promise<void> | null>(null);
  const checkGeneration = useRef(0);
  const styleWaitReported = useRef(false);
  const invalidateCheck = useCallback(() => {
    checkGeneration.current++;
    checkInFlight.current = null;
  }, []);
  useEffect(() => {
    // Set on every mount, not only at creation: a remount (React's dev
    // double-mount, or a screen restored from the stack) must be able to
    // publish what it reads.
    mounted.current = true;
    return () => {
      mounted.current = false;
      invalidateCheck();
    };
  }, [invalidateCheck]);

  const refresh = useCallback(() => {
    // A slow native read must not overlap every 2 seconds or leave a spinner.
    if (checkInFlight.current) return checkInFlight.current;
    const generation = ++checkGeneration.current;
    const current = () => mounted.current && generation === checkGeneration.current;
    setChecking(true);
    setCheckError(null);
    const work = (async () => {
      try {
        const [pkg, packs, style] = await bounded(Promise.all([
          readTripPackage(tripKey), readTripPacks(tripKey), readStylePackInspection(TRIP_STYLE_URL),
        ]), 'offline map check', 20_000);
        if (!current()) return;
        const counts = style.kind === 'counts' ? style.counts : null;
        const next = tripReadiness(pkg, TRIP_STYLE_URL, packs, fallbackChunks.map(c => c.name), stylePackComplete(counts));
        setStyleRead(style);
        setState(next);
        if (next.kind === 'ready') {
          setDownloading(false);
          setError(null);
        } else if (next.kind === 'tiles-saved' && style.kind === 'unconfirmed') {
          // A not-yet-readable pack can appear shortly after tiles finish.
          // Keep the bounded recheck window for that case; missing support or
          // a failed read cannot tell us that a download is still progressing.
          if (style.reason !== 'native-unconfirmed') setDownloading(false);
          if (!styleWaitReported.current) {
            styleWaitReported.current = true;
            warn('float', 'offline map verification unavailable', { reason: style.reason, chunks: packs.length });
          }
        }
      } catch {
        if (!current()) return;
        setState(null);
        setDownloading(false);
        setCheckError('Couldn’t check this map. Your saved data is still on this phone.');
      } finally {
        if (current()) {
          checkInFlight.current = null;
          setChecking(false);
        }
      }
    })();
    checkInFlight.current = work;
    return work;
  }, [tripKey, fallbackChunks]);

  useFocusEffect(useCallback(() => {
    if (!available || fallbackChunks.length === 0) return;
    void refresh();
    return onForeground(() => void refresh());
  }, [available, fallbackChunks, refresh]));

  // The deadline is independent of status reads, so a stalled read cannot
  // extend "Checking offline map" forever. A recheck never restarts a download.
  useEffect(() => {
    if (!downloading || state?.kind !== 'tiles-saved') return;
    const timer = setTimeout(() => {
      invalidateCheck();
      setChecking(false);
      setDownloading(false);
      if (!styleWaitReported.current) {
        styleWaitReported.current = true;
        warn('float', 'offline map verification still incomplete');
      }
    }, STYLE_WAIT_MS);
    return () => clearTimeout(timer);
  }, [downloading, state?.kind, invalidateCheck]);

  // Poll while a download runs, so progress moves.
  useEffect(() => {
    if (!downloading) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [downloading, refresh]);

  const start = useCallback(async () => {
    // Block a second tap before the first asynchronous package read completes.
    if (starting.current || downloading) return;
    starting.current = true;
    try {
      setError(null);
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
          ...(fromLngLat ? { fromLngLat } : {}),
          toId,
          styleURL: TRIP_STYLE_URL,
          chunkNames: fallbackChunks.map((c) => c.name),
          savedAt: new Date().toISOString(),
        };
        try {
          await saveTripPackage(pkg);
        } catch {
          setError('Eddy couldn’t save this trip on your phone. Free up some storage and try again.');
          return;
        }
      }
      try {
        await onPackageSaved?.(pkg);
      } catch {
        setError('Your route was saved, but Eddy couldn’t remember this setup. Try again.');
        return;
      }
      const chunks = chunksFor(pkg.route, tripKey, pkg.fromId, pkg.toId, pkg.fromLngLat);
      styleWaitReported.current = false;
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
    } finally {
      starting.current = false;
    }
  }, [tripKey, route, fromId, fromLngLat, toId, fallbackChunks, refresh, onPackageSaved, downloading]);

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

  if (!available || fallbackChunks.length === 0) return compact ? (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
      <Text style={[styles.title, { color: colors.text }]}>Offline map · Optional</Text>
      <Text style={[styles.note, { color: colors.textMuted }]}>{!available
        ? 'Offline downloads aren’t available in this version of Eddy.'
        : 'Available once Eddy knows the full stretch.'}</Text>
    </View>
  ) : null;
  const compactOffer = compact && state?.kind === 'none' && !downloading;
  const missingVerifier = styleRead?.kind === 'unconfirmed' && styleRead.reason === 'module-missing';

  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
      <View style={styles.head}>
        <ControlIcon name="cloud-download-outline" size={18} color={colors.interactive} />
        {compactOffer ? <>
          <View style={styles.offerTitle}>
            <Text style={[styles.title, { color: colors.text }]}>Offline map</Text>
            <Text style={[styles.note, { color: colors.textMuted }]}>Optional</Text>
          </View>
          <Pressable onPress={() => void start()} accessibilityRole="button" accessibilityLabel="Download offline map" style={styles.downloadLink}>
            <Text style={[styles.linkText, { color: colors.interactive }]}>Download</Text>
          </Pressable>
        </> : <Text style={[styles.title, { color: colors.text }]}>Offline map</Text>}
      </View>

      {state == null ? (
        checking || !checkError ? <ActivityIndicator color={colors.interactive} /> :
          <Pressable onPress={() => void refresh()} accessibilityRole="button" style={styles.link}>
            <Text style={[styles.linkText, { color: colors.interactive }]}>Check again</Text>
          </Pressable>
      ) : state.kind === 'ready' ? (
        <>
          <Text style={[styles.body, { color: colors.text }]}>Ready offline · {formatBytes(state.bytes)}</Text>
          <Pressable onPress={remove} accessibilityRole="button" style={styles.link}>
            <Text style={[styles.linkText, { color: colors.error }]}>Remove download</Text>
          </Pressable>
        </>
      ) : state.kind === 'tiles-saved' ? (
        <>
          <Text style={[styles.body, { color: colors.text }]}>{downloading || checking ? 'Checking offline map' : 'Offline map not confirmed'} · {formatBytes(state.bytes)}</Text>
          {downloading ? (
            <View style={styles.row}>
              <ActivityIndicator color={colors.interactive} />
              <Text style={[styles.note, { color: colors.textMuted }]}>Map tiles are saved. Checking that the full map is ready.</Text>
            </View>
          ) : (
            <>
              <Text style={[styles.note, { color: colors.textMuted }]}>
                {missingVerifier ? 'This version of Eddy can’t verify offline maps. Update Eddy before relying on this map offline.'
                  : 'Your route and map tiles are saved. Eddy hasn’t confirmed the full offline map yet.'}
              </Text>
              <Pressable disabled={checking} onPress={() => void refresh()} accessibilityRole="button" style={styles.link}>
                <Text style={[styles.linkText, { color: colors.interactive }]}>{checking ? 'Checking…' : 'Check again'}</Text>
              </Pressable>
              {!missingVerifier ? <Pressable onPress={() => void start()} accessibilityRole="button" style={styles.link}>
                <Text style={[styles.linkText, { color: colors.interactive }]}>Retry download</Text>
              </Pressable> : null}
            </>
          )}
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
      ) : compactOffer ? null : (
        <>
          <Text style={[styles.note, { color: colors.textMuted }]}>
            Save this trip and its map so both work with no signal. Optional: River Mode tracks without it.
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

      {error ? <Text style={[styles.note, { color: colors.error }]}>{error}</Text> : null}
      {checkError ? <Text style={[styles.note, { color: colors.error }]}>{checkError}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: 14, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  offerTitle: { flex: 1, minWidth: 120 },
  downloadLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  title: { ...t.base, fontFamily: fonts.semibold },
  body: { ...t.sm, fontFamily: fonts.semibold },
  note: { ...t.sm, fontFamily: fonts.body },
  button: { minHeight: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  link: { minHeight: 44, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  linkText: { ...t.base, fontFamily: fonts.semibold },
});
