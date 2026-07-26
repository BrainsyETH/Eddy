// eddy-ios/app/(tabs)/index.tsx
// The Map tab: pick a river, see it drawn in its live condition colour, and take
// it offline.
//
// This screen has to survive Mapbox being absent. The native module cannot run
// in Expo Go, so instead of a red screen the tab explains itself and the other
// three tabs keep working — see src/map/runtime.ts.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { MapAccessPoint, RiverDetail, RiverListItem } from '@eddy/types';
import { ApiError, fetchRiverAccessPoints, fetchRiverDetail, fetchRivers } from '@/api/client';
import { COLORS, conditionColor, conditionLabel, floatableRank } from '@/theme/conditions';
import { RiverMap } from '@/map/RiverMap';
import { mapUnavailableReason } from '@/map/runtime';
import { planOffline } from '@eddy/offline';
import { useOfflinePacks } from '@/map/useOfflinePacks';
import { useStarredRivers } from '@/hooks/useStarredRivers';

export default function MapScreen() {
  const [rivers, setRivers] = useState<RiverListItem[] | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [detail, setDetail] = useState<RiverDetail | null>(null);
  const [accessPoints, setAccessPoints] = useState<MapAccessPoint[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { isStarred } = useStarredRivers();
  const packs = useOfflinePacks();
  const unavailable = mapUnavailableReason();

  useEffect(() => {
    const controller = new AbortController();
    fetchRivers(controller.signal)
      .then(setRivers)
      .catch((err) => {
        if (err instanceof ApiError && err.message === 'Request cancelled') return;
        setError(err instanceof ApiError ? err.message : 'Something went wrong');
      });
    return () => controller.abort();
  }, []);

  // Order the picker the way someone actually chooses: their starred rivers
  // first, then floatable-first within the rest. floatableRank uses
  // WEEKEND_SEVERITY, which is the "where should I go" ordering rather than the
  // alert-severity one.
  const ordered = useMemo(() => {
    if (!rivers) return [];
    return [...rivers].sort((a, b) => {
      const starDiff = Number(isStarred(b.id)) - Number(isStarred(a.id));
      if (starDiff !== 0) return starDiff;
      const rankDiff =
        floatableRank(a.currentCondition?.code ?? 'unknown') -
        floatableRank(b.currentCondition?.code ?? 'unknown');
      if (rankDiff !== 0) return rankDiff;
      return a.name.localeCompare(b.name);
    });
  }, [rivers, isStarred]);

  useEffect(() => {
    if (!selectedSlug && ordered.length > 0) setSelectedSlug(ordered[0].slug);
  }, [ordered, selectedSlug]);

  // Geometry is the heaviest response the app fetches — the Current River alone
  // is a 632-point LineString — so it loads one river at a time, on selection,
  // never eagerly for all thirteen.
  useEffect(() => {
    if (!selectedSlug) return;
    const controller = new AbortController();
    setLoadingDetail(true);
    setDetail(null);
    setAccessPoints([]);

    Promise.all([
      fetchRiverDetail(selectedSlug, controller.signal),
      // Access points are a nice-to-have: an empty list still leaves a usable
      // map, so a failure here must not blank the river.
      fetchRiverAccessPoints(selectedSlug, controller.signal).catch(() => []),
    ])
      .then(([river, points]) => {
        setDetail(river);
        setAccessPoints(points);
        setError(null);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.message === 'Request cancelled') return;
        setError(err instanceof ApiError ? err.message : 'Could not load this river');
      })
      .finally(() => setLoadingDetail(false));

    return () => controller.abort();
  }, [selectedSlug]);

  const selected = useMemo(
    () => ordered.find((r) => r.slug === selectedSlug) ?? null,
    [ordered, selectedSlug],
  );

  const plan = useMemo(() => (detail ? planOffline(detail) : null), [detail]);
  const isDownloaded = selectedSlug ? packs.isDownloaded(selectedSlug) : false;

  const onDownload = useCallback(async () => {
    if (!detail) return;
    setBusy(true);
    const result = await packs.download(detail);
    setBusy(false);
    if (!result.ok && result.error) setError(result.error);
  }, [detail, packs]);

  const onRemove = useCallback(async () => {
    if (!selectedSlug) return;
    setBusy(true);
    await packs.remove(selectedSlug);
    setBusy(false);
  }, [packs, selectedSlug]);

  const conditionCode = selected?.currentCondition?.code ?? 'unknown';

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Map</Text>
        {selected ? (
          <View style={styles.headerMeta}>
            <View style={[styles.dot, { backgroundColor: conditionColor(conditionCode) }]} />
            <Text style={styles.headerMetaText}>
              {selected.name} · {conditionLabel(conditionCode)}
            </Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.picker}
        contentContainerStyle={styles.pickerRow}
      >
        {ordered.map((river) => {
          const active = river.slug === selectedSlug;
          return (
            <Pressable
              key={river.id}
              onPress={() => setSelectedSlug(river.slug)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <View
                style={[
                  styles.chipDot,
                  { backgroundColor: conditionColor(river.currentCondition?.code ?? 'unknown') },
                ]}
              />
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{river.name}</Text>
              {packs.isDownloaded(river.slug) ? (
                <Ionicons name="cloud-done" size={13} color={COLORS.success} />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.mapArea}>
        {unavailable ? (
          <MapUnavailable reason={unavailable} />
        ) : loadingDetail || !detail ? (
          <View style={styles.centered}>
            <ActivityIndicator color={COLORS.accent} />
          </View>
        ) : (
          <RiverMap river={detail} accessPoints={accessPoints} conditionCode={conditionCode} />
        )}
      </View>

      <View style={styles.footer}>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {packs.active ? (
          <View style={styles.progressRow}>
            <ActivityIndicator color={COLORS.accent} size="small" />
            <Text style={styles.progressText}>Downloading… {packs.active.percent}%</Text>
          </View>
        ) : unavailable ? null : isDownloaded ? (
          <Pressable style={styles.secondaryButton} onPress={onRemove} disabled={busy}>
            <Ionicons name="trash-outline" size={16} color={COLORS.textMuted} />
            <Text style={styles.secondaryButtonText}>Remove offline map</Text>
          </Pressable>
        ) : plan ? (
          <Pressable style={styles.button} onPress={onDownload} disabled={busy}>
            <Ionicons name="cloud-download-outline" size={17} color="#FFFFFF" />
            <Text style={styles.buttonText}>Download for offline · {plan.sizeLabel}</Text>
          </Pressable>
        ) : null}

        {plan && !isDownloaded && !packs.active ? (
          // Stating the size before the tap is the point of the tile maths.
          // Downloading the plain bounding box instead of following the river
          // would be several times this, so the number is worth showing.
          <Text style={styles.footnote}>
            {plan.regions.length} areas along the river, zoom {plan.minZoom}–{plan.maxZoom}.
            Works with no signal once downloaded.
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

/**
 * The honest empty state. Expo Go genuinely cannot load a native map, and saying
 * so beats an infinite spinner that looks like a network problem.
 */
function MapUnavailable({ reason }: { reason: 'expo-go' | 'missing-token' | 'load-failed' }) {
  const copy = {
    'expo-go': {
      title: 'Map needs a full build',
      body: 'Maps use a native module that Expo Go cannot load. Run a development build (eas build --profile development) to see the map. The other tabs work here.',
    },
    'missing-token': {
      title: 'Map key missing',
      body: 'Set EXPO_PUBLIC_MAPBOX_TOKEN to a Mapbox public token and rebuild.',
    },
    'load-failed': {
      title: 'Map failed to load',
      body: 'The map module could not start. Everything else still works.',
    },
  }[reason];

  return (
    <View style={styles.centered}>
      <Ionicons name="map-outline" size={44} color={COLORS.textSubtle} />
      <Text style={styles.unavailableTitle}>{copy.title}</Text>
      <Text style={styles.unavailableBody}>{copy.body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: 20, paddingTop: 12 },
  title: { color: COLORS.text, fontSize: 30, fontWeight: '700' },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
  dot: { width: 9, height: 9, borderRadius: 999 },
  headerMetaText: { color: COLORS.textMuted, fontSize: 14 },
  // A horizontal ScrollView in a column stretches to fill the cross axis by
  // default, which made every chip as tall as the free space and squeezed the
  // map into a strip. flexGrow: 0 sizes the row to its content; alignItems
  // stops the chips themselves stretching inside it.
  picker: { flexGrow: 0, flexShrink: 0 },
  pickerRow: { alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  chipActive: { borderColor: COLORS.accent, backgroundColor: COLORS.cardRaised },
  chipDot: { width: 7, height: 7, borderRadius: 999 },
  chipText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: COLORS.text },
  mapArea: { flex: 1, overflow: 'hidden' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  unavailableTitle: { color: COLORS.text, fontSize: 18, fontWeight: '600', marginTop: 14 },
  unavailableBody: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 21,
  },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  errorText: { color: COLORS.warm, fontSize: 13, marginBottom: 10 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    paddingVertical: 13,
    borderRadius: 12,
  },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 12,
    borderRadius: 12,
  },
  secondaryButtonText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '600' },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 13,
  },
  progressText: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  footnote: {
    color: COLORS.textSubtle,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 17,
  },
});
