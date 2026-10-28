// Float tools keeps the existing route used by Live Activity and notification links.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FloatActivityControl } from '@/float/FloatActivityControl';
import { FloatHazardReports } from '@/float/FloatHazardReports';
import { FloatReminders } from '@/float/FloatReminders';
import { PickupContact } from '@/float/PickupContact';
import { EssentialsConditions } from '@/float/EssentialsConditions';
import { EssentialsButton, EssentialsSection, essentialsStyles as s } from '@/float/essentialsUi';
import { focusFloatMap } from '@/float/mapFocus';
import { useHazardReports } from '@/float/hazardReports';
import { useKeepAwakePreference } from '@/float/keepAwakePreference';
import { useTrackingLine } from '@/float/useTrackingLine';
import { useFloatSession, useFloatSessionLoaded } from '@/hooks/useFloatSession';
import { useFloatDisplayClock } from '@/hooks/useFloatDisplayClock';
import { useTheme } from '@/theme/ThemeProvider';
import { aheadItems, aheadSymbol, currentFloatReports, essentialsClock, essentialsRouteFeatures, coordinateText, essentialsPosition, locationAgeLabel, locationLink, locationMessage, reportStatusLabel } from '@/lib/floatEssentials';
import { formatBeyond, viewSession } from '@/lib/floatSession';
import { HAZARD_KINDS } from '@/lib/hazardReportQueue';
import { PlaceThumb } from '@/float/PlaceThumb';
import { useRouteAccessPoints } from '@/float/useRouteAccessPoints';
import { fonts, type as t } from '@/theme/typography';
import { selectionFeedback } from '@/lib/haptics';
import type { LngLat } from '@eddy/geo';

const timeLabel = (at: number) => new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

export default function FloatOptionsScreen() {
  const session = useFloatSession();
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const tick = useFloatDisplayClock(focused && !!session);
  // Never older than the newest fix: see essentialsClock.
  const now = session ? essentialsClock(session, tick) : tick;
  const reports = useHazardReports();
  const tracking = useTrackingLine();
  const [keepAwake, setKeepAwake] = useKeepAwakePreference();
  const [showAll, setShowAll] = useState(section === 'ahead');
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const scrolledToAhead = useRef(false);
  const route = session?.route;
  const startMile = session?.startMile ?? null;
  const putIn = session?.putIn ?? null;
  const end = session?.takeOut;
  const features = useMemo(() => route && end ? essentialsRouteFeatures(route, startMile, putIn, end) : null, [route, startMile, putIn, end]);
  // Photos and place types for the take-out and the accesses ahead.
  const places = useRouteAccessPoints(route?.riverSlug);
  const ahead = useMemo(() => session ? aheadItems(session, reports, now, features) : null, [session, reports, now, features]);
  // Only once the stored float has been read: a Live Activity tap opens this
  // sheet cold, before the read lands, and going back on a null that meant
  // "not known yet" closed it on the paddler who had just asked for it.
  const loaded = useFloatSessionLoaded();
  useEffect(() => { if (loaded && !session && router.canGoBack()) router.back(); }, [loaded, session, router]);
  if (!session) return null;
  const fix = essentialsPosition(session, now);
  const view = viewSession(session, now);
  const takeOut = session.route.anchors.find(a => a.id === session.takeOut.id);
  const unplaced = currentFloatReports(session, reports).filter(r => r.riverMile == null);
  const share = async (message: string | null) => {
    if (!message) return;
    setError(null);
    try { await Share.share({ message }); } catch { setError('Couldn’t open sharing'); }
  };
  const showOnMap = (point: LngLat, title: string, detail: string) => {
    selectionFeedback();
    focusFloatMap({ sessionId: session.id, point, title, detail });
    router.back();
  };
  return <ScrollView ref={scroll} style={{ flex: 1, backgroundColor: colors.bg }} keyboardShouldPersistTaps="handled"
    contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: Math.max(insets.bottom, 16) + 20 }}>
    <View style={{ flexDirection: fontScale > 1.3 ? 'column' : 'row', alignItems: fontScale > 1.3 ? 'stretch' : 'center', justifyContent: 'space-between', gap: 12 }}>
      <Text style={[s.heading, { color: colors.text }]} accessibilityRole="header">Float tools</Text>
      <EssentialsButton label="Done" onPress={() => router.back()} />
    </View>
    <EssentialsSection title="Your location">
      {fix ? <>
        {/* Tabular digits: a new fix changes the numbers, not the line's width. */}
        <Text selectable style={[s.title, styles.coordinates, { color: colors.text }]}>{coordinateText(fix.lngLat)}</Text>
        <Text style={[s.note, { color: colors.textMuted }]}>{fix.stale ? 'Last known' : 'Current'} · {locationAgeLabel(fix.at, now)} · {fix.accuracyMeters == null ? 'Accuracy unavailable' : `±${Math.ceil(fix.accuracyMeters)} m`}</Text>
      </> : <Text style={[s.note, { color: colors.textMuted }]}>Waiting for GPS</Text>}
      <EssentialsButton label="Share location" disabled={!fix} onPress={() => void share(locationMessage(session, Date.now(), timeLabel))} />
      {error ? <Text accessibilityRole="alert" style={[s.note, { color: colors.error }]}>{error}</Text> : null}
    </EssentialsSection>
    <EssentialsSection title="Take-out">
      {/* The landing itself, as the planner and Ready to float show it: its
          photo, or the Eddy mark for what kind of access it is. */}
      <View style={styles.placeRow}>
        <PlaceThumb point={places.get(session.takeOut.id) ?? null} symbol="boatRamp" size={72} />
        <View style={styles.placeText}>
          <Text style={[s.title, { color: colors.text }]}>{session.takeOut.name}</Text>
          {view.milesLeft != null ? <Text style={[styles.placeMiles, { color: colors.interactive }]}>
            {view.milesLeft.toFixed(1)} mi {session.takeOut.offLineMeters != null ? 'to river endpoint' : 'to go'}
          </Text> : null}
          {ahead?.basis?.stale ? <Text style={[s.note, { color: colors.textMuted }]}>As of {timeLabel(ahead.basis.at)}</Text> : null}
        </View>
      </View>
      {session.takeOut.offLineMeters != null ? <Text style={[s.note, { color: colors.textMuted }]}>Landing {formatBeyond(session.takeOut.offLineMeters)} beyond mapped river</Text> : null}
      {takeOut ? <View style={s.actions}>
        <EssentialsButton label="Show on map" onPress={() => showOnMap(takeOut.lngLat, takeOut.name, 'Take-out')} />
        <EssentialsButton label="Share take-out" onPress={() => void share(`${session.route.riverName} — Take-out: ${takeOut.name}\n${coordinateText(takeOut.lngLat)}\n${locationLink(takeOut.lngLat, takeOut.name)}`)} />
      </View> : <Text style={[s.note, { color: colors.textMuted }]}>Location unavailable</Text>}
    </EssentialsSection>
    <View onLayout={event => {
      if (section === 'ahead' && !scrolledToAhead.current) {
        scrolledToAhead.current = true;
        scroll.current?.scrollTo({ y: event.nativeEvent.layout.y, animated: false });
      }
    }}>
      <EssentialsSection title="Ahead" symbol="river">
        {ahead?.basis?.stale ? <Text style={[s.note, { color: colors.textMuted }]}>From your last river position · {timeLabel(ahead.basis.at)}</Text> : null}
        {ahead?.items.length ? (showAll ? ahead.items : ahead.items.slice(0, 3)).map(item => {
          const distance = item.distance == null ? `River mile ${item.mile.toFixed(1)}` : `${item.distance.toFixed(1)} mi ${ahead.basis?.stale ? 'downstream of that position' : 'ahead'}`;
          // An access shows its photo or place mark; a hazard or report, the
          // hazard mark (a dam for a low-water dam).
          const symbol = aheadSymbol(item);
          return <Pressable key={item.id} accessibilityRole="button" accessibilityHint="Show on map"
            accessibilityLabel={`${item.name}, ${distance}, ${item.detail}`}
            onPress={() => showOnMap(item.point, item.name, `${item.detail} · ${distance}`)}
            style={({ pressed }) => [styles.aheadRow, { borderBottomColor: colors.border, opacity: pressed ? 0.65 : 1 }]}>
            <PlaceThumb point={item.kind === 'access' ? places.get(item.sourceId) ?? null : null} symbol={symbol ?? 'accessPoint'} />
            <View style={styles.placeText}>
              <Text style={[s.title, { color: colors.text }]}>{item.name}</Text>
              <Text style={[s.note, { color: colors.interactive }]}>{distance}</Text>
              <Text style={[s.note, { color: colors.textMuted }]}>{item.detail}{item.reportedAt ? ` · ${timeLabel(Date.parse(item.reportedAt))}` : ''}</Text>
            </View>
          </Pressable>;
        }) : <Text style={[s.note, { color: colors.textMuted }]}>No mapped stops ahead</Text>}
        {ahead && ahead.items.length > 3 ? <EssentialsButton label={showAll ? 'Show less' : `Show all (${ahead.items.length})`} onPress={() => setShowAll(v => !v)} /> : null}
      </EssentialsSection>
    </View>
    {unplaced.length ? <EssentialsSection title="Unpositioned reports">{unplaced.map(report => <View key={report.id} style={{ gap: 4 }}>
      <Text style={[s.title, { color: colors.text }]}>{HAZARD_KINDS.find(k => k.id === report.kind)?.label}</Text>
      <Text style={[s.note, { color: colors.textMuted }]}>Your report · {reportStatusLabel(report.status)} · {timeLabel(Date.parse(report.capturedAt))}</Text>
    </View>)}</EssentialsSection> : null}
    <EssentialsSection title="Pickup contact"><PickupContact message={locationMessage(session, now, timeLabel)} /></EssentialsSection>
    <EssentialsSection title="River conditions" symbol="gauge"><EssentialsConditions slug={session.route.riverSlug} now={now} /></EssentialsSection>
    <EssentialsSection title="Screen">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[s.title, { color: colors.text }]}>Keep screen awake</Text>
          <Text style={[s.note, { color: colors.textMuted }]}>While River Mode is showing. Uses more battery.</Text>
        </View>
        <Switch value={keepAwake} onValueChange={value => void setKeepAwake(value)} accessibilityLabel="Keep screen awake while River Mode is showing" />
      </View>
    </EssentialsSection>
    {tracking.line && tracking.line.action !== 'info' ? <EssentialsButton label={tracking.line.text} onPress={tracking.act} /> : null}
    <FloatReminders session={session} />
    <EssentialsSection title="Lock Screen"><FloatActivityControl /></EssentialsSection>
    <EssentialsSection title="Your reports"><FloatHazardReports session={session} /></EssentialsSection>
  </ScrollView>;
}

const styles = StyleSheet.create({
  coordinates: { fontVariant: ['tabular-nums'] },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  placeText: { flex: 1, minWidth: 0, gap: 3 },
  placeMiles: { ...t.base, fontFamily: fonts.semibold },
  aheadRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
});
