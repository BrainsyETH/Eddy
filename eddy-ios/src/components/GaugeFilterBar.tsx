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
// Counts are viewport-scoped because that is what the layer holds. Zeroes stay
// visible and tappable, as everywhere else in this app.
//
// The caller passes the layer's DRAWABLE population — curated gauges already
// removed — and not the raw viewport response. That is load-bearing, not tidy:
// counting the response meant every number here included pins this layer will
// never draw, and it is the same mismatch that made the old "Eddy-rated" chip
// report matches over an empty map.
//
// ── Two chips that could not work, removed ──────────────────────────────────
// "Eddy-rated" and "Following" used to sit at the head of this strip, and both
// matched exactly the gauges this layer excludes: the screen drops `curated`
// pins before drawing, so selecting either produced an empty intersection every
// time — no pins and a 0 in the layers sheet. "Eddy-rated" is a SCOPE (it is
// the layer row above this one, now named
// so), never a trait of the layer that is defined as its complement, and every
// starrable gauge in the app is starred from that row's callout. Narrowing the
// rated tier is a job for a filter under the rated tier, not for this one.

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
 * not be in the condition strip: "Reports flow" and "Reports stage" are
 * properties of a gauge, and the five bands are a scale. Selecting across
 * families reads as AND ("gauges reporting flow and running much higher"),
 * which is what someone tapping both means.
 *
 * Every key here is a property of the READING, which is what this tier has and
 * all it has. Nothing in this union may describe the gauge's relationship to
 * Eddy — see the note at the top of the file for the two keys that tried.
 */
export type GaugeFilterKey = FlowBand | 'flow' | 'stage';

export const GAUGE_FILTER_KEYS: GaugeFilterKey[] = [...FLOW_BAND_ORDER, 'flow', 'stage'];

/** Does this gauge satisfy one filter key? */
export function matchesGaugeFilter(gauge: MapGaugeLite, key: GaugeFilterKey): boolean {
  switch (key) {
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
 * AND (a band AND reporting flow). One flat set with everything OR'd would make
 * "Reports flow + Much higher" show every flow gauge plus every high one, which
 * is the opposite of narrowing.
 */
export function applyGaugeFilters(
  gauges: MapGaugeLite[],
  active: ReadonlySet<GaugeFilterKey>,
): MapGaugeLite[] {
  if (active.size === 0) return gauges;

  const bands = [...active].filter((k) => (FLOW_BAND_ORDER as string[]).includes(k));
  const traits = [...active].filter((k) => !(FLOW_BAND_ORDER as string[]).includes(k));

  return gauges.filter((g) => {
    if (bands.length && !bands.some((k) => matchesGaugeFilter(g, k))) return false;
    if (traits.length && !traits.every((k) => matchesGaugeFilter(g, k))) return false;
    return true;
  });
}

interface Props {
  /**
   * What this layer will actually DRAW in the current viewport, before the
   * chips narrow it. Curated gauges are already gone — see the file header.
   */
  gauges: MapGaugeLite[];
  active: ReadonlySet<GaugeFilterKey>;
  onToggle: (key: GaugeFilterKey) => void;
  onClear: () => void;
  /**
   * The camera is below MIN_GAUGE_ZOOM, so the layer draws nothing at all.
   * This now occurs only after someone deliberately zooms farther out than the
   * statewide opening view, but it still needs an explanation rather than a
   * silent zero.
   */
  belowMinZoom?: boolean;
}

function GaugeFilterBarComponent({
  gauges,
  active,
  onToggle,
  onClear,
  belowMinZoom = false,
}: Props) {
  const { colors } = useTheme();

  const counts = useMemo(() => {
    const out = {} as Record<GaugeFilterKey, number>;
    for (const key of GAUGE_FILTER_KEYS) out[key] = 0;
    for (const g of gauges) {
      for (const key of GAUGE_FILTER_KEYS) {
        if (matchesGaugeFilter(g, key)) out[key]++;
      }
    }
    return out;
  }, [gauges]);

  const chips: FilterChip[] = [
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
  if (belowMinZoom) return null;

  return (
    <View style={[styles.bar, { borderLeftColor: colors.border }]}>
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
          <Text style={[styles.statusText, { color: colors.interactive }]}>Clear filters ×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export const GaugeFilterBar = memo(GaugeFilterBarComponent);

const styles = StyleSheet.create({
  // Indented under its layer row with a hairline spine, so it reads as
  // belonging to that row rather than as a sixth layer.
  bar: {
    marginLeft: 30,
    paddingLeft: 10,
    paddingTop: 4,
    paddingBottom: 10,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 0,
    paddingTop: 8,
  },
  statusText: { ...t.xs, fontFamily: fonts.semibold },
});
