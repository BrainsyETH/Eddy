// Shared by route planning and Ready to float. Photos, eligibility context and distances agree.
import { useMemo, useState, type ReactNode } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { accessTypeLabel, type MapAccessPoint } from '@eddy/types';
import { milesBetween, type Coords } from '@eddy/geo';
import { ControlIcon } from './ControlIcon';
import { EddyScene } from './EddyScene';
import { EddySymbol } from './EddySymbol';
import { PlanAccessPhoto } from './PlanAccessPhoto';
import { accessKindLabels, formatRiverMiles, timelineGapLabel } from '@/lib/accessPickerCopy';
import { useTheme } from '@/theme/ThemeProvider';
import { radii } from '@/theme/layout';
import { fonts, type as t } from '@/theme/typography';

export function PlanAccessPicker({
  header,
  points,
  onSelect,
  selectedId,
  emptyMessage,
  fromPoint,
  userCoords,
  fromMile: locationMile,
}: {
  header?: ReactNode;
  points: MapAccessPoint[];
  onSelect: (point: MapAccessPoint) => void;
  selectedId: string | null;
  emptyMessage: string;
  /** Set on the take-out step so each row can show the float length it makes. */
  fromPoint?: MapAccessPoint | null;
  /** Confirmed position on this river, when starting from here. */
  fromMile?: number | null;
  /** Set on the PUT-IN step only, enabling a nearest-first ordering. */
  userCoords?: Coords | null;
}) {
  const { colors, elevation } = useTheme();
  // Headwaters-first by default. That is the order a river runs in, and it is
  // the order someone who knows the river thinks in — so nearest-first is an
  // option rather than the default, even when we know where they are.
  const [nearestFirst, setNearestFirst] = useState(false);

  const downstreamOrder = !(nearestFirst && userCoords);
  const fromMile = fromPoint?.riverMile ?? locationMile;
  const originLabel = fromPoint ? 'put-in' : 'your location';

  const distances = useMemo(() => {
    if (!userCoords) return null;
    const map = new Map<string, number>();
    for (const point of points) {
      map.set(point.id, milesBetween(userCoords, point.coordinates));
    }
    return map;
  }, [points, userCoords]);

  const ordered = useMemo(() => {
    if (!nearestFirst || !distances) return points;
    return [...points].sort(
      (a, b) => (distances.get(a.id) ?? Infinity) - (distances.get(b.id) ?? Infinity),
    );
  }, [points, nearestFirst, distances]);

  if (points.length === 0) {
    return (
      <ScrollView style={styles.flex} contentInsetAdjustmentBehavior="never" contentContainerStyle={styles.statusContent}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {header}
        <View style={styles.centered}>
          {/* Both messages this renders are about picking a point — no mapped
              access points, or nothing downstream of the put-in — so it shows
              Eddy over a map, not a mood for a river nobody has read.
              The error branch above keeps the canonical `flag` otter. */}
          <EddyScene name="routePlanning" size={100} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>{emptyMessage}</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <FlatList
      style={styles.flex}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentInsetAdjustmentBehavior="never"
      data={ordered}
      keyExtractor={(point) => point.id}
      contentContainerStyle={styles.accessList}
      initialNumToRender={4}
      maxToRenderPerBatch={4}
      windowSize={5}
      extraData={selectedId}
      ListHeaderComponent={
        <View>
          {header}
          {distances ? (
            <Pressable
              onPress={() => setNearestFirst((prev) => !prev)}
              style={({ pressed }) => [
                styles.sortRow,
                // The label no longer changes with the state, so the pill's
                // border carries it for sighted readers, as a selected chip's does.
                { borderColor: nearestFirst ? colors.interactive : colors.border, opacity: pressed ? 0.6 : 1 },
              ]}
              // A toggle names the ACTION and reports its state, never the
              // other way round: this pill used to read "Nearest to you" while
              // the heading below said the same, so VoiceOver announced the
              // order twice and never what tapping would do.
              accessibilityRole="button"
              accessibilityLabel="Sort by nearest to you"
              accessibilityState={{ selected: nearestFirst }}
            >
              <ControlIcon
                name={nearestFirst ? 'navigate' : 'navigate-outline'}
                size={14}
                color={nearestFirst ? colors.interactive : colors.textMuted}
              />
              <Text
                style={[styles.sortText, { color: nearestFirst ? colors.text : colors.textMuted }]}
              >
                Sort by nearest
              </Text>
            </Pressable>
          ) : null}
          <View style={styles.timelineIntro}>
            <Text style={[styles.introTitle, { color: colors.text }]}>
              {downstreamOrder ? '↓ Upstream to downstream' : 'Nearest to you'}
            </Text>
            {!downstreamOrder ? <Text style={[styles.optionMeta, { color: colors.textMuted }]}>
              Sorted by straight-line distance from you, not river order.
            </Text> : null}
          </View>
          {downstreamOrder && fromPoint ? (
            <View style={styles.timelineRow}>
              <View style={styles.timelineRail} accessible={false} importantForAccessibility="no-hide-descendants">
                <View style={[styles.timelineLine, styles.lineBelow, { backgroundColor: colors.border }]} />
                {/* Eddy's own access-point mark: the put-in is a place, not a step. */}
                <View style={[styles.originMark, { backgroundColor: colors.selectionBg, borderColor: colors.interactive }]}>
                  <EddySymbol name="accessPoint" size={16} />
                </View>
              </View>
              <View style={[styles.timelineContent, styles.originContent]}>
                <Text style={[styles.originLabel, { color: colors.interactive }]}>Your put-in</Text>
                <Text style={[styles.optionName, { color: colors.text }]}>{fromPoint.name}</Text>
                <Text style={[styles.optionMeta, { color: colors.textMuted }]}>Mile {fromPoint.riverMile.toFixed(1)}</Text>
              </View>
            </View>
          ) : null}
        </View>
      }
      renderItem={({ item: point, index }) => {
        const selected = point.id === selectedId;
        const miles = fromMile != null ? point.riverMile - fromMile : null;
        const away = distances?.get(point.id) ?? null;
        const awayLabel = away != null ? `${away < 10 ? away.toFixed(1) : away.toFixed(0)} mi away · straight line` : null;
        const gapLabel = downstreamOrder ? timelineGapLabel(point, ordered[index - 1], index) : null;
        const last = index === ordered.length - 1;
        const mileLabel = `Mile ${point.riverMile.toFixed(1)}`;
        // One headline distance per row: the one that decides this choice.
        // From a put-in that is the float it makes; on the put-in step it is
        // how far away the place is, else where it sits on the river.
        const headline = miles != null
          ? `${formatRiverMiles(miles)} mi from ${originLabel}`
          : !downstreamOrder && awayLabel ? awayLabel : mileLabel;
        // Straight-line, and labelled "away" rather than "drive" for exactly
        // that reason — an Ozark put-in eight miles off can be forty minutes of
        // gravel road.
        const details = [
          headline === mileLabel ? null : mileLabel,
          headline === awayLabel ? null : awayLabel,
          point.isPublic ? 'Public' : null,
          ...accessKindLabels(point),
        ].filter(Boolean).join(' · ');
        return (
          <View>
            {gapLabel ? (
              <View style={styles.timelineRow}>
                <View style={styles.timelineRail} accessible={false} importantForAccessibility="no-hide-descendants">
                  <View style={[styles.timelineLine, { backgroundColor: colors.border }]} />
                </View>
                <Text style={[styles.segmentLabel, { color: colors.textMuted }]}>{gapLabel}</Text>
              </View>
            ) : null}
            <View style={[styles.timelineRow, !downstreamOrder && styles.nearestItem]}>
              {downstreamOrder ? (
                <View style={styles.timelineRail} accessible={false} importantForAccessibility="no-hide-descendants">
                  <View style={[
                    styles.timelineLine,
                    index === 0 && !fromPoint ? styles.lineBelow : last ? styles.lineAbove : null,
                    { backgroundColor: colors.border },
                    last && index === 0 && !fromPoint ? styles.hidden : null,
                  ]} />
                  <View style={[styles.timelineDot, { backgroundColor: selected ? colors.interactive : colors.bg, borderColor: colors.interactive }]} />
                </View>
              ) : null}
              <View style={styles.timelineContent}>
                <Pressable
                  key={point.id}
                  onPress={() => onSelect(point)}
                  style={({ pressed }) => [
                    styles.accessCard,
                    elevation(1),
                    {
                      backgroundColor: selected ? colors.cardRaised : colors.card,
                      borderColor: selected ? colors.interactive : colors.border,
                      opacity: pressed ? 0.65 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${point.name}, river mile ${point.riverMile.toFixed(1)}${miles != null ? `, ${miles < 0.1 ? 'less than 0.1' : miles.toFixed(1)} miles downstream from ${originLabel}` : ''}, ${point.isPublic ? 'public access' : 'private access, check permission'}, ${accessTypeLabel(point.type)}${away != null ? `, ${away.toFixed(1)} miles away` : ''}`}
                  accessibilityState={{ selected }}
                >
                  {/* A thumbnail, not a hero: the decision is comparing stops,
                      so several have to fit on one screen. */}
                  <PlanAccessPhoto point={point} style={styles.accessPhoto} />
                  <View style={styles.optionBody}>
                    <Text style={[styles.optionName, { color: colors.text }]} numberOfLines={2}>
                      {point.name}
                    </Text>
                    <Text style={[styles.headline, { color: colors.interactive }]}>{headline}</Text>
                    {details ? (
                      <Text style={[styles.optionMeta, { color: colors.textMuted }]}>{details}</Text>
                    ) : null}
                    {point.isPublic ? null : (
                      <Text style={[styles.accessStatus, { color: colors.text }]}>Private · Check permission</Text>
                    )}
                  </View>
                  {selected ? <ControlIcon name="checkmark-circle" size={22} color={colors.interactive} /> : null}
                </Pressable>
              </View>
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  accessCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radii.card, borderWidth: 1 },
  accessList: { padding: 16 },
  accessPhoto: { width: 72, height: 72, borderRadius: radii.card - 4 },
  accessStatus: { ...t.xs, fontFamily: fonts.semibold, marginTop: 2 },
  centered: { flexGrow: 1, flexShrink: 0, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyText: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
  flex: { flex: 1 },
  headline: { ...t.sm, fontFamily: fonts.monoMedium, marginTop: 2 },
  hidden: { opacity: 0 },
  introTitle: { ...t.base, fontFamily: fonts.heading },
  lineAbove: { bottom: '50%' },
  lineBelow: { top: '50%' },
  nearestItem: { marginBottom: 12 },
  optionBody: { flex: 1, minWidth: 0 },
  optionMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  optionName: { ...t.base, fontFamily: fonts.semibold },
  originContent: { paddingVertical: 8 },
  originLabel: { ...t.xs, fontFamily: fonts.semibold, textTransform: 'uppercase', letterSpacing: 0.6 },
  originMark: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  segmentLabel: { flex: 1, ...t.xs, fontFamily: fonts.body, paddingVertical: 6 },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 4,
    minHeight: 44,
  },
  sortText: { ...t.sm, fontFamily: fonts.semibold },
  statusContent: { flexGrow: 1, padding: 16 },
  timelineContent: { flex: 1, minWidth: 0, paddingVertical: 4 },
  timelineDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  timelineIntro: { gap: 4, marginBottom: 12 },
  timelineLine: { position: 'absolute', width: 2, top: 0, bottom: 0 },
  timelineRail: { width: 28, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  timelineRow: { flexDirection: 'row', alignItems: 'stretch' },
});
