import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ControlIcon } from '@/components/ControlIcon';
import { EddySymbol } from '@/components/EddySymbol';
import { CampgroundAvailability } from '@/components/map-sheet/CampgroundAvailability';
import { savedCampingDisplay, savedGaugeDisplay, savedPlaceSummary } from '@/lib/savedPlaceDisplay';
import type { SavedPlace } from '@/lib/savedPlaces';
import { useTheme } from '@/theme/ThemeProvider';
import { conditionChipBorder, conditionColor, conditionInk, conditionOpaqueBg } from '@/theme/conditions';
import { radii } from '@/theme/layout';
import { fonts, type as t } from '@/theme/typography';

/** The kind line and the mark each saved kind wears — the map's own mark for it. */
const KIND_DISPLAY: Record<SavedPlace['kind'], { label: string; symbol: 'accessPoint' | 'campground' | 'outfitter' | 'lodging' }> = {
  access: { label: 'Access point', symbol: 'accessPoint' },
  campground: { label: 'Campground', symbol: 'campground' },
  outfitter: { label: 'Outfitter', symbol: 'outfitter' },
  lodging: { label: 'Lodging', symbol: 'lodging' },
};

interface Props {
  place: SavedPlace;
  now: number;
  onPress: () => void;
  onRemove: () => void;
}

/** Uses only the saved snapshot and bundled artwork, including offline. */
export function FavoritePlaceCard({ place, now, onPress, onRemove }: Props) {
  const { colors, elevation, isDark } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale >= 1.3;
  const { label: kind, symbol } = KIND_DISPLAY[place.kind] ?? KIND_DISPLAY.access;
  const camping = savedCampingDisplay(place, now);
  const gauge = !camping && place.gauge ? savedGaugeDisplay(place, now) : null;
  const code = gauge?.code ?? null;
  const gaugeNotice = gauge ? [gauge.condition ?? gauge.state, gauge.age].filter(Boolean).join(' · ') : null;
  const summary = camping || gauge ? null : savedPlaceSummary(place, now);
  // Keep restrictions visible without repeating tags or raw amenities in the summary.
  const detailSummary = summary && !place.tags.includes(summary) && summary !== place.amenities.join(' · ')
    ? summary : null;
  const accessibilityLabel = [
    place.name, kind, place.riverName, ...place.tags,
    camping ? `Campsites, ${camping.accessibilityLabel}, checked ${camping.age}` : null,
    gauge ? place.gauge?.reading.gaugeName : null, gauge?.reading ?? (gauge ? 'Reading unavailable' : null), gaugeNotice,
    detailSummary,
  ].filter(Boolean).join(', ');

  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
      <View style={[styles.stripe, {
        // A stale gauge cannot lend its old condition to the place. Teal on
        // ungauged places is brand chrome, not a water-condition verdict.
        backgroundColor: code ? conditionColor(code) : gauge ? colors.border : colors.interactive,
      }]} />
      <View style={styles.body}>
        <View style={styles.head}>
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityHint="Opens saved place details"
            style={({ pressed }) => [styles.headMain, stacked && styles.headStacked, { opacity: pressed ? 0.65 : 1 }]}
          >
            <View style={[styles.artwork, { backgroundColor: colors.selectionBg }]}>
              <EddySymbol name={symbol} size={38} />
            </View>
            <View style={[styles.identity, stacked && styles.stackedIdentity]}>
              <Text style={[styles.kind, { color: colors.interactive }]}>{kind}</Text>
              <Text style={[styles.name, { color: colors.text }]}>{place.name}</Text>
              {place.riverName ? <Text style={[styles.river, { color: colors.textMuted }]}>{place.riverName}</Text> : null}
            </View>
          </Pressable>
          <Pressable
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${place.name} from favorites`}
            style={({ pressed }) => [styles.star, { opacity: pressed ? 0.5 : 1 }]}
          >
            <ControlIcon name="star" size={21} color={colors.warm} />
          </Pressable>
        </View>

        {/* The header announces the complete card once; this larger tap area
            shares its destination, while the star remains a sibling control. */}
        <Pressable onPress={onPress} accessible={false}
          style={({ pressed }) => [styles.details, { opacity: pressed ? 0.65 : 1 }]}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.detailsContent}>
            {place.tags.length ? (
              <View style={styles.chips}>
                {place.tags.map(tag => (
                  <View key={tag} style={[styles.tag, { backgroundColor: colors.cardRaised, borderColor: colors.border }]}>
                    <Text style={[styles.tagText, { color: colors.text }]}>{tag}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {camping ? (
              <View style={styles.camping}>
                <CampgroundAvailability wrapText caption={camping.caption} availability={camping.availability} name={camping.name} today={camping.today}
                  pending={!camping.availability} pendingLabel="Availability out of date" />
                <Text style={[styles.notice, { color: colors.textMuted }]}>Checked {camping.age}</Text>
              </View>
            ) : gauge ? (
              <View style={[styles.readingRow, stacked && styles.readingStacked, { backgroundColor: colors.cardRaised }]}>
                <View style={[styles.readingContext, stacked && styles.stackedContext]}>
                  <Text style={[styles.gaugeName, { color: colors.text }]}>{place.gauge?.reading.gaugeName}</Text>
                  <Text style={[styles.notice, { color: colors.textMuted }]}>{gaugeNotice}</Text>
                  {!gauge.reading ? <Text style={[styles.notice, { color: colors.textMuted }]}>Reading unavailable</Text> : null}
                </View>
                {gauge.reading ? (
                  <View style={[styles.readingPill, {
                    backgroundColor: code ? conditionOpaqueBg(code, isDark) : colors.card,
                    borderColor: code ? conditionChipBorder(code, isDark) : colors.border,
                  }]}>
                    <Text style={[styles.readingValue, { color: code ? conditionInk(code, isDark) : colors.textMuted }]}>{gauge.reading}</Text>
                  </View>
                ) : null}
              </View>
            ) : detailSummary ? (
              <View style={[styles.summary, { backgroundColor: colors.cardRaised }]}>
                <ControlIcon name={place.dam ? 'time-outline' : 'information-circle-outline'} size={16} color={colors.textMuted} />
                <Text style={[styles.summaryText, { color: colors.textMuted }]}>{detailSummary}</Text>
              </View>
            ) : null}

            {!camping && !gauge && !detailSummary && !place.tags.length ? (
              <View style={styles.openRow}>
                <Text style={[styles.openText, { color: colors.interactive }]}>View place</Text>
                <ControlIcon name="chevron-forward" size={12} color={colors.interactive} />
              </View>
            ) : null}
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'stretch', marginHorizontal: 16, marginBottom: 10, borderRadius: radii.card, overflow: 'hidden' },
  stripe: { width: 4 },
  body: { flex: 1, minWidth: 0, paddingVertical: 12, paddingLeft: 13, paddingRight: 4 },
  head: { flexDirection: 'row', alignItems: 'flex-start' },
  headMain: { flex: 1, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headStacked: { flexDirection: 'column', alignItems: 'flex-start' },
  artwork: { width: 48, height: 48, borderRadius: radii.inset, alignItems: 'center', justifyContent: 'center' },
  identity: { flex: 1, minWidth: 0, flexShrink: 1 },
  stackedIdentity: { flexGrow: 0, flexBasis: 'auto', alignSelf: 'stretch' },
  kind: { ...t.xs, fontFamily: fonts.medium, marginBottom: 2 },
  name: { ...t.base, fontFamily: fonts.semibold },
  river: { ...t.sm, marginTop: 2 },
  star: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  details: { marginTop: 12, marginRight: 9, minHeight: 44, justifyContent: 'center' },
  detailsContent: { gap: 10 },
  camping: { gap: 3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  tag: { maxWidth: '100%', borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  tagText: { ...t.xs, fontFamily: fonts.medium },
  readingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10 },
  readingStacked: { flexDirection: 'column', alignItems: 'flex-start' },
  readingContext: { flex: 1, minWidth: 0 },
  stackedContext: { flexGrow: 0, flexBasis: 'auto' },
  gaugeName: { ...t.sm, fontFamily: fonts.medium },
  notice: { ...t.xs, marginTop: 2 },
  readingPill: { maxWidth: '100%', borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  readingValue: { ...t.sm, fontFamily: fonts.mono },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10 },
  summaryText: { ...t.sm, flex: 1 },
  openRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  openText: { ...t.sm, fontFamily: fonts.medium },
});
