// eddy-ios/app/(tabs)/(floats)/float-mode.tsx
// Float Mode: "how much farther?" while you are on the water.
//
// Everything on this screen is derived from the active session in
// src/lib/floatSessionStore.ts by viewSession(); nothing here is stored. The
// screen can unmount at any time (tab switch, another screen) and the float
// carries on.
//
// It reads nothing from the network. Connectivity affects the background map
// only; miles, progress and time left come from data copied onto the phone
// when the float started.
//
// ── Layout: the map, then one glanceable panel ──────────────────────────────
// Made for a wet thumb in sunlight. The map takes the screen; under it a
// compact panel holds the numbers (miles left, time left, arrival), the next
// hazard, at most one tracking line, and three large buttons: Options, Hazard
// and End/Finish. Reminders, the Lock Screen card, keep-awake and past hazard
// reports live in Float options (float-options.tsx), a sheet, so End is never
// scrolled under a list of switches.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused, useRouter } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { ControlIcon } from '@/components/ControlIcon';
import { FloatMap } from '@/float/FloatMap';
import { HazardReportSheet } from '@/float/HazardReportSheet';
import { useKeepAwakePreference } from '@/float/keepAwakePreference';
import { useTrackingLine } from '@/float/useTrackingLine';
import { useFloatSession } from '@/hooks/useFloatSession';
import { cancelUnstartedFloat, endFloat } from '@/lib/floatSessionStore';
import {
  arrivalAnchor,
  arrivalCopy,
  arrivalOutlook,
  formatBeyond,
  indexRoute,
  mapFeatures,
  offerRiverChange,
  remainingCopy,
  statusCopy,
  viewSession,
} from '@/lib/floatSession';
import { hazardTypeLabel } from '@eddy/hazards';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles, type as t } from '@/theme/typography';

/** Re-read the clock this often so "last position N min ago" stays true. */
const TICK_MS = 15_000;

const clockTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function FloatModeScreen() {
  const session = useFloatSession();
  const router = useRouter();
  const { colors, elevation } = useTheme();
  const [now, setNow] = useState(() => Date.now());
  const tracking = useTrackingLine();
  const [keepAwake] = useKeepAwakePreference();
  const [reporting, setReporting] = useState(false);
  const focused = useIsFocused();

  // Only while this screen is showing and a float is active (#1448): leaving
  // the screen or ending the float releases it. Keyed on whether a float is
  // active, not the session object, which changes with every GPS fix and used
  // to release and re-acquire the wake lock each time.
  const floatActive = session != null;
  useEffect(() => {
    if (!keepAwake || !focused || !floatActive) return;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    return () => void deactivateKeepAwake(KEEP_AWAKE_TAG);
  }, [keepAwake, focused, floatActive]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // Recomputed when a fix lands or the clock ticks. A fix newer than the last
  // tick is itself the latest known time, so a fresh position never reads as
  // stale between ticks.
  const clock = Math.max(now, session?.last?.at ?? 0);
  const view = useMemo(() => (session ? viewSession(session, clock) : null), [session, clock]);

  const route = session?.route;
  const putIn = session?.putIn ?? null;
  const takeOut = session?.takeOut ?? null;
  const ends = useMemo(() => {
    if (!route || !takeOut) return null;
    const anchor = (id: string | undefined) => route.anchors.find((a) => a.id === id)?.lngLat ?? null;
    const startAt = anchor(putIn?.id);
    const takeOutAt = anchor(takeOut.id);
    if (!takeOutAt) return null;
    return {
      start: putIn && startAt ? { name: putIn.name, lngLat: startAt, riverMile: putIn.riverMile } : null,
      takeOut: { name: takeOut.name, lngLat: takeOutAt, riverMile: takeOut.riverMile },
    };
  }, [route, putIn, takeOut]);

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

  if (!session || !view || !ends) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered, { backgroundColor: colors.bg }]} edges={['left', 'right']}>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>No float in progress</Text>
        <Pressable onPress={() => router.replace('/float-home')} style={[styles.secondary, { borderColor: colors.border }]} accessibilityRole="button">
          <Text style={[styles.secondaryText, { color: colors.interactive }]}>Back to Floats</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const position = session.position?.lngLat ?? null;
  const currentMile = view.confirmed ? (session.samples[session.samples.length - 1]?.riverMile ?? null) : null;
  const time = remainingCopy(view.estimate, view.takeOutBeyondMeters != null);
  const anchor = arrivalAnchor(view, clock);
  const outlook = anchor ? arrivalOutlook(view.estimate.minutes, anchor.from, ends.takeOut.lngLat) : null;
  const arrival = outlook ? arrivalCopy(outlook, clockTime, anchor?.asOf ?? null) : null;
  const hazard = view.nextHazard;
  const live = view.status === 'live';
  // At the take-out, or as close as the mapped river goes to one off it.
  const done = view.arrived || view.atRiverEnd;
  const wrongRiver = offerRiverChange(view);

  const confirmEnd = () => {
    Alert.alert(
      done ? 'Finish this float?' : 'End this float?',
      'Tracking stops and Eddy saves a recap in your float history.',
      [
        { text: 'Keep floating', style: 'cancel' },
        {
          text: done ? 'Finish' : 'End float',
          style: done ? 'default' : 'destructive',
          onPress: () => {
            endingHere.current = true;
            void endFloat().then((cleared) => {
              // Tracking has stopped either way; say so if storage lagged.
              if (!cleared) {
                Alert.alert(
                  'Float ended',
                  'Tracking has stopped. Eddy couldn’t finish saving your recap yet and will retry. Keep the app open and check your history.',
                );
              }
              router.replace({ pathname: '/float-recap', params: { id: session.id } });
            });
          },
        },
      ],
    );
  };

  // Nothing has been measured, so changing the river loses nothing: no recap.
  const changeRiver = () => {
    Alert.alert('Choose another river?', `This float on the ${view.riverName} ends without a recap, since Eddy never found you on it.`, [
      { text: 'Keep this river', style: 'cancel' },
      {
        text: 'Choose another',
        onPress: () => {
          endingHere.current = true;
          void cancelUnstartedFloat().then((cancelled) => {
            if (cancelled) router.replace(session.kind === 'quick' ? '/float-start' : '/float-home');
            else endingHere.current = false;
          });
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['left', 'right']}>
      <View style={styles.map}>
        <FloatMap
          line={session.route.line}
          section={features?.section ?? null}
          stops={features?.stops ?? []}
          hazards={features?.hazards ?? []}
          start={ends.start}
          takeOut={ends.takeOut}
          position={position}
          positionDimmed={!live}
          currentMile={currentMile}
        />
      </View>

      <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }, elevation(2)]}>
        <Text style={[styles.route, { color: colors.textMuted }]} numberOfLines={1}>
          {view.riverName} · to {view.takeOutName}
        </Text>
        <Text
          style={[styles.status, { color: live ? colors.interactive : colors.textMuted }]}
          accessibilityLiveRegion="polite"
          numberOfLines={3}
        >
          {statusCopy(view, clock)}
        </Text>

        {view.startedPastTakeOut ? (
          <Text style={[styles.note, { color: colors.textMuted }]}>
            You started below {view.takeOutName}, so there’s no distance left to show. End this float and pick a take-out downstream.
          </Text>
        ) : (
          <>
            <View style={styles.numbers}>
              <View style={styles.number}>
                <Text style={[styles.miles, { color: live ? colors.text : colors.textMuted }]}>
                  {view.milesLeft == null ? '—' : view.milesLeft.toFixed(1)}
                  <Text style={[styles.unit, { color: colors.textMuted }]}> mi left</Text>
                </Text>
              </View>
              <View style={[styles.number, styles.numberRight]}>
                <Text style={[styles.time, { color: live ? colors.text : colors.textMuted }]} numberOfLines={1}>
                  {time.headline}
                </Text>
                {arrival ? (
                  <Text style={[styles.note, styles.right, { color: colors.textMuted }]} numberOfLines={2}>
                    {arrival.line}
                  </Text>
                ) : null}
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
            {time.note ? <Text style={[styles.caption, { color: colors.textMuted }]}>{time.note}</Text> : null}
            {view.takeOutBeyondMeters != null ? (
              <Text style={[styles.caption, { color: colors.textMuted }]}>
                Miles to the river’s closest point. {view.takeOutName} is about {formatBeyond(view.takeOutBeyondMeters)} beyond it.
              </Text>
            ) : null}
            {arrival?.warning ? (
              <Text style={[styles.note, styles.emphasis, { color: colors.error }]} accessibilityRole="alert">
                {arrival.warning}
              </Text>
            ) : null}
          </>
        )}

        {hazard ? (
          <View style={styles.hazardRow} accessible>
            <ControlIcon name="warning-outline" size={16} color={colors.error} />
            <Text style={[styles.note, styles.flex, { color: colors.text }]} numberOfLines={2}>
              <Text style={styles.emphasis}>
                {hazard.milesAway < 0.1 ? 'Just ahead' : `${hazard.milesAway.toFixed(1)} mi`}:
              </Text>{' '}
              {hazardTypeLabel(hazard.hazard.type)}, {hazard.hazard.name}
              {hazard.hazard.portageRequired
                ? ` · portage${hazard.hazard.portageSide && hazard.hazard.portageSide !== 'either' ? ` river ${hazard.hazard.portageSide}` : ''}`
                : ''}
            </Text>
          </View>
        ) : null}

        {tracking.line ? (
          tracking.line.action === 'info' ? (
            <Text style={[styles.caption, { color: colors.textMuted }]}>{tracking.line.text}</Text>
          ) : (
            <Notice label={tracking.line.text} onPress={tracking.act} />
          )
        ) : null}

        {wrongRiver ? (
          <Notice label={`Not on the ${view.riverName}? Tap to choose another river.`} onPress={changeRiver} />
        ) : null}

        <View style={styles.actions}>
          <ActionButton icon="ellipsis-horizontal" label="Options" onPress={() => router.push('/float-options')} />
          <ActionButton icon="warning-outline" label="Hazard" onPress={() => setReporting(true)} accessibilityLabel="Report a hazard here" />
          <Pressable
            onPress={confirmEnd}
            style={({ pressed }) => [
              styles.action,
              styles.endAction,
              done
                ? { backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill }
                : { borderColor: colors.error, borderWidth: 1, opacity: pressed ? 0.6 : 1 },
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.actionText, { color: done ? colors.onAccent : colors.error }]}>{done ? 'Finish float' : 'End float'}</Text>
          </Pressable>
        </View>
      </View>

      {reporting ? <HazardReportSheet onClose={() => setReporting(false)} session={session} /> : null}
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
      onPress={onPress}
      style={({ pressed }) => [styles.action, { borderColor: colors.border, borderWidth: 1, opacity: pressed ? 0.6 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <ControlIcon name={icon} size={18} color={colors.interactive} />
      <Text style={[styles.actionText, { color: colors.interactive }]}>{label}</Text>
    </Pressable>
  );
}

const KEEP_AWAKE_TAG = 'float-mode';

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  map: { flex: 1 },
  panel: {
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
  right: { textAlign: 'right' },
  miles: { ...textStyles.pageTitle },
  unit: { ...t.base, fontFamily: fonts.body },
  time: { ...t.lg, fontFamily: fonts.heading },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  note: { ...t.sm, fontFamily: fonts.body },
  caption: { ...t.xs, fontFamily: fonts.body },
  emphasis: { fontFamily: fonts.semibold },
  flex: { flex: 1 },
  hazardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notice: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  noticeText: { ...t.sm, fontFamily: fonts.body },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  action: {
    flex: 1,
    minHeight: 52,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  endAction: { flex: 1.4 },
  actionText: { ...t.base, fontFamily: fonts.semibold },
  emptyTitle: { ...t.lg, fontFamily: fonts.heading },
  secondary: { minHeight: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  secondaryText: { ...t.base, fontFamily: fonts.semibold },
});
