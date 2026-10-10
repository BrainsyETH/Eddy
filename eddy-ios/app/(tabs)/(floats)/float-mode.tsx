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

import { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { FloatMap } from '@/float/FloatMap';
import { useFloatSession } from '@/hooks/useFloatSession';
import { endFloat } from '@/lib/floatSessionStore';
import { remainingCopy, statusCopy, viewSession } from '@/lib/floatSession';
import { radii } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles, type as t } from '@/theme/typography';
import type { LngLat } from '@eddy/geo';

/** Re-read the clock this often so "last position N min ago" stays true. */
const TICK_MS = 15_000;

export default function FloatModeScreen() {
  const session = useFloatSession();
  const router = useRouter();
  const { colors, elevation } = useTheme();
  const [now, setNow] = useState(() => Date.now());
  const permission = useLocationPermission();

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // Recomputed when a fix lands or the clock ticks. A fix newer than the last
  // tick is itself the latest known time, so a fresh position never reads as
  // stale between ticks.
  const clock = Math.max(now, session?.last?.at ?? 0);
  const view = useMemo(() => (session ? viewSession(session, clock) : null), [session, clock]);

  const ends = useMemo(() => {
    if (!session) return null;
    const anchor = (id: string | undefined) => session.route.anchors.find((a) => a.id === id)?.lngLat ?? null;
    return { start: anchor(session.putIn?.id), takeOut: anchor(session.takeOut.id) };
  }, [session]);

  if (!session || !view || !ends?.takeOut) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered, { backgroundColor: colors.bg }]} edges={['left', 'right']}>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>No float in progress</Text>
        <Pressable onPress={() => router.replace('/float-home')} style={[styles.secondary, { borderColor: colors.border }]} accessibilityRole="button">
          <Text style={[styles.secondaryText, { color: colors.interactive }]}>Back to Floats</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const position: LngLat | null = session.position?.lngLat ?? null;
  const time = remainingCopy(view.estimate);
  const live = view.status === 'live';

  const confirmEnd = () => {
    Alert.alert(
      view.arrived ? 'Finish this float?' : 'End this float?',
      view.arrived ? 'Tracking stops.' : 'Tracking stops and this float’s progress is cleared.',
      [
        { text: 'Keep floating', style: 'cancel' },
        {
          text: view.arrived ? 'Finish' : 'End float',
          style: view.arrived ? 'default' : 'destructive',
          onPress: () => {
            void endFloat().then(() => router.replace('/float-home'));
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['left', 'right']}>
      <View style={styles.map}>
        <FloatMap
          line={session.route.line}
          start={ends.start}
          takeOut={ends.takeOut}
          position={position}
          positionDimmed={!live}
        />
      </View>

      <ScrollView contentContainerStyle={styles.panel}>
        <Text style={[styles.route, { color: colors.textMuted }]} numberOfLines={1}>
          {view.riverName} · to {view.takeOutName}
        </Text>
        <Text style={[styles.status, { color: live ? colors.interactive : colors.textMuted }]} accessibilityLiveRegion="polite">
          {statusCopy(view, clock)}
        </Text>

        {permission === 'denied' ? (
          <PermissionNotice onPress={() => void Linking.openSettings()} label="Location is off for Eddy. Turn it on in Settings to track this float." />
        ) : permission === 'undetermined' ? (
          <PermissionNotice
            onPress={() => void Location.requestForegroundPermissionsAsync()}
            label="Eddy needs your location to show how far you have left. It stays on your phone."
          />
        ) : null}

        {view.startedPastTakeOut ? (
          <Text style={[styles.note, { color: colors.textMuted }]}>
            You started below {view.takeOutName}, so there’s no distance left to show. End this float and pick a take-out downstream.
          </Text>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
            <Text style={[styles.miles, { color: live ? colors.text : colors.textMuted }]}>
              {view.milesLeft == null ? '—' : `${view.milesLeft.toFixed(1)} mi`}
              <Text style={[styles.milesUnit, { color: colors.textMuted }]}>  left</Text>
            </Text>
            <View
              style={[styles.track, { backgroundColor: colors.selectionBg }]}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: Math.round((view.fraction ?? 0) * 100) }}
            >
              <View style={[styles.fill, { width: `${Math.round((view.fraction ?? 0) * 100)}%`, backgroundColor: colors.interactive }]} />
            </View>
            <Text style={[styles.percent, { color: colors.textMuted }]}>
              {view.fraction == null ? ' ' : `${Math.round(view.fraction * 100)}% of the way`}
            </Text>
            <Text style={[styles.time, { color: colors.text }]}>{time.headline}</Text>
            {time.note ? <Text style={[styles.note, { color: colors.textMuted }]}>{time.note}</Text> : null}
          </View>
        )}

        <Pressable
          onPress={confirmEnd}
          style={({ pressed }) => [
            view.arrived ? styles.primary : styles.secondary,
            view.arrived
              ? { backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill }
              : { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
          ]}
          accessibilityRole="button"
        >
          <Text style={view.arrived ? [styles.primaryText, { color: colors.onAccent }] : [styles.secondaryText, { color: colors.error }]}>
            {view.arrived ? 'Finish float' : 'End float'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function PermissionNotice({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.notice, { backgroundColor: colors.cardRaised, borderColor: colors.border }]} accessibilityRole="button">
      <Text style={[styles.noticeText, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

/** Foreground permission, re-read when it might have changed. */
function useLocationPermission(): 'granted' | 'denied' | 'undetermined' | null {
  const [status, setStatus] = useState<'granted' | 'denied' | 'undetermined' | null>(null);
  useEffect(() => {
    let active = true;
    const read = () =>
      void Location.getForegroundPermissionsAsync().then((result) => {
        if (active) setStatus(result.status as 'granted' | 'denied' | 'undetermined');
      });
    read();
    const timer = setInterval(read, TICK_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return status;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  map: { height: '45%' },
  panel: { padding: 16, gap: 12, paddingBottom: 32 },
  route: { ...t.sm, fontFamily: fonts.semibold },
  status: { ...t.sm, fontFamily: fonts.body },
  card: { borderRadius: radii.card, padding: 16, gap: 8 },
  miles: { ...textStyles.pageTitle },
  milesUnit: { ...t.base, fontFamily: fonts.body },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  percent: { ...t.xs, fontFamily: fonts.body },
  time: { ...t.lg, fontFamily: fonts.heading, marginTop: 4 },
  note: { ...t.sm, fontFamily: fonts.body },
  notice: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  noticeText: { ...t.sm, fontFamily: fonts.body },
  emptyTitle: { ...t.lg, fontFamily: fonts.heading },
  primary: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primaryText: { ...t.base, fontFamily: fonts.semibold },
  secondary: { minHeight: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  secondaryText: { ...t.base, fontFamily: fonts.semibold },
});
