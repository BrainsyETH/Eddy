// Setup pages share one URL, with native pushes for river → take-out → summary.
// A nearby access point suggests a river; the paddler always confirms it.
// Preview location never seeds tracking. beginFloat still owns session creation.
//
// The pieces live in src/float/start/: the river picker, the location card,
// the background-location sheet, the start logic (useStart) and the shared UI.
// This file is the route and the two steps that need the loaded river.
import { useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRoute as useNavigationRoute } from 'expo-router/react-navigation';
import { milesBetween } from '@eddy/geo';
import { useFloatSession } from '@/hooks/useFloatSession';
import { useFloatStartLocation } from '@/hooks/useFloatStartLocation';
import { routeProblemCopy, type LoadedRoute } from '@/float/loadFloatRoute';
import { BackgroundStep } from '@/float/start/BackgroundStep';
import { LocationGate } from '@/float/start/LocationGate';
import { RiverPicker } from '@/float/start/RiverPicker';
import { BoatChoice, Card, PrimaryButton, RiverName, Row, Shell, SummaryLine, TextButton, styles } from '@/float/start/ui';
import { newSessionId, useRiverRoute, useStart, type Params, type StartLocation } from '@/float/start/useStart';
import { TripDownloadCard } from '@/float/TripDownloadCard';
import { arrivalCopy, arrivalOutlook, formatBeyond, formatDuration, startSession, takeOutChoices } from '@/lib/floatSession';
import { startRiverPosition } from '@/lib/floatStart';
import { useTheme } from '@/theme/ThemeProvider';

const clockTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

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
  const [boatType, setBoatType] = useState<string | null>(params.boatType ?? null);
  const startKey = params.startKey ?? route.key;
  const loaded = useRiverRoute(params.riverSlug, params.shortCode ?? params.sessionId);
  const nextParams = {
    ...params,
    sessionId,
    startKey,
    boatType: boatType ?? undefined,
    // A different boat than the plan's makes its moving speed the wrong one.
    plannerMph: boatType === (params.boatType ?? null) ? params.plannerMph : undefined,
  };
  const start = useStart(nextParams, loaded, location);
  const saved = Boolean(params.putInId && params.takeOutId);
  const summary = saved || params.step === 'summary' || params.step === 'background';

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

  let body: React.ReactNode;
  if (!params.riverSlug) {
    body = (
      <RiverPicker
        location={location}
        onChoose={(riverSlug) => {
          router.push({ pathname: '/float-start', params: { riverSlug, startKey, step: 'takeout' } });
        }}
      />
    );
  } else if (!loaded) {
    body = (
      <Shell>
        <ActivityIndicator color={colors.interactive} accessibilityLabel="Loading the river" />
      </Shell>
    );
  } else if (!loaded.ok) {
    body = (
      <Shell>
        <Text style={[styles.body, { color: colors.text }]}>{routeProblemCopy(loaded.reason)}</Text>
      </Shell>
    );
  } else if (params.step === 'background') {
    body = <BackgroundStep location={location} start={start} />;
  } else if (!summary) {
    body = (
      <TakeOutStep
        loaded={loaded}
        location={location}
        onChoose={(takeOutId) =>
          router.push({
            pathname: '/float-start',
            params: { riverSlug: params.riverSlug!, takeOutId, sessionId: newSessionId(), startKey, step: 'summary' },
          })
        }
      />
    );
  } else {
    body = (
      <SummaryStep
        params={params}
        nextParams={nextParams}
        saved={saved}
        sessionId={sessionId}
        loaded={loaded}
        location={location}
        start={start}
        boatType={boatType}
        onBoatType={setBoatType}
      />
    );
  }

  return (
    <>
      {screen}
      {body}
    </>
  );
}

function useLocated(loaded: Extract<LoadedRoute, { ok: true }>, location: StartLocation) {
  return useMemo(
    () => startRiverPosition(loaded.index, location.fix, location.checkedAt),
    [loaded, location.fix, location.checkedAt],
  );
}

function TakeOutStep({
  loaded,
  location,
  onChoose,
}: {
  loaded: Extract<LoadedRoute, { ok: true }>;
  location: StartLocation;
  onChoose: (takeOutId: string) => void;
}) {
  const { colors } = useTheme();
  const located = useLocated(loaded, location);
  const choices = useMemo(
    () => takeOutChoices(loaded.route, loaded.index, located?.riverMile ?? null),
    [loaded, located],
  );
  return (
    <Shell>
      <RiverName name={loaded.route.riverName} />
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        Where are you taking out?
      </Text>
      {!located ? (
        location.busy ? (
          <View style={styles.inline}>
            <ActivityIndicator color={colors.interactive} />
            <Text style={[styles.body, { color: colors.textMuted }]}>Finding you on the river…</Text>
          </View>
        ) : (
          <>
            <Text style={[styles.body, { color: colors.textMuted }]}>
              Eddy hasn’t found you on this river yet, so every take-out is listed by river mile, upstream first.
              Progress appears once Eddy finds you.
            </Text>
            {location.state === 'ready' ? (
              <TextButton label="Find me to show distances" onPress={() => void location.act()} />
            ) : null}
          </>
        )
      ) : null}
      <Card padded={false}>
        {choices.map((choice) => (
          <Row
            key={choice.id}
            title={choice.name}
            detail={located ? `${(choice.mile - located.riverMile).toFixed(1)} mi` : `Mile ${choice.mile.toFixed(1)}`}
            onPress={() => onChoose(choice.id)}
          />
        ))}
        {choices.length === 0 ? (
          <Text style={[styles.body, styles.empty, { color: colors.textMuted }]}>
            No take-outs ahead on this river. Go back to choose another river.
          </Text>
        ) : null}
      </Card>
    </Shell>
  );
}

function SummaryStep({
  params,
  nextParams,
  saved,
  sessionId,
  loaded,
  location,
  start,
  boatType,
  onBoatType,
}: {
  params: Params;
  nextParams: Params;
  saved: boolean;
  sessionId: string;
  loaded: Extract<LoadedRoute, { ok: true }>;
  location: StartLocation;
  start: ReturnType<typeof useStart>;
  boatType: string | null;
  onBoatType: (value: string | null) => void;
}) {
  const { colors } = useTheme();
  const located = useLocated(loaded, location);
  const putIn = loaded.route.anchors.find((anchor) => anchor.id === params.putInId);
  const takeOut = takeOutChoices(loaded.route, loaded.index, null).find((choice) => choice.id === params.takeOutId);
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
      <Shell>
        <Text style={[styles.body, { color: colors.text }]}>
          {routeProblemCopy(preview.ok ? 'no-take-out' : preview.reason)}
        </Text>
      </Shell>
    );
  const startMile = preview.session.putIn?.riverMile ?? located?.riverMile;
  const miles = startMile != null ? preview.session.takeOut.riverMile - startMile : null;
  const upstream = !saved && miles != null && miles <= 0;
  const plannerMph = Number(nextParams.plannerMph);
  const minutes =
    saved && miles != null && miles > 0 && Number.isFinite(plannerMph) && plannerMph > 0
      ? Math.max(5, Math.round(((miles / plannerMph) * 60) / 5) * 5)
      : null;
  const outlook = arrivalOutlook(minutes, location.checkedAt, takeOut.lngLat);
  const arrival = outlook ? arrivalCopy(outlook, clockTime) : null;
  const putInMiles =
    putIn && location.fix
      ? milesBetween(
          { lat: location.fix.point[1], lng: location.fix.point[0] },
          { lat: putIn.lngLat[1], lng: putIn.lngLat[0] },
        )
      : null;

  return (
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
          <Text style={[styles.caption, { color: colors.textMuted }]}>Estimated moving time · stops not included</Text>
        ) : null}
        {arrival ? (
          <Text style={[styles.body, { color: colors.textMuted }]}>If you start now: {arrival.line}</Text>
        ) : null}
        {arrival?.warning ? (
          <Text style={[styles.body, styles.label, { color: colors.error }]}>{arrival.warning}</Text>
        ) : null}
        {putInMiles != null ? (
          <Text style={[styles.body, { color: colors.textMuted }]}>
            About {putInMiles.toFixed(1)} mi from the put-in · straight-line distance
          </Text>
        ) : null}
        {!saved && !located ? (
          <Text style={[styles.body, { color: colors.textMuted }]}>Progress appears once Eddy finds you on the river.</Text>
        ) : null}
      </Card>
      {takeOut.offLineMeters != null ? (
        <Text style={[styles.body, { color: colors.textMuted }]}>
          {takeOut.name} is about {formatBeyond(takeOut.offLineMeters)} off the mapped river. Distances run to the
          closest point on the river.
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
      <BoatChoice value={boatType} onChange={onBoatType} />
      <Text style={[styles.caption, { color: colors.textMuted }]}>
        Raw float positions stay on this phone. Ending saves a recap; signed-in recaps are backed up to your account.
      </Text>
      {location.state !== 'ready' ? (
        <LocationGate location={location} summary />
      ) : (
        <>
          {upstream ? (
            <Text style={[styles.body, { color: colors.error }]}>
              This take-out is behind you. Go back to choose one downstream.
            </Text>
          ) : null}
          <PrimaryButton label="Start float" busy={start.busy} disabled={upstream} onPress={() => void start.run('start')} />
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
