import { useCallback, useRef, useState } from 'react';
import { Linking, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Redirect, Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSavedPlaces } from '@/hooks/useSavedPlaces';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { PlaceAction } from '@/components/PlaceAction';
import { SavedPlaceSchedule } from '@/components/SavedPlaceSchedule';
import { NativeHeaderHome } from '@/components/NativeHeaderHome';
import { useDirectionsMenu } from '@/components/DirectionsMenu';
import { CampgroundAvailability } from '@/components/map-sheet/CampgroundAvailability';
import { AccessGaugeReading, AmenityChips, Chips, LinkRow, Prose, Section } from '@/components/map-sheet/sections';
import { refreshSavedPlace, savedPlaces } from '@/lib/savedPlacesStore';
import { savedCampingDisplay, savedGaugeDisplay } from '@/lib/savedPlaceDisplay';
import { openExternalLink } from '@/lib/openExternalLink';
import { onForeground } from '@/lib/foreground';
import { savedAccessRoute } from '@/lib/accessDetailPresentation';

export default function SavedPlaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { owner } = useSavedPlaces();
  return <SavedPlaceContent key={`${owner}:${id}`} />;
}

/** Access saves use the canonical access screen; this is for service-only POIs. */
function SavedPlaceContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { places, owner, ready, error: loadError } = useSavedPlaces();
  const place = places.find(value => value.id === id);
  const accessRoute = savedAccessRoute(place);
  const opensAccess = !!accessRoute;
  const { colors } = useTheme();
  const router = useRouter();
  const { showDirections, directionsMenu } = useDirectionsMenu();
  const [now, setNow] = useState(Date.now);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshingRef = useRef(false);

  useFocusEffect(useCallback(() => {
    if (!ready || opensAccess) return;
    const update = () => {
      setNow(Date.now());
      void refreshSavedPlace(id, undefined, { owner, automatic: true }).catch(() => {});
    };
    update();
    const off = onForeground(update);
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => { off(); clearInterval(timer); };
  }, [ready, opensAccess, id, owner]));

  const refresh = async () => {
    if (!place || refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setError(null);
    try {
      if (!await refreshSavedPlace(place.id, undefined, { owner })) setError('Couldn’t update details. Try again.');
    } catch { setError('Couldn’t update details. Try again.'); }
    finally {
      refreshingRef.current = false;
      setRefreshing(false);
      setNow(Date.now());
    }
  };

  const body = [t.base, { fontFamily: fonts.body, color: colors.text }];
  const note = [t.xs, { fontFamily: fonts.body, color: colors.textMuted }];
  if (!place) return <View style={{ flex: 1, backgroundColor: colors.bg, padding: 20, gap: 16 }}>
    <Text style={body}>{!ready ? 'Loading…' : loadError ?? 'Place unavailable'}</Text>
    {loadError ? <PlaceAction label="Retry" onPress={() => void savedPlaces.select(owner)} /> : null}
    <PlaceAction label="Favorites" onPress={() => router.replace('/(tabs)/(favorites)/favorites')} />
  </View>;
  if (accessRoute) return <Redirect href={{ pathname: '/river/[slug]/access/[accessSlug]', params: accessRoute }} />;

  const camping = savedCampingDisplay(place, now);
  const gauge = place.gauge?.reading;
  const display = savedGaugeDisplay(place, now);
  const status = gauge ? {
    ...gauge,
    cfs: display.reading ? gauge.cfs : null,
    heightFt: display.reading ? gauge.heightFt : null,
    level: display.code ?? 'unknown' as const,
    label: display.condition ?? display.state ?? gauge.label,
    trend: display.band === 'fresh' ? gauge.trend : null,
  } : null;

  return <>
    <Stack.Screen options={{ title: place.name }} />
    <NativeHeaderHome />
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button icon="star.fill" accessibilityLabel={`Remove ${place.name} from Favorites`} onPress={() => {
        void savedPlaces.remove(place.id, owner).then(() => router.back()).catch(() => setError('Couldn’t remove place'));
      }}>Saved</Stack.Toolbar.Button>
    </Stack.Toolbar>
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.interactive} />}>
      <View style={{ gap: 8 }}>
        <Text accessibilityRole="header" style={[t.xl, { fontFamily: fonts.heading, color: colors.text }]}>{place.name}</Text>
        {place.riverName ? <Text style={[t.sm, { fontFamily: fonts.body, color: colors.textMuted }]}>{place.riverName}</Text> : null}
        <Chips labels={place.tags} />
        {place.canDrive ? <LinkRow label="Directions" external onPress={() => showDirections(place)} accessibilityLabel={`Directions to ${place.name}`} /> : null}
        {error ? <Text accessibilityRole="alert" style={[t.sm, { color: colors.error }]}>{error}</Text> : null}
      </View>
      {camping ? <Section title="Campsites">
        <CampgroundAvailability wrapText availability={camping.availability} name={camping.name} today={camping.today}
          pending={!camping.availability} pendingLabel="Availability out of date" />
        {camping.age !== 'Time unknown' ? <Text style={note}>Checked {camping.age}</Text> : null}
      </Section> : null}
      {status ? <Section title="Water level">
        <AccessGaugeReading status={status} onOpenGauge={siteId => router.push(`/gauge/${encodeURIComponent(siteId)}`)} />
        <Text style={note}>{display.age}</Text>
      </Section> : null}
      {place.notes.length ? <Section>{place.notes.map((text, index) => <Prose key={index}>{text}</Prose>)}</Section> : null}
      {place.facts.map(fact => <Section key={fact.label}
        title={fact.label === 'Road' ? 'Getting in' : fact.label}
        symbol={fact.label === 'Road' ? 'road' : fact.label === 'Parking' ? 'parking' : fact.label === 'Facilities' ? 'facilities' : undefined}>
        <Prose>{fact.value}</Prose>
      </Section>)}
      {place.amenities.length ? <Section><AmenityChips amenities={place.amenities} /></Section> : null}
      <SavedPlaceSchedule place={place} now={now} />
      {place.links.length ? <Section>{place.links.map(link => <LinkRow key={link.url} label={link.label} external onPress={() => {
        if (/^https?:/i.test(link.url)) void openExternalLink(link.url);
        else if (/^tel:/i.test(link.url)) void Linking.openURL(link.url).catch(() => setError('Couldn’t open link'));
      }} />)}</Section> : null}
    </ScrollView>
    {directionsMenu}
  </>;
}
