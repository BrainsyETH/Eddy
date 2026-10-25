import { useCallback, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSavedPlaces } from '@/hooks/useSavedPlaces';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { conditionText } from '@/theme/conditions';
import { PlaceAction } from '@/components/PlaceAction';
import { SavedPlaceDamPicker } from '@/components/SavedPlaceDamPicker';
import { NativeHeaderHome } from '@/components/NativeHeaderHome';
import { useDirectionsMenu } from '@/components/DirectionsMenu';
import { DayBars } from '@/components/dam/DayBars';
import { DAM_CATALOG } from '@/lib/damCatalog';
import { refreshSavedPlace, savedPlaces } from '@/lib/savedPlacesStore';
import { savedScheduleState } from '@/lib/savedPlaces';
import { savedGaugeDisplay, savedScheduleDayLabel, scheduleGroups } from '@/lib/savedPlaceDisplay';
import { onForeground } from '@/lib/foreground';

const stamp = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Time unknown';

export default function SavedPlaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { owner } = useSavedPlaces();
  return <SavedPlaceContent key={`${owner}:${id}`} />;
}
function SavedPlaceContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { places, owner, ready, error: loadError } = useSavedPlaces();
  const place = places.find(p => p.id === id);
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { showDirections, directionsMenu } = useDirectionsMenu();
  const [now, setNow] = useState(Date.now);
  const [choosingDam, setChoosingDam] = useState(false);
  const [earlierOpen, setEarlierOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    setNow(Date.now());
    const tick = () => setNow(Date.now());
    const off = onForeground(tick);
    const timer = setInterval(tick, 60_000);
    return () => { off(); clearInterval(timer); };
  }, []));
  const refresh = async (damId?: string) => {
    if (!place || busy) return;
    setBusy(true); setError(null);
    try { if (!await refreshSavedPlace(place.id, damId, { owner })) setError('Couldn’t refresh all details'); }
    catch { setError('Couldn’t save the download'); }
    finally { setBusy(false); }
  };
  const heading = [t.lg, { fontFamily: fonts.heading, color: colors.text }];
  const body = [t.base, { fontFamily: fonts.body, color: colors.text }];
  const note = [t.sm, { fontFamily: fonts.body, color: colors.textMuted }];
  if (!place) return <View style={{ flex: 1, backgroundColor: colors.bg, padding: 20, gap: 16 }}>
    <Text style={body}>{!ready ? 'Loading…' : loadError ?? 'Place unavailable'}</Text>
    {loadError ? <PlaceAction label="Retry" onPress={() => void savedPlaces.select(owner)} /> : null}
    <PlaceAction label="Favorites" onPress={() => router.replace('/(tabs)/(favorites)/favorites')} />
  </View>;
  const gauge = place.gauge?.reading;
  const display = savedGaugeDisplay(place, now);
  const dam = place.dam?.snapshot;
  const chosenDamId = place.damChoice === 'none' ? null : dam?.id ?? (place.damChoice === 'auto' ? null : place.damChoice);
  const damName = dam?.name ?? DAM_CATALOG.find(d => d.id === chosenDamId)?.name;
  const days = scheduleGroups(place, now);
  const showDamSection = !!chosenDamId || place.relatedDamIds.length > 0;
  const renderDay = (day: NonNullable<typeof dam>['schedule'][number]) => <View key={day.scheduleDate} style={{ gap: 8 }}>
    <Text accessibilityRole="header" style={body}>{savedScheduleDayLabel(day.scheduleDate, now)} · CT</Text>
    <Text style={note}>{savedScheduleState(day, new Date(now))} · Checked {stamp(day.retrievedAt)}</Text>
    <DayBars day={day} reference={dam?.generationReference} />
  </View>;
  return <>
    <Stack.Screen options={{ title: place.name }} />
    <NativeHeaderHome />
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, gap: 24, paddingBottom: 40 }}>
      <View style={{ gap: 8 }}>
        <Text accessibilityRole="header" style={heading}>{place.name}</Text>
        {place.riverName ? <Text style={note}>{place.riverName}</Text> : null}
        {place.tags.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{place.tags.map(tag =>
          <Text key={tag} style={[t.sm, { color: colors.text, fontFamily: fonts.semibold, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 8 }]}>{tag}</Text>)}</View> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {place.canDrive ? <PlaceAction label="Directions" onPress={() => showDirections(place)} /> : null}
          <PlaceAction label={busy ? 'Downloading…' : 'Refresh'} disabled={busy} onPress={() => void refresh()} />
        </View>
        <Text selectable style={note}>{place.coordinates.lat.toFixed(5)}, {place.coordinates.lng.toFixed(5)}</Text>
        <Text style={note}>{place.detailsDownloadedAt ? `Details downloaded ${stamp(place.detailsDownloadedAt)}` : 'Details not downloaded'}</Text>
        {error ? <Text accessibilityRole="alert" style={[t.sm, { color: colors.error }]}>{error}</Text> : null}
      </View>
      {gauge ? <View style={{ gap: 6 }}>
        <Text accessibilityRole="header" style={heading}>{gauge.gaugeName}</Text>
        <Text style={[t.xl, { fontFamily: fonts.heading, color: display.band === 'fresh' ? colors.text : colors.textMuted }]}>{display.reading ?? 'Reading unavailable'}</Text>
        <Text style={[t.base, { color: display.code ? conditionText(display.code, isDark) : colors.textMuted }]}>{[display.condition ?? display.state, display.age].filter(Boolean).join(' · ')}</Text>
        <Text style={note}>Observed {stamp(gauge.lastUpdated)}</Text>
        {place.gauge?.downloadedAt !== place.detailsDownloadedAt ? <Text style={note}>Downloaded {stamp(place.gauge?.downloadedAt ?? null)}</Text> : null}
        <PlaceAction label="Open gauge" variant="link" onPress={() => router.push(`/gauge/${gauge.usgsId}`)} />
      </View> : null}
      {place.notes.map((text, i) => <Text key={i} style={body}>{text}</Text>)}
      {place.facts.map(fact => <View key={fact.label} style={{ gap: 4 }}>
        <Text style={[t.sm, { fontFamily: fonts.semibold, color: colors.textMuted }]}>{fact.label}</Text>
        <Text style={body}>{fact.value}</Text>
      </View>)}
      {place.amenities.length ? <Text style={note}>{place.amenities.join(' · ')}</Text> : null}
      {showDamSection ? <View style={{ gap: 12 }}>
        <Text accessibilityRole="header" style={heading}>{damName ?? 'Dam schedule'}</Text>
        {place.dam ? <Text style={note}>Downloaded {stamp(place.dam.downloadedAt)}</Text> : null}
        {dam?.metrics.release ? <View style={{ gap: 4 }}>
          <Text style={body}>{Math.round(dam.metrics.release.value).toLocaleString()} {dam.metrics.release.unit}{dam.metrics.release.dailyMean ? ' · daily average' : ''}</Text>
          <Text style={note}>Observed {stamp(dam.metrics.release.at)}</Text>
        </View> : null}
        {days.upcoming.map(renderDay)}
        {days.earlier.length ? <>
          {!days.upcoming.length ? <Text style={note}>No current schedule</Text> : null}
          <PlaceAction label={`Earlier schedules (${days.earlier.length})`} variant="link" expanded={earlierOpen} onPress={() => setEarlierOpen(v => !v)} />
          {earlierOpen ? days.earlier.map(renderDay) : null}
        </> : null}
        {chosenDamId && !dam ? <Text style={note}>Schedule not downloaded</Text> : dam && !dam.schedule.length ? <Text style={note}>Schedule unavailable</Text> : null}
        <PlaceAction label={chosenDamId ? 'Change dam' : 'Add a dam schedule'} variant="link" disabled={busy} onPress={() => setChoosingDam(true)} />
      </View> : <PlaceAction label="Add a dam schedule" variant="link" disabled={busy} onPress={() => setChoosingDam(true)} />}
      {place.links.map(link => <PlaceAction key={link.url} label={link.label} onPress={() => {
        if (!/^(https?:|tel:)/i.test(link.url)) return;
        void Linking.openURL(link.url).catch(() => setError('Couldn’t open link'));
      }} />)}
      <PlaceAction label="Remove from Favorites" variant="link" onPress={() => {
        void savedPlaces.remove(place.id, owner).then(() => router.back()).catch(() => setError('Couldn’t remove place'));
      }} />
    </ScrollView>
    {choosingDam ? <SavedPlaceDamPicker relatedIds={place.relatedDamIds} selectedId={chosenDamId} onClose={() => setChoosingDam(false)} onSelect={damId => {
      setChoosingDam(false);
      if (damId) void refresh(damId);
      else void savedPlaces.linkDam(place.id, null, owner).catch(() => setError('Couldn’t remove dam schedule'));
    }} /> : null}
    {directionsMenu}
  </>;
}
