import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { CampingOverview, TrackedCampground } from '@eddy/types';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import { useAppConfig } from '@/hooks/useAppConfig';
import { useCampingOverview } from '@/hooks/useCampingOverview';
import { useCampingRanking } from '@/hooks/useCampingRanking';
import { useLocation } from '@/hooks/useLocation';
import { useStarredRivers } from '@/hooks/useStarredRivers';
import { CampingGrid, CampingLegend } from '@/components/CampingGrid';
import { CampingSites } from '@/components/CampingSites';
import {
  campingSections,
  cardSummary,
  checkedLabel,
  currentNight,
  dateLabel,
  distance,
  nightLine,
  safeExternalUrl,
  sortCamping,
  weekendLine,
} from '@/lib/campingHeatmap';

function ExternalLink({ url, label }: { url: string | null; label: string }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const safe = safeExternalUrl(url);
  if (!safe) return null;
  return (
    <View>
      <Pressable
        accessibilityRole="link"
        onPress={() => {
          void Linking.openURL(safe).catch(() => setFailed(true));
        }}
        style={styles.action}
      >
        <Text style={[styles.link, { color: colors.interactive }]}>
          {label} ↗
        </Text>
      </Pressable>
      {failed ? (
        <Text style={{ color: colors.textMuted }}>
          Couldn’t open this link. Please try again.
        </Text>
      ) : null}
    </View>
  );
}
function ExpandedCampground({
  row,
  data,
  now,
}: {
  row: TrackedCampground;
  data: CampingOverview;
  now: number;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const [week, setWeek] = useState(0);
  const [selected, setSelected] = useState(data.horizon.startDate);
  const date = data.horizon.nights.includes(selected)
    ? selected
    : data.horizon.startDate;
  const n = currentNight(row, date, data.maxObservationAgeSeconds, now);
  return (
    <View style={[styles.expanded, { backgroundColor: colors.cardRaised }]}>
      <View style={styles.between}>
        <Text style={[styles.name, { color: colors.text }]}>
          Choose a night
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={week ? 'Show first week' : 'Show second week'}
          style={styles.action}
          onPress={() => setWeek((w) => (w ? 0 : 1))}
        >
          <Text style={{ color: colors.interactive }}>
            {week ? '← First week' : 'Next week →'}
          </Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.picker}
      >
        {data.horizon.nights.slice(week * 7, week * 7 + 7).map((d) => (
          <Pressable
            key={d}
            accessibilityRole="button"
            accessibilityState={{ selected: date === d }}
            accessibilityLabel={`${dateLabel(d)}. ${nightLine(currentNight(row, d, data.maxObservationAgeSeconds, now))}`}
            onPress={() => setSelected(d)}
            style={[
              styles.day,
              {
                borderColor: date === d ? colors.interactive : colors.border,
                backgroundColor: date === d ? colors.selectionBg : colors.card,
              },
            ]}
          >
            <Text style={{ color: colors.text, fontFamily: fonts.semibold }}>
              {dateLabel(d, true)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={[styles.name, { color: colors.text }]}>
        {dateLabel(date)} · {nightLine(n)}
      </Text>
      <Text style={[styles.copy, { color: colors.textMuted }]}>
        {checkedLabel(n?.checkedAt ?? null)}
      </Text>
      <Text style={[styles.copy, { color: colors.textMuted }]}>
        {[
          row.displayGroup.key !== 'other' ? row.displayGroup.label : null,
          row.managingAgency,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {row.firstCome === 'present' ? (
        <Text style={[styles.copy, { color: colors.textMuted }]}>
          Also has first-come sites; availability is not tracked.
        </Text>
      ) : null}
      <ExternalLink
        url={row.booking?.url ?? null}
        label={row.booking?.label ?? 'Check and book'}
      />
      <ExternalLink url={row.website} label="Campground website" />
      {row.accessDestination ? (
        <Pressable
          accessibilityRole="button"
          style={styles.action}
          onPress={() =>
            router.push({
              pathname: '/',
              params: {
                focusAccess: row.accessDestination!.accessId,
                focusRiver: row.accessDestination!.riverSlug,
              },
            })
          }
        >
          <Text style={[styles.link, { color: colors.interactive }]}>
            Open campground on map →
          </Text>
        </Pressable>
      ) : null}
      <CampingSites
        key={row.facilityId}
        facilityId={row.facilityId}
        date={date}
        bookingUrl={row.booking?.url}
      />
    </View>
  );
}
export default function CampingScreen() {
  const { features, loading } = useAppConfig();
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.bg }]}
      edges={['top']}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={styles.action}
        >
          <Text style={[styles.link, { color: colors.interactive }]}>
            ← Back
          </Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>
          Find a campsite
        </Text>
      </View>
      {features.campingHeatmap ? (
        <CampingContent />
      ) : loading ? (
        <ActivityIndicator color={colors.interactive} />
      ) : (
        <Text style={[styles.message, { color: colors.textMuted }]}>
          Camping availability is not available in this build yet.
        </Text>
      )}
    </SafeAreaView>
  );
}
function CampingContent() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ facility?: string }>();
  const [expanded, setExpanded] = useState<string | null>(
    params.facility ?? null,
  );
  const { coords: locationCoords } = useLocation();
  const [revision, setRevision] = useState(0);
  const coords = useCampingRanking(locationCoords, revision);
  const { starred } = useStarredRivers();
  const saved = useMemo(
    () =>
      new Set(
        starred.filter((s) => s.kind === 'river' && s.slug).map((s) => s.slug!),
      ),
    [starred],
  );
  const { data, loading, error, refresh, now } = useCampingOverview();
  const sections = useMemo(
    () => campingSections(data?.tracked ?? [], coords, saved),
    [data, coords, saved],
  );
  // Pin the explicitly requested campground first so opening a Today row never lands offscreen.
  const visible = useMemo(() => {
    const requested = params.facility
      ? data?.tracked.find((r) => r.facilityId === params.facility)
      : null;
    return requested
      ? [
          { title: 'Selected campground', data: [requested] },
          ...sections
            .map((s) => ({
              ...s,
              data: s.data.filter((r) => r.facilityId !== requested.facilityId),
            }))
            .filter((s) => s.data.length),
        ]
      : sections;
  }, [sections, data, params.facility]);
  if (!data)
    return (
      <View style={styles.message}>
        {loading ? (
          <ActivityIndicator color={colors.interactive} />
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={refresh}
            style={styles.action}
          >
            <Text style={{ color: colors.interactive }}>
              Couldn’t load camping. Tap to retry.
            </Text>
          </Pressable>
        )}
      </View>
    );
  return (
    <SectionList
      sections={visible}
      keyExtractor={(r) => r.facilityId}
      refreshing={loading}
      onRefresh={() => {
        setRevision((v) => v + 1);
        refresh();
      }}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View>
          <Text style={[styles.copy, { color: colors.textMuted }]}>
            {dateLabel(data.horizon.startDate)} —{' '}
            {dateLabel(data.horizon.nights[13])}
          </Text>
          <Text style={[styles.copy, { color: colors.textMuted }]}>
            {cardSummary(data.tracked, data, now)}
          </Text>
          <Text style={[styles.copy, { color: colors.textMuted }]}>
            Reservable sites only · Underlined dates: {data.weekend.label}
          </Text>
          <CampingLegend />
          {error ? (
            <Text style={{ color: colors.textMuted }}>
              Couldn’t refresh. Displaying the last received data.
            </Text>
          ) : null}
          {params.facility &&
          !data.tracked.some((r) => r.facilityId === params.facility) ? (
            <Text style={{ color: colors.textMuted }}>
              That campground is no longer tracked. Browse the directory below.
            </Text>
          ) : null}
          <View style={{ paddingHorizontal: 12 }}>
            <CampingGrid overview={data} now={now} headings />
          </View>
        </View>
      }
      renderSectionHeader={({ section }) => (
        <Text
          accessibilityRole="header"
          style={[styles.section, { color: colors.text }]}
        >
          {section.title}
        </Text>
      )}
      renderItem={({ item: row }) => {
        const miles = distance(row, coords);
        return (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Pressable
              style={styles.row}
              accessibilityRole="button"
              accessibilityState={{ expanded: expanded === row.facilityId }}
              accessibilityLabel={`${row.name}. ${weekendLine(row, data, now)}. ${checkedLabel(row.latestObservationAt)}`}
              onPress={() =>
                setExpanded((v) =>
                  v === row.facilityId ? null : row.facilityId,
                )
              }
            >
              <Text style={[styles.name, { color: colors.text }]}>
                {row.name}
              </Text>
              {Number.isFinite(miles) ? (
                <Text style={[styles.copy, { color: colors.textMuted }]}>
                  {Math.round(miles)} miles · straight line
                </Text>
              ) : null}
              <CampingGrid row={row} overview={data} now={now} />
              <Text style={[styles.copy, { color: colors.textMuted }]}>
                {weekendLine(row, data, now)}
              </Text>
              <Text style={[styles.small, { color: colors.textSubtle }]}>
                {checkedLabel(row.latestObservationAt)}
              </Text>
            </Pressable>
            {expanded === row.facilityId ? (
              <ExpandedCampground row={row} data={data} now={now} />
            ) : null}
          </View>
        );
      }}
      ListFooterComponent={
        <View>
          <Text
            accessibilityRole="header"
            style={[styles.section, { color: colors.text }]}
          >
            Other campgrounds
          </Text>
          <Text style={[styles.copy, { color: colors.textMuted }]}>
            Check with campground · These places have no active availability
            feed.
          </Text>
          {sortCamping(data.untracked, coords, saved).map((row) => (
            <View
              key={row.id}
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.name, { color: colors.text }]}>
                {row.name}
              </Text>
              <ExternalLink
                url={row.reservationUrl ?? row.website}
                label="Check with campground"
              />
            </View>
          ))}
        </View>
      }
    />
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  title: { fontFamily: fonts.display, fontSize: 28 },
  list: { padding: 20, paddingBottom: 60 },
  section: {
    fontFamily: fonts.heading,
    fontSize: 19,
    marginTop: 24,
    marginBottom: 12,
  },
  card: { borderRadius: 16, borderWidth: 1, padding: 12, marginBottom: 12 },
  row: { minHeight: 44, gap: 6 },
  name: { fontFamily: fonts.semibold, fontSize: 16 },
  copy: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20 },
  small: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16 },
  expanded: { padding: 12, marginTop: 12, borderRadius: 12, gap: 8 },
  between: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  picker: { gap: 6, paddingVertical: 8 },
  day: {
    minWidth: 60,
    minHeight: 48,
    padding: 10,
    borderWidth: 2,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  action: { minHeight: 44, justifyContent: 'center', paddingVertical: 8 },
  link: { fontFamily: fonts.semibold, fontSize: 14 },
  message: { padding: 24 },
});
