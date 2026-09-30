import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
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
  filterCamping,
  safeExternalUrl,
  campingRiverGroups,
  linkedCampingNight,
} from '@/lib/campingHeatmap';
import { nextCampingDate } from '@/lib/campingStay';
import { ScopeSwitch } from '@/components/ScopeSwitch';
import { CampingNightControl } from '@/components/CampingNightControl';
import { CampingAvailabilityRow } from '@/components/CampingAvailabilityRow';
import { useScreenReaderEnabled } from '@/hooks/useScreenReaderEnabled';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { goBack } from '@/lib/nav';

export default function CampingScreen() {
  const { features, loading } = useAppConfig();
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.bg }}
      edges={['top', 'bottom']}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable
          onPress={() => goBack(router)}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.action}
        >
          <Text style={{ color: colors.interactive }}>← Back</Text>
        </Pressable>
        <Text style={[textStyles.pageTitle, { color: colors.text }]}>
          Camping
        </Text>
      </View>
      {features.campingHeatmap ? (
        <CampingContent />
      ) : loading ? (
        <ActivityIndicator color={colors.interactive} />
      ) : (
        <Text style={[styles.message, { color: colors.textMuted }]}>
          Camping availability is unavailable.
        </Text>
      )}
    </SafeAreaView>
  );
}
function CampingContent() {
  const { colors } = useTheme();
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
  const [saved, setSaved] = useState(false);
  const [riverPicker, setRiverPicker] = useState(false);
  const [query, setQuery] = useState('');
  const { starred } = useStarredRivers();
  // A river deep link (e.g. from Today's camping demand card) preselects the
  // filter; an unknown slug falls back to all rivers once the catalog loads.
  const [riverChoice, setRiver] = useState<string | null>(
    typeof params.river === 'string' && /^[a-z0-9-]{1,80}$/.test(params.river)
      ? params.river
      : null,
  );
  const [nearby, setNearby] = useState(false);
  const [directory, setDirectory] = useState(false);
  const [linkFailed, setLinkFailed] = useState(false);
  const { coords, status, request } = useLocation();
  const { data, loading, error, refresh, now } = useCampingOverview();
  const rivers = useMemo(
    () => campingRiverOptions(data?.tracked ?? [], data?.untracked ?? []),
    [data],
  );
  const river =
    data && riverChoice && !rivers.some((r) => r.slug === riverChoice)
      ? null
      : riverChoice;
  const rows = useMemo(() => {
    const slugs = new Set(
      starred.filter((s) => s.kind === 'river').map((s) => s.slug),
    );
    const filtered = filterCamping(
      data?.tracked ?? [],
      river,
      nearby,
      coords,
    ).filter((row) => !saved || row.riverSlugs.some((slug) => slugs.has(slug)));
    return campingRiverGroups(filtered).flatMap((group) => group.data);
  }, [data, river, nearby, coords, starred, saved]);
  const other = useMemo(
    () =>
      campingRiverGroups(
        filterCamping(data?.untracked ?? [], river, nearby, coords).filter(
          (row) =>
            !saved ||
            row.riverSlugs.some((slug) =>
              starred.some((s) => s.kind === 'river' && s.slug === slug),
            ),
        ),
      ).flatMap((group) => group.data),
    [data, river, nearby, coords, saved, starred],
  );
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
  if (!data)
    return loading ? (
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
    );
  const grid = observedCampingOverview(rows, data, now);
  function chip(label: string, active: boolean, onPress: () => void) {
    return (
      <Pressable
        key={label}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        onPress={onPress}
        style={[
          styles.chip,
          {
            backgroundColor: active ? colors.selectionBg : colors.card,
            borderColor: active ? colors.interactive : colors.border,
          },
        ]}
      >
        <Text
          style={{
            color: active ? colors.interactive : colors.text,
            fontFamily: fonts.medium,
          }}
        >
          {label}
        </Text>
      </Pressable>
    );
  }
  return (
    <>
      <ScrollView
        horizontal
        style={{ flexGrow: 0, flexShrink: 0 }}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {chip(
          rivers.find((r) => r.slug === river)?.label ?? 'All rivers',
          !nearby && !saved,
          () => {
            if (nearby || saved) {
              setNearby(false);
              setSaved(false);
              setRiver(null);
            } else {
              setQuery('');
              setRiverPicker(true);
            }
          },
        )}
        {chip('Favorites', saved, () => {
          setSaved((v) => !v);
          setNearby(false);
          setRiver(null);
        })}
        {chip(status === 'locating' ? 'Locating…' : 'Nearby', nearby, () => {
          setSaved(false);
          setRiver(null);
          if (nearby) setNearby(false);
          else {
            setNearby(true);
            if (!coords) void request();
          }
        })}
      </ScrollView>
      <ScopeSwitch
        options={[
          { key: 'grid', label: 'Grid', accessibilityLabel: 'Camping availability grid' },
          { key: 'list', label: 'List', accessibilityLabel: 'Camping availability list by night' },
        ]}
        value={display}
        onChange={setDisplayChoice}
      />
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
                  setRiver(item.slug || null);
                  setNearby(false);
                  setSaved(false);
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
      {nearby && !coords && status !== 'locating' ? (
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
                else void request();
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
                setNearby(false);
                setSaved(false);
                setRiver(null);
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
            setNearby(false);
            setSaved(false);
            setRiver(null);
          }}
          accessibilityRole="button"
          style={styles.notice}
        >
          <Text style={{ color: colors.interactive }}>
            Within 120 miles · Show all
          </Text>
        </Pressable>
      ) : null}
      {error ? (
        <Pressable
          onPress={refresh}
          accessibilityRole="button"
          style={styles.notice}
        >
          <Text style={{ color: colors.interactive }}>
            Couldn’t refresh. Retry
          </Text>
        </Pressable>
      ) : null}
      <CampingScrollGroup
        thumbnails
        dateWidth={36}
        key={`${river}:${nearby}:${grid.horizon.endDateExclusive}`}
      >
        <FlatList
          data={rows}
          keyExtractor={(row) => row.facilityId}
          refreshing={loading}
          onRefresh={refresh}
          contentContainerStyle={styles.list}
          stickyHeaderIndices={display === 'grid' ? [0] : undefined}
          ListHeaderComponent={
            <View style={{ backgroundColor: colors.bg, paddingBottom: 6 }}>
              <Text
                style={[
                  textStyles.caption,
                  { color: colors.textMuted, paddingVertical: 8 },
                ]}
              >
                {campingCoverageLabel(grid)}
              </Text>
              {display === 'grid' ? <CampingTableHeader overview={grid} now={now} /> :
                <CampingNightControl nights={data.horizon.nights} selected={night} onSelect={setNightChoice} />}
            </View>
          }
          renderItem={({ item }) => (
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
          ListEmptyComponent={
            <Text style={[styles.message, { color: colors.textMuted }]}>
              No campgrounds match these filters.
            </Text>
          }
          ListFooterComponent={
            <View>
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
const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 8 },
  action: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
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
