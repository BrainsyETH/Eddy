// All entry points fill one editable draft. Preview GPS never seeds the recorder.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { CommonActions, useRoute as useNavigationRoute } from 'expo-router/react-navigation';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FLOAT_BOATS, FLOAT_BOAT_STORAGE_KEY, type FloatBoat } from '@eddy/conditions/float-search';
import { useFloatSession, useFloatSessionUnreadable } from '@/hooks/useFloatSession';
import { useFloatStartLocation } from '@/hooks/useFloatStartLocation';
import { routeProblemCopy } from '@/float/loadFloatRoute';
import { LocationGate } from '@/float/start/LocationGate';
import { RiverPicker } from '@/float/start/RiverPicker';
import { Card, PrimaryButton, Row, Shell, TextButton, styles } from '@/float/start/ui';
import { newSessionId, useRiverRoute, useStart, type Params } from '@/float/start/useStart';
import { useStartEstimate } from '@/float/start/useEstimate';
import { FloatMap } from '@/float/FloatMap';
import { TripDownloadCard } from '@/float/TripDownloadCard';
import { PlanAccessPicker } from '@/components/PlanAccessPicker';
import { PlanAccessPhoto } from '@/components/PlanAccessPhoto';
import { VesselPicker } from '@/components/VesselPicker';
import { EddyScene } from '@/components/EddyScene';
import { arrivalCopy, arrivalOutlook, formatDuration, mapFeatures, startSession, takeOutChoices } from '@/lib/floatSession';
import { putInLocation, estimateStartId, floatSetupKey, sameFloatStretch, startRiverPosition, usableStartFix } from '@/lib/floatStart';
import { useTheme } from '@/theme/ThemeProvider';
import { completedFloatRoutes } from '@/lib/floatNavigation';
import { matchesSetupDownload } from '@/lib/floatSetupDownload';
import { readPendingFloatSetup, savePendingFloatSetup } from '@/float/pendingFloatSetup';
import type { TripPackage } from '@/lib/tripDownload';

const clockTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const isBoat = (value?: string | null): value is FloatBoat => FLOAT_BOATS.includes(value as FloatBoat);

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
  const [id] = useState(newSessionId);
  const [draft, setDraft] = useState(() => ({ riverSlug: initial.riverSlug, putInId: initial.putInId, takeOutId: initial.takeOutId }));
  const [boat, setBoat] = useState<FloatBoat>(() => isBoat(initial.boatType) ? initial.boatType : 'kayak');
  const boatChosen = useRef(isBoat(initial.boatType));
  const [picker, setPicker] = useState<'river' | 'from' | 'to' | null>(null);
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
  const loaded = useRiverRoute(draft.riverSlug, shortCode ?? sourceKey);
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
  const startId = route ? estimateStartId(route, draft.putInId, startMile) : null;
  const estimate = useStartEstimate(loaded?.ok && loaded.riverId && startId && takeOut && !upstream &&
    (!draft.putInId || putIn) ? {
      riverId: loaded.riverId, startId, endId: takeOut.id, boatType: boat,
      ...(draft.putInId || startMile == null ? {} : { startRiverMile: startMile }),
    } : null, location.checkedAt);
  const minutes = miles != null && miles > 0 && estimate.speed != null
    ? Math.max(5, Math.round(miles / estimate.speed * 12) * 5) : null;
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
  const gpsLabel = location.state !== 'ready' ? 'Location permission needed'
    : location.busy ? 'Finding GPS…' : !gpsReady ? 'Waiting for GPS'
    : route && !located ? 'GPS ready · not on this river yet' : putInStatus?.label ?? 'GPS ready';
  const downloadReason = !route ? 'Choose a river to prepare an offline map.'
    : !takeOut ? 'Choose a take-out to prepare an offline map.'
    : upstream ? 'Choose a take-out downstream of your start.'
    : !fromPoint ? 'Available once Eddy knows where you’re starting.' : null;
  const openPicker = (next: typeof picker) => { if (!start.busy) setPicker(next); };
  const selectFrom = (putInId?: string) => {
    const mile = putInId ? choices.find(p => p.id === putInId)?.mile : located?.riverMile;
    setDraft(current => ({ ...current, putInId,
      takeOutId: mile != null && takeOut && takeOut.mile <= mile ? undefined : current.takeOutId }));
    setPicker(null);
  };
  return (
    <>
      <Stack.Screen options={{ title: 'Ready to float', headerBackButtonMenuEnabled: false, gestureEnabled: !start.busy }} />
      <Shell>
        {restoredPackage ? <Text style={[styles.caption, { color: colors.textMuted }]}>Your downloaded setup · edit any field below</Text> : null}
        <View style={[local.map, { borderColor: colors.border, backgroundColor: colors.card }]}>
          {route ? <FloatMap key={stretchKey} preview line={route.line} section={features?.section ?? null}
            stops={features?.stops ?? []} hazards={features?.hazards ?? []}
            start={fromPoint ? { name: putIn?.name ?? 'Your location', lngLat: fromPoint, riverMile: startMile } : null}
            takeOut={takeOut ? { name: takeOut.name, lngLat: takeOut.lngLat, riverMile: takeOut.mile } : null}
            position={null} positionDimmed={false} /> : <View style={local.placeholder}>
              {draft.riverSlug && !loaded ? <ActivityIndicator color={colors.interactive} /> : <EddyScene name="routePlanning" size={100} />}
              <Text style={[styles.body, { color: colors.textMuted }]}>Choose your river to see the map</Text>
            </View>}
        </View>
        <View pointerEvents={start.busy ? 'none' : 'auto'}>
          <Card padded={false}>
            <Row title="River" detail={route?.riverName ?? (draft.riverSlug && !loaded ? 'Loading river…' : 'Choose a river')} onPress={() => openPicker('river')} />
            <Row title="From" detail={putIn?.name ?? (draft.putInId ? 'Choose a put-in' : 'From my location')}
              leading={putInPoint ? <PlanAccessPhoto point={putInPoint} style={local.photo} /> : undefined} onPress={() => openPicker('from')} />
            <Row title="Take-out" detail={takeOut?.name ?? 'Choose a take-out'}
              leading={takeOutPoint ? <PlanAccessPhoto point={takeOutPoint} style={local.photo} /> : undefined} onPress={() => openPicker('to')} />
          </Card>
        </View>
        {loaded && !loaded.ok ? <Text style={[styles.body, { color: colors.error }]}>{routeProblemCopy(loaded.reason)}</Text> : null}
        <View style={styles.group} pointerEvents={start.busy ? 'none' : 'auto'}>
          <Text style={[styles.label, { color: colors.text }]}>Boat</Text>
          <VesselPicker value={boat} onChange={value => {
            boatChosen.current = true; setBoat(value);
            void AsyncStorage.setItem(FLOAT_BOAT_STORAGE_KEY, value).catch(() => {});
          }} />
        </View>
        <View style={styles.group}>
          {miles != null && miles > 0 ? <Text style={[styles.distance, { color: colors.text }]}>
            {miles.toFixed(1)} mi{minutes != null ? ` · about ${formatDuration(minutes)}` : ''}
          </Text> : null}
          <Text style={[styles.body, { color: colors.textMuted }]}>{minutes != null
            ? 'Moving time · stops not included' : estimate.loading ? 'Checking moving time…' : 'Eddy will learn your pace'}</Text>
          {arrival ? <Text style={[styles.body, { color: colors.textMuted }]}>If you start now: {arrival.line}</Text> : null}
          {arrival?.warning ? <Text style={[styles.body, { color: colors.error }]}>{arrival.warning}</Text> : null}
          {upstream ? <Text style={[styles.body, { color: colors.error }]}>This take-out is behind your start. Choose one downstream.</Text> : null}
        </View>
        {takeOut?.offLineMeters != null ? <Text style={[styles.body, { color: colors.textMuted }]}>
          The take-out pin doesn’t quite line up with Eddy’s river map. Distances end at the nearest point on the river.
        </Text> : null}
        {!downloadReason && route && takeOut && fromPoint ? <TripDownloadCard key={downloadKey} compact tripKey={downloadKey}
          route={route} fromId={draft.putInId ?? ''} fromLngLat={draft.putInId ? undefined : fromPoint} toId={takeOut.id}
          onPackageSaved={async pkg => { await savePendingFloatSetup(pkg, boat); setSavedPackage(pkg); }} />
          : <Card><Text style={[styles.label, { color: colors.text }]}>Offline map · Optional</Text>
            <Text style={[styles.body, { color: colors.textMuted }]}>{downloadReason}</Text></Card>}
        <Text accessibilityLiveRegion="polite" style={[styles.label, { color: colors.text }]}>{gpsLabel}</Text>
        {gpsReady && putInStatus?.canSwitch ? <>
          <Text style={[styles.body, { color: colors.textMuted }]}>Tracking will begin where GPS finds you. The route preview still starts at {putIn?.name}.</Text>
          <TextButton label="Start from here" onPress={() => selectFrom()} />
        </> : null}
        {location.state !== 'ready' ? <LocationGate location={location} /> : !gpsReady && !location.busy ? <>
          <Text style={[styles.body, { color: colors.textMuted }]}>You can start now. Recording begins when GPS finds you.</Text>
          <TextButton label="Try GPS again" onPress={() => void location.act()} />
        </> : null}
        <PrimaryButton label="Start tracking" busy={start.busy} disabled={!valid || location.state !== 'ready'} onPress={() => void start.run()} />
        {start.error ? <Text accessibilityRole="alert" style={[styles.body, { color: colors.error }]}>{start.error}</Text> : null}
        <Text style={[styles.caption, { color: colors.textMuted }]}>Sign in to back up your float summary</Text>
      </Shell>
      <Modal visible={picker != null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPicker(null)}>
        <SafeAreaProvider><SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top', 'left', 'right', 'bottom']}>
          <View style={local.pickerHeader}>
            <Text accessibilityRole="header" style={[styles.cardTitle, styles.flex, { color: colors.text }]}>
              {picker === 'river' ? 'Choose a river' : picker === 'from' ? 'Where are you starting?' : 'Where are you taking out?'}
            </Text>
            <Pressable onPress={() => setPicker(null)} accessibilityRole="button" style={local.done}>
              <Text style={[styles.label, { color: colors.interactive }]}>Done</Text>
            </Pressable>
          </View>
          {picker === 'river' ? <RiverPicker location={location} onChoose={riverSlug => {
            if (riverSlug !== draft.riverSlug) setDraft({ riverSlug, putInId: undefined, takeOutId: undefined });
            setPicker(null);
          }} /> : !route ? <Shell><Text style={[styles.body, { color: colors.textMuted }]}>Choose a river first.</Text>
            <TextButton label="Choose a river" onPress={() => setPicker('river')} /></Shell> :
            points.length === 0 ? <Shell>
              {picker === 'from' ? <Row title="From my location" onPress={() => selectFrom()} /> : null}
              {choices.filter(p => picker === 'from' || startMile == null || p.mile > startMile).map(point =>
                <Row key={point.id} title={point.name}
                  detail={`Mile ${point.mile.toFixed(1)}${picker === 'to' && startMile != null ? ` · ${(point.mile - startMile).toFixed(1)} mi from ${draft.putInId ? 'put-in' : 'your location'}` : ''}`}
                  onPress={() => {
                    if (picker === 'from') selectFrom(point.id);
                    else { setDraft(current => ({ ...current, takeOutId: point.id })); setPicker(null); }
                  }} />)}
            </Shell> : <PlanAccessPicker selectedId={(picker === 'from' ? draft.putInId : draft.takeOutId) ?? null}
              points={picker === 'from' ? points : points.filter(p => startMile == null || p.riverMile > startMile)}
              fromPoint={picker === 'to' ? putInPoint : null} fromMile={picker === 'to' ? startMile : null}
              header={picker === 'from' ? <Row title="From my location" detail="Start where GPS finds me" onPress={() => selectFrom()} /> :
                startMile == null ? <Text style={[styles.body, { color: colors.textMuted }]}>Distances show river miles until Eddy knows your start.</Text> : undefined}
              emptyMessage="No available access points here. Choose another river or starting point."
              onSelect={point => {
                if (picker === 'from') selectFrom(point.id);
                else { setDraft(current => ({ ...current, takeOutId: point.id })); setPicker(null); }
              }} />}
        </SafeAreaView></SafeAreaProvider>
      </Modal>
    </>
  );
}

const local = StyleSheet.create({
  map: { height: 200, borderRadius: 12, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  photo: { width: 64, height: 56, borderRadius: 8 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20 },
  done: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
});
