import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { Coords } from '@eddy/geo';
import { useAppConfig } from '@/hooks/useAppConfig';
import { useCampingOverview } from '@/hooks/useCampingOverview';
import { useCampingRanking } from '@/hooks/useCampingRanking';
import { CampingGrid } from './CampingGrid';
import {
  cardSummary,
  currentNight,
  checkedLabel,
  dateLabel,
  distance,
  todayCampgrounds,
  weekendLine,
} from '@/lib/campingHeatmap';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

export function TodayCamping(props: {
  coords: Coords | null;
  saved: ReadonlySet<string>;
  revision: number;
}) {
  const { features } = useAppConfig();
  return features.campingHeatmap ? <CampingCard {...props} /> : null;
}
function CampingCard({
  coords,
  saved,
  revision,
}: {
  coords: Coords | null;
  saved: ReadonlySet<string>;
  revision: number;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const { data, loading, error, refresh, now } = useCampingOverview(
    true,
    revision,
  );
  const rankingCoords = useCampingRanking(coords, revision);
  const selection = useMemo(
    () => todayCampgrounds(data?.tracked ?? [], rankingCoords, saved),
    [data, rankingCoords, saved],
  );
  const hasFresh =
    !!data &&
    selection.rows.some((row) =>
      data.horizon.nights.some((date) =>
        currentNight(row, date, data.maxObservationAgeSeconds, now),
      ),
    );
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.title, { color: colors.text }]}>
        {selection.title}
      </Text>
      {data ? (
        <>
          <Text style={[styles.copy, { color: colors.textMuted }]}>
            {data.weekend.label} · 14 nights from {dateLabel(data.horizon.startDate)}
          </Text>
          <Text style={[styles.copy, { color: colors.textMuted }]}>
            {selection.rows.length
              ? cardSummary(selection.rows, data, now)
              : 'Browse campgrounds and check directly.'}
          </Text>
          {hasFresh ? (
            <CampingGrid overview={data} now={now} headings />
          ) : (
            <Text style={[styles.copy, { color: colors.textMuted }]}>
              Availability needs an update. Campground links are still
              available.
            </Text>
          )}
          {(hasFresh ? selection.rows.slice(0, 4) : []).map((row) => {
            const miles = distance(row, coords);
            const copy = weekendLine(row, data, now);
            return (
              <Pressable
                key={row.id}
                onPress={() =>
                  router.push({
                    pathname: '/camping',
                    params: { facility: row.facilityId },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`${row.name}. ${copy}. ${checkedLabel(row.latestObservationAt)}`}
                style={[styles.row, { borderColor: colors.border }]}
              >
                <Text style={[styles.name, { color: colors.text }]}>
                  {row.name}
                  {Number.isFinite(miles) ? ` · ${Math.round(miles)} mi` : ''}
                </Text>
                <CampingGrid row={row} overview={data} now={now} />
                <Text style={[styles.copy, { color: colors.textMuted }]}>
                  {copy}
                </Text>
                <Text style={[styles.small, { color: colors.textSubtle }]}>
                  {checkedLabel(row.latestObservationAt)}
                </Text>
              </Pressable>
            );
          })}
        </>
      ) : loading ? (
        <View style={styles.loading}>
          <ActivityIndicator
            color={colors.interactive}
            accessibilityLabel="Loading camping availability"
          />
        </View>
      ) : null}
      {error ? (
        <Pressable
          onPress={refresh}
          accessibilityRole="button"
          style={styles.action}
        >
          <Text style={{ color: colors.interactive }}>
            Couldn’t update availability. Retry
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => router.push('/camping')}
        accessibilityRole="button"
        style={styles.action}
      >
        <Text style={{ color: colors.interactive, fontFamily: fonts.semibold }}>
          See all camping →
        </Text>
      </Pressable>
      <Text style={[styles.small, { color: colors.textSubtle }]}>
        Reservable sites only{coords ? ' · Straight-line distances' : ''}
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    padding: 16,
    borderWidth: 1,
    borderRadius: 20,
    gap: 6,
  },
  title: { fontFamily: fonts.display, fontSize: 22 },
  copy: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  name: { fontFamily: fonts.semibold, fontSize: 14 },
  small: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16 },
  row: { paddingVertical: 10, borderBottomWidth: 1, gap: 4, minHeight: 44 },
  action: { minHeight: 44, justifyContent: 'center' },
  loading: { minHeight: 120, justifyContent: 'center' },
});
