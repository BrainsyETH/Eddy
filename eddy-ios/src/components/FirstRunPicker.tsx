// Personalization does real work: both river and dam choices become Favorites.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, FlatList, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { milesBetween, type Coords } from '@eddy/geo';
import type { DamSnapshot, RiverListItem } from '@eddy/types';
import { generationNow, generationStatusLabel } from '@eddy/conditions/dam-generation';
import { relativeAge } from '@eddy/conditions/dam-schedule-copy';
import { EddyScene } from '@/components/EddyScene';
import { SearchBar } from '@/components/SearchBar';
import { DAM_PHOTOS, OnboardingPhoto } from '@/components/OnboardingPhoto';
import { useLocation } from '@/hooks/useLocation';
import { useStarredRivers } from '@/hooks/useStarredRivers';
import { useDams, useDamRequestState, getSharedDams, type DamRequestState } from '@/hooks/useDams';
import { readBestIndex, agedIndex } from '@/lib/riverCache';
import { envelope, type CacheEnvelope } from '@/lib/offline-cache';
import { firstRunRivers, firstRunGauges } from '@/lib/firstRunPreload';
import { firstRunPlaces, firstRunFavorites, visibleFirstRunPlaces, damPlaceholder, type FirstRunPlace } from '@/lib/firstRunPlaces';
import { DAM_CATALOG } from '@/lib/damCatalog';
import { riverDistanceLabel, riverMilesByGauge } from '@/lib/riverDistance';
import { damControlledLabel, formatReading, primaryReading, readingAge } from '@/lib/readingCopy';
import { report, warn } from '@/lib/monitoring';
import { useTheme } from '@/theme/ThemeProvider';
import { conditionColor, conditionShortLabel, conditionText } from '@/theme/conditions';
import { fonts, type as t } from '@/theme/typography';

interface Props { onDone: () => void }

export function FirstRunPicker({ onDone }: Props) {
  const { colors } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const columns = fontScale > 1.2 || width < 360 ? 1 : 2;
  const { followStars, ready: starsReady } = useStarredRivers();
  const location = useLocation();
  const dams = useDams(true);
  const damRequestState = useDamRequestState();
  const [index, setIndex] = useState<CacheEnvelope<RiverListItem[]> | null>(null);
  const [now, setNow] = useState(Date.now);
  const [riversLoading, setRiversLoading] = useState(true);
  const [riverFailed, setRiverFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [browseAll, setBrowseAll] = useState(false);
  const [riverDistances, setRiverDistances] = useState<Map<string, number> | null>(null);
  const [nearbyCoords, setNearbyCoords] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, []);

  useEffect(() => {
    let active = true;
    let liveArrived = false;
    // Disk and network overlap. A late disk read cannot replace fresh readings.
    void readBestIndex().then(cached => {
      if (active && !liveArrived && cached?.payload.length) setIndex(cached);
    }).catch(() => {});
    void firstRunRivers().then(fresh => {
      if (!active) return;
      if (fresh.length) {
        liveArrived = true;
        setNow(Date.now());
        setIndex(envelope(fresh, new Date().toISOString()));
      } else setRiverFailed(true);
    }).catch(error => {
      if (active) setRiverFailed(true);
      warn('cache', 'first-run rivers unavailable', error);
    }).finally(() => { if (active) setRiversLoading(false); });
    return () => { active = false; };
  }, [retry]);

  const rivers = useMemo(() => index ? agedIndex(index, now) : [], [index, now]);
  const all = useMemo(() => firstRunPlaces(rivers), [rivers]);
  const damDistances = useMemo(() => nearbyCoords
    ? new Map(DAM_CATALOG.map(dam => [dam.id, milesBetween(nearbyCoords, { lat: dam.lat, lng: dam.lon })]))
    : null, [nearbyCoords]);
  const places = useMemo(() => visibleFirstRunPlaces({ rivers, query, browseAll, selected, riverDistances, damDistances }),
    [rivers, query, browseAll, selected, riverDistances, damDistances]);
  const favorites = useMemo(() => firstRunFavorites(all, selected, dams ?? []), [all, selected, dams]);
  const count = favorites.length;

  // Wait for a pause in typing. Selection and reading updates do not retrigger
  // an announcement, and clearing search cancels any pending result count.
  useEffect(() => {
    if (!query.trim()) return;
    const timer = setTimeout(() => {
      AccessibilityInfo.announceForAccessibility(`${places.length} ${places.length === 1 ? 'result' : 'results'}`);
    }, 500);
    return () => clearTimeout(timer);
  }, [query, places.length]);

  const toggle = (key: string) => setSelected(current => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const showNearby = async () => {
    if (locating) return;
    setLocating(true);
    try {
      const gaugesPromise = firstRunGauges().catch(() => null);
      const coords = await location.request();
      if (!coords || !mounted.current) return;
      setNearbyCoords(coords);
      const gauges = await gaugesPromise;
      if (mounted.current) {
        setRiverDistances(gauges ? riverMilesByGauge(gauges, coords) : null);
        setBrowseAll(false);
        setQuery('');
      }
    } catch (error) {
      warn('map', 'first-run nearby lookup failed', error);
    } finally { if (mounted.current) setLocating(false); }
  };

  const finish = () => {
    if (saving || !starsReady || !count) return;
    setSaving(true);
    try {
      // Additive and idempotent; never toggle off a synced favorite on reinstall.
      followStars(favorites);
      onDone();
    } catch (error) {
      report(error, { operation: 'firstRun.follow' });
      setSaving(false);
    }
  };
  const locationLabel = locating ? 'Finding nearby water…'
    : nearbyCoords ? riverDistances?.size ? 'Showing nearby water' : 'Showing nearby dams'
    : location.status === 'denied' ? 'Location off · Search or browse below'
    : location.status === 'unavailable' ? 'Location unavailable · Try again' : 'Near me';

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          key={columns}
          data={places}
          numColumns={columns}
          keyExtractor={item => item.key}
          contentContainerStyle={styles.body}
          columnWrapperStyle={columns === 2 ? styles.columns : undefined}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          ListHeaderComponent={
            <View style={styles.header}>
              <EddyScene name="wave" size={78} />
              <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Choose your rivers and dams</Text>
              <Text style={[styles.copy, { color: colors.textMuted }]}>Save your favorites to see their conditions on Today.</Text>
              <Pressable accessibilityRole="button" disabled={locating || location.status === 'denied'}
                accessibilityState={{ disabled: locating || location.status === 'denied' }}
                onPress={() => void showNearby()} style={[styles.chip, { backgroundColor: colors.selectionBg, borderColor: colors.border }]}>
                {locating ? <ActivityIndicator size="small" color={colors.interactive} /> : <Ionicons name="location-outline" size={17} color={colors.interactive} />}
                <Text style={[styles.chipText, { color: colors.selectionText }]}>{locationLabel}</Text>
              </Pressable>
              {location.status === 'denied' ? <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()} style={styles.textButton}>
                <Text style={[styles.skipText, { color: colors.interactive }]}>Open Settings</Text>
              </Pressable> : null}
              <View style={styles.search}><SearchBar value={query} onChangeText={setQuery} placeholder="Search rivers, dams, or lakes" /></View>
              {riversLoading && !rivers.length ? <View style={styles.notice}><ActivityIndicator size="small" color={colors.interactive} /><Text style={{ color: colors.textMuted }}>Loading rivers…</Text></View> : null}
              {riverFailed ? <Pressable accessibilityRole="button" onPress={() => { setRiversLoading(true); setRiverFailed(false); setRetry(value => value + 1); }} style={styles.notice}>
                <Text style={[styles.copy, { color: colors.interactive }]}>{rivers.length ? 'Showing saved rivers. Tap to retry.' : 'Rivers unavailable. Tap to retry.'}</Text>
              </Pressable> : null}
              {damRequestState === 'error' ? <Pressable accessibilityRole="button" onPress={() => void getSharedDams().catch(() => {})} style={styles.textButton}>
                <Text style={[styles.copy, { color: colors.interactive }]}>Retry dam readings</Text>
              </Pressable> : null}
              <Text style={[styles.section, { color: colors.textMuted }]}>{query.trim() ? `${places.length} results` : browseAll ? 'All rivers and dams' : nearbyCoords && !riverDistances?.size ? 'Suggested rivers and nearby dams' : 'Suggested for you'}</Text>
            </View>
          }
          renderItem={({ item }) => <PlaceCard place={item} selected={selected.has(item.key)} onPress={() => toggle(item.key)}
            damRequestState={damRequestState}
            dam={item.kind === 'dam' ? dams?.find(dam => dam.id === item.dam.id) ?? null : null}
            miles={item.kind === 'river' ? riverDistances?.get(item.river.id) : damDistances?.get(item.dam.id)} now={now} />}
          ListEmptyComponent={<Text style={[styles.copy, { color: colors.textMuted }]}>No matches. Try a river, dam, or lake name.</Text>}
          ListFooterComponent={<View>
            {!query.trim() && !browseAll ? <Pressable accessibilityRole="button" onPress={() => setBrowseAll(true)} style={styles.textButton}>
              <Text style={[styles.buttonText, { color: colors.interactive }]}>Show all rivers and dams</Text>
            </Pressable> : null}
            <Pressable accessibilityRole="button" onPress={() => setCreditsOpen(true)} style={styles.textButton}>
              <Text style={[styles.meta, { color: colors.textMuted }]}>Photo credits</Text>
            </Pressable>
          </View>}
        />
        <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.bg }]}>
          <View style={styles.reviewControl}>
            {count > 0 ? <Pressable accessibilityRole="button"
              onPress={() => { Keyboard.dismiss(); setReviewOpen(true); }} style={styles.textButton}>
              <Text style={[styles.skipText, { color: colors.interactive }]}>Review selected ({count})</Text>
            </Pressable> : <Text style={[styles.footerHint, { color: colors.textMuted }]}>Select at least one favorite</Text>}
          </View>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !count || saving || !starsReady }}
            disabled={!count || saving || !starsReady} onPress={finish}
            style={({ pressed }) => [styles.button, { backgroundColor: count ? colors.accentFill : colors.border, opacity: pressed || saving ? 0.7 : 1 }]}>
            <Text style={[styles.buttonText, { color: count ? colors.onAccent : colors.textSubtle }]}>{saving ? 'Saving…' : 'Save & continue'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onDone} style={styles.textButton}>
            <Text style={[styles.skipText, { color: colors.textMuted }]}>Skip for now</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      {/* The sheet and save action read the same live favorites array. No
          snapshot, duplicate inline section, or card reordering on selection. */}
      <Modal visible={reviewOpen} animationType="slide" presentationStyle="pageSheet"
        onRequestClose={() => setReviewOpen(false)}>
        <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
          <View style={styles.reviewHeader}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Selected favorites ({count})</Text>
          </View>
          <ScrollView contentContainerStyle={styles.body}>
            {favorites.length ? favorites.map(item => <View key={`${item.kind}:${item.entityId}`}
              style={[styles.selectedRow, { borderColor: colors.border }]}>
              <View style={styles.selectedCopy}>
                <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>{item.kind === 'river' ? 'River' : 'Dam'}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${item.name} from selection`}
                onPress={() => toggle(`${item.kind}:${item.entityId}`)} style={styles.textButton}>
                <Text style={[styles.skipText, { color: colors.interactive }]}>Remove</Text>
              </Pressable>
            </View>) : <Text style={[styles.copy, { color: colors.textMuted }]}>No favorites selected. Tap Done to keep exploring.</Text>}
          </ScrollView>
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Pressable accessibilityRole="button" onPress={() => setReviewOpen(false)} style={styles.textButton}>
              <Text style={[styles.buttonText, { color: colors.interactive }]}>Done</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
      <Modal visible={creditsOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCreditsOpen(false)}>
        <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
          <ScrollView contentContainerStyle={styles.body}>
            <Text style={[styles.title, { color: colors.text }]}>Photo credits</Text>
            <Text style={[styles.copy, { color: colors.textMuted }]}>Scenery photos do not show current water conditions. Dam photos are resized and cropped for display.</Text>
            {Object.entries(DAM_PHOTOS).map(([id, photo]) => <View key={id} style={styles.credit}>
              <Text style={[styles.name, { color: colors.text }]}>{DAM_CATALOG.find(dam => dam.id === id)?.name}</Text>
              <Text style={{ color: colors.textMuted }}>{photo.credit}</Text>
              <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(photo.url)} style={styles.textButton}><Text style={{ color: colors.interactive }}>Original photograph</Text></Pressable>
              <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(photo.license)} style={styles.textButton}><Text style={{ color: colors.interactive }}>License</Text></Pressable>
            </View>)}
            {rivers.filter(river => river.photoCredit).map(river => <Pressable key={river.id} accessibilityRole="link" onPress={() => void Linking.openURL(river.photoCredit!.url)} style={styles.credit}>
              <Text style={[styles.name, { color: colors.text }]}>{river.name}</Text><Text style={{ color: colors.interactive }}>{river.photoCredit!.text}</Text>
            </Pressable>)}
          </ScrollView>
          <Pressable accessibilityRole="button" onPress={() => setCreditsOpen(false)} style={styles.textButton}><Text style={[styles.buttonText, { color: colors.interactive }]}>Done</Text></Pressable>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function PlaceCard({ place, selected, onPress, dam, damRequestState, miles, now }: {
  place: FirstRunPlace; selected: boolean; onPress: () => void; dam: DamSnapshot | null; damRequestState: DamRequestState; miles?: number; now: number;
}) {
  const { colors, isDark } = useTheme();
  const river = place.kind === 'river' ? place.river : null;
  const name = river?.name ?? (place.kind === 'dam' ? place.dam.name : '');
  const code = river?.currentCondition?.code ?? 'unknown';
  const reading = river?.currentCondition ? primaryReading(river.currentCondition) : null;
  const generation = dam ? generationNow(dam, now) : null;
  const release = dam?.metrics.release;
  const status = river
    ? damControlledLabel(river.riverType, code) ?? conditionShortLabel(code)
    : generation && generation.kind !== 'unavailable' ? generationStatusLabel(generation)
    : release ? release.dailyMean ? 'Daily mean release' : 'Reported release'
    : dam ? 'Reading unavailable' : damPlaceholder(damRequestState);
  const value = reading ? formatReading(reading.value, reading.unit)
    : generation && generation.kind !== 'unavailable' ? `${formatReading(generation.turbineCfs, 'cfs')} turbine flow`
    : release ? `${Math.round(release.value).toLocaleString()} ${release.unit}` : null;
  const age = reading ? readingAge(river?.currentCondition?.readingAgeHours) ?? 'Reading time unavailable'
    : generation && generation.kind !== 'unavailable' ? relativeAge(generation.observedAt, now)
    : release ? relativeAge(release.at, now) : null;
  const distance = miles == null ? null : river ? riverDistanceLabel(miles) : `≈ ${Math.round(miles)} mi away`;
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }}
      accessibilityLabel={[name, place.kind, status, value, age, distance].filter(Boolean).join(', ')}
      onPress={onPress} style={({ pressed }) => [styles.card, { backgroundColor: selected ? colors.selectionBg : colors.card, borderColor: selected ? colors.interactive : colors.border, opacity: pressed ? 0.8 : 1 }]}>
      <OnboardingPhoto uri={river?.photoUrl} damId={place.kind === 'dam' ? place.dam.id : undefined} />
      <View style={[styles.selection, { backgroundColor: colors.card }]}>
        <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={selected ? colors.interactive : colors.textMuted} />
      </View>
      <View style={styles.cardBody}>
        <Text style={[styles.meta, { color: colors.textMuted }]}>{place.kind === 'river' ? 'River' : 'Dam'} · {river?.state ?? (place.kind === 'dam' ? place.dam.state : '')}</Text>
        <Text style={[styles.name, { color: colors.text }]}>{name}</Text>
        <View style={styles.status}>
          {river ? <View style={[styles.dot, { backgroundColor: conditionColor(code) }]} /> : null}
          <Text style={[styles.statusText, { color: river ? conditionText(code, isDark) : colors.text }]}>{status}</Text>
        </View>
        {value ? <Text style={[styles.reading, { color: colors.text }]}>{value}</Text> : null}
        {age ? <Text style={[styles.meta, { color: colors.textMuted }]}>{age}</Text> : null}
        {distance ? <Text style={[styles.meta, { color: colors.textMuted }]}>{distance}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },
  header: { alignItems: 'center' },
  title: { ...t['2xl'], fontFamily: fonts.displayBold, textAlign: 'center', marginTop: 10 },
  copy: { ...t.sm, fontFamily: fonts.body, textAlign: 'center', marginTop: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 24, paddingVertical: 10, paddingHorizontal: 14, marginTop: 16, minHeight: 44, maxWidth: '100%' },
  chipText: { ...t.sm, fontFamily: fonts.semibold, flexShrink: 1 },
  search: { width: '100%', marginTop: 16 },
  section: { ...t.sm, fontFamily: fonts.semibold, alignSelf: 'flex-start', marginTop: 20, marginBottom: 12 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, minHeight: 44 },
  columns: { gap: 12 },
  card: { flex: 1, borderWidth: 2, borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  cardBody: { padding: 12, gap: 5 },
  selection: { position: 'absolute', top: 8, right: 8, borderRadius: 18, padding: 3 },
  name: { ...t.base, fontFamily: fonts.semibold },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { ...t.sm, fontFamily: fonts.semibold, flexShrink: 1 },
  reading: { ...t.sm, fontFamily: fonts.monoMedium },
  meta: { ...t.xs, fontFamily: fonts.body },
  footer: { paddingHorizontal: 20, paddingTop: 14, borderTopWidth: 1 },
  button: { borderRadius: 12, paddingVertical: 15, paddingHorizontal: 12, alignItems: 'center', minHeight: 48 },
  buttonText: { ...t.base, fontFamily: fonts.semibold, textAlign: 'center' },
  skipText: { ...t.sm, fontFamily: fonts.semibold, textAlign: 'center' },
  textButton: { paddingVertical: 12, paddingHorizontal: 12, minHeight: 44, alignItems: 'center' },
  credit: { paddingVertical: 16 },
  reviewControl: { minHeight: 44, justifyContent: 'center', marginBottom: 8 },
  reviewHeader: { paddingHorizontal: 20, paddingVertical: 12 },
  selectedCopy: { flex: 1, gap: 4 },
  selectedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderWidth: 1, borderRadius: 12, padding: 10, minHeight: 44, marginBottom: 10 },
  footerHint: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
});
