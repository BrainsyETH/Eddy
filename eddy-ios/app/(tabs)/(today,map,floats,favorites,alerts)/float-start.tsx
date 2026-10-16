// All entry points fill one editable draft. Preview GPS never seeds the recorder.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { CommonActions, useRoute as useNavigationRoute } from 'expo-router/react-navigation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FLOAT_BOATS, FLOAT_BOAT_STORAGE_KEY, type FloatBoat } from '@eddy/conditions/float-search';
import { useSession } from '@/hooks/useSession';
import { useFloatSession, useFloatSessionUnreadable } from '@/hooks/useFloatSession';
import { useFloatStartLocation } from '@/hooks/useFloatStartLocation';
import { routeProblemCopy } from '@/float/loadFloatRoute';
import { LocationGate } from '@/float/start/LocationGate';
import { RoutePicker } from '@/float/start/RoutePicker';
import { RouteCard } from '@/float/start/RouteCard';
import { useGpsRiver } from '@/float/start/useGpsRiver';
import { VesselPicker } from '@/components/VesselPicker';
import { Card, PrimaryButton, Shell, TextButton, styles } from '@/float/start/ui';
import { newSessionId, useRiverRoute, useStart, type Params } from '@/float/start/useStart';
import { useStartEstimate } from '@/float/start/useEstimate';
import { FloatMap } from '@/float/FloatMap';
import { TripDownloadCard } from '@/float/TripDownloadCard';
import { PlanAccessPhoto } from '@/components/PlanAccessPhoto';
import { arrivalCopy, arrivalOutlook, formatDuration, mapFeatures, startSession, takeOutChoices } from '@/lib/floatSession';
import { putInLocation, estimateStartId, floatSetupKey, sameFloatStretch, startRiverPosition, usableStartFix } from '@/lib/floatStart';
import { useTheme } from '@/theme/ThemeProvider';
import { completedFloatRoutes } from '@/lib/floatNavigation';
import { nextTakeOuts } from '@/lib/floatStartSelection';
import { matchesSetupDownload } from '@/lib/floatSetupDownload';
import { readPendingFloatSetup, savePendingFloatSetup } from '@/float/pendingFloatSetup';
import type { TripPackage } from '@/lib/tripDownload';

const clockTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const isBoat = (value?: string | null): value is FloatBoat => FLOAT_BOATS.includes(value as FloatBoat);
const movingMinutes = (miles: number, mph: number | null) => miles > 0 && mph != null
  ? Math.max(5, Math.round(miles / mph * 12) * 5) : null;

export default function FloatStartScreen() {
  const params = useLocalSearchParams<Params>();
  const active = useFloatSession();
  const stored = useFloatSessionUnreadable();
  const { colors } = useTheme();
  const [restored, setRestored] = useState<Awaited<ReturnType<typeof readPendingFloatSetup>> | undefined>();
  useEffect(() => {
    let current = true;
    void readPendingFloatSetup().then(value => { if (current) setRestored(value); });
    return () => { current = false; };
  }, []);
  if (active) return <ResumeActiveFloat />;
  if (stored.unreadable) return (
    <Shell>
      <Text style={[styles.title, { color: colors.text }]}>Eddy couldn’t check for a float in progress</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        Your saved float couldn’t be read just now. Try again before starting a new one.
      </Text>
      <PrimaryButton label="Try again" onPress={stored.retry} />
    </Shell>
  );
  if (!params.riverSlug && restored === undefined) return <Shell><ActivityIndicator /></Shell>;
  const pending = !params.riverSlug ? restored : null;
  const initial = pending ? { riverSlug: pending.pkg.route.riverSlug, putInId: pending.pkg.fromId || undefined,
    takeOutId: pending.pkg.toId, boatType: pending.boatType } : params;
  return <ReadyToFloat initial={initial} restoredPackage={pending?.pkg} />;
}

function ResumeActiveFloat() {
  const navigation = useNavigation();
  const route = useNavigationRoute();
  const router = useRouter();
  const opened = useRef(false);
  useFocusEffect(useCallback(() => {
    if (opened.current) return;
    opened.current = true;
    const state = navigation.getState();
    const routes = state ? completedFloatRoutes(state.routes, route.key) : [];
    if (state && routes.length) navigation.dispatch({
      ...CommonActions.reset({ ...state, routes, index: routes.length - 1 }), target: state.key,
    });
    router.push('/float-mode');
  }, [navigation, route.key, router]));
  return null;
}

function ReadyToFloat({ initial, restoredPackage }: { initial: Params; restoredPackage?: TripPackage }) {
  const { colors } = useTheme();
  const location = useFloatStartLocation();
  const account = useSession();
  const [id] = useState(newSessionId);
  const [draft, setDraft] = useState(() => ({ riverSlug: initial.riverSlug, putInId: initial.putInId, takeOutId: initial.takeOutId }));
  const [boat, setBoat] = useState<FloatBoat>(() => isBoat(initial.boatType) ? initial.boatType : 'kayak');
  const boatChosen = useRef(isBoat(initial.boatType));
  const [picker, setPicker] = useState<'river' | 'from' | 'to' | null>(null);
  // Tracking needs location, so the screen asks once on arrival instead of
  // waiting for a tap; a declined prompt falls back to the Location card.
  const askedLocation = useRef(false);
  const { state: locationState, act: locationAct } = location;
  useEffect(() => {
    if (locationState !== 'request' || askedLocation.current) return;
    askedLocation.current = true;
    void locationAct();
  }, [locationState, locationAct]);
  // An empty river is filled from GPS until the paddler makes any choice.
  const [autoEligible, setAutoEligible] = useState(!initial.riverSlug);
  const [autoRiver, setAutoRiver] = useState<string | null>(null);
  const gpsRiver = useGpsRiver(autoEligible && !draft.riverSlug, location, slug => {
    setDraft(current => current.riverSlug ? current : { riverSlug: slug, putInId: undefined, takeOutId: undefined });
    setAutoRiver(slug);
  });
  useEffect(() => {
    let current = true;
    void AsyncStorage.getItem(FLOAT_BOAT_STORAGE_KEY).then(value => {
      if (current && !boatChosen.current && isBoat(value)) setBoat(value);
    }).catch(() => {});
    return () => { current = false; };
  }, []);
  const unchanged = sameFloatStretch(initial, draft);
  const shortCode = unchanged ? initial.shortCode : undefined;
  const [savedPackage, setSavedPackage] = useState(restoredPackage);
  // A package also carries the full river line. It remains a valid data source
  // on that river after edits, but its tiles are reused only for its own stretch.
  const sourceKey = restoredPackage && restoredPackage.route.riverSlug === draft.riverSlug ? restoredPackage.tripKey : undefined;
  const [routeReload, setRouteReload] = useState(0);
  const loaded = useRiverRoute(draft.riverSlug, shortCode ?? sourceKey, routeReload);
  const route = loaded?.ok ? loaded.route : null;
  const located = useMemo(() => loaded?.ok
    ? startRiverPosition(loaded.index, location.fix, location.checkedAt) : null, [loaded, location.fix, location.checkedAt]);
  const choices = useMemo(() => loaded?.ok ? takeOutChoices(loaded.route, loaded.index, null) : [], [loaded]);
  const putIn = choices.find(point => point.id === draft.putInId);
  const takeOut = choices.find(point => point.id === draft.takeOutId);
  const startMile = draft.putInId ? putIn?.mile ?? null : located?.riverMile ?? null;
  const fromPoint = putIn?.lngLat ?? (!draft.putInId && located ? location.fix?.point : null);
  const stretchKey = floatSetupKey(draft, fromPoint);
  // Local package IDs contain no GPS coordinates. A change gets its own package;
  // returning to an earlier draft reuses that draft's download.
  const [packages] = useState(() => new Map<string, string>());
  const reusablePackage = savedPackage && matchesSetupDownload(savedPackage, draft, fromPoint) ? savedPackage : null;
  const downloadKey = useMemo(() => {
    if (shortCode) return shortCode;
    if (reusablePackage) return reusablePackage.tripKey;
    let key = packages.get(stretchKey);
    if (!key) { key = `${id}-${packages.size}`; packages.set(stretchKey, key); }
    return key;
  }, [id, packages, stretchKey, shortCode, reusablePackage]);
  const miles = takeOut && startMile != null ? takeOut.mile - startMile : null;
  const upstream = miles != null && miles <= 0;
  const upcoming = takeOut ? null : nextTakeOuts(choices, startMile);
  // Before a take-out is chosen, the nearest suggestion stands in so each
  // suggestion can show its time.
  const estimateEnd = takeOut ?? upcoming?.next[0];
  const startId = route ? estimateStartId(route, draft.putInId, startMile) : null;
  const estimate = useStartEstimate(loaded?.ok && loaded.riverId && startId && estimateEnd && !upstream &&
    (!draft.putInId || putIn) ? {
      riverId: loaded.riverId, startId, endId: estimateEnd.id, boatType: boat,
      ...(draft.putInId || startMile == null ? {} : { startRiverMile: startMile }),
    } : null, location.checkedAt);
  const minutes = miles != null ? movingMinutes(miles, estimate.speed) : null;
  const outlook = takeOut ? arrivalOutlook(minutes, location.checkedAt, takeOut.lngLat) : null;
  const arrival = outlook ? arrivalCopy(outlook, clockTime) : null;
  const start = useStart({ ...draft, boatType: boat, shortCode,
    sessionId: id, downloadKey,
    plannerMph: estimate.speed?.toString(), previewStartMile: startMile ?? undefined,
  }, loaded, location);
  const preview = loaded?.ok && takeOut ? startSession({ id, kind: draft.putInId ? 'saved' : 'quick',
    route: loaded.route, index: loaded.index, putInId: draft.putInId, takeOutId: takeOut.id, now: 0 }) : null;
  const features = loaded?.ok && preview?.ok
    ? mapFeatures({ ...preview.session, startMile }, loaded.index) : null;
  const valid = Boolean(preview?.ok && !upstream);
  const points = useMemo(() => loaded?.ok ? [...(loaded.accessPoints ?? [])]
    .flatMap(point => {
      const choice = choices.find(c => c.id === point.id);
      return choice ? [{ ...point, riverMile: choice.mile }] : [];
    }).sort((a, b) => a.riverMile - b.riverMile) : [], [loaded, choices]);
  const putInPoint = points.find(point => point.id === draft.putInId);
  const takeOutPoint = points.find(point => point.id === draft.takeOutId);
  const gpsReady = location.state === 'ready' && usableStartFix(location.fix, location.checkedAt);
  const putInStatus = loaded?.ok && putIn ? putInLocation(loaded.index, location.fix, location.checkedAt, putIn) : null;
  const gpsLabel = location.state === 'checking' ? 'Finding your location…'
    : location.state === 'precise' ? 'Precise location needed'
    : location.state === 'services' ? 'Location Services are off'
    : location.state !== 'ready' ? 'Location needed to track'
    : !gpsReady ? (location.busy ? 'Finding your location…' : 'Waiting for GPS…')
    : putInStatus?.label ?? (route && !located ? 'GPS ready · not on this river yet' : 'GPS ready');
  const downloadReason = !route ? 'Choose a river to prepare an offline map.'
    : !takeOut ? 'Choose a take-out to prepare an offline map.'
    : upstream ? 'Choose a take-out downstream of your start.'
    : !fromPoint ? 'Available once Eddy knows where you’re starting.' : null;
  const openPicker = (next: typeof picker) => { if (!start.busy) { setAutoEligible(false); setPicker(next); } };
  const riverNote = draft.riverSlug
    ? autoRiver === draft.riverSlug ? { label: 'Found from your location' } : undefined
    : gpsRiver.searching ? { label: 'Looking for a river near you…', busy: true } : undefined;
  const suggestions = upcoming?.next.length ? {
    items: upcoming.next.map(point => {
      const away = point.mile - (startMile ?? point.mile);
      const time = movingMinutes(away, estimate.speed);
      const photoPoint = points.find(item => item.id === point.id);
      return { id: point.id, name: point.name,
        detail: `${away.toFixed(1)} mi${time != null ? ` · about ${formatDuration(time)}` : ''}`,
        photo: photoPoint ? <PlanAccessPhoto point={photoPoint} style={local.photo} /> : undefined };
    }),
    more: upcoming.more,
    onPick: (takeOutId: string) => { if (!start.busy) { setAutoEligible(false); setDraft(current => ({ ...current, takeOutId })); } },
    onSeeAll: () => openPicker('to'),
  } : undefined;
  const selectFrom = (putInId?: string) => {
    const mile = putInId ? choices.find(p => p.id === putInId)?.mile : located?.riverMile;
    setDraft(current => ({ ...current, putInId,
      takeOutId: mile != null && takeOut && takeOut.mile <= mile ? undefined : current.takeOutId }));
    setPicker(null);
  };
  return (
    <>
      <Stack.Screen options={{ title: 'Ready to float', headerBackButtonMenuEnabled: false, gestureEnabled: !start.busy,
        headerTransparent: false, headerBlurEffect: 'none', headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text, headerShadowVisible: true }} />
      <Shell footer={<>
        <PrimaryButton label="Start tracking" busy={start.busy} disabled={!valid || location.state !== 'ready'} onPress={() => void start.run()} />
        {start.error ? <Text accessibilityRole="alert" style={[styles.body, { color: colors.error }]}>{start.error}</Text> : null}
        {account.ready && (!account.session || account.isAnonymous) ? <Text style={[styles.caption, local.backup, { color: colors.textMuted }]}>Sign in to back up your float summary</Text> : null}
      </>}>
        {restoredPackage ? <Text style={[styles.caption, { color: colors.textMuted }]}>Your downloaded setup · edit any field below</Text> : null}
        <RouteCard river={draft.riverSlug ? route?.riverName ?? (loaded ? null : 'loading') : null}
          riverNote={riverNote} suggestions={suggestions}
          takeOutHint={!takeOut && route && startMile == null ? 'Choose a put-in to see downstream suggestions.' : undefined}
          disabled={start.busy} onRiver={() => openPicker('river')} onFrom={() => openPicker('from')} onTo={() => openPicker('to')}
          from={{ value: putIn?.name ?? (draft.putInId ? null : 'Current location'),
            detail: startMile != null ? `Mile ${startMile.toFixed(1)}` : undefined,
            status: { label: gpsLabel, ready: gpsReady, busy: !draft.putInId && location.busy && !gpsReady },
            photo: putInPoint ? <PlanAccessPhoto point={putInPoint} style={local.photo} /> : undefined }}
          to={{ value: takeOut?.name ?? null, detail: takeOut ? `Mile ${takeOut.mile.toFixed(1)}` : undefined,
            photo: takeOutPoint ? <PlanAccessPhoto point={takeOutPoint} style={local.photo} /> : undefined }}
          leg={miles != null && miles > 0 ? `${miles.toFixed(1)} mi${minutes != null ? ` · about ${formatDuration(minutes)}` : ''}` : null} />
        <Card padded={false}>
          <VesselPicker value={boat} disabled={start.busy} onChange={value => {
            boatChosen.current = true; setBoat(value);
            void AsyncStorage.setItem(FLOAT_BOAT_STORAGE_KEY, value).catch(() => {});
          }} />
          {valid ? <View style={[local.timing, { borderTopColor: colors.border }]}>
            <Text style={[styles.body, { color: colors.textMuted }]}>{minutes != null
              ? 'Moving time · stops not included' : estimate.loading ? 'Checking moving time…' : 'Eddy will learn your pace'}</Text>
            {arrival ? <Text style={[styles.body, { color: colors.textMuted }]}>If you start now: {arrival.line}</Text> : null}
            {arrival?.warning ? <Text style={[styles.body, { color: colors.error }]}>{arrival.warning}</Text> : null}
          </View> : null}
        </Card>
        {upstream ? <Text style={[styles.body, { color: colors.error }]}>This take-out is behind your start. Choose one downstream.</Text> : null}
        {gpsReady && putInStatus?.note ? <Text style={[styles.body, { color: colors.textMuted }]}>{putInStatus.note}</Text> : null}
        {gpsReady && putInStatus?.canSwitch ? <>
          <Text style={[styles.body, { color: colors.textMuted }]}>Tracking will begin where GPS finds you. The route preview still starts at {putIn?.name}.</Text>
          <TextButton label="Start from here" onPress={() => selectFrom()} />
        </> : null}
        {location.state !== 'ready' && location.state !== 'checking' ? <LocationGate location={location} /> : null}
        {location.state === 'ready' && location.error && !location.busy ? <View>
          <Text style={[styles.body, { color: colors.textMuted }]}>{location.error} You can still start; tracking begins when GPS finds you.</Text>
          <TextButton label="Try GPS again" onPress={() => void location.act()} />
        </View> : null}
        {route ? <View style={[local.map, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <FloatMap key={stretchKey} preview line={route.line} section={features?.section ?? null}
            stops={features?.stops ?? []} hazards={features?.hazards ?? []}
            start={fromPoint ? { name: putIn?.name ?? 'Your location', lngLat: fromPoint, riverMile: startMile } : null}
            takeOut={takeOut ? { name: takeOut.name, lngLat: takeOut.lngLat, riverMile: takeOut.mile } : null}
            position={null} positionDimmed={false} />
        </View> : null}
        {loaded && !loaded.ok ? <Text style={[styles.body, { color: colors.error }]}>{routeProblemCopy(loaded.reason)}</Text> : null}
        {takeOut?.offLineMeters != null ? <Text style={[styles.body, { color: colors.textMuted }]}>
          The take-out pin doesn’t quite line up with Eddy’s river map. Distances end at the nearest point on the river.
        </Text> : null}
        {!downloadReason && route && takeOut && fromPoint ? <TripDownloadCard key={downloadKey} compact tripKey={downloadKey}
          route={route} fromId={draft.putInId ?? ''} fromLngLat={draft.putInId ? undefined : fromPoint} toId={takeOut.id}
          onPackageSaved={async pkg => { await savePendingFloatSetup(pkg, boat); setSavedPackage(pkg); }} />
          : <Card><Text style={[styles.label, { color: colors.text }]}>Offline map · Optional</Text>
            <Text style={[styles.body, { color: colors.textMuted }]}>{downloadReason}</Text></Card>}
      </Shell>
      {picker ? <RoutePicker field={picker} draft={draft} loaded={loaded} location={location}
        onRetryCurrent={() => setRouteReload(value => value + 1)}
        onClose={() => setPicker(null)} onSelect={next => {
          setDraft({ riverSlug: next.riverSlug, putInId: next.putInId, takeOutId: next.takeOutId });
          setPicker(null);
        }} /> : null}
    </>
  );
}

const local = StyleSheet.create({
  timing: { borderTopWidth: StyleSheet.hairlineWidth, marginHorizontal: 16, paddingVertical: 12, gap: 4 },
  map: { height: 200, borderRadius: 16, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  photo: { width: 44, height: 44, borderRadius: 10, alignSelf: 'center' },
  backup: { textAlign: 'center' },
});
