import { useMemo, useState } from 'react';
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
import {
  CampingLegend,
  CampingTableHeader,
  CampingTableRow,
} from './CampingGrid';
import { CampingDetailSheet } from './CampingDetailSheet';
import { campingFreshness, todayCampgrounds } from '@/lib/campingHeatmap';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles } from '@/theme/typography';

type Props = {
  coords: Coords | null;
  saved: ReadonlySet<string>;
  revision: number;
};
export function TodayCamping(props: Props) {
  const { features } = useAppConfig();
  return features.campingHeatmap ? <CampingCard {...props} /> : null;
}
function CampingCard({ coords, saved, revision }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const { data, loading, error, refresh, now } = useCampingOverview(
    true,
    revision,
  );
  const rankingCoords = useCampingRanking(coords, revision);
  const [selected, setSelected] = useState<string | null>(null);
  const rows = useMemo(
    () =>
      todayCampgrounds(data?.tracked ?? [], rankingCoords, saved).rows.slice(
        0,
        4,
      ),
    [data, rankingCoords, saved],
  );
  const detail = data?.tracked.find((r) => r.facilityId === selected);
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.heading}>
        <Text style={[textStyles.cardTitle, { color: colors.text }]}>
          Camping
        </Text>
        <Text style={[textStyles.caption, { color: colors.textMuted }]}>
          Next 14 nights
        </Text>
      </View>
      {data ? (
        <>
          <CampingTableHeader overview={data} now={now} />
          {rows.map((row) => (
            <CampingTableRow
              key={row.facilityId}
              row={row}
              overview={data}
              now={now}
              onPress={() => setSelected(row.facilityId)}
            />
          ))}
          {!rows.length ? (
            <Text style={[textStyles.caption, { color: colors.textMuted }]}>
              No camping availability yet.
            </Text>
          ) : null}
          <CampingLegend />
          {rows.length ? (
            <Text style={[textStyles.caption, { color: colors.textSubtle }]}>
              {campingFreshness(rows, data, now)}
            </Text>
          ) : null}
        </>
      ) : loading ? (
        <ActivityIndicator
          style={{ padding: 24 }}
          accessibilityLabel="Loading camping availability"
          color={colors.interactive}
        />
      ) : null}
      {error ? (
        <Pressable
          onPress={refresh}
          accessibilityRole="button"
          style={styles.action}
        >
          <Text style={{ color: colors.interactive }}>
            Couldn’t refresh. Retry
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
      {detail && data ? (
        <CampingDetailSheet
          key={detail.facilityId}
          row={detail}
          overview={data}
          now={now}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    padding: 16,
    borderWidth: 1,
    borderRadius: 20,
    gap: 4,
  },
  heading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 8,
  },
  action: { minHeight: 44, justifyContent: 'center' },
});
