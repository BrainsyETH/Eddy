import { openExternalLink } from '@/lib/openExternalLink';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { CampingOverview, TrackedCampground } from '@eddy/types';
import { useTheme } from '@/theme/ThemeProvider';
import { EddySymbol } from './EddySymbol';
import { ControlIcon } from './ControlIcon';
import { fonts, textStyles } from '@/theme/typography';
import {
  initialCampingNight,
  checkedLabel,
  safeExternalUrl,
} from '@/lib/campingHeatmap';
import {
  campsiteStayFilterCounts,
  currentCampingStay,
  filterCampsiteStays,
  nextCampingDate,
  type CampingStay,
} from '@/lib/campingStay';
import { commonSiteFeatures, narrowingSiteFilters, noFilteredSitesLine, type SiteFilter } from './map-sheet/siteList';
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
  const { fontScale } = useWindowDimensions();
  const scrollingTitle = fontScale >= 1.3 || row.name.length > 48;
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
    result,
    loading,
    failed: loadFailed,
    refresh,
  } = useCampsiteStay(row.facilityId, stay);
  const allEntries = currentCampingStay(result, overview.maxObservationAgeSeconds, now);
  const counts = campsiteStayFilterCounts(allEntries);
  const takeable = allEntries.filter(e => e.state === 'available' || e.state === 'first_come').length;
  const chips = narrowingSiteFilters(counts, filters, takeable);
  const commonFeatures = commonSiteFeatures(counts, takeable).filter(f => !filters.includes(f));
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
  const timestamps = result?.fetchedAt ? [result.fetchedAt] : [];
  function open(url: string) {
    setFailed(false);
    void openExternalLink(url, () => setFailed(true));
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
        style={{ flex: 1, backgroundColor: colors.sheetGrouped }}
        edges={['bottom']}
        onAccessibilityEscape={onClose}
      >
        <View style={styles.header}>
          <EddySymbol name="campground" size={28} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[textStyles.sectionTitle, { color: colors.text }]}>{scrollingTitle ? 'Camping' : row.name}</Text>
            {row.displayGroup.key !== 'other' ? <Text style={[textStyles.caption, { color: colors.textMuted }]}>{row.displayGroup.label}</Text> : null}
          </View>
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
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
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
                now={now}
                facilityId={row.facilityId}
                bookingUrl={booking}
                campgroundName={row.name}
              />
            </View>
          )}
          ListHeaderComponent={
            <View style={{ gap: 8, paddingBottom: 12 }}>
              {scrollingTitle ? <Text accessibilityRole="header" style={[textStyles.sectionTitle, { color: colors.text }]}>{row.name}</Text> : null}
              <CampingStayPicker
                stay={stay}
                nights={overview.horizon.nights}
                onChange={(s) => {
                  setStay(s);
                  setShowUnavailable(false);
                  setShowUnknown(false);
                }}
              />
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
                        ? `${available.length} ${filters.length ? (available.length === 1 ? 'matching site' : 'matching sites') : (available.length === 1 ? 'site available' : 'sites available')}`
                        : unknown.length
                          ? 'No confirmed openings'
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
                      {firstCome.length ? '' : ' · Reservable sites'}
                    </Text>
                  ) : null}
                </>
              )}
              {commonFeatures.length ? <Text style={[textStyles.caption, { color: colors.textMuted }]}>{commonFeatures.join(' · ')}</Text> : null}
              <View style={styles.links}>
                {row.accessDestination ? (
                  <Pressable
                    accessibilityRole="button"
                    style={styles.linkAction}
                    onPress={() => {
                      onClose();
                      // navigate, not push — the access screen's "View on map"
                      // says why. push minted a second Map screen on the stack,
                      // focused on this campground, and every later return to
                      // the Map tab landed on that copy instead of the reader's
                      // own map.
                      router.navigate({
                        pathname: '/',
                        params: {
                          focusAccess: row.accessDestination!.accessId,
                          focusRiver: row.accessDestination!.riverSlug,
                        },
                      });
                    }}
                  >
                    <ControlIcon name="map-outline" size={16} color={colors.interactive} />
                    <Text style={{ color: colors.interactive }}>View on map</Text>
                  </Pressable>
                ) : null}
                {website ? (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => open(website)}
                    style={styles.linkAction}
                  >
                    <Text style={{ color: colors.interactive }}>Website</Text><ControlIcon name="open-outline" size={15} color={colors.interactive} />
                  </Pressable>
                ) : null}
              </View>
              {chips.length ? (
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
              {filters.length && !filteredOut ? <Pressable accessibilityRole="button" onPress={() => setFilters([])} style={styles.action}>
                <Text style={{ color: colors.interactive }}>Clear filters</Text>
              </Pressable> : null}
              {row.firstCome === 'present' && !firstCome.length ? (
                <Text style={[textStyles.caption, { color: colors.textMuted }]}>
                  First-come sites also offered.
                </Text>
              ) : null}
              {row.loopName && booking && firstCome.length !== allEntries.length ? (
                <Text style={[textStyles.caption, { color: colors.textMuted }]}>
                  District permits: select this campground.
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  linkAction: { minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  action: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 24 },
});
