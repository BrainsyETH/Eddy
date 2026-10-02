import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { ControlIcon } from '@/components/ControlIcon';
import { useRouter } from 'expo-router';
import { useAppConfig } from '@/hooks/useAppConfig';
import { useCampingOverview } from '@/hooks/useCampingOverview';
import { todayCampingDemand, todayPopularCamping, campingPulseInfo, campingPulseReading, campingPulseAccessibilityLabel } from '@/lib/campingDemand';
import { campingDate } from '@/lib/campingHeatmap';
import { CampingDemandGauge } from './CampingDemandGauge';
import { CampingDemandMeter } from './CampingDemandMeter';
import { EddySymbol } from './EddySymbol';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles } from '@/theme/typography';
import { GaugeChartSheet } from '@/components/GaugeChartSheet';

type Props = { revision: number };

export function TodayCamping(props: Props) {
  const { features } = useAppConfig();
  return features.campingHeatmap
    ? <CampingCard {...props} showDemand={features.crowdSignal === true} />
    : null;
}

function CampingCard({ revision, showDemand }: Props & { showDemand: boolean }) {
  const { colors } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const stackRiverReadings = fontScale > 1.3 || width < 360;
  const router = useRouter();
  // Reuse the cached overview and its capacity baseline; no provider request.
  const { data, loading, error, refresh, now } = useCampingOverview(showDemand, revision, 21);
  const demand = useMemo(
    () => (data && showDemand ? todayCampingDemand(data, now) : null),
    [data, showDemand, now],
  );
  const riverRows = useMemo(
    () => data && showDemand ? todayPopularCamping(data, now) : [],
    [data, showDemand, now],
  );
  const openCamping = () => router.push({ pathname: '/camping', params: { night: campingDate(now) } });
  const [infoOpen, setInfoOpen] = useState(false);
  const showInfo = () => setInfoOpen(true);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {infoOpen ? <GaugeChartSheet title="Camping legend" onClose={() => setInfoOpen(false)}>
        <Text style={[textStyles.body, { color: colors.text }]}>{campingPulseInfo(demand)}</Text>
      </GaugeChartSheet> : null}
      <View style={styles.heading}>
        <View style={styles.title}>
          <EddySymbol name="campground" size={28} />
          <Text style={[textStyles.cardTitle, styles.titleText, { color: colors.text }]}>
            {showDemand ? 'Camping tonight' : 'Camping'}
          </Text>
        </View>
        {showDemand ? (
          <Pressable
            onPress={showInfo}
            accessibilityRole="button"
            accessibilityLabel="Camping legend"
            accessibilityHint="Explains the status bands and booked percentages"
            style={styles.info}
          >
            <ControlIcon name="information-circle-outline" size={22} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {demand ? (
        <CampingDemandGauge demand={demand} />
      ) : showDemand && loading ? (
        <ActivityIndicator
          style={styles.loading}
          accessibilityLabel="Loading tonight’s camping demand"
          color={colors.interactive}
        />
      ) : (
        <Text style={[textStyles.caption, { color: colors.textMuted }]}>
          {showDemand
            ? 'Tonight’s camping demand is unavailable.'
            : 'Explore campground availability across the Ozarks.'}
        </Text>
      )}
      {riverRows.length ? (
        <View style={[styles.rivers, { borderColor: colors.border }]}>
          <Text style={[textStyles.caption, { color: colors.textMuted }]}>Popular rivers</Text>
          {riverRows.map((row) => (
            <Pressable
              key={row.slug}
              onPress={() => router.push({ pathname: '/camping', params: { river: row.slug, night: row.demand.date } })}
              accessibilityRole="button"
              accessibilityLabel={campingPulseAccessibilityLabel(row.demand, row.name)}
              accessibilityHint="Opens campground availability on this river for tonight"
              style={styles.riverRow}
            >
              <View style={[styles.riverContent, stackRiverReadings && styles.stacked]}>
                <Text style={[styles.riverName, { color: colors.text }]}>{row.name}</Text>
                <View style={[styles.riverReading, stackRiverReadings && styles.readingWide]}>
                  <View style={styles.riverMeter}>
                    <CampingDemandMeter demand={row.demand} />
                  </View>
                  <Text style={[textStyles.caption, styles.readingLabel, { color: colors.text }]}>
                    <Text style={styles.percent}>{campingPulseReading(row.demand)?.label}</Text> booked
                  </Text>
                </View>
              </View>
              <ControlIcon name="chevron-forward" size={14} color={colors.textSubtle} />
            </Pressable>
          ))}
        </View>
      ) : null}
      {error && showDemand ? (
        <Pressable onPress={refresh} accessibilityRole="button" style={styles.action}>
          <ControlIcon name="alert-circle-outline" size={16} color={colors.text} />
          <Text style={[textStyles.caption, { color: colors.interactive }]}>
            Couldn’t refresh. Retry
          </Text>
        </Pressable>
      ) : null}
      <Pressable onPress={openCamping} accessibilityRole="button" style={styles.action}>
        <Text style={{ color: colors.interactive, fontFamily: fonts.semibold }}>
          See all camping →
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderWidth: 1, borderRadius: 20, gap: 4 },
  title: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  titleText: { flexShrink: 1 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  info: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  loading: { paddingVertical: 24 },
  rivers: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8, paddingTop: 10 },
  riverRow: { minHeight: 44, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  riverContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  riverName: { fontFamily: fonts.medium, fontSize: 14, flexGrow: 1, flexShrink: 1 },
  riverReading: { width: 152, flexDirection: 'row', alignItems: 'center', gap: 8 },
  riverMeter: { width: 48 },
  readingLabel: { flex: 1, textAlign: 'right' },
  percent: { fontFamily: fonts.monoMedium },
  stacked: { flexDirection: 'column', alignItems: 'stretch' },
  readingWide: { width: '100%' },
  action: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
});
