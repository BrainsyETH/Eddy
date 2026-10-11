// eddy-ios/app/(tabs)/(floats)/float-start.tsx
// Starting a float: from a saved float, or a quick start from where you are.
//
//   saved  /float-start?riverSlug=…&putInId=…&takeOutId=…[&shortCode][&plannerMph]
//   quick  /float-start
//
// Neither needs an account, a server plan, a share code or a map download.
// The river line and access points come from the phone when it has them (the
// launch bundle seeds every river), and the network only fills a gap.
//
// Quick start never picks the river for you. Nearby rivers are suggestions;
// near a confluence the nearest access point can belong to the wrong one.
// Location is asked for here, with the reason on screen, and never before.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { locateOnRoute, type LngLat } from '@eddy/geo';
import type { RiverListItem } from '@eddy/types';
import { useFloatSession } from '@/hooks/useFloatSession';
import { loadFloatRoute, routeProblemCopy, type LoadedRoute } from '@/float/loadFloatRoute';
import { formatBeyond, suggestRivers, startSession, takeOutChoices, type TakeOutChoice } from '@/lib/floatSession';
import { beginFloat } from '@/lib/floatSessionStore';
import { TripDownloadCard } from '@/float/TripDownloadCard';
import { readBestIndex } from '@/lib/riverCache';
import { radii } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles, type as t } from '@/theme/typography';

/** Farther than this from the river line, a location does not narrow the take-outs. */
const ON_RIVER_METERS = 2_000;

type Params = { riverSlug?: string; putInId?: string; takeOutId?: string; shortCode?: string; plannerMph?: string };

function newSessionId(): string {
  return `float-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function FloatStartScreen() {
  const params = useLocalSearchParams<Params>();
  const active = useFloatSession();
  const router = useRouter();
  const { colors } = useTheme();

  if (active) {
    return (
      <Shell>
        <Text style={[styles.title, { color: colors.text }]}>A float is in progress</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>
          {active.route.riverName} to {active.takeOut.name}. Resume it, or end it from Float Mode before starting another.
        </Text>
        <PrimaryButton label="Resume float" onPress={() => router.replace('/float-mode')} />
      </Shell>
    );
  }

  const saved = params.riverSlug && params.putInId && params.takeOutId;
  return saved ? (
    <SavedStart
      riverSlug={params.riverSlug!}
      putInId={params.putInId!}
      takeOutId={params.takeOutId!}
      shortCode={params.shortCode ?? null}
      plannerMph={params.plannerMph ? Number(params.plannerMph) : null}
    />
  ) : (
    <QuickStart />
  );
}

function SavedStart(props: { riverSlug: string; putInId: string; takeOutId: string; shortCode: string | null; plannerMph: number | null }) {
  const { colors } = useTheme();
  const loaded = useRoute(props.riverSlug, props.shortCode);
  const start = useStart();

  if (!loaded) return <Loading />;
  if (!loaded.ok) return <Problem text={routeProblemCopy(loaded.reason)} />;
  const putIn = loaded.route.anchors.find((a) => a.id === props.putInId);
  const takeOut = loaded.route.anchors.find((a) => a.id === props.takeOutId);

  return (
    <Shell>
      <Text style={[styles.eyebrow, { color: colors.accent }]}>{loaded.route.riverName.toUpperCase()}</Text>
      <Text style={[styles.title, { color: colors.text }]}>
        {putIn?.name ?? 'Put-in'} → {takeOut?.name ?? 'Take-out'}
      </Text>
      {props.shortCode ? (
        <TripDownloadCard tripKey={props.shortCode} route={loaded.route} fromId={props.putInId} toId={props.takeOutId} />
      ) : null}
      <LocationReason />
      <PrimaryButton
        label="Start float"
        busy={start.busy}
        onPress={() =>
          void start.run(() =>
            startSession({
              id: newSessionId(),
              kind: 'saved',
              shortCode: props.shortCode,
              route: loaded.route,
              index: loaded.index,
              putInId: props.putInId,
              takeOutId: props.takeOutId,
              plannerMph: props.plannerMph,
              now: Date.now(),
            }),
          )
        }
      />
      {start.error ? <Text style={[styles.body, { color: colors.error }]}>{start.error}</Text> : null}
    </Shell>
  );
}

function QuickStart() {
  const { colors, elevation } = useTheme();
  const [rivers, setRivers] = useState<RiverListItem[] | null>(null);
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [riverSlug, setRiverSlug] = useState<string | null>(null);
  /**
   * The take-out picked, waiting on Start float. Its session id is made here
   * and reused at start, so an optional download made now (keyed by it)
   * belongs to the float that follows.
   */
  const [picked, setPicked] = useState<{ choice: TakeOutChoice; sessionId: string } | null>(null);
  const loaded = useRoute(riverSlug);
  const start = useStart();

  useEffect(() => {
    void readBestIndex().then((index) => setRivers(index?.payload ?? []));
  }, []);

  const locate = useCallback(async () => {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') return;
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setHere({ lat: position.coords.latitude, lng: position.coords.longitude });
    } catch {
      // No position is fine: the full river list is right below.
    } finally {
      setLocating(false);
    }
  }, []);

  const suggestions = useMemo(() => (rivers && here ? suggestRivers(rivers, here) : []), [rivers, here]);
  // One array per position: the download card plans from it, and a new array
  // every render would re-plan and re-read the offline store every render.
  const herePoint = useMemo<LngLat | null>(() => (here ? [here.lng, here.lat] : null), [here]);

  // Where you are on the chosen river, to offer only take-outs below you.
  const located = useMemo(() => {
    if (!loaded?.ok || !here) return null;
    const hit = locateOnRoute(loaded.index, [here.lng, here.lat] as LngLat);
    return hit && hit.offsetMeters <= ON_RIVER_METERS ? hit : null;
  }, [loaded, here]);
  const choices = useMemo(
    () => (loaded?.ok ? takeOutChoices(loaded.route, loaded.index, located?.riverMile ?? null) : []),
    [loaded, located],
  );

  if (!riverSlug) {
    return (
      <Shell>
        <Text style={[styles.title, { color: colors.text }]}>Which river are you on?</Text>
        <Pressable
          onPress={() => void locate()}
          style={({ pressed }) => [styles.secondary, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
        >
          {locating ? <ActivityIndicator color={colors.interactive} /> : (
            <Text style={[styles.secondaryText, { color: colors.interactive }]}>Suggest rivers near me</Text>
          )}
        </Pressable>
        {suggestions.length > 0 ? (
          <View style={styles.group}>
            <Text style={[styles.label, { color: colors.textMuted }]}>Nearby (straight-line distance)</Text>
            {suggestions.map((s) => (
              <Row key={s.slug} title={s.name} detail={`${s.miles.toFixed(1)} mi`} onPress={() => setRiverSlug(s.slug)} />
            ))}
          </View>
        ) : null}
        <View style={styles.group}>
          <Text style={[styles.label, { color: colors.textMuted }]}>All rivers</Text>
          {rivers == null ? <ActivityIndicator color={colors.interactive} /> : rivers.length === 0 ? (
            <Text style={[styles.body, { color: colors.textMuted }]}>
              Eddy hasn’t saved the river list on this phone yet. Open Eddy once with a signal.
            </Text>
          ) : (
            [...rivers]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((river) => <Row key={river.slug} title={river.name} onPress={() => setRiverSlug(river.slug)} />)
          )}
        </View>
      </Shell>
    );
  }

  if (!loaded) return <Loading />;
  if (!loaded.ok) return <Problem text={routeProblemCopy(loaded.reason)} onBack={() => setRiverSlug(null)} />;

  const milesTo = (choice: TakeOutChoice) => (located ? choice.mile - located.riverMile : null);

  if (picked) {
    const { choice, sessionId } = picked;
    const miles = milesTo(choice);
    return (
      <Shell>
        <Text style={[styles.eyebrow, { color: colors.accent }]}>{loaded.route.riverName.toUpperCase()}</Text>
        <Text style={[styles.title, { color: colors.text }]}>To {choice.name}</Text>
        {miles != null ? (
          <Text style={[styles.body, { color: colors.text }]}>About {miles.toFixed(1)} mi down the river from you.</Text>
        ) : null}
        {choice.offLineMeters != null ? (
          <Text style={[styles.body, { color: colors.textMuted }]}>
            {choice.name} sits about {formatBeyond(choice.offLineMeters)} off the mapped river. Float Mode tracks you to the river’s closest point and tells you when you’re there.
          </Text>
        ) : null}
        {located && herePoint ? (
          <TripDownloadCard
            tripKey={sessionId}
            route={loaded.route}
            fromId=""
            fromLngLat={herePoint}
            toId={choice.id}
          />
        ) : (
          <Text style={[styles.body, { color: colors.textMuted }]}>
            An offline map download needs Eddy to find you on this river first. Float Mode tracks without one.
          </Text>
        )}
        <LocationReason />
        <PrimaryButton
          label="Start float"
          busy={start.busy}
          onPress={() =>
            void start.run(() =>
              startSession({ id: sessionId, kind: 'quick', route: loaded.route, index: loaded.index, takeOutId: choice.id, now: Date.now() }),
            )
          }
        />
        {start.error ? <Text style={[styles.body, { color: colors.error }]}>{start.error}</Text> : null}
        <Pressable onPress={() => setPicked(null)} accessibilityRole="button" style={styles.link}>
          <Text style={[styles.secondaryText, { color: colors.interactive }]}>Choose a different take-out</Text>
        </Pressable>
      </Shell>
    );
  }

  return (
    <Shell>
      <Text style={[styles.eyebrow, { color: colors.accent }]}>{loaded.route.riverName.toUpperCase()}</Text>
      <Text style={[styles.title, { color: colors.text }]}>Where are you taking out?</Text>
      {here && !located ? (
        <Text style={[styles.body, { color: colors.textMuted }]}>
          You don’t look close to this river, so every take-out is listed. Progress starts once Eddy finds you on it.
        </Text>
      ) : null}
      <LocationReason />
      <View style={[styles.list, { backgroundColor: colors.card }, elevation(1)]}>
        {choices.length === 0 ? (
          <Text style={[styles.body, { color: colors.textMuted, padding: 14 }]}>No take-outs below you on this river.</Text>
        ) : (
          choices.map((choice) => {
            const miles = milesTo(choice);
            const detail = [miles != null ? `${miles.toFixed(1)} mi` : null, choice.offLineMeters != null ? 'off river' : null]
              .filter(Boolean)
              .join(' · ');
            return (
              <Row
                key={choice.id}
                title={choice.name}
                detail={detail || undefined}
                onPress={() => setPicked({ choice, sessionId: newSessionId() })}
              />
            );
          })
        )}
      </View>
      {start.error ? <Text style={[styles.body, { color: colors.error }]}>{start.error}</Text> : null}
      <Pressable onPress={() => { setPicked(null); setRiverSlug(null); }} accessibilityRole="button" style={styles.link}>
        <Text style={[styles.secondaryText, { color: colors.interactive }]}>Choose a different river</Text>
      </Pressable>
    </Shell>
  );
}

/** Load a river's route once per slug; a saved trip's own package first. */
function useRoute(slug: string | null, tripKey?: string | null): LoadedRoute | null {
  const [state, setState] = useState<{ slug: string; result: LoadedRoute } | null>(null);
  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    loadFloatRoute(slug, controller.signal, tripKey)
      .then((result) => setState({ slug, result }))
      .catch(() => {});
    return () => controller.abort();
  }, [slug, tripKey]);
  return slug && state?.slug === slug ? state.result : null;
}

/** Ask for location if needed, begin the float, and open Float Mode. */
function useStart() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (make: () => ReturnType<typeof startSession>) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        const made = make();
        if (!made.ok) {
          setError(routeProblemCopy(made.reason));
          return;
        }
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          setError('Float Mode needs your location to show how far you have left. Turn it on for Eddy in Settings.');
          if (!permission.canAskAgain) void Linking.openSettings();
          return;
        }
        // Locked-screen tracking needs "Always". Asked once, here, where the
        // reason is on screen; declining still starts the float, and Float
        // Mode says tracking pauses while locked.
        const background = await Location.getBackgroundPermissionsAsync();
        if (background.status !== 'granted' && background.canAskAgain) {
          await Location.requestBackgroundPermissionsAsync();
        }
        // A float is not active until it is on disk. 'already-active' (a
        // second tap, or one started elsewhere) opens the float in progress.
        const result = await beginFloat(made.session);
        if (result === 'storage-failed') {
          setError('Eddy couldn’t save this float on your phone, so it could be lost if Eddy closes. Free up some storage and try again.');
          return;
        }
        router.replace('/float-mode');
      } finally {
        setBusy(false);
      }
    },
    [busy, router],
  );
  return { run, busy, error };
}

function LocationReason() {
  const { colors } = useTheme();
  return (
    <Text style={[styles.body, { color: colors.textMuted }]}>
      Float Mode uses your location to show miles and time left, and it stays on your phone. To keep tracking with
      your phone locked in a dry bag, allow location Always when asked.
    </Text>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['left', 'right']}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

function Loading() {
  const { colors } = useTheme();
  return (
    <Shell>
      <ActivityIndicator color={colors.interactive} accessibilityLabel="Loading the river" />
    </Shell>
  );
}

function Problem({ text, onBack }: { text: string; onBack?: () => void }) {
  const { colors } = useTheme();
  return (
    <Shell>
      <Text style={[styles.body, { color: colors.text }]}>{text}</Text>
      {onBack ? (
        <Pressable onPress={onBack} accessibilityRole="button" style={styles.link}>
          <Text style={[styles.secondaryText, { color: colors.interactive }]}>Choose a different river</Text>
        </Pressable>
      ) : null}
    </Shell>
  );
}

function PrimaryButton({ label, onPress, busy = false }: { label: string; onPress: () => void; busy?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [styles.primary, { backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill }]}
      accessibilityRole="button"
    >
      {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={[styles.primaryText, { color: colors.onAccent }]}>{label}</Text>}
    </Pressable>
  );
}

function Row({ title, detail, onPress }: { title: string; detail?: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
      accessibilityRole="button"
    >
      <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
      {detail ? <Text style={[styles.rowDetail, { color: colors.textSubtle }]}>{detail}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  eyebrow: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 0.8 },
  title: { ...textStyles.sectionTitle },
  body: { ...t.sm, fontFamily: fonts.body },
  label: { ...t.xs, fontFamily: fonts.semibold, marginBottom: 4 },
  group: { gap: 2 },
  list: { borderRadius: radii.card, overflow: 'hidden' },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  rowTitle: { ...t.base, fontFamily: fonts.semibold, flex: 1 },
  rowDetail: { ...t.sm, fontFamily: fonts.body, marginLeft: 8 },
  primary: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primaryText: { ...t.base, fontFamily: fonts.semibold },
  secondary: { minHeight: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { ...t.base, fontFamily: fonts.semibold },
  link: { minHeight: 44, justifyContent: 'center' },
});
