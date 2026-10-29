// eddy-ios/app/(recording)/float-mode.tsx
// River Mode: "how much farther?" while you are on the water.
//
// Everything on this screen is derived from the active session in
// src/lib/floatSessionStore.ts by viewSession(); nothing here is stored. The
// screen can unmount at any time (tab switch, another screen) and the float
// carries on.
//
// Miles, progress and time left use data copied onto the phone at float start.
// The background map can use the network. Float tools also refresh conditions
// when opened or on request; successful readings are cached by fetchCondition.
//
// ── Layout: the map, then one glanceable panel ──────────────────────────────
// Made for a wet thumb in sunlight. The map takes the screen; under it a
// compact panel holds the numbers (miles left, time left, arrival), the next
// hazard, at most one tracking line, the trip so far (time, moving time,
// speeds), and three large buttons: Tools, Report and End/Finish. Reminders, the Lock Screen card, keep-awake and past hazard
// reports live in Float tools (float-options.tsx), a sheet, so End is never
// scrolled under a list of switches.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation, useRouter } from 'expo-router';
import { EddySymbol } from '@/components/EddySymbol';
import { FloatActionIcon } from '@/components/FloatActionIcon';
import { HazardReportFeedback } from '@/float/HazardReportFeedback';
import { selectionFeedback } from '@/lib/haptics';
import { FloatStatusDot } from '@/float/FloatStatusDot';
import { floatDisplayPosition, fixAgeLabel, gpsQualityNote, paceLine, progressLine, spokenStats } from '@/lib/floatDisplay';
import { useFloatMapFocus } from '@/float/mapFocus';
import { FloatMap } from '@/float/FloatMap';
import { HazardReportSheet } from '@/float/HazardReportSheet';
import { useTrackingLine } from '@/float/useTrackingLine';
import { useAnnounce } from '@/hooks/useAnnounce';
import { useFloatSession, useFloatSessionLoaded, useFloatSessionUnreadable } from '@/hooks/useFloatSession';
import { useFloatDisplayClock } from '@/hooks/useFloatDisplayClock';
import { discardShortFloat, endFloat, stopTracking } from '@/lib/floatSessionStore';
import { ControlIcon } from '@/components/ControlIcon';
import { discardCopy, discardReason } from '@/lib/floatEnding';
import {
  arrivalAnchor,
  arrivalCopy,
  arrivalOutlook,
  indexRoute,
  mapFeatures,
  remainingCopy,
  statusCopy,
  viewSession,
} from '@/lib/floatSession';
import { recordedOrigin } from '@/lib/floatOrigin';
import { hazardAheadNote, hazardDataState } from '@/lib/floatHazardData';
import { hazardTypeLabel } from '@eddy/hazards';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles, type as t } from '@/theme/typography';

const clockTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function FloatModeScreen() {
  const session = useFloatSession();
  const stored = useFloatSessionUnreadable();
  const loaded = useFloatSessionLoaded();
  const mapFocus = useFloatMapFocus();
  const { fontScale, width } = useWindowDimensions();
  const stacked = fontScale > 1.3 || width < 360;
  const router = useRouter();
  const root = useNavigation('/');
  const { colors, elevation } = useTheme();
  const tracking = useTrackingLine();
  const [reporting, setReporting] = useState(false);
  const [reportedId, setReportedId] = useState<string | null>(null);
  // Finish is applying the last of the recorded track before saving.
  const [finishing, setFinishing] = useState(false);
  const focused = useIsFocused();

  // Keep screen awake is held by the recording layout, so the Float tools
  // sheet presenting over this screen does not release it.
  const floatActive = session != null;
  const now = useFloatDisplayClock(focused && floatActive);

  // Recomputed when a fix lands or the clock ticks. A fix newer than the last
  // tick is itself the latest known time, so a fresh position never reads as
  // stale between ticks.
  const clock = Math.max(now, session?.last?.at ?? 0);
  const view = useMemo(() => (session ? viewSession(session, clock) : null), [session, clock]);

  const route = session?.route;
  const recordedStart = session?.recordedStart;
  const takeOut = session?.takeOut ?? null;
  const ends = useMemo(() => {
    if (!route || !takeOut) return null;
    const anchor = (id: string | undefined) => route.anchors.find((a) => a.id === id)?.lngLat ?? null;
    const takeOutAt = anchor(takeOut.id);
    if (!takeOutAt) return null;
    return {
      start: recordedStart ? { name: 'Recording started here', lngLat: recordedStart.lngLat, riverMile: recordedStart.riverMile } : null,
      takeOut: { name: takeOut.name, lngLat: takeOutAt, riverMile: takeOut.riverMile },
    };
  }, [route, recordedStart, takeOut]);

  // The same calibrated line the numbers use; rebuilt only if the route changes.
  const index = useMemo(() => {
    if (!route) return null;
    const built = indexRoute(route);
    return built.ok ? built.index : null;
  }, [route]);
  const startMile = session?.startMile ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the stretch moves only when its start or route does, not on every fix
  const features = useMemo(() => (session && index ? mapFeatures(session, index) : null), [index, startMile]);

  // A float Eddy ended on its own (arrived long ago, or left the river) while
  // this screen was open: show its recap, as Finish would. If it ended while
  // Float options was in front, the recap waits until this screen is again.
  const lastId = useRef<string | null>(null);
  const endingHere = useRef(false);
  useEffect(() => {
    if (session) {
      lastId.current = session.id;
      return;
    }
    if (!lastId.current) return;
    if (endingHere.current) {
      lastId.current = null;
      return;
    }
    if (!focused) return;
    router.replace({ pathname: '/float-recap', params: { id: lastId.current } });
    lastId.current = null;
  }, [session, focused, router]);

  // What VoiceOver is told when it changes: the panel's text changes under
  // the user, and iOS has no live region, so the moments that matter are
  // announced (useAnnounce). Derived below the early return, so computed
  // here from what may be null.
  const displayed = session ? floatDisplayPosition(session, clock) : null;
  const recording = tracking.tracker.status === 'recording' && !tracking.tracker.servicesOff && !tracking.tracker.denied && !tracking.tracker.preciseOff && !tracking.tracker.notInUse;
  const fresh = recording && displayed != null && !displayed.dimmed;
  const time = view ? remainingCopy(view.estimate, view.takeOutBeyondMeters != null) : null;
  const anchor = view ? arrivalAnchor(view, clock) : null;
  // No arrival to place on a clock for a float that began below its take-out:
  // the panel hides the line, and VoiceOver must not hear a sunset warning for it.
  const outlook = view && !view.startedPastTakeOut && anchor && ends ? arrivalOutlook(view.estimate.minutes, anchor.from, ends.takeOut.lngLat) : null;
  const arrival = outlook && view ? arrivalCopy(outlook, clockTime, anchor?.asOf ?? null, { paused: view.estimate.paused }) : null;
  const hazard = view?.nextHazard ?? null;
  // At the take-out, or as close as the mapped river goes to one off it.
  const done = Boolean(view && (view.arrived || view.atRiverEnd));
  const weakGps = session ? gpsQualityNote(session, clock) : null;
  const attention = tracking.line && (tracking.line.action !== 'info' || !recording) ? tracking.line.text : null;
  useAnnounce(view && done ? statusCopy(view, clock) : null);
  useAnnounce(hazard && hazard.milesAway < 0.1 ? `Just ahead: ${hazardTypeLabel(hazard.hazard.type)}, ${hazard.hazard.name}` : null);
  useAnnounce(arrival?.warning ?? null);
  useAnnounce(attention);

  if (!session || !view || !ends || !time) {
    const back = () => {
      if (root.canGoBack()) root.goBack();
      router.navigate('/(tabs)/(floats)/float-home');
    };
    // Opened cold, before the stored float has been read: wait for the
    // answer rather than show "No float in progress" for a float that is
    // recording. The store's own failure state comes next if the read fails.
    if (!loaded && !stored.unreadable) {
      return (
        <SafeAreaView style={[styles.screen, styles.centered, { backgroundColor: colors.bg }]} edges={['left', 'right', 'bottom']}>
          <ActivityIndicator color={colors.interactive} />
          <Text style={[styles.note, styles.centeredText, { color: colors.textMuted }]}>Opening your float…</Text>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={[styles.screen, styles.centered, { backgroundColor: colors.bg }]} edges={['left', 'right', 'bottom']}>
        {stored.unreadable ? <>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Eddy couldn’t read your float</Text>
          <Text style={[styles.note, styles.centeredText, { color: colors.textMuted }]}>
            A float may still be recording. Eddy will keep trying to read it; nothing is stopped or lost.
          </Text>
          <Pressable onPress={stored.retry} style={[styles.secondary, { borderColor: colors.border }]} accessibilityRole="button">
            <Text style={[styles.secondaryText, { color: colors.interactive }]}>Try again</Text>
          </Pressable>
        </> : <Text style={[styles.emptyTitle, { color: colors.text }]}>No float in progress</Text>}
        <Pressable onPress={back} style={[styles.secondary, { borderColor: colors.border }]} accessibilityRole="button">
          <Text style={[styles.secondaryText, { color: colors.interactive }]}>Back to Floats</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const position = displayed?.lngLat ?? null;
  const currentMile = view.confirmed ? (session.samples[session.samples.length - 1]?.riverMile ?? null) : null;
  const live = view.status === 'live';
  const waitingAtLaunch = !view.confirmed && view.status === 'off-route' && session.last?.nearPutIn;
  const progress = progressLine(session, clock);
  const pace = paceLine(session, clock);
  const status = waitingAtLaunch
    ? `At ${session.putIn?.name}. Push off when you’re ready.`
    : weakGps && (view.status === 'stale' || view.status === 'acquiring')
      ? 'Finding you on the river…'
      : statusCopy(view, clock);
  // Finish could not read the whole track and the paddler stopped tracking
  // anyway (stopTracking): no GPS, and the recap is still owed.
  const stopped = session.trackingStoppedAt != null;
  const freshness = stopped ? 'Tracking stopped'
    : fresh
    ? `Tracking · ${fixAgeLabel(displayed?.at ?? null, clock)}`
    : tracking.tracker.status === 'starting' ? 'Starting GPS…'
    : !recording ? 'Tracking needs attention'
    : weakGps ? 'Finding you…'
    : displayed ? `Location delayed · ${fixAgeLabel(displayed.at, clock)}` : 'Finding GPS…';

  // After a discard, back to where the float was started from.
  const leaveAfterDiscard = () => {
    if (root.canGoBack()) root.goBack();
    router.navigate('/(tabs)/(floats)/float-home');
  };

  /** Save the recap and leave for it; the End dialog's last step, and Save recap's. */
  const finish = () => {
    endingHere.current = true;
    setFinishing(true);
    void endFloat().then((result) => {
      setFinishing(false);
      if (result === 'not-ended') {
        // Not saved from a partial track. Saving the recap and stopping the
        // GPS are separate: the float can stop tracking now, and its journal
        // is kept until the recap can be saved from all of it.
        endingHere.current = false;
        if (session.trackingStoppedAt != null) {
          Alert.alert(
            'Recap not saved yet',
            'Tracking is stopped. Eddy still couldn’t read your whole track, so it’s kept on this phone. Try again in a moment.',
          );
          return;
        }
        Alert.alert(
          'Couldn’t save your float',
          'Eddy couldn’t read all of your recorded track, so nothing was saved and tracking is still on. You can stop tracking now and save the recap later; nothing recorded is lost.',
          [
            { text: 'Keep floating', style: 'cancel' },
            { text: 'Try again', onPress: finish },
            { text: 'Stop tracking', style: 'destructive', onPress: () => void stopTracking() },
          ],
        );
        return;
      }
      // Tracking has stopped either way; say so if storage lagged.
      if (result === 'ended-unsaved') {
        Alert.alert(
          'Float ended',
          'Tracking has stopped. Eddy couldn’t finish saving your recap yet and will retry. Keep the app open and check your history.',
        );
      }
      router.replace({ pathname: '/float-recap', params: { id: session.id } });
    });
  };

  const confirmEnd = () => {
    // Already ended in all but its recap: nothing left to confirm.
    if (stopped) {
      finish();
      return;
    }
    // An accidental Start, or a float that never measured anything
    // (floatEnding.ts discardReason): offer to throw it away rather than file
    // a recap that has to be deleted afterwards, and say which case it is.
    const reason = done ? null : discardReason(session, clock);
    const short = reason != null;
    Alert.alert(
      done ? 'Finish this float?' : 'End this float?',
      reason ? discardCopy(reason) : 'Tracking stops and Eddy saves a recap in your float history.',
      [
        { text: 'Keep floating', style: 'cancel' },
        ...(short ? [{
          text: 'Discard',
          style: 'destructive' as const,
          onPress: () => {
            endingHere.current = true;
            setFinishing(true);
            void discardShortFloat().then((result) => {
              setFinishing(false);
              // A storage write still retrying is a discard all the same: the
              // float is already gone, and this screen has nothing to end.
              if (result !== 'refused') {
                leaveAfterDiscard();
                return;
              }
              // The float grew past "short" while the alert was open (the
              // store judges it afresh). Silence here read as a broken
              // button; say so, and leave End float as the way out.
              endingHere.current = false;
              Alert.alert(
                'This float has recorded enough to keep',
                'Eddy measured more while this was open, so it can’t be discarded. Use End float to save a recap instead.',
              );
            });
          },
        }] : []),
        {
          text: done ? 'Finish' : 'End float',
          style: done ? 'default' : 'destructive',
          onPress: finish,
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['left', 'right', 'bottom']}>
      <View style={styles.map}>
        <FloatMap
          line={session.route.line}
          section={features?.section ?? null}
          stops={features?.stops ?? []}
          hazards={features?.hazards ?? []}
          start={ends.start}
          takeOut={ends.takeOut}
          position={position}
          positionDimmed={!fresh}
          accuracyMeters={fresh ? displayed?.accuracyMeters ?? null : null}
          course={fresh ? displayed?.course ?? null : null}
          currentMile={currentMile}
          focus={mapFocus?.sessionId === session.id ? mapFocus : null}
        />
      </View>

      <View style={[styles.panel, stacked && { maxHeight: '70%' }, { backgroundColor: colors.card, borderColor: colors.border }, elevation(2)]}>
        <ScrollView style={styles.panelScroll} contentContainerStyle={styles.panelContent} showsVerticalScrollIndicator>
        <View style={styles.freshness}>
          <FloatStatusDot at={displayed?.at ?? null} fresh={fresh && !stopped} />
          <Text style={[styles.caption, { color: colors.textMuted }]}>{freshness}</Text>
          {/* What locking the phone does, and closing Eddy does not: written
              in the tracking line's detail, and otherwise never shown while
              tracking is healthy. */}
          {!stopped && tracking.line?.detail ? (
            <Pressable
              onPress={() => Alert.alert('About tracking', `${tracking.line!.text} ${tracking.line!.detail}`)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="About tracking"
            >
              <ControlIcon name="information-circle-outline" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        {stopped ? (
          <Notice
            label="Tracking is stopped. Eddy couldn’t read your whole track yet, so your recap isn’t saved. It’s kept on this phone: tap to try again."
            onPress={finish}
          />
        ) : null}
        <View style={styles.routeHeader}>
          <FloatActionIcon name="startFloat" size={34} color={colors.interactive} />
          <View style={styles.flex}>
            <Text style={[styles.riverName, { color: colors.text }]}>{view.riverName}</Text>
            <Text style={[styles.route, { color: colors.textMuted }]}>To {view.takeOutName}</Text>
          </View>
        </View>
        <Text style={[styles.status, { color: live ? colors.interactive : colors.textMuted }]}>
          {status}
        </Text>

        {recordedOrigin(session).note ? <Text style={[styles.note, { color: colors.textMuted }]}>
          {recordedOrigin(session).note}
        </Text> : null}
        {view.startedPastTakeOut ? (
          <Text style={[styles.note, { color: colors.textMuted }]}>
            You started below {view.takeOutName}, so there’s no distance left to show. End this float and pick a take-out downstream.
          </Text>
        ) : (
          <>
            <View style={[styles.numbers, stacked && styles.stackedNumbers]}>
              <View style={styles.number}>
                <Text style={[styles.miles, { color: live ? colors.text : colors.textMuted }]}>
                  {view.milesLeft == null ? '—' : view.milesLeft.toFixed(1)}
                  <Text style={[styles.unit, { color: colors.textMuted }]}> mi left</Text>
                </Text>
              </View>
              <View style={[styles.number, !stacked && styles.numberRight]}>
                <Text style={[styles.time, { color: live ? colors.text : colors.textMuted }]}>
                  {time.headline}
                </Text>
              </View>
            </View>
            <View
              style={[styles.track, { backgroundColor: colors.selectionBg }]}
              accessibilityRole="progressbar"
              accessibilityLabel="Progress to the take-out"
              accessibilityValue={{ min: 0, max: 100, now: Math.round((view.fraction ?? 0) * 100) }}
            >
              <View style={[styles.fill, { width: `${Math.round((view.fraction ?? 0) * 100)}%`, backgroundColor: colors.interactive }]} />
            </View>
            {/* Full width: at half width the arrival line wrapped to three lines
                and sank the miles number with it. */}
            {arrival ? <Text style={[styles.note, { color: colors.textMuted }]}>{arrival.line}</Text> : null}
            {/* The arrival line already says it assumes no stops. */}
            {(arrival ? time.shortNote : time.note) ? (
              <Text style={[styles.caption, { color: colors.textMuted }]}>{arrival ? time.shortNote : time.note}</Text>
            ) : null}
            {arrival?.warning ? (
              <Text style={[styles.note, styles.emphasis, { color: colors.error }]} accessibilityRole="alert">
                {arrival.warning}
              </Text>
            ) : null}
          </>
        )}

        {hazard ? (
          <Pressable style={styles.hazardRow} accessibilityRole="button" accessibilityHint="Open upcoming accesses and hazards" onPress={() => router.push({ pathname: '/float-options', params: { section: 'ahead' } })}>
            <EddySymbol name="hazard" size={26} />
            <Text style={[styles.note, styles.flex, { color: colors.text }]}>
              <Text style={styles.emphasis}>
                {hazard.milesAway < 0.1 ? 'Just ahead' : `${hazard.milesAway.toFixed(1)} mi`}:
              </Text>{' '}
              {hazardTypeLabel(hazard.hazard.type)}, {hazard.hazard.name}
              {hazard.hazard.portageRequired
                ? ` · portage${hazard.hazard.portageSide && hazard.hazard.portageSide !== 'either' ? ` river ${hazard.hazard.portageSide}` : ''}`
                : ''}
            </Text>
          </Pressable>
        ) : hazardDataState(session.route) === 'unavailable' ? (
          // No hazard data is not a clear river: say so where the next hazard
          // would be, not only in Float tools.
          <Text style={[styles.caption, { color: colors.textMuted }]}>{hazardAheadNote(session.route, 0)}</Text>
        ) : null}

        {tracking.line ? (
          tracking.line.action === 'info' ? (
            !recording ? <Text style={[styles.caption, { color: colors.textMuted }]}>{tracking.line.text}</Text> : null
          ) : (
            <Notice label={tracking.line.text} onPress={tracking.act} />
          )
        ) : null}

        {/* Trip stats last: the numbers, the next hazard and anything blocking
            tracking come first in a panel that may scroll. */}
        {progress ? <Text style={[styles.caption, { color: colors.textMuted }]} accessibilityLabel={spokenStats(progress)}>{progress}</Text> : null}
        {pace ? <Text style={[styles.caption, { color: colors.textMuted }]} accessibilityLabel={spokenStats(pace)}>{pace}</Text> : null}

        </ScrollView>
        {reportedId ? <HazardReportFeedback reportId={reportedId} onDismiss={() => setReportedId(null)} /> : null}
        <View style={[styles.actions, stacked && styles.stackedActions]}>
          <ActionButton icon="ellipsis-horizontal" label="Tools" onPress={() => router.push('/float-options')} />
          <ActionButton icon="warning-outline" label="Report" onPress={() => setReporting(true)} accessibilityLabel="Report a hazard here" />
          <Pressable
            onPress={confirmEnd}
            disabled={finishing}
            accessibilityState={{ disabled: finishing, busy: finishing }}
            style={({ pressed }) => [
              styles.action,
              styles.endAction,
              done || stopped
                ? { backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill }
                : { borderColor: colors.error, borderWidth: 1, opacity: pressed ? 0.6 : 1 },
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.actionText, { color: done || stopped ? colors.onAccent : colors.error }]}>{finishing ? 'Saving…' : stopped ? 'Save recap' : done ? 'Finish float' : 'End float'}</Text>
          </Pressable>
        </View>
      </View>

      {reporting ? <HazardReportSheet onClose={(id) => { setReporting(false); if (id) setReportedId(id); }} session={session} /> : null}
    </SafeAreaView>
  );
}

function Notice({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.notice, { backgroundColor: colors.cardRaised, borderColor: colors.border }]} accessibilityRole="button">
      <Text style={[styles.noticeText, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  accessibilityLabel,
}: {
  icon: 'ellipsis-horizontal' | 'warning-outline';
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => { selectionFeedback(); onPress(); }}
      style={({ pressed }) => [styles.action, { backgroundColor: colors.cardRaised, borderColor: colors.borderStrong, borderWidth: 1, opacity: pressed ? 0.7 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <EddySymbol name={icon === 'warning-outline' ? 'hazard' : 'floatTools'} size={26} />
      <Text style={[styles.actionText, { color: colors.interactive }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  routeHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  riverName: { ...t.lg, fontFamily: fonts.heading },
  screen: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  centeredText: { textAlign: 'center' },
  map: { flex: 1, minHeight: 120 },
  panelScroll: { flexShrink: 1 },
  panelContent: { gap: 8 },
  freshness: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  activityLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  panel: {
    maxHeight: '58%',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 8,
  },
  route: { ...t.sm, fontFamily: fonts.semibold },
  status: { ...t.sm, fontFamily: fonts.body },
  numbers: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  number: { flex: 1 },
  numberRight: { alignItems: 'flex-end' },
  miles: { ...textStyles.pageTitle },
  unit: { ...t.base, fontFamily: fonts.body },
  time: { ...t.lg, fontFamily: fonts.heading },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  note: { ...t.sm, fontFamily: fonts.body },
  caption: { ...t.xs, fontFamily: fonts.body },
  emphasis: { fontFamily: fonts.semibold },
  flex: { flex: 1 },
  hazardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56 },
  notice: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  noticeText: { ...t.sm, fontFamily: fonts.body },
  stackedNumbers: { flexDirection: 'column', alignItems: 'flex-start' },
  stackedActions: { flexDirection: 'column' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4, flexShrink: 0 },
  action: {
    flex: 1,
    minHeight: 56,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  endAction: { flex: 1.4 },
  actionText: { ...t.base, fontFamily: fonts.semibold, flexShrink: 1, textAlign: 'center' },
  emptyTitle: { ...t.lg, fontFamily: fonts.heading },
  secondary: { minHeight: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  secondaryText: { ...t.base, fontFamily: fonts.semibold },
});
