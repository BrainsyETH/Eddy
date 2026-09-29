import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  CAMPING_DEMAND_INFO,
  demandAccessibilityLabel,
  demandBasis,
  demandDetail,
  demandHeadline,
  type CampingDemand,
} from '@eddy/conditions/camping-demand';
import { weekdayOf } from '@eddy/conditions/camping-window';
import { useAppConfig } from '@/hooks/useAppConfig';
import { useCampingOverview } from '@/hooks/useCampingOverview';
import {
  bandLevel,
  demandNightLabel,
  demandRows,
  type DemandRow,
} from '@/lib/campingDemand';
import { dateLabel } from '@/lib/campingHeatmap';
import { accent, neutral, secondary } from '@/theme/palette';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles } from '@/theme/typography';

// Its own sequential scale, deliberately not the heatmap's green-open /
// red-booked marks: "Quiet" and "lots of open sites" must not read as two
// different facts. Band names are always written out; colour is secondary.
const SCALE = [secondary[200], secondary[500], accent[400], accent[600], accent[700]];
const INK = [neutral[950], neutral[950], neutral[950], neutral[950], '#FFFFFF'];
const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type Props = { saved: ReadonlySet<string>; revision: number };

export function TodayCampingDemand(props: Props) {
  const { features } = useAppConfig();
  return features.crowdSignal ? <DemandCard {...props} /> : null;
}

function showInfo() {
  Alert.alert('About camping demand', CAMPING_DEMAND_INFO);
}

function DemandCard({ saved, revision }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  // Same 21-night request and cache as the camping card: no extra fetch.
  const { data, now } = useCampingOverview(true, revision, 21);
  // One selected night for the whole card, so rivers compare like for like.
  // Null follows the weekend default; a stale selection falls back to it.
  const [selected, setSelected] = useState<string | null>(null);
  const view = useMemo(
    () => (data ? demandRows(data, saved, now, selected) : null),
    [data, saved, now, selected],
  );
  if (!view) return null;
  const nightLabel = demandNightLabel(view.night);
  return (
    <View
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.heading}>
        <Text style={[textStyles.cardTitle, { color: colors.text }]}>Camping demand</Text>
        <Pressable
          onPress={showInfo}
          accessibilityRole="button"
          accessibilityLabel="About camping demand"
          hitSlop={12}
          style={styles.info}
        >
          <Ionicons name="information-circle-outline" size={20} color={colors.textMuted} />
        </Pressable>
        <Text
          style={[textStyles.caption, { color: colors.textMuted, marginLeft: 'auto' }]}
          accessibilityLiveRegion="polite"
        >
          {nightLabel} · {dateLabel(view.night)}
        </Text>
      </View>
      {view.rows.map((row) => (
        <DemandRiver
          key={row.slug}
          row={row}
          night={view.night}
          nightLabel={nightLabel}
          onSelectNight={setSelected}
          onOpen={() =>
            router.push({ pathname: '/camping', params: { river: row.slug } })
          }
        />
      ))}
      <Text style={[textStyles.caption, { color: colors.textSubtle }]}>
        Tap a night to compare · Tracked Recreation.gov campsites · Reservable sites only
      </Text>
    </View>
  );
}

function DemandRiver({
  row,
  night,
  nightLabel,
  onSelectNight,
  onOpen,
}: {
  row: DemandRow;
  night: string;
  nightLabel: string;
  onSelectNight: (date: string) => void;
  onOpen: () => void;
}) {
  const { colors } = useTheme();
  const d = row.headline;
  return (
    <View style={[styles.row, { borderTopColor: colors.border }]}>
      {/* Summary and nights are siblings, not nested: a grouped accessible
          parent would hide the night buttons from VoiceOver. */}
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={demandAccessibilityLabel(d, row.name, nightLabel)}
        accessibilityHint={`Opens camping on ${row.name}`}
        style={styles.summary}
      >
        <View style={styles.rowTop}>
          <Text
            style={[textStyles.body, { color: colors.text, fontFamily: fonts.semibold, flexShrink: 1 }]}
          >
            {row.name}
          </Text>
          <BandPill demand={d} />
        </View>
        <Text style={[textStyles.caption, { color: colors.textMuted }]}>{demandDetail(d)}</Text>
        <Text style={[textStyles.caption, { color: colors.textSubtle }]}>{demandBasis(d)}</Text>
      </Pressable>
      <View style={styles.strip}>
        {row.strip.map((n) => (
          <NightCell
            key={n.date}
            demand={n}
            riverName={row.name}
            selected={n.date === night}
            onPress={() => onSelectNight(n.date)}
          />
        ))}
      </View>
    </View>
  );
}

function NightCell({
  demand,
  riverName,
  selected,
  onPress,
}: {
  demand: CampingDemand;
  riverName: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const level = bandLevel(demand.band);
  const dow = weekdayOf(demand.date);
  const weekend = dow === 5 || dow === 6;
  const label = `${demandNightLabel(demand.date)}, ${dateLabel(demand.date)}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={demandAccessibilityLabel(demand, riverName, label)}
      accessibilityHint="Shows this night for every river"
      hitSlop={{ top: 8, bottom: 8 }}
      style={styles.stripCell}
    >
      <View
        style={[
          styles.stripBar,
          level == null
            ? { backgroundColor: 'transparent', borderColor: colors.border, borderWidth: 1 }
            : { backgroundColor: SCALE[level] },
          selected && { borderColor: colors.text, borderWidth: 2 },
        ]}
      />
      <Text
        style={[
          styles.stripDay,
          {
            color: selected || weekend ? colors.text : colors.textSubtle,
            fontFamily: selected || weekend ? fonts.semibold : undefined,
          },
        ]}
      >
        {DAY_INITIALS[dow]}
      </Text>
    </Pressable>
  );
}

function BandPill({ demand }: { demand: CampingDemand }) {
  const { colors } = useTheme();
  const level = bandLevel(demand.band);
  // "All observed sites booked" is not Packed: show it as an outline so it
  // cannot be mistaken for the complete-coverage result.
  const partial = demand.allObservedBooked;
  return (
    <View
      style={[
        styles.pill,
        level == null || partial
          ? { borderColor: level == null ? colors.border : SCALE[3], borderWidth: 1 }
          : { backgroundColor: SCALE[level] },
      ]}
    >
      <Text
        style={[
          textStyles.caption,
          {
            fontFamily: fonts.semibold,
            color: level == null ? colors.textMuted : partial ? colors.text : INK[level],
          },
        ]}
      >
        {demandHeadline(demand)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderWidth: 1, borderRadius: 20, gap: 4 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 4 },
  info: { minWidth: 28, minHeight: 28, alignItems: 'center', justifyContent: 'center' },
  row: { paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 6 },
  summary: { gap: 2, minHeight: 44 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  strip: { flexDirection: 'row', gap: 4 },
  stripCell: { flex: 1, alignItems: 'center', gap: 2, minHeight: 32, justifyContent: 'center' },
  stripBar: { height: 8, alignSelf: 'stretch', borderRadius: 4 },
  stripDay: { fontSize: 11 },
});
