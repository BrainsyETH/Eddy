// eddy-ios/src/components/GaugeFilterBar.tsx
// Narrow the national gauge layer to the gauges you care about.
//
// A SIBLING of ConditionFilterBar, cloned in structure and deliberately not
// merged with it. They narrow different things by different vocabularies:
// that one filters curated rivers by a floatability VERDICT, this one filters
// ~14,000 reference gauges by how they compare to their own history. Folding
// them into one strip would put "Flowing" and "Much higher" in the same row and
// imply they are the same kind of answer. They are not, and the whole point of
// the flow-band vocabulary is that the difference stays visible.
//
// ── Where this lives, and why it moved ─────────────────────────────────────
// Inside the layers sheet, indented under the "All U.S. gauges" row it refines.
// It spent one release behind its own floating button on the map, which made
// three stacked 44pt buttons down the right edge — precisely the permanent tax
// on the map's pixels that MapLayersSheet exists to have removed. A refinement
// for a layer belongs where the layer is switched on: you turn it on, the
// chips appear under it, and the map keeps two buttons.
//
// Still chips rather than switches, per README.md's ruling: these genuinely
// mean "narrow to this", where the row above them means "also draw this".
//
// ── Counts are viewport-scoped, and the heading says so ─────────────────────
// Everything here counts what is currently on screen, because that is what the
// layer holds; it never claims to count the country. The heading reads "Gauges
// in view" so a count of 3 next to a national dataset is not a lie. Zeroes stay
// visible and tappable, as everywhere else in this app.

import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MapGaugeLite } from '@eddy/types';
import { FLOW_BAND_ORDER, type FlowBand } from '@eddy/conditions/flow-band';
import { flowBandColor, flowBandLabel } from '@/theme/flow';
import { flowBandFor } from '@/lib/gaugeFlow';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { FilterChips, type FilterChip } from '@/components/FilterChips';

/**
 * The filter keys.
 *
 * Two families in one multi-select set, which is honest here in a way it would
 * not be in the condition strip: "Eddy-rated" and "Reports flow" are properties
 * of a gauge, and the five bands are a scale. Selecting across families reads
 * as AND ("Eddy-rated gauges running much higher"), which is what someone
 * tapping both means.
 */
export type GaugeFilterKey = FlowBand | 'curated' | 'starred' | 'flow' | 'stage';

export const GAUGE_FILTER_KEYS: GaugeFilterKey[] = [
  'curated',
  'starred',
  ...FLOW_BAND_ORDER,
  'flow',
  'stage',
];

/** Does this gauge satisfy one filter key? */
export function matchesGaugeFilter(
  gauge: MapGaugeLite,
  key: GaugeFilterKey,
  isStarred: (id: string) => boolean,
): boolean {
  switch (key) {
    case 'curated':
      return gauge.curated;
    case 'starred':
      return isStarred(gauge.id);
    case 'flow':
      return gauge.dischargeCfs != null;
    case 'stage':
      return gauge.gaugeHeightFt != null;
    default:
      // A band key. flowBandFor returns null for a suspect reading or a gauge
      // with no statistics, and null must not match any band — "we don't know"
      // is not a quiet member of every bucket.
      return flowBandFor(gauge) === key;
  }
}

/**
 * Gauges passing the active set.
 *
 * Keys within the same family are OR (any of these bands), and families are
 * AND (a band AND Eddy-rated). One flat set with everything OR'd would make
 * "Eddy-rated + Much higher" show every Eddy gauge plus every high one, which
 * is the opposite of narrowing.
 */
export function applyGaugeFilters(
  gauges: MapGaugeLite[],
  active: ReadonlySet<GaugeFilterKey>,
  isStarred: (id: string) => boolean,
): MapGaugeLite[] {
  if (active.size === 0) return gauges;

  const bands = [...active].filter((k) => (FLOW_BAND_ORDER as string[]).includes(k));
  const traits = [...active].filter((k) => !(FLOW_BAND_ORDER as string[]).includes(k));

  return gauges.filter((g) => {
    if (bands.length && !bands.some((k) => matchesGaugeFilter(g, k, isStarred))) return false;
    if (traits.length && !traits.every((k) => matchesGaugeFilter(g, k, isStarred))) return false;
    return true;
  });
}

interface Props {
  /** Everything the viewport holds, before filtering — counts come from this. */
  gauges: MapGaugeLite[];
  active: ReadonlySet<GaugeFilterKey>;
  isStarred: (id: string) => boolean;
  onToggle: (key: GaugeFilterKey) => void;
  onClear: () => void;
}

function GaugeFilterBarComponent({ gauges, active, isStarred, onToggle, onClear }: Props) {
  const { colors } = useTheme();

  const counts = useMemo(() => {
    const out = {} as Record<GaugeFilterKey, number>;
    for (const key of GAUGE_FILTER_KEYS) out[key] = 0;
    for (const g of gauges) {
      for (const key of GAUGE_FILTER_KEYS) {
        if (matchesGaugeFilter(g, key, isStarred)) out[key]++;
      }
    }
    return out;
  }, [gauges, isStarred]);

  const chips: FilterChip[] = [
    { key: 'curated', label: 'Eddy-rated', icon: 'water', count: counts.curated },
    { key: 'starred', label: 'Following', icon: 'star', count: counts.starred },
    ...FLOW_BAND_ORDER.map((band) => ({
      key: band,
      label: flowBandLabel(band),
      count: counts[band],
      // Each band wears its own ramp colour when active, so the strip doubles
      // as the legend for the dots on the map — the same rule the condition
      // strip and the layers sheet both follow.
      activeColor: flowBandColor(band),
    })),
    { key: 'flow', label: 'Reports flow', count: counts.flow },
    { key: 'stage', label: 'Reports stage', count: counts.stage },
  ];

  const filtering = active.size > 0;
  const matching = filtering ? applyGaugeFilters(gauges, active, isStarred).length : gauges.length;

  return (
    <View style={[styles.bar, { borderLeftColor: colors.border }]}>
      <View style={styles.head}>
        {/* "in view", not "nationwide". The layer only ever holds the viewport,
            and a heading that implied otherwise would make every count wrong. */}
        <Text style={[styles.heading, { color: colors.textMuted }]}>Narrow to</Text>
        <Text style={[styles.subheading, { color: colors.textSubtle }]}>
          {gauges.length} in view
        </Text>
      </View>

      <FilterChips
        chips={chips}
        active={[...active]}
        onToggle={(k) => onToggle(k as GaugeFilterKey)}
        paddingHorizontal={0}
      />

      {filtering ? (
        <Pressable
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel="Clear gauge filter"
          style={({ pressed }) => [styles.status, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.statusText, { color: colors.text }]}>
            Showing {matching} {matching === 1 ? 'gauge' : 'gauges'}
          </Text>
          <Text style={[styles.statusText, { color: colors.accent }]}>Clear ×</Text>
        </Pressable>
      ) : (
        <Text style={[styles.hint, { color: colors.textSubtle }]}>
          Tap a filter to dim the rest
        </Text>
      )}
    </View>
  );
}

export const GaugeFilterBar = memo(GaugeFilterBarComponent);

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  // Indented under its layer row with a hairline spine, so it reads as
  // belonging to that row rather than as a sixth layer.
  bar: {
    marginLeft: 30,
    paddingLeft: 10,
    paddingTop: 4,
    paddingBottom: 10,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
    marginBottom: 6,
  },
  heading: { ...t.xs, fontFamily: fonts.semibold, textTransform: 'uppercase', letterSpacing: 0.6 },
  subheading: { ...t.xs, fontFamily: fonts.body },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
    paddingTop: 8,
  },
  statusText: { ...t.xs, fontFamily: fonts.semibold },
  hint: { ...t.xs, fontFamily: fonts.body, paddingTop: 6 },
});
