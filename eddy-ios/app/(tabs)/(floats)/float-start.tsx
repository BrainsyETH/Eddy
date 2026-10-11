// Setup pages share one URL, with native pushes for river → take-out → summary.
// A nearby access point suggests a river; the paddler always confirms it.
// Preview location never seeds tracking. beginFloat still owns session creation.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { CommonActions, useRoute as useNavigationRoute } from 'expo-router/react-navigation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { milesBetween } from '@eddy/geo';
import type { RiverListItem } from '@eddy/types';
import { ControlIcon } from '@/components/ControlIcon';
import { useFloatSession } from '@/hooks/useFloatSession';
import { useFloatStartLocation } from '@/hooks/useFloatStartLocation';
import { loadFloatRoute, routeProblemCopy, type LoadedRoute } from '@/float/loadFloatRoute';
import {
  formatBeyond,
  formatDuration,
  suggestRivers,
  startSession,
  takeOutChoices,
} from '@/lib/floatSession';
import { completedFloatRoutes, startRiverPosition } from '@/lib/floatStart';
import { startLocationState } from '@/lib/floatPermissions';
import { beginFloat } from '@/lib/floatSessionStore';
import { TripDownloadCard } from '@/float/TripDownloadCard';
import { readBestIndex } from '@/lib/riverCache';
import { radii } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles, type as t } from '@/theme/typography';

type Params = {
  riverSlug?: string;
  putInId?: string;
  takeOutId?: string;
  shortCode?: string;
  plannerMph?: string;
  step?: 'takeout' | 'summary' | 'background';
  startKey?: string;
  sessionId?: string;
};
type StartLocation = ReturnType<typeof useFloatStartLocation>;
const BACKGROUND_EXPLAINED_KEY = 'eddy:float-background-explained:v1';

function newSessionId() {
  return `float-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function FloatStartScreen() {
  const params = useLocalSearchParams<Params>();
  const active = useFloatSession();
  const router = useRouter();
  const { colors } = useTheme();
  if (active)
    return (
      <Shell>
        <Text style={[styles.title, { color: colors.text }]}>A float is in progress</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>
          {active.route.riverName} to {active.takeOut.name}.
        </Text>
        <PrimaryButton label="Resume float" onPress={() => router.replace('/float-mode')} />
      </Shell>
    );
  return <StartFlow params={params} />;
}

function StartFlow({ params }: { params: Params }) {
  const { colors } = useTheme();
  const router = useRouter();
  const route = useNavigationRoute();
  const location = useFloatStartLocation();
  const [sessionId] = useState(() => params.sessionId ?? newSessionId());
  const startKey = params.startKey ?? route.key;
  const loaded = useRiverRoute(params.riverSlug, params.shortCode ?? params.sessionId);
  const nextParams = { ...params, sessionId, startKey };
  const start = useStart(nextParams, loaded, location);
  const saved = Boolean(params.putInId && params.takeOutId);
  const summary = saved || params.step === 'summary' || params.step === 'background';
  const located = useMemo(
    () => (loaded?.ok ? startRiverPosition(loaded.index, location.fix, location.checkedAt) : null),
    [loaded, location.fix, location.checkedAt],
  );
  const choices = useMemo(
    () => (loaded?.ok ? takeOutChoices(loaded.route, loaded.index, located?.riverMile ?? null) : []),
    [loaded, located],
  );

  const screen = (
    <Stack.Screen
      options={{
        title: 'Start a float',
        headerBackButtonMenuEnabled: false,
        gestureEnabled: !start.busy,
        ...(params.step === 'background'
          ? {
              presentation: 'formSheet',
              sheetAllowedDetents: [0.5, 1],
              sheetGrabberVisible: true,
              headerShown: false,
            }
          : {}),
      }}
    />
  );

  if (!params.riverSlug)
    return (
      <>
        {screen}
        <RiverPicker
          location={location}
          onChoose={(riverSlug) => {
            router.push({ pathname: '/float-start', params: { riverSlug, startKey, step: 'takeout' } });
          }}
        />
      </>
    );
  if (!loaded)
    return (
      <>
        {screen}
        <Shell>
          <ActivityIndicator color={colors.interactive} accessibilityLabel="Loading the river" />
        </Shell>
      </>
    );
  if (!loaded.ok)
    return (
      <>
        {screen}
        <Shell>
          <Text style={[styles.body, { color: colors.text }]}>{routeProblemCopy(loaded.reason)}</Text>
        </Shell>
      </>
    );

  if (params.step === 'background')
    return (
      <>
        {screen}
        <BackgroundStep location={location} start={start} />
      </>
    );

  if (!summary)
    return (
      <>
        {screen}
        <Shell>
          <RiverName name={loaded.route.riverName} />
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            Where are you taking out?
          </Text>
          {!located ? (
            <Text style={[styles.body, { color: colors.textMuted }]}>
              Progress appears once Eddy finds you on the river.
            </Text>
          ) : null}
          <Card padded={false}>
            {choices.map((choice) => (
              <Row
                key={choice.id}
                title={choice.name}
                detail={located ? `${(choice.mile - located.riverMile).toFixed(1)} mi` : undefined}
                onPress={() =>
                  router.push({
                    pathname: '/float-start',
                    params: {
                      riverSlug: params.riverSlug!,
                      takeOutId: choice.id,
                      sessionId: newSessionId(),
                      startKey,
                      step: 'summary',
                    },
                  })
                }
              />
            ))}
            {choices.length === 0 ? (
              <Text style={[styles.body, styles.empty, { color: colors.textMuted }]}>
                No take-outs ahead on this river. Go back to choose another river.
              </Text>
            ) : null}
          </Card>
        </Shell>
      </>
    );

  const putIn = loaded.route.anchors.find((anchor) => anchor.id === params.putInId);
  const takeOut = takeOutChoices(loaded.route, loaded.index, null).find(
    (choice) => choice.id === params.takeOutId,
  );
  // Use the same calibrated endpoint miles as the session, including off-line accesses.
  const preview = startSession({
    id: sessionId,
    kind: saved ? 'saved' : 'quick',
    route: loaded.route,
    index: loaded.index,
    putInId: params.putInId,
    takeOutId: params.takeOutId ?? '',
    now: 0,
  });
  if (!preview.ok || !takeOut)
    return (
      <>
        {screen}
        <Shell>
          <Text style={[styles.body, { color: colors.text }]}>
            {routeProblemCopy(preview.ok ? 'no-take-out' : preview.reason)}
          </Text>
        </Shell>
      </>
    );
  const startMile = preview.session.putIn?.riverMile ?? located?.riverMile;
  const miles = startMile != null ? preview.session.takeOut.riverMile - startMile : null;
  const upstream = !saved && miles != null && miles <= 0;
  const plannerMph = Number(params.plannerMph);
  const minutes =
    saved && miles != null && miles > 0 && Number.isFinite(plannerMph) && plannerMph > 0
      ? Math.max(5, Math.round(((miles / plannerMph) * 60) / 5) * 5)
      : null;
  const putInMiles =
    putIn && location.fix
      ? milesBetween(
          { lat: location.fix.point[1], lng: location.fix.point[0] },
          { lat: putIn.lngLat[1], lng: putIn.lngLat[0] },
        )
      : null;

  return (
    <>
      {screen}
      <Shell>
        <Card>
          <RiverName name={loaded.route.riverName} large />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <SummaryLine label="From" value={putIn?.name ?? 'Your location'} />
          <SummaryLine label="To" value={takeOut.name} />
          {miles != null && miles > 0 ? (
            <Text style={[styles.distance, { color: colors.text }]}>
              {miles.toFixed(1)} mi{minutes != null ? ` · about ${formatDuration(minutes)}` : ''}
            </Text>
          ) : null}
          {minutes != null ? (
            <Text style={[styles.caption, { color: colors.textMuted }]}>
              Estimated moving time · stops not included
            </Text>
          ) : null}
          {putInMiles != null ? (
            <Text style={[styles.body, { color: colors.textMuted }]}>
              About {putInMiles.toFixed(1)} mi from the put-in · straight-line distance
            </Text>
          ) : null}
          {!saved && !located ? (
            <Text style={[styles.body, { color: colors.textMuted }]}>
              Progress appears once Eddy finds you on the river.
            </Text>
          ) : null}
        </Card>
        {takeOut.offLineMeters != null ? (
          <Text style={[styles.body, { color: colors.textMuted }]}>
            {takeOut.name} is about {formatBeyond(takeOut.offLineMeters)} off the mapped river. Distances run
            to the closest point on the river.
          </Text>
        ) : null}
        {saved || (located && location.fix && !upstream) ? (
          <TripDownloadCard
            compact
            tripKey={params.shortCode ?? sessionId}
            route={loaded.route}
            fromId={params.putInId ?? ''}
            fromLngLat={!saved && location.fix ? location.fix.point : undefined}
            toId={takeOut.id}
          />
        ) : null}
        {location.state !== 'ready' ? (
          <LocationGate location={location} summary />
        ) : (
          <>
            {upstream ? (
              <Text style={[styles.body, { color: colors.error }]}>
                This take-out is behind you. Go back to choose one downstream.
              </Text>
            ) : null}
            <PrimaryButton
              label="Start float"
              busy={start.busy}
              disabled={upstream}
              onPress={() => void start.run('start')}
            />
          </>
        )}
        {start.error ? (
          <Text accessibilityRole="alert" style={[styles.body, { color: colors.error }]}>
            {start.error}
          </Text>
        ) : null}
      </Shell>
    </>
  );
}

function RiverPicker({ location, onChoose }: { location: StartLocation; onChoose: (slug: string) => void }) {
  const { colors } = useTheme();
  const [rivers, setRivers] = useState<RiverListItem[] | null>(null);
  const [manual, setManual] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  useEffect(() => {
    let current = true;
    void readBestIndex()
      .then((index) => {
        if (current) setRivers(index?.payload ?? []);
      })
      .catch(() => {
        if (current) setRivers([]);
      });
    return () => {
      current = false;
    };
  }, []);
  const suggestions = useMemo(
    () =>
      rivers && location.fix
        ? suggestRivers(rivers, { lat: location.fix.point[1], lng: location.fix.point[0] }).filter(
            (river) => river.miles <= 25,
          )
        : [],
    [rivers, location.fix],
  );
  const showList = manual || location.state === 'ready' || Boolean(location.error);
  const first = suggestions[0];
  const filtered = useMemo(
    () =>
      [...(rivers ?? [])]
        .filter((river) => river.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [rivers, query],
  );

  if (!showList)
    return (
      <Shell>
        <LocationGate location={location} />
        <TextButton label="Choose a river instead" onPress={() => setManual(true)} />
      </Shell>
    );

  return (
    <Shell>
      {location.busy ? (
        <View style={styles.inline}>
          <ActivityIndicator color={colors.interactive} />
          <Text style={[styles.body, { color: colors.textMuted }]}>Finding your location…</Text>
        </View>
      ) : null}
      {location.error ? (
        <Text style={[styles.body, { color: colors.textMuted }]}>{location.error}</Text>
      ) : null}
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        {first && !manual && !searching ? 'Is this your river?' : 'Which river are you on?'}
      </Text>
      {first && !manual && !searching ? (
        <>
          <Card>
            <RiverName name={first.name} large />
            <Text style={[styles.body, { color: colors.textMuted }]}>
              {first.miles.toFixed(1)} mi to the nearest access
            </Text>
            <PrimaryButton label="Use this river" onPress={() => onChoose(first.slug)} />
          </Card>
          {suggestions.length > 1 ? (
            <View style={styles.group}>
              <Text style={[styles.label, { color: colors.textMuted }]}>Other rivers nearby</Text>
              <Card padded={false}>
                {suggestions.slice(1).map((river) => (
                  <Row
                    key={river.slug}
                    title={river.name}
                    detail={`${river.miles.toFixed(1)} mi`}
                    onPress={() => onChoose(river.slug)}
                  />
                ))}
              </Card>
            </View>
          ) : null}
          <Text style={[styles.caption, { color: colors.textMuted }]}>
            Straight-line distance to each river’s nearest access.
          </Text>
        </>
      ) : null}
      <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <ControlIcon name="search-outline" size={20} color={colors.textMuted} />
        <TextInput
          accessibilityLabel="Search all rivers"
          placeholder="Search all rivers"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setSearching(true)}
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
          style={[styles.searchInput, { color: colors.text }]}
        />
      </View>
      {searching || manual || !first ? (
        rivers == null ? (
          <ActivityIndicator color={colors.interactive} />
        ) : (
          <Card padded={false}>
            {filtered.map((river) => (
              <Row key={river.slug} title={river.name} onPress={() => onChoose(river.slug)} />
            ))}
            {filtered.length === 0 ? (
              <Text style={[styles.body, styles.empty, { color: colors.textMuted }]}>
                {rivers.length
                  ? 'No rivers match your search.'
                  : 'Open Eddy with a signal to load the river list.'}
              </Text>
            ) : null}
          </Card>
        )
      ) : null}
      {!location.busy ? (
        <TextButton
          label={location.state === 'ready' ? 'Find me again' : 'Use my location'}
          onPress={() => {
            setManual(false);
            void location.act();
          }}
        />
      ) : null}
    </Shell>
  );
}

function LocationGate({ location, summary = false }: { location: StartLocation; summary?: boolean }) {
  const { colors } = useTheme();
  const copy = {
    checking: ['Checking location', ''],
    request: ['Use your location', 'Eddy uses your location to track your float.'],
    settings: ['Location is off', 'Turn it on to track your float.'],
    precise: ['Turn on Precise Location', 'Eddy needs a precise location to track your float.'],
    services: [
      'Location Services are off',
      'Turn on Location Services in iPhone Settings to track your float.',
    ],
    ready: ['Find your location', 'Eddy uses your location to track your float.'],
  }[location.state];
  const settings = ['settings', 'precise', 'services'].includes(location.state);
  return (
    <Card>
      <ControlIcon name="locate-outline" size={28} color={colors.interactive} />
      <Text accessibilityRole="header" style={[styles.cardTitle, { color: colors.text }]}>
        {copy[0]}
      </Text>
      {copy[1] ? <Text style={[styles.body, { color: colors.textMuted }]}>{copy[1]}</Text> : null}
      {location.error ? (
        <Text style={[styles.body, { color: colors.textMuted }]}>{location.error}</Text>
      ) : null}
      <PrimaryButton
        label={settings ? 'Open Settings' : summary ? 'Enable location' : 'Find me on the river'}
        busy={location.busy}
        onPress={() => void location.act()}
      />
    </Card>
  );
}

function BackgroundStep({
  location,
  start,
}: {
  location: StartLocation;
  start: ReturnType<typeof useStart>;
}) {
  const { colors } = useTheme();
  const [background, setBackground] = useState<Location.PermissionResponse | null>(null);
  useFocusEffect(
    useCallback(() => {
      let current = true;
      const read = () =>
        void Location.getBackgroundPermissionsAsync()
          .then((value) => {
            if (current) setBackground(value);
          })
          .catch(() => {});
      read();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') read();
      });
      return () => {
        current = false;
        subscription.remove();
      };
    }, []),
  );
  const settings = background && background.status !== 'granted' && !background.canAskAgain;
  return (
    <Shell>
      <ControlIcon name="locate-outline" size={32} color={colors.interactive} />
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        Keep tracking when your phone is locked
      </Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Allow background location to keep tracking while your phone is locked.
      </Text>
      {location.state !== 'ready' ? (
        <LocationGate location={location} summary />
      ) : (
        <>
          <PrimaryButton
            label={background?.status === 'granted' ? 'Start float' : settings ? 'Open Settings' : 'Continue'}
            busy={start.busy}
            onPress={() => void start.run('background')}
          />
          <TextButton
            label="Start without background tracking"
            disabled={start.busy}
            onPress={() => void start.run('foreground')}
          />
        </>
      )}
      {start.error ? (
        <Text accessibilityRole="alert" style={[styles.body, { color: colors.error }]}>
          {start.error}
        </Text>
      ) : null}
    </Shell>
  );
}

function useStart(params: Params, loaded: LoadedRoute | null, location: StartLocation) {
  const router = useRouter();
  const navigation = useNavigation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
      };
    }, []),
  );
  const run = async (intent: 'start' | 'background' | 'foreground') => {
    if (running.current || !loaded?.ok) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      const foreground = await Location.getForegroundPermissionsAsync();
      const services = await Location.hasServicesEnabledAsync();
      if (!focused.current) return;
      if (startLocationState(foreground, services) !== 'ready') {
        await location.refresh();
        return;
      }
      const background = await Location.getBackgroundPermissionsAsync();
      if (intent === 'start' && background.status !== 'granted') {
        const explained = await AsyncStorage.getItem(BACKGROUND_EXPLAINED_KEY).catch(() => null);
        if (!focused.current) return;
        if (!explained) {
          router.push({ pathname: '/float-start', params: { ...params, step: 'background' } });
          return;
        }
      }
      if (intent !== 'start') {
        await AsyncStorage.setItem(BACKGROUND_EXPLAINED_KEY, '1').catch(() => {});
        if (!focused.current) return;
        if (intent === 'background' && background.status !== 'granted') {
          if (!background.canAskAgain) {
            await Linking.openSettings();
            return;
          }
          // Allow Once can silently decline this. Foreground tracking still starts.
          await Location.requestBackgroundPermissionsAsync();
        }
      }
      if (!focused.current) return;
      // Permissions may have changed in the system prompt; never start from a stale grant.
      const finalPermission = await Location.getForegroundPermissionsAsync();
      const finalServices = await Location.hasServicesEnabledAsync();
      if (!focused.current) return;
      if (startLocationState(finalPermission, finalServices) !== 'ready') {
        await location.refresh();
        return;
      }
      const saved = Boolean(params.putInId);
      const hit = !saved ? startRiverPosition(loaded.index, location.fix, Date.now()) : null;
      if (
        hit &&
        !takeOutChoices(loaded.route, loaded.index, hit.riverMile).some(
          (choice) => choice.id === params.takeOutId,
        )
      ) {
        setError('This take-out is behind you. Go back to choose one downstream.');
        return;
      }
      const speed = Number(params.plannerMph);
      const made = startSession({
        id: params.sessionId!,
        kind: saved ? 'saved' : 'quick',
        shortCode: params.shortCode,
        route: loaded.route,
        index: loaded.index,
        putInId: params.putInId,
        takeOutId: params.takeOutId ?? '',
        plannerMph: saved && Number.isFinite(speed) && speed > 0 ? speed : null,
        now: Date.now(),
      });
      if (!made.ok) {
        setError(routeProblemCopy(made.reason));
        return;
      }
      const result = await beginFloat(made.session);
      if (result === 'storage-failed') {
        setError('Eddy couldn’t save this float. Free up some storage and try again.');
        return;
      }
      const state = navigation.getState();
      if (!state) {
        router.replace('/float-mode');
        return;
      }
      const routes = completedFloatRoutes(state.routes, params.startKey ?? '');
      navigation.dispatch({
        ...CommonActions.reset({ ...state, routes, index: routes.length - 1 }),
        target: state.key,
      });
    } catch {
      if (focused.current) setError('Eddy couldn’t start this float. Please try again.');
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return { run, busy, error };
}

function useRiverRoute(slug?: string, tripKey?: string): LoadedRoute | null {
  const [state, setState] = useState<{ slug: string; result: LoadedRoute } | null>(null);
  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    void loadFloatRoute(slug, controller.signal, tripKey)
      .then((result) => {
        if (!controller.signal.aborted) setState({ slug, result });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ slug, result: { ok: false, reason: 'no-river-data' } });
      });
    return () => controller.abort();
  }, [slug, tripKey]);
  return state && state.slug === slug ? state.result : null;
}

function Shell({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['left', 'right', 'bottom']}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.content}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
function Card({ children, padded = true }: { children: React.ReactNode; padded?: boolean }) {
  const { colors, elevation } = useTheme();
  return (
    <View style={[styles.card, padded && styles.cardPadding, { backgroundColor: colors.card }, elevation(1)]}>
      {children}
    </View>
  );
}
function RiverName({ name, large = false }: { name: string; large?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.inline}>
      <ControlIcon name="water-outline" size={22} color={colors.interactive} />
      <Text
        accessibilityRole={large ? 'header' : undefined}
        style={[
          large ? styles.cardTitle : styles.body,
          styles.flex,
          { color: large ? colors.text : colors.textMuted },
        ]}
      >
        {name}
      </Text>
    </View>
  );
}
function SummaryLine({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.summaryLine}>
      <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}
function PrimaryButton({
  label,
  onPress,
  busy = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy || disabled, busy }}
      style={({ pressed }) => [
        styles.primary,
        {
          backgroundColor: pressed ? colors.accentFillPressed : colors.accentFill,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={colors.onAccent} />
      ) : (
        <Text style={[styles.primaryText, { color: colors.onAccent }]}>{label}</Text>
      )}
    </Pressable>
  );
}
function TextButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={styles.link}
    >
      <Text style={[styles.linkText, { color: colors.interactive }]}>{label}</Text>
    </Pressable>
  );
}
function Row({ title, detail, onPress }: { title: string; detail?: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
        {detail ? <Text style={[styles.body, { color: colors.textMuted }]}>{detail}</Text> : null}
      </View>
      <ControlIcon name="chevron-forward" size={16} color={colors.textSubtle} />
    </Pressable>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, gap: 20, paddingBottom: 32 },
  title: { ...textStyles.pageTitle },
  cardTitle: { ...t['2xl'], fontFamily: fonts.heading },
  body: { ...t.sm },
  caption: { ...textStyles.caption },
  label: { ...t.sm, fontFamily: fonts.semibold },
  group: { gap: 10 },
  card: { borderRadius: radii.feature },
  cardPadding: { padding: 20, gap: 16 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1 },
  divider: { height: StyleSheet.hairlineWidth },
  summaryLine: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  summaryLabel: { ...t.base, minWidth: 44 },
  summaryValue: { ...t.base, fontFamily: fonts.semibold, flex: 1, minWidth: 120 },
  distance: { ...t.lg, fontFamily: fonts.semibold, marginTop: 4 },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, gap: 4 },
  rowTitle: { ...t.base, fontFamily: fonts.semibold },
  empty: { padding: 16 },
  primary: {
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radii.inset,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { ...t.base, fontFamily: fonts.semibold, textAlign: 'center' },
  link: { minHeight: 44, justifyContent: 'center', paddingVertical: 8 },
  linkText: { ...t.base, fontFamily: fonts.semibold, textAlign: 'center' },
  search: {
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.inset,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  searchInput: { ...t.base, flex: 1, paddingVertical: 12 },
});
