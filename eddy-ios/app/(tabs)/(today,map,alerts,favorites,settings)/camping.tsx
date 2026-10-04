import { useMemo, useReducer, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  TextInput,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { Stack, useLocalSearchParams } from 'expo-router';
import { NativeHeaderHome } from '@/components/NativeHeaderHome';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles } from '@/theme/typography';
import { useAppConfig } from '@/hooks/useAppConfig';
import { useCampingOverview } from '@/hooks/useCampingOverview';
import { useLocation } from '@/hooks/useLocation';
import {
  CampingScrollGroup,
  CampingTableHeader,
  CampingTableRow,
} from '@/components/CampingGrid';
import { useStarredRivers } from '@/hooks/useStarredRivers';
import { CampgroundThumbnail } from '@/components/CampgroundThumbnail';
import { CampingDetailSheet } from '@/components/CampingDetailSheet';
import {
  campingRiverOptions,
  observedCampingOverview,
  campingCoverageLabel,
  campingFreshness,
  safeExternalUrl,
  campingRiverGroups,
  linkedCampingNight,
} from '@/lib/campingHeatmap';
import { nextCampingDate } from '@/lib/campingStay';
import { campingFilterReducer, filterCampingScope, initialCampingFilters, type CampingScope } from '@/lib/campingFilters';
import { ScopeSwitch } from '@/components/ScopeSwitch';
import { CampingNightControl } from '@/components/CampingNightControl';
import { CampingAvailabilityRow } from '@/components/CampingAvailabilityRow';
import { useScreenReaderEnabled } from '@/hooks/useScreenReaderEnabled';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export default function CampingScreen() {
  const { features, loading } = useAppConfig();
  const { colors } = useTheme();
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.bg }}
      edges={['left', 'right']}
    >
      <NativeHeaderHome destination="today" />
      {/* Horizontal dates must never be interpreted as the native back swipe. */}
      <Stack.Screen options={{ gestureEnabled: false }} />
      {features.campingHeatmap ? (
        <CampingContent />
      ) : (
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.empty}>
          {loading ? <ActivityIndicator color={colors.interactive} /> :
            <Text style={[styles.message, { color: colors.textMuted }]}>Camping availability is unavailable.</Text>}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
function CampingContent() {
  const { colors } = useTheme();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  // RN's sticky-header animation includes explicit contentInset.top, not the
  // UIKit automatic adjustment. Match both the content and sticky stop to the
  // measured native bar, while letting ordinary rows scroll underneath it.
  const listTopInset = Platform.OS === 'ios' ? headerHeight : 0;
  const listBottomInset = Platform.OS === 'ios' ? insets.bottom : 0;
  const { fontScale } = useWindowDimensions();
  const screenReader = useScreenReaderEnabled();
  const reducedMotion = useReducedMotion();
  const [displayChoice, setDisplayChoice] = useState<'grid' | 'list' | null>(null);
  const display = displayChoice ?? (screenReader || fontScale >= 1.3 ? 'list' : 'grid');
  const [nightChoice, setNightChoice] = useState<string | null>(null);
  const [openedNight, setOpenedNight] = useState<string | undefined>();
  const params = useLocalSearchParams<{ facility?: string; river?: string; night?: string }>();
  const [selected, setSelected] = useState<string | null>(
    params.facility ?? null,
  );
  const [riverPicker, setRiverPicker] = useState(false);
  const [query, setQuery] = useState('');
  const { starred } = useStarredRivers();
  // Today's river link seeds the scope; changing filters never remounts the list.
  const [filters, dispatchFilter] = useReducer(campingFilterReducer, params.river, initialCampingFilters);
  const locationRequest = useRef(0);
  const [directory, setDirectory] = useState(false);
  const [linkFailed, setLinkFailed] = useState(false);
  const { coords, status, request } = useLocation();
  const { data, loading, extending, error, refresh, now } = useCampingOverview();
  const rivers = useMemo(
    () => campingRiverOptions(data?.tracked ?? [], data?.untracked ?? []),
    [data],
  );
  const scope = useMemo<CampingScope>(() => {
    const choice = filters.scope;
    return data && choice.kind === 'river' && !rivers.some((r) => r.slug === choice.slug)
      ? { kind: 'all' }
      : choice;
  }, [data, filters.scope, rivers]);
  const river = scope.kind === 'river' ? scope.slug : null;
  const saved = scope.kind === 'favorites';
  const nearby = scope.kind === 'nearby';
  const locating = filters.locationRequest !== null;
  const favoriteRivers = useMemo(() => new Set(
    starred.filter((s) => s.kind === 'river').map((s) => s.slug),
  ), [starred]);
  const rows = useMemo(() => campingRiverGroups(
    filterCampingScope(data?.tracked ?? [], scope, coords, favoriteRivers),
  ).flatMap((group) => group.data), [data, scope, coords, favoriteRivers]);
  const other = useMemo(() => campingRiverGroups(
    filterCampingScope(data?.untracked ?? [], scope, coords, favoriteRivers),
  ).flatMap((group) => group.data), [data, scope, coords, favoriteRivers]);
  function selectScope(next: CampingScope) {
    dispatchFilter({ type: 'select', scope: next });
    setLinkFailed(false);
  }
  function locateNearby() {
    setLinkFailed(false);
    if (coords) {
      selectScope({ kind: 'nearby' });
      return;
    }
    const id = ++locationRequest.current;
    dispatchFilter({ type: 'locate', request: id });
    void request().then((fix) => {
      dispatchFilter({ type: 'located', request: id, found: fix !== null });
    });
  }
  const riverHeaders = new Map(
    campingRiverGroups(rows).map((group) => [
      group.data[0].facilityId,
      group.title,
    ]),
  );
  const directoryHeaders = new Map(
    campingRiverGroups(other).map((group) => [group.data[0].id, group.title]),
  );
  const detail = data?.tracked.find((r) => r.facilityId === selected);
  const linkedNight = data ? linkedCampingNight(data, params.night) : undefined;
  const night = data ? linkedCampingNight(data, nightChoice) ?? linkedNight ?? data.horizon.startDate : '';
  const detailNight = data ? linkedCampingNight(data, openedNight) ?? linkedNight : undefined;
  const grid = useMemo(() => data ? observedCampingOverview(data.tracked, data, now) : null, [data, now]);
  if (!data || !grid)
    return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.empty}>{loading ? (
      <ActivityIndicator color={colors.interactive} />
    ) : (
      <Pressable
        accessibilityRole="button"
        onPress={refresh}
        style={styles.message}
      >
        <Text style={{ color: colors.interactive }}>
          Couldn’t load camping. Retry
        </Text>
      </Pressable>
    )}</ScrollView>;
  // Keep the same date columns and horizontal position across every scope.
  // Missing observations in a filtered river remain explicit unknown cells.

  return (
    <>
      <Modal
        visible={riverPicker}
        animationType={reducedMotion ? 'none' : 'slide'}
        presentationStyle="pageSheet"
        onRequestClose={() => setRiverPicker(false)}
      >
        <SafeAreaView
          style={{ flex: 1, backgroundColor: colors.bg, padding: 20 }}
          onAccessibilityEscape={() => setRiverPicker(false)}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Text style={[textStyles.sectionTitle, { color: colors.text }]}>
              Rivers
            </Text>
            <Pressable
              accessibilityRole="button"
              style={styles.action}
              onPress={() => setRiverPicker(false)}
            >
              <Text style={{ color: colors.interactive }}>Done</Text>
            </Pressable>
          </View>
          <TextInput
            accessibilityLabel="Search rivers"
            placeholder="Search rivers"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            style={{
              minHeight: 48,
              color: colors.text,
              borderBottomWidth: 1,
              borderColor: colors.border,
            }}
          />
          <FlatList
            data={[
              { slug: '', label: 'All rivers' },
              ...rivers.filter((r) =>
                r.label.toLowerCase().includes(query.toLowerCase()),
              ),
            ]}
            keyExtractor={(r) => r.slug}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: (river ?? '') === item.slug }}
                style={styles.action}
                onPress={() => {
                  selectScope(item.slug ? { kind: 'river', slug: item.slug } : { kind: 'all' });
                  setRiverPicker(false);
                }}
              >
                <Text
                  style={{
                    color:
                      (river ?? '') === item.slug
                        ? colors.interactive
                        : colors.text,
                  }}
                >
                  {item.label}
                </Text>
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
      <CampingScrollGroup
        thumbnails
        dateWidth={36}
        columnCount={grid.horizon.nights.length}
        // Only a new calendar horizon resets the date offset, never a filter.
        key={grid.horizon.startDate}
      >
        <FlatList
          initialNumToRender={8}
          maxToRenderPerBatch={4}
          windowSize={5}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          automaticallyAdjustsScrollIndicatorInsets={false}
          contentInset={{ top: listTopInset, bottom: listBottomInset, left: 0, right: 0 }}
          contentOffset={{ x: 0, y: -listTopInset }}
          scrollIndicatorInsets={{ top: listTopInset, bottom: listBottomInset, left: 0, right: 0 }}
          // The first data cell is the month/date row; filters/caption stay in the
          // scrolling ListHeaderComponent. Index 1 accounts for that header.
          data={[null, ...rows]}
          keyExtractor={(row) => row?.facilityId ?? 'camping-dates'}
          refreshing={loading && !extending}
          onRefresh={refresh}
          contentContainerStyle={styles.list}
          stickyHeaderIndices={display === 'grid' ? [1] : undefined}
          ListHeaderComponent={
            <View style={{ backgroundColor: colors.bg, paddingBottom: 6 }}>
              <View style={styles.filterHeader}>
                <ScrollView
                  horizontal
                  style={{ flexGrow: 0, flexShrink: 0 }}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filters}
                >
                  <CampingFilterChip
                    label={rivers.find((r) => r.slug === river)?.label ?? 'All rivers'}
                    active={!nearby && !saved}
                    onPress={() => {
                      if (nearby || saved || locating || filters.locationFailed) {
                        selectScope({ kind: 'all' });
                      } else {
                        setQuery('');
                        setRiverPicker(true);
                      }
                    }}
                  />
                  <CampingFilterChip label="Favorites" active={saved} onPress={() => {
                    selectScope({ kind: saved ? 'all' : 'favorites' });
                  }} />
                  <CampingFilterChip label={locating ? 'Locating…' : 'Nearby'} active={nearby} busy={locating} onPress={() => {
                    if (nearby || locating) selectScope({ kind: 'all' });
                    else locateNearby();
                  }} />
                </ScrollView>
                <ScopeSwitch
                  options={[
                    { key: 'grid', label: 'Grid', accessibilityLabel: 'Camping availability grid' },
                    { key: 'list', label: 'List', accessibilityLabel: 'Camping availability list by night' },
                  ]}
                  value={display}
                  onChange={setDisplayChoice}
                />
                {filters.locationFailed ? (
                  <View style={styles.notice}>
                    <Text style={{ color: colors.textMuted }}>
                      {status === 'denied'
                        ? 'Location access is off.'
                        : 'Couldn’t find your location.'}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
                      <Pressable
                        accessibilityRole="button"
                        style={styles.action}
                        onPress={() => {
                          if (status === 'denied')
                            void Linking.openSettings().catch(() => setLinkFailed(true));
                          else locateNearby();
                        }}
                      >
                        <Text style={{ color: colors.interactive }}>
                          {status === 'denied' ? 'Open Settings' : 'Retry'}
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        style={styles.action}
                        onPress={() => {
                          selectScope({ kind: 'all' });
                        }}
                      >
                        <Text style={{ color: colors.interactive }}>Show all</Text>
                      </Pressable>
                    </View>
                    {linkFailed ? (
                      <Text style={{ color: colors.error }}>
                        Couldn’t open Settings. Enable location in your device settings.
                      </Text>
                    ) : null}
                  </View>
                ) : nearby && coords ? (
                  <Pressable
                    onPress={() => {
                      selectScope({ kind: 'all' });
                    }}
                    accessibilityRole="button"
                    style={styles.notice}
                  >
                    <Text style={{ color: colors.interactive }}>
                      Within 120 miles · Show all
                    </Text>
                  </Pressable>
                ) : null}
                {extending ? <Text style={{ color: colors.textMuted }}>Loading more dates…</Text> : null}
                {error ? (
                  <Pressable
                    onPress={refresh}
                    accessibilityRole="button"
                    style={styles.notice}
                  >
                    <Text style={{ color: colors.interactive }}>
                      {data.horizon.nights.length < 90 ? 'Couldn’t load more dates. Retry' : 'Couldn’t refresh. Retry'}
                    </Text>
                  </Pressable>
                ) : null}

              </View>
              <Text
                style={[
                  textStyles.caption,
                  { color: colors.textMuted, paddingVertical: 8 },
                ]}
              >
                {campingCoverageLabel(grid)}
              </Text>
            </View>
          }
          renderItem={({ item }) => item === null ? (
            <View style={[display === 'list' && styles.dateHeader, { backgroundColor: colors.bg }]}>
              {display === 'grid' ? <CampingTableHeader overview={grid} now={now} /> :
                <CampingNightControl nights={data.horizon.nights} selected={night} onSelect={setNightChoice} />}
            </View>
          ) : (
            <View>
              {riverHeaders.has(item.facilityId) ? (
                <Text
                  accessibilityRole="header"
                  style={[
                    textStyles.cardTitle,
                    { color: colors.text, paddingTop: 18, paddingBottom: 8 },
                  ]}
                >
                  {riverHeaders.get(item.facilityId)}
                </Text>
              ) : null}
              {display === 'list' ? <CampingAvailabilityRow
                row={item} overview={data} now={now} night={night}
                onPress={() => { setOpenedNight(night); setSelected(item.facilityId); }}
              /> : <CampingTableRow
                row={item}
                overview={grid}
                now={now}
                onPress={() => { setOpenedNight(linkedNight); setSelected(item.facilityId); }}
              />}
            </View>
          )}
          ListFooterComponent={
            <View>
              {/* The date cell keeps the list nonempty even with no results. */}
              {rows.length === 0 ? (
                <Text style={[styles.message, { color: colors.textMuted }]}>
                  No campgrounds match these filters.
                </Text>
              ) : null}
              {rows.length ? (
                <Text
                  style={[textStyles.caption, { color: colors.textSubtle }]}
                >
                  {campingFreshness(rows, data, now)} · Reservable sites only
                </Text>
              ) : null}
              {other.length ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: directory }}
                  onPress={() => setDirectory((v) => !v)}
                  style={styles.directory}
                >
                  <Text
                    style={{
                      fontFamily: fonts.semibold,
                      color: colors.interactive,
                    }}
                  >
                    More campgrounds ({other.length}) {directory ? '−' : '+'}
                  </Text>
                </Pressable>
              ) : null}
              {directory ? (
                <>
                  <Text
                    style={[textStyles.caption, { color: colors.textMuted }]}
                  >
                    Check availability with the campground.
                  </Text>
                  {other.map((row) => {
                    const url = safeExternalUrl(
                      row.reservationUrl ?? row.website,
                    );
                    return (
                      <View key={row.id}>
                        {directoryHeaders.has(row.id) ? (
                          <Text
                            accessibilityRole="header"
                            style={[
                              textStyles.cardTitle,
                              {
                                color: colors.text,
                                paddingTop: 18,
                                paddingBottom: 8,
                              },
                            ]}
                          >
                            {directoryHeaders.get(row.id)}
                          </Text>
                        ) : null}
                        <View
                          style={[
                            styles.directoryRow,
                            { borderColor: colors.border },
                          ]}
                        >
                          <CampgroundThumbnail url={row.imageUrl} />
                          <Text
                            style={[
                              textStyles.body,
                              { color: colors.text, flex: 1 },
                            ]}
                          >
                            {row.name}
                          </Text>
                          {url ? (
                            <Pressable
                              accessibilityRole="link"
                              accessibilityLabel={`Check availability for ${row.name}`}
                              style={styles.action}
                              onPress={() => {
                                setLinkFailed(false);
                                void Linking.openURL(url).catch(() =>
                                  setLinkFailed(true),
                                );
                              }}
                            >
                              <Text style={{ color: colors.interactive }}>
                                Check ↗
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                  {linkFailed ? (
                    <Text style={{ color: colors.error }}>
                      Couldn’t open the link. Try again.
                    </Text>
                  ) : null}
                </>
              ) : null}
            </View>
          }
        />
      </CampingScrollGroup>
      {detail ? (
        <CampingDetailSheet
          key={detail.facilityId}
          row={detail}
          overview={data}
          now={now}
          initialStay={detailNight ? { arrival: detailNight, departure: nextCampingDate(detailNight) } : undefined}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}
function CampingFilterChip({ label, active, onPress, busy = false }: {
  label: string;
  active: boolean;
  onPress: () => void;
  busy?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, busy }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.selectionBg : colors.card,
          borderColor: active ? colors.interactive : colors.border,
        },
      ]}
    >
      <Text style={{ color: active ? colors.interactive : colors.text, fontFamily: fonts.medium }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  empty: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  action: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  dateHeader: { paddingBottom: 6 },
  filterHeader: { marginHorizontal: -20 },
  filters: { paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
  chip: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 44,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  message: { padding: 20 },
  notice: { paddingHorizontal: 20, paddingVertical: 10, minHeight: 44 },
  directory: { minHeight: 48, justifyContent: 'center', marginTop: 16 },
  directoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
