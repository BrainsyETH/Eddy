import { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  CAMPING_DEMAND_INFO,
  demandBasis,
  demandDetail,
} from '@eddy/conditions/camping-demand';
import { useAppConfig } from '@/hooks/useAppConfig';
import { useCampingOverview } from '@/hooks/useCampingOverview';
import { todayCampingDemand } from '@/lib/campingDemand';
import { CampingDemandGauge } from './CampingDemandGauge';
import { EddySymbol } from './EddySymbol';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles } from '@/theme/typography';

type Props = { revision: number };

export function TodayCamping(props: Props) {
  const { features } = useAppConfig();
  return features.campingHeatmap
    ? <CampingCard {...props} showDemand={features.crowdSignal === true} />
    : null;
}

function CampingCard({ revision, showDemand }: Props & { showDemand: boolean }) {
  const { colors } = useTheme();
  const router = useRouter();
  // Reuse the cached overview and its capacity baseline; no provider request.
  const { data, loading, error, refresh, now } = useCampingOverview(showDemand, revision, 21);
  const demand = useMemo(
    () => (data && showDemand ? todayCampingDemand(data, now) : null),
    [data, showDemand, now],
  );
  const openCamping = () => router.push('/camping');
  const showInfo = () => {
    const basis = demand
      ? `\n\n${demandBasis(demand)}.\n${demandDetail(demand)}.`
      : '';
    Alert.alert(
      'About Ozarks camping',
      `One reading for tonight across Eddy’s tracked Ozarks campgrounds, weighted by the number of reservable sites.\n\n${CAMPING_DEMAND_INFO}${basis}`,
    );
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.heading}>
        <View style={styles.title}>
          <EddySymbol name="campground" size={28} />
          <Text style={[textStyles.cardTitle, { color: colors.text }]}>Camping</Text>
        </View>
        {showDemand ? (
          <Pressable
            onPress={showInfo}
            accessibilityRole="button"
            accessibilityLabel="About Ozarks camping"
            style={styles.info}
          >
            <Ionicons name="information-circle-outline" size={22} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {demand ? (
        <CampingDemandGauge demand={demand} onPress={openCamping} />
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
      {error && showDemand ? (
        <Pressable onPress={refresh} accessibilityRole="button" style={styles.action}>
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
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  info: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  loading: { paddingVertical: 24 },
  action: { minHeight: 44, justifyContent: 'center' },
});
