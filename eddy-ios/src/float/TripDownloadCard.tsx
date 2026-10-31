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
import type { LngLat } from '@eddy/geo';
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
import { diagnoseStylePack, readStylePackInspection } from '../../modules/eddy-style-pack';
import { tilesSavedCopy, type StylePackRead } from '@/lib/stylePackRead';
import { onForeground } from '@/lib/foreground';
import { prefetchStretchPhotos } from './floatPhotos';
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
  /** When a tapped Check again finished, so the tap visibly did something. */
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const mounted = useRef(true);
  const starting = useRef(false);
  // The pack creation in flight, so Stop and remove can halt it and wait for
  // the last pack it started before deleting them all.
  const creation = useRef<{ controller: AbortController; done: Promise<void> } | null>(null);
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
          // A not-yet-readable pack, or a read that got no answer while the
          // style is still being written, can settle shortly after the tiles.
          // Keep the bounded recheck window for those; missing support or a
          // read that threw cannot tell us a download is still progressing.
          if (style.reason === 'module-missing' || style.reason === 'read-failed') setDownloading(false);
          if (!styleWaitReported.current) {
            styleWaitReported.current = true;
            warn('float', 'offline map verification unavailable', { reason: style.reason, chunks: packs.length });
            // Diagnostics only: ask the store directly why the check got no
            // answer. Up to 30 seconds, in the background; it changes nothing.
            if (style.reason === 'timeout' || style.reason === 'read-failed') {
              void diagnoseStylePack(TRIP_STYLE_URL).then((report) => {
                warn('float', 'offline map style diagnosis', { ...report, reason: style.reason, chunks: packs.length });
              });
            }
          }
        } else if (next.kind === 'tiles-saved' && style.kind === 'counts' && !styleWaitReported.current) {
          // The counts the card now shows; until now no report carried them.
          styleWaitReported.current = true;
          warn('float', 'offline map style incomplete', {
            required: style.counts.requiredResourceCount,
            completed: style.counts.completedResourceCount,
            chunks: packs.length,
          });
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

  // A tapped check reports its outcome; one that changes the state shows the
  // new state instead, and one that fails shows the check error.
  const checkAgain = useCallback(async () => {
    setCheckedAt(null);
    await refresh();
    if (mounted.current) setCheckedAt(new Date());
  }, [refresh]);

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

  // Poll while a download runs, so progress moves: one this card started, or
  // one still progressing natively after a remount (`downloading` is this
  // mount's own flag, not the native side's). A partial map whose progress
  // stops moving stops being polled after a few reads; Resume or a return to
  // the screen starts again.
  const partial = state?.kind === 'partial';
  const fraction = state?.kind === 'partial' ? state.fraction : null;
  const stalled = useRef({ fraction: null as number | null, reads: 0 });
  useEffect(() => {
    if (!downloading && !partial) return;
    stalled.current = { fraction, reads: 0 };
    const timer = setInterval(() => {
      if (!downloading) {
        const seen = stalled.current;
        if (seen.fraction === fraction) seen.reads += 1;
        else stalled.current = { fraction, reads: 0 };
        if (stalled.current.reads >= 5) return;
      }
      void refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [downloading, partial, fraction, refresh]);

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
      // "Download for offline" also saves the stretch's access photos, so
      // Float tools shows them at the river; not part of map readiness.
      void prefetchStretchPhotos({ riverSlug: pkg.route.riverSlug, takeOutId: pkg.toId, fromId: pkg.fromId || null });
      styleWaitReported.current = false;
      setCheckedAt(null);
      setDownloading(true);
      const controller = new AbortController();
      const run = startTripDownload(chunks, (message) => {
        if (!mounted.current) return;
        setError(message);
        setDownloading(false);
      }, controller.signal);
      creation.current = { controller, done: run.then(() => {}, () => {}) };
      try {
        await run;
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Download could not start.');
          setDownloading(false);
        }
      } finally {
        if (creation.current?.controller === controller) creation.current = null;
      }
      void refresh();
    } finally {
      starting.current = false;
    }
  }, [tripKey, route, fromId, fromLngLat, toId, fallbackChunks, refresh, onPackageSaved, downloading]);

  const remove = useCallback((cancelling = false) => {
    if (protectedByActiveFloat) {
      Alert.alert('In use', 'This map is being used by the float in progress. End the float first.');
      return;
    }
    Alert.alert(
      cancelling ? 'Stop this download?' : 'Remove offline map?',
      cancelling ? 'What has downloaded so far is removed. The saved float stays.' : 'The saved float stays. You can download the map again later.',
      [
        { text: cancelling ? 'Keep downloading' : 'Cancel', style: 'cancel' },
        {
          text: cancelling ? 'Stop and remove' : 'Remove',
          style: 'destructive',
          onPress: () => {
            setDownloading(false);
            // Halt pack creation first and let the pack it is creating land,
            // so the removal below sees, and deletes, every one of them.
            const inFlight = creation.current;
            inFlight?.controller.abort();
            void (inFlight?.done ?? Promise.resolve())
              .then(() => removeTripDownload(tripKey))
              .then(() => { setError(null); return refresh(); })
              // A failed native delete leaves the pack: say so, rather than an
              // unhandled rejection and a card that silently keeps it.
              .catch((err) => {
                warn('float', 'could not remove a trip download', err);
                setError('Couldn’t remove this map. Try again.');
                void refresh();
              });
          },
        },
      ],
    );
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
  const savedCopy = tilesSavedCopy(styleRead);

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
          <Text style={[styles.body, { color: colors.text }]}>Ready offline</Text>
          <Pressable onPress={() => remove()} accessibilityRole="button" style={styles.link}>
            <Text style={[styles.linkText, { color: colors.error }]}>Remove download</Text>
          </Pressable>
        </>
      ) : state.kind === 'tiles-saved' ? (
        <>
          {downloading ? (
            <>
              <Text style={[styles.body, { color: colors.text }]}>Checking offline map</Text>
              <View style={styles.row}>
                <ActivityIndicator color={colors.interactive} />
                <Text style={[styles.note, { color: colors.textMuted }]}>Checking the map…</Text>
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.body, { color: colors.text }]}>{savedCopy.title}</Text>
              {savedCopy.note ? <Text style={[styles.note, { color: colors.textMuted }]}>{savedCopy.note}</Text> : null}
              {savedCopy.action === 'finish' ? (
                <Pressable
                  onPress={() => void start()}
                  style={({ pressed }) => [styles.button, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.linkText, { color: colors.interactive }]}>Finish download</Text>
                </Pressable>
              ) : null}
              {/* The main action when the check is what failed; a link otherwise. */}
              <Pressable
                disabled={checking}
                onPress={() => void checkAgain()}
                accessibilityRole="button"
                accessibilityState={{ busy: checking, disabled: checking }}
                style={savedCopy.action === 'check'
                  ? ({ pressed }) => [styles.button, { borderColor: colors.border, opacity: checking ? 0.6 : pressed ? 0.6 : 1 }]
                  : styles.link}
              >
                <Text style={[styles.linkText, { color: colors.interactive }]}>{checking ? 'Checking…' : 'Check again'}</Text>
              </Pressable>
              {checkedAt && !checking ? (
                <Text style={[styles.note, { color: colors.textMuted }]} accessibilityLiveRegion="polite">
                  Checked at {checkedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.
                </Text>
              ) : null}
            </>
          )}
          <Pressable onPress={() => remove()} accessibilityRole="button" style={styles.link}>
            <Text style={[styles.linkText, { color: colors.error }]}>Remove download</Text>
          </Pressable>
        </>
      ) : state.kind === 'outdated' ? (
        <>
          <Text style={[styles.note, { color: colors.textMuted }]}>
            This map is out of date. Remove it and download again.
          </Text>
          <Pressable onPress={() => remove()} accessibilityRole="button" style={styles.link}>
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
          <Pressable onPress={() => remove(downloading)} accessibilityRole="button" style={styles.link}>
            <Text style={[styles.linkText, { color: colors.error }]}>{downloading ? 'Cancel download' : 'Remove download'}</Text>
          </Pressable>
        </>
      ) : compactOffer ? null : (
        <>
          <Text style={[styles.note, { color: colors.textMuted }]}>
            Save this trip and its map so both work with no signal.
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
