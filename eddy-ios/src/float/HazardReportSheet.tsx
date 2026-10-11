// eddy-ios/src/float/HazardReportSheet.tsx
// "Report a hazard here" from Float Mode (#1448 Phase 5, #1453).
//
// One question (what is it?), an optional note, and the position it will be
// reported at, shown before sending so the paddler can confirm it: river mile
// when the fix is on the river, GPS accuracy, and how old it is. Saving works
// with no signal; the report waits on the phone (src/lib/hazardReportQueue.ts)
// and says so. Reports are reviewed before anyone else sees them.

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import { locateOnRoute } from '@eddy/geo';
import { indexRoute, type FloatSession } from '@/lib/floatSession';
import { HAZARD_KINDS, newReportId, type HazardKind } from '@/lib/hazardReportQueue';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { addHazardReport } from './hazardReports';

/** A fresh fix is worth waiting this long for; then the last known one is used. */
const FIX_TIMEOUT_MS = 10_000;
/** Farther than this from the line, no river mile is claimed for the report. */
const ON_RIVER_M = 150;

interface Here {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  at: number;
  /** How old the position was when it was found, in whole minutes. */
  minutesOld: number;
}

/** Mounted only while open, so every report starts from a clean sheet. */
export function HazardReportSheet({ onClose, session }: { onClose: (saved: boolean) => void; session: FloatSession }) {
  const { colors } = useTheme();
  const [kind, setKind] = useState<HazardKind | null>(null);
  const [note, setNote] = useState('');
  const [here, setHere] = useState<Here | null>(null);
  const [locating, setLocating] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A fresh position; the last known one if GPS is slow; the float's own last
  // confirmed position as a last resort. Read once, when the sheet opens.
  const [opened] = useState(() => ({ position: session.position }));
  useEffect(() => {
    let cancelled = false;
    type Found = Omit<Here, 'minutesOld'>;
    const fallback: Found | null = opened.position
      ? { latitude: opened.position.lngLat[1], longitude: opened.position.lngLat[0], accuracyMeters: null, at: opened.position.at }
      : null;
    const fromFix = (fix: Location.LocationObject | null): Found | null =>
      fix ? { latitude: fix.coords.latitude, longitude: fix.coords.longitude, accuracyMeters: fix.coords.accuracy ?? null, at: fix.timestamp } : null;
    void Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).then(fromFix),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_TIMEOUT_MS)),
    ])
      .catch(() => null)
      .then(async (fresh) => fresh ?? fromFix(await Location.getLastKnownPositionAsync().catch(() => null)) ?? fallback)
      .then((found) => {
        if (cancelled) return;
        setHere(found ? { ...found, minutesOld: Math.max(0, Math.round((Date.now() - found.at) / 60_000)) } : null);
        setLocating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [opened]);

  const riverMile = useMemo(() => {
    if (!here) return null;
    const built = indexRoute(session.route);
    if (!built.ok) return null;
    const placed = locateOnRoute(built.index, [here.longitude, here.latitude]);
    return placed && placed.offsetMeters <= ON_RIVER_M ? placed.riverMile : null;
  }, [here, session.route]);

  const whereLine = !here
    ? null
    : [
        riverMile != null ? `Near river mile ${riverMile.toFixed(1)}` : 'Away from the river line',
        here.accuracyMeters != null ? `±${Math.round(here.accuracyMeters)} m` : null,
        here.minutesOld >= 1 ? `position from ${here.minutesOld} min ago` : 'just now',
      ].filter(Boolean).join(' · ');

  const save = async () => {
    if (!kind || !here || saving) return;
    setSaving(true);
    setError(null);
    try {
      await addHazardReport({
        id: newReportId(),
        riverSlug: session.route.riverSlug,
        riverName: session.route.riverName,
        latitude: here.latitude,
        longitude: here.longitude,
        accuracyMeters: here.accuracyMeters,
        capturedAt: new Date(here.at).toISOString(),
        riverMile,
        kind,
        note,
      });
      onClose(true);
    } catch {
      setError('Eddy couldn’t save this on your phone. Free up some storage and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => onClose(false)}>
      <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
        <View style={styles.head}>
          <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">Report a hazard here</Text>
          <Pressable onPress={() => onClose(false)} accessibilityRole="button" hitSlop={12}>
            <Text style={[styles.cancel, { color: colors.interactive }]}>Cancel</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={[styles.where, { backgroundColor: colors.card }]}>
            {locating ? (
              <View style={styles.row}>
                <ActivityIndicator color={colors.interactive} />
                <Text style={[styles.note, { color: colors.textMuted }]}>Finding your position…</Text>
              </View>
            ) : here ? (
              <Text style={[styles.whereText, { color: colors.text }]}>{whereLine}</Text>
            ) : (
              <Text style={[styles.note, { color: colors.textMuted }]}>Eddy can’t place you right now, so there’s nothing to report a location for. Try again in a moment.</Text>
            )}
          </View>

          <Text style={[styles.label, { color: colors.textMuted }]}>What is it?</Text>
          <View style={styles.kinds}>
            {HAZARD_KINDS.map((option) => {
              const selected = option.id === kind;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => setKind(option.id)}
                  style={[styles.kind, { borderColor: selected ? colors.interactive : colors.border, backgroundColor: selected ? colors.selectionBg : colors.card }]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.kindText, { color: selected ? colors.interactive : colors.text }]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.label, { color: colors.textMuted }]}>Anything else? (optional)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Which side, how much of the channel, how to get around it"
            placeholderTextColor={colors.textSubtle}
            multiline
            maxLength={500}
            style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
          />

          {error ? <Text style={[styles.note, { color: colors.error }]} accessibilityRole="alert">{error}</Text> : null}

          <Pressable
            onPress={() => void save()}
            disabled={!kind || !here || saving}
            style={({ pressed }) => [styles.primary, { backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill, opacity: !kind || !here || saving ? 0.5 : 1 }]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !kind || !here || saving, busy: saving }}
          >
            <Text style={[styles.primaryText, { color: colors.onAccent }]}>{saving ? 'Saving…' : 'Save report'}</Text>
          </Pressable>
          <Text style={[styles.note, { color: colors.textMuted }]}>
            Saved on your phone first and sent when you have signal. Reports are checked before anyone else sees them.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  title: { ...t.lg, fontFamily: fonts.heading, flex: 1 },
  cancel: { ...t.base, fontFamily: fonts.semibold },
  body: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  where: { borderRadius: 12, padding: 12 },
  whereText: { ...t.sm, fontFamily: fonts.semibold },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { ...t.xs, fontFamily: fonts.semibold, marginTop: 4 },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kind: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36, justifyContent: 'center' },
  kindText: { ...t.sm, fontFamily: fonts.semibold },
  input: { minHeight: 88, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, textAlignVertical: 'top', ...t.base, fontFamily: fonts.body },
  note: { ...t.sm, fontFamily: fonts.body },
  primary: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primaryText: { ...t.base, fontFamily: fonts.semibold },
});
