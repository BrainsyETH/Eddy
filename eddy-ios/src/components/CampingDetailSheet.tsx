import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { CampingOverview, TrackedCampground } from '@eddy/types';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles } from '@/theme/typography';
import {
  initialCampingNight,
  checkedLabel,
  safeExternalUrl,
} from '@/lib/campingHeatmap';
import {
  campsiteStays,
  campsiteStayFilterCounts,
  filterCampsiteStays,
  nextCampingDate,
  type CampingStay,
} from '@/lib/campingStay';
import { noFilteredSitesLine, siteFilterChips, type SiteFilter } from './map-sheet/siteList';
import { FilterChips } from './FilterChips';
import { useCampsiteStay } from '@/hooks/useCampsiteStay';
import { CampingStayPicker } from './CampingStayPicker';
import { CampingSiteCard } from './CampingSiteCard';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export function CampingDetailSheet({
  row,
  overview,
  now,
  initialStay,
  onClose,
}: {
  row: TrackedCampground;
  overview: CampingOverview;
  now: number;
  initialStay?: CampingStay;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const [stay, setStay] = useState<CampingStay>(
    () =>
      initialStay ?? {
        arrival: initialCampingNight(overview),
        departure: nextCampingDate(initialCampingNight(overview)),
      },
  );
  const [failed, setFailed] = useState(false);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [showUnknown, setShowUnknown] = useState(false);
  const [filters, setFilters] = useState<SiteFilter[]>([]);
  const {
    responses,
    loading,
    failed: loadFailed,
    refresh,
  } = useCampsiteStay(row.facilityId, stay);
  const allEntries = campsiteStays(
    responses,
    stay,
    overview.maxObservationAgeSeconds,
    now,
  );
  const counts = campsiteStayFilterCounts(allEntries);
  // A selected kind stays selected, and visible at zero, across date changes:
  // it is the reader's requirement, not a suggestion. See siteFilterChips.
  const chips = siteFilterChips(counts, filters);
  // An unselected chip matching every takeable site narrows nothing.
  const takeable = allEntries.filter((e) => e.state === 'available' || e.state === 'first_come').length;
  const showChips = filters.length > 0 || chips.some((f) => counts[f] < takeable);
  const entries = filterCampsiteStays(allEntries, filters);
  // The filters, not the campground, are why nothing is listed.
  const filteredOut = filters.length > 0 && allEntries.length > 0 &&
    !entries.some((e) => e.state === 'available' || e.state === 'first_come');
  const available = entries.filter((e) => e.state === 'available');
  const firstCome = entries.filter((e) => e.state === 'first_come');
  const unknown = entries.filter((e) => e.state === 'unknown');
  const unavailable = entries.filter((e) => e.state === 'unavailable');
  const visible = [
    ...available,
    ...firstCome,
    ...(showUnknown ? unknown : []),
    ...(showUnavailable ? unavailable : []),
  ];
  const booking = safeExternalUrl(row.booking?.url);
  const website = safeExternalUrl(row.website);
  const timestamps = responses
    .map((r) => r.fetchedAt)
    .filter((d): d is string => !!d)
    .sort();
  function open(url: string) {
    setFailed(false);
    void Linking.openURL(url).catch(() => setFailed(true));
  }
  return (
    <Modal
      visible
      animationType={reducedMotion ? 'none' : 'slide'}
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.bg }}
        edges={['bottom']}
        onAccessibilityEscape={onClose}
      >
        <View style={styles.header}>
          <Text
            style={[textStyles.sectionTitle, { color: colors.text, flex: 1 }]}
          >
            {row.name}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close campground details"
            style={styles.action}
          >
            <Text
              style={{ color: colors.interactive, fontFamily: fonts.semibold }}
            >
              Done
            </Text>
          </Pressable>
        </View>
        <FlatList
          data={visible}
          keyExtractor={(e) => e.site.id}
          initialNumToRender={3}
          maxToRenderPerBatch={3}
          windowSize={5}
          contentContainerStyle={styles.content}
          ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
          renderItem={({ item }) => (
            <View style={{ gap: 12 }}>
              {item.site.id === firstCome[0]?.site.id ? (
                <Text
                  accessibilityRole="header"
                  style={[textStyles.cardTitle, { color: colors.text }]}
                >
                  First-come sites ({firstCome.length}) · No reservations
                </Text>
              ) : null}
              <CampingSiteCard
                entry={item}
                facilityId={row.facilityId}
                bookingUrl={booking}
              />
            </View>
          )}
          ListHeaderComponent={
            <View style={{ gap: 12, paddingBottom: 16 }}>
              {row.displayGroup.key !== 'other' ? (
                <Text style={[textStyles.caption, { color: colors.textMuted }]}>
                  {row.displayGroup.label}
                </Text>
              ) : null}
              <CampingStayPicker
                stay={stay}
                nights={overview.horizon.nights}
                onChange={(s) => {
                  setStay(s);
                  setShowUnavailable(false);
                  setShowUnknown(false);
                }}
              />
              {showChips ? (
                <FilterChips
                  chips={chips.map((f) => ({ key: f, label: f, count: counts[f] }))}
                  active={filters}
                  onToggle={(key) =>
                    setFilters((current) =>
                      current.includes(key as SiteFilter)
                        ? current.filter((f) => f !== key)
                        : [...current, key as SiteFilter],
                    )
                  }
                  paddingHorizontal={0}
                />
              ) : null}
              <View style={styles.links}>
                {row.accessDestination ? (
                  <Pressable
                    accessibilityRole="button"
                    style={styles.action}
                    onPress={() => {
                      onClose();
                      router.push({
                        pathname: '/',
                        params: {
                          focusAccess: row.accessDestination!.accessId,
                          focusRiver: row.accessDestination!.riverSlug,
                        },
                      });
                    }}
                  >
                    <Text style={{ color: colors.interactive }}>
                      View on map
                    </Text>
                  </Pressable>
                ) : null}
                {website ? (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => open(website)}
                    style={styles.action}
                  >
                    <Text style={{ color: colors.interactive }}>Website ↗</Text>
                  </Pressable>
                ) : null}
              </View>
              {loading ? (
                <ActivityIndicator
                  accessibilityLabel="Loading campsites"
                  color={colors.interactive}
                />
              ) : loadFailed ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={refresh}
                  style={styles.action}
                >
                  <Text style={{ color: colors.interactive }}>
                    Couldn’t load sites. Retry
                  </Text>
                </Pressable>
              ) : filteredOut ? (
                <View style={{ gap: 4 }}>
                  <Text style={[textStyles.cardTitle, { color: colors.text }]}>
                    {noFilteredSitesLine(filters)} available for these dates
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.action}
                    onPress={() => setFilters([])}
                  >
                    <Text style={{ color: colors.interactive }}>Clear filters</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  {available.length || !firstCome.length ? (
                    <Text
                      style={[textStyles.cardTitle, { color: colors.text }]}
                    >
                      {available.length
                        ? `${available.length} ${available.length === 1 ? 'site available' : 'sites available'}`
                        : unknown.length
                          ? 'Availability needs an update'
                          : entries.length
                            ? 'No sites open for this stay'
                            : 'Individual site data unavailable'}
                    </Text>
                  ) : null}
                  {timestamps[0] ? (
                    <Text
                      style={[textStyles.caption, { color: colors.textMuted }]}
                    >
                      {checkedLabel(timestamps[0], now)}
                      {firstCome.length ? '' : ' · Reservable sites only'}
                    </Text>
                  ) : null}
                </>
              )}
              {row.firstCome === 'present' && !firstCome.length ? (
                <Text style={[textStyles.caption, { color: colors.textMuted }]}>
                  First-come sites also offered.
                </Text>
              ) : null}
              {row.loopName && booking ? (
                <Text style={[textStyles.caption, { color: colors.textMuted }]}>
                  Reservations through the district permit.
                </Text>
              ) : null}
              {!available.length &&
              booking &&
              (!firstCome.length || unknown.length || unavailable.length) ? (
                <Pressable
                  accessibilityRole="link"
                  style={styles.action}
                  onPress={() => open(booking)}
                >
                  <Text style={{ color: colors.interactive }}>
                    Check park reservations ↗
                  </Text>
                </Pressable>
              ) : null}
              {failed ? (
                <Text style={{ color: colors.error }}>
                  Couldn’t open the link. Try again.
                </Text>
              ) : null}
            </View>
          }
          ListFooterComponent={
            <View>
              {unknown.length ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showUnknown }}
                  onPress={() => setShowUnknown((v) => !v)}
                  style={styles.action}
                >
                  <Text style={{ color: colors.interactive }}>
                    {showUnknown ? 'Hide' : 'Show'} sites without updated
                    availability ({unknown.length})
                  </Text>
                </Pressable>
              ) : null}
              {unavailable.length ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showUnavailable }}
                  onPress={() => setShowUnavailable((v) => !v)}
                  style={styles.action}
                >
                  <Text style={{ color: colors.interactive }}>
                    {showUnavailable ? 'Hide' : 'Show'} unavailable sites (
                    {unavailable.length})
                  </Text>
                </Pressable>
              ) : null}
            </View>
          }
        />
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12 },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  action: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 24 },
});
