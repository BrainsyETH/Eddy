// Essentials keeps the existing route used by Live Activity and notification links.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Share, Switch, Text, View, useWindowDimensions } from 'react-native';
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
import { aheadItems, currentFloatReports, essentialsRouteFeatures, coordinateText, essentialsPosition, locationLink, locationMessage, reportStatusLabel } from '@/lib/floatEssentials';
import { formatBeyond, viewSession } from '@/lib/floatSession';
import { fixAgeLabel } from '@/lib/floatDisplay';
import { HAZARD_KINDS } from '@/lib/hazardReportQueue';
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
  const now = useFloatDisplayClock(focused && !!session);
  const reports = useHazardReports();
  const tracking = useTrackingLine();
  const [keepAwake, setKeepAwake] = useKeepAwakePreference();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showAll, setShowAll] = useState(section === 'ahead');
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const scrolledToAhead = useRef(false);
  const route = session?.route;
  const startMile = session?.startMile ?? null;
  const putIn = session?.putIn ?? null;
  const end = session?.takeOut;
  const features = useMemo(() => route && end ? essentialsRouteFeatures(route, startMile, putIn, end) : null, [route, startMile, putIn, end]);
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
      <Text style={[s.heading, { color: colors.text }]} accessibilityRole="header">Essentials</Text>
      <EssentialsButton label="Done" onPress={() => router.back()} />
    </View>
    <EssentialsSection title="Your location">
      {fix ? <>
        <Text selectable style={[s.title, { color: colors.text }]}>{coordinateText(fix.lngLat)}</Text>
        <Text style={[s.note, { color: colors.textMuted }]}>{fix.stale ? 'Last known' : 'Current'} · {fixAgeLabel(fix.at, now)} · {fix.accuracyMeters == null ? 'Accuracy unavailable' : `±${Math.ceil(fix.accuracyMeters)} m`}</Text>
      </> : <Text style={[s.note, { color: colors.textMuted }]}>Waiting for GPS</Text>}
      <EssentialsButton label="Share location" disabled={!fix} onPress={() => void share(locationMessage(session, Date.now(), timeLabel))} />
      {error ? <Text accessibilityRole="alert" style={[s.note, { color: colors.error }]}>{error}</Text> : null}
    </EssentialsSection>
    <EssentialsSection title="Take-out">
      <Text style={[s.title, { color: colors.text }]}>{session.takeOut.name}</Text>
      {view.milesLeft != null ? <Text style={[s.note, { color: colors.textMuted }]}>
        {view.milesLeft.toFixed(1)} mi {session.takeOut.offLineMeters != null ? 'to river endpoint' : 'remaining'}{ahead?.basis?.stale ? ` · as of ${timeLabel(ahead.basis.at)}` : ''}
      </Text> : null}
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
      <EssentialsSection title="Ahead">
        {ahead?.basis?.stale ? <Text style={[s.note, { color: colors.textMuted }]}>From your last river position · {timeLabel(ahead.basis.at)}</Text> : null}
        {ahead?.items.length ? (showAll ? ahead.items : ahead.items.slice(0, 3)).map(item => {
          const distance = item.distance == null ? `River mile ${item.mile.toFixed(1)}` : `${item.distance.toFixed(1)} mi ${ahead.basis?.stale ? 'downstream of that position' : 'ahead'}`;
          return <Pressable key={item.id} accessibilityRole="button" accessibilityHint="Show on map"
            onPress={() => showOnMap(item.point, item.name, `${item.detail} · ${distance}`)}
            style={({ pressed }) => ({ minHeight: 56, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border, gap: 4, opacity: pressed ? 0.65 : 1 })}>
            <Text style={[s.title, { color: colors.text }]}>{item.name}</Text>
            <Text style={[s.note, { color: colors.interactive }]}>{distance}</Text>
            <Text style={[s.note, { color: colors.textMuted }]}>{item.detail}{item.reportedAt ? ` · ${timeLabel(Date.parse(item.reportedAt))}` : ''}</Text>
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
    <EssentialsSection title="River conditions"><EssentialsConditions slug={session.route.riverSlug} now={now} /></EssentialsSection>
    {/* One tap away, not under Float settings: on the water this is the switch people reach for. */}
    <EssentialsSection title="Screen">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[s.title, { color: colors.text }]}>Keep screen awake</Text>
          <Text style={[s.note, { color: colors.textMuted }]}>While River Mode is showing. Uses more battery.</Text>
        </View>
        <Switch value={keepAwake} onValueChange={value => void setKeepAwake(value)} accessibilityLabel="Keep screen awake while River Mode is showing" />
      </View>
    </EssentialsSection>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: settingsOpen }} onPress={() => setSettingsOpen(v => !v)} style={{ minHeight: 56, justifyContent: 'center' }}>
      <Text style={[s.title, { color: colors.interactive }]}>{settingsOpen ? 'Hide settings' : 'Float settings'}</Text>
    </Pressable>
    {settingsOpen ? <>
      {tracking.line && tracking.line.action !== 'info' ? <EssentialsButton label={tracking.line.text} onPress={tracking.act} /> : null}
      <FloatReminders session={session} />
      <EssentialsSection title="Live Activity"><FloatActivityControl /></EssentialsSection>
      <FloatHazardReports session={session} />
    </> : null}
  </ScrollView>;
}
