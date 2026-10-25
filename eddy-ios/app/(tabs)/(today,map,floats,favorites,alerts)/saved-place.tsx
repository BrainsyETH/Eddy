import { useCallback, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSavedPlaces } from '@/hooks/useSavedPlaces';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { PlaceAction } from '@/components/PlaceAction';
import { NativeHeaderHome } from '@/components/NativeHeaderHome';
import { useDirectionsMenu } from '@/components/DirectionsMenu';
import { DayBars } from '@/components/dam/DayBars';
import { DAM_CATALOG } from '@/lib/damCatalog';
import { refreshSavedPlace, savedPlaces } from '@/lib/savedPlacesStore';
import { savedScheduleState } from '@/lib/savedPlaces';
import { onForeground } from '@/lib/foreground';

const stamp = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Time unknown';

export default function SavedPlaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { places, ready, error: loadError } = useSavedPlaces();
  const place = places.find(p => p.id === id);
  const { colors } = useTheme();
  const router = useRouter();
  const { showDirections, directionsMenu } = useDirectionsMenu();
  const [now, setNow] = useState(Date.now);
  const [choosingDam, setChoosingDam] = useState(false);
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
    try {
      if (!await refreshSavedPlace(place.id, damId)) setError('Couldn’t refresh all details');
      else setChoosingDam(false);
    } catch { setError('Couldn’t save the download'); }
    finally { setBusy(false); }
  };
  const heading = [t.lg, { fontFamily: fonts.heading, color: colors.text }];
  const body = [t.base, { fontFamily: fonts.body, color: colors.text }];
  const note = [t.sm, { fontFamily: fonts.body, color: colors.textMuted }];
  if (!place) return <View style={{ flex: 1, backgroundColor: colors.bg, padding: 20, gap: 16 }}>
    <Text style={body}>{!ready ? 'Loading…' : loadError ?? 'Place removed'}</Text>
    <PlaceAction label="Favorites" onPress={() => router.replace('/(tabs)/(favorites)/favorites')} />
  </View>;
  const gauge = place.gauge?.reading;
  const dam = place.dam?.snapshot;
  return <>
    <Stack.Screen options={{ title: place.name }} />
    <NativeHeaderHome />
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 40 }}>
      <View style={{ gap: 8 }}>
        <Text accessibilityRole="header" style={heading}>{place.name}</Text>
        {place.riverName ? <Text style={note}>{place.riverName}</Text> : null}
        <Text style={note}>{place.detailsDownloadedAt ? `Downloaded ${stamp(place.detailsDownloadedAt)}` : 'Details not downloaded'}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {place.canDrive ? <PlaceAction label="Directions" onPress={() => showDirections(place)} /> : null}
          <PlaceAction label={busy ? 'Downloading…' : 'Refresh'} disabled={busy} onPress={() => void refresh()} />
        </View>
        <Text selectable style={note}>{place.coordinates.lat.toFixed(5)}, {place.coordinates.lng.toFixed(5)}</Text>
        {error ? <Text accessibilityRole="alert" style={[t.sm, { color: colors.error }]}>{error}</Text> : null}
      </View>
      {place.notes.length || place.amenities.length ? <View style={{ gap: 10 }}>
        <Text accessibilityRole="header" style={heading}>Access</Text>
        {place.notes.map((text, i) => <Text key={i} style={body}>{text}</Text>)}
        {place.amenities.length ? <Text style={note}>{place.amenities.join(' · ')}</Text> : null}
      </View> : null}
      {gauge ? <View style={{ gap: 8 }}>
        <Text accessibilityRole="header" style={heading}>{gauge.gaugeName}</Text>
        <Text style={heading}>{gauge.cfs != null ? `${Math.round(gauge.cfs).toLocaleString()} cfs` : gauge.heightFt != null ? `${gauge.heightFt.toFixed(2)} ft` : 'Reading unavailable'}</Text>
        <Text style={note}>Observed {stamp(gauge.lastUpdated)}</Text>
        <PlaceAction label="Open gauge" onPress={() => router.push(`/gauge/${gauge.usgsId}`)} />
      </View> : null}
      <View style={{ gap: 12 }}>
        <Text accessibilityRole="header" style={heading}>{dam?.name ?? 'Dam schedule'}</Text>
        {place.dam ? <Text style={note}>Downloaded {stamp(place.dam.downloadedAt)}</Text> : null}
        {dam?.metrics.release ? <View style={{ gap: 4 }}>
          <Text style={body}>{Math.round(dam.metrics.release.value).toLocaleString()} {dam.metrics.release.unit}{dam.metrics.release.dailyMean ? ' · daily average' : ''}</Text>
          <Text style={note}>Observed {stamp(dam.metrics.release.at)}</Text>
        </View> : null}
        {dam?.schedule.map(day => <View key={day.scheduleDate} style={{ gap: 8 }}>
          <Text style={body}>{day.scheduleDate} · Central time</Text>
          <Text style={note}>{savedScheduleState(day, new Date(now))} · Checked {stamp(day.retrievedAt)}</Text>
          <DayBars day={day} reference={dam.generationReference} />
        </View>)}
        {dam && !dam.schedule.length ? <Text style={note}>Schedule unavailable</Text> : null}
        <PlaceAction label={dam ? 'Change dam' : 'Choose dam'} onPress={() => setChoosingDam(v => !v)} />
        {choosingDam ? DAM_CATALOG.map(item => <PlaceAction key={item.id} label={item.name} disabled={busy} onPress={() => void refresh(item.id)} />) : null}
      </View>
      {place.links.map(link => <PlaceAction key={link.url} label={link.label} onPress={() => {
        if (!/^(https?:|tel:)/i.test(link.url)) return;
        void Linking.openURL(link.url).catch(() => setError('Couldn’t open link'));
      }} />)}
      <PlaceAction label="Remove from Favorites" onPress={() => {
        void savedPlaces.remove(place.id).then(() => router.back()).catch(() => setError('Couldn’t remove place'));
      }} />
    </ScrollView>
    {directionsMenu}
  </>;
}
