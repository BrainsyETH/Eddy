// eddy-ios/src/float/HazardReportSheet.tsx
// "Report a hazard" from River Mode (#1448 Phase 5, #1453).
//
// One question (what is it?), an optional note, and the position it will be
// reported at, shown before sending so the paddler can confirm it: river mile
// when the fix is on the river, GPS accuracy, and how old it is. Saving works
// with no signal; the report waits on the phone (src/lib/hazardReportQueue.ts)
// and says so. Reports are reviewed before anyone else sees them.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import * as Location from 'expo-location';
import { locateOnRoute } from '@eddy/geo';
import { indexRoute, type FloatSession } from '@/lib/floatSession';
import { HAZARD_KINDS, newReportId, type HazardKind } from '@/lib/hazardReportQueue';
import { newestPosition, reportPositionLabel, recorderPosition, type ReportPosition } from '@/lib/hazardReportPosition';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { addHazardReport } from './hazardReports';
import { successFeedback } from '@/lib/haptics';
import { EddySymbol } from '@/components/EddySymbol';
import { ControlIcon } from '@/components/ControlIcon';
import { FloatInfoTip } from './FloatInfoTip';
import { radii } from '@/theme/layout';

/** A fresh fix is worth waiting this long for; then the last known one is used. */
const FIX_TIMEOUT_MS = 10_000;
/** Farther than this from the line, no river mile is claimed for the report. */
const ON_RIVER_M = 150;
/** How often the position's age line is recomputed while the sheet is open. */
const AGE_TICK_MS = 15_000;

/** Mounted only while open, so every report starts from a clean sheet. */
export function HazardReportSheet({ onClose, session }: { onClose: (reportId?: string) => void; session: FloatSession }) {
  const { colors } = useTheme();
  const { fontScale, width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const singleColumn = fontScale > 1.3 || width < 350;
  const [kind, setKind] = useState<HazardKind | null>(null);
  const [note, setNote] = useState('');
  const [here, setHere] = useState<ReportPosition | null>(null);
  const [locating, setLocating] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The age line is read again while the sheet stays open: a position found
  // "just now" must not still say so five minutes later.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), AGE_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // A fresh position, or iOS's last known one if GPS is slow, weighed against
  // the float's own last RAW fix: whichever was measured more recently wins
  // (src/lib/hazardReportPosition.ts). Never the point snapped onto the river
  // line: a report filed from a snapped point would always read "near river
  // mile X" with no accuracy to caveat it, for a hazard that may sit on the
  // bank. The recorder's fix is read when the search settles, so one that
  // arrived while GPS was slow still counts.
  const latest = useRef(session);
  useEffect(() => {
    latest.current = session;
  }, [session]);
  useEffect(() => {
    let cancelled = false;
    const fromFix = (fix: Location.LocationObject | null): ReportPosition | null =>
      fix ? { latitude: fix.coords.latitude, longitude: fix.coords.longitude, accuracyMeters: fix.coords.accuracy ?? null, at: fix.timestamp } : null;
    void Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).then(fromFix),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_TIMEOUT_MS)),
    ])
      .catch(() => null)
      .then(async (fresh) => fresh ?? fromFix(await Location.getLastKnownPositionAsync().catch(() => null)))
      .then((phone) => {
        if (cancelled) return;
        const recorded = latest.current;
        const at = Date.now();
        setHere(newestPosition([phone, recorderPosition(recorded.lastFix), recorderPosition(recorded.gpsPosition)], at));
        setNow(at);
        setLocating(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const riverMile = useMemo(() => {
    if (!here) return null;
    const built = indexRoute(session.route);
    if (!built.ok) return null;
    const placed = locateOnRoute(built.index, [here.longitude, here.latitude]);
    return placed && placed.offsetMeters <= ON_RIVER_M ? placed.riverMile : null;
  }, [here, session.route]);

  const where = here ? reportPositionLabel(here, session.route.anchors, riverMile, now) : null;

  const save = async () => {
    if (!kind || !here || saving) return;
    setSaving(true);
    setError(null);
    try {
      const id = newReportId();
      await addHazardReport({
        id,
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
      successFeedback();
      onClose(id);
    } catch {
      setError('Eddy couldn’t save this on your phone. Free up some storage and try again.');
    } finally {
      setSaving(false);
    }
  };

  const close = () => { if (!saving) onClose(); };
  return (
    <Modal visible animationType={reducedMotion ? 'none' : 'slide'} presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaProvider>
        <SafeAreaView style={[styles.sheet, { backgroundColor: colors.sheetGrouped }]} accessibilityViewIsModal onAccessibilityEscape={close}>
          <KeyboardAvoidingView style={styles.sheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.head}>
              <EddySymbol name="hazard" size={28} />
              <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">Report a hazard</Text>
              <Pressable onPress={close} disabled={saving} accessibilityRole="button" accessibilityState={{ disabled: saving }} style={styles.cancelButton}>
                <Text style={[styles.cancel, { color: colors.interactive }]}>Cancel</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.sheet} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
              <View style={[styles.where, { backgroundColor: colors.card }]}>
                {locating ? <View style={styles.row}>
                  <ActivityIndicator color={colors.interactive} />
                  <Text style={[styles.note, { color: colors.textMuted }]}>Finding your position…</Text>
                </View> : where ? <>
                  <Text selectable style={[styles.whereText, { color: colors.text }]}>{where.title}</Text>
                  <Text style={[styles.note, { color: colors.textMuted }]}>{where.detail}</Text>
                </> : <Text style={[styles.note, { color: colors.textMuted }]}>Couldn’t get your location. Try again in a moment.</Text>}
              </View>

              <Text style={[styles.label, { color: colors.textMuted }]}>What is it?</Text>
              <View style={styles.kinds}>
                {HAZARD_KINDS.map(option => {
                  const selected = option.id === kind;
                  return <Pressable key={option.id} onPress={() => setKind(option.id)} disabled={saving}
                    style={[styles.kind, { width: singleColumn ? '100%' : '48.5%', borderColor: selected ? colors.interactive : colors.border, backgroundColor: selected ? colors.selectionBg : colors.card }]}
                    accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: saving }}>
                    <Text style={[styles.kindText, { color: selected ? colors.interactive : colors.text }]}>{option.label}</Text>
                    <View style={styles.check}>{selected ? <ControlIcon name="checkmark" size={18} color={colors.interactive} /> : null}</View>
                  </Pressable>;
                })}
              </View>

              <Text style={[styles.label, { color: colors.textMuted }]}>Details (optional)</Text>
              <TextInput value={note} onChangeText={setNote} editable={!saving}
                accessibilityLabel="Details about this hazard, optional" placeholder="Which side? Can you get around it?"
                placeholderTextColor={colors.textSubtle} multiline maxLength={500}
                style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]} />
            </ScrollView>
            <View style={[styles.footer, { borderTopColor: colors.border }]}>
              {error ? <Text style={[styles.note, { color: colors.error }]} accessibilityRole="alert">{error}</Text> : null}
              <Pressable onPress={() => void save()} disabled={!kind || !here || saving}
                style={({ pressed }) => [styles.primary, { backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill, opacity: !kind || !here || saving ? 0.5 : 1 }]}
                accessibilityRole="button" accessibilityState={{ disabled: !kind || !here || saving, busy: saving }}>
                <Text style={[styles.primaryText, { color: colors.onAccent }]}>{saving ? 'Saving…' : 'Save report'}</Text>
              </Pressable>
              <View style={styles.row}>
                <Text style={[styles.note, styles.footerCopy, { color: colors.textMuted }]}>Saved on your phone. Sends when you have signal.</Text>
                <FloatInfoTip title="Hazard reports" message="Reports are checked before anyone else sees them. Saving keeps the report on your phone first; its status tells you when Eddy receives it for review. You can retry a failed report or withdraw one while it waits." />
              </View>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 16 },
  title: { ...t.lg, fontFamily: fonts.heading, flex: 1 },
  cancel: { ...t.base, fontFamily: fonts.semibold },
  cancelButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end', paddingLeft: 12 },
  body: { paddingHorizontal: 16, paddingBottom: 20, gap: 12 },
  footer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  footerCopy: { flex: 1 },
  where: { borderRadius: radii.card, padding: 14, gap: 4 },
  whereText: { ...t.base, fontFamily: fonts.semibold },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { ...t.xs, fontFamily: fonts.semibold, marginTop: 4 },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  kind: { borderWidth: 1, borderRadius: radii.inset, paddingHorizontal: 12, paddingVertical: 12, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 6 },
  kindText: { ...t.sm, fontFamily: fonts.semibold, flex: 1 },
  check: { width: 18, height: 18 },
  input: { minHeight: 88, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, textAlignVertical: 'top', ...t.base, fontFamily: fonts.body },
  note: { ...t.sm, fontFamily: fonts.body },
  primary: { minHeight: 48, padding: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primaryText: { ...t.base, fontFamily: fonts.semibold },
});
