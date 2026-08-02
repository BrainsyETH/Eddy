// eddy-ios/src/components/PlanRoutePreview.tsx
// The stretch you just planned, drawn.
//
// A map app's planner answered "7.4 mi" and never showed the water. The
// geometry was already on the wire — FloatPlan.route.geometry, the same
// LineString the map tab paints — and this is the strip that spends it: the
// real channel between the real two ends, at a glance, before the numbers.
//
// ── It is a picture, not a map ──────────────────────────────────────────────
//
// No basemap, no terrain, no interaction. The point is the SHAPE of the
// stretch: whether it doubles back, whether it is one long bend or twelve
// tight ones, whether 7.4 miles is straight or wound. A tile layer under it
// would cost a network round trip, an offline story and a licence question to
// deliver something nobody is trying to read at 120pt tall.
//
// ── Nothing, rather than something invented ─────────────────────────────────
//
// `routePreview` returns null for missing, single-point or zero-extent
// geometry and this renders null on that. It never falls back to a straight
// line between the ends: a straight line is a claim about a river, made on the
// screen where somebody decides whether to drive four hours to paddle it.
//
// ── Why the boundary ────────────────────────────────────────────────────────
//
// react-native-svg is a NATIVE module and this is the app's second consumer of
// it. An OTA JS update can land on a binary built before it was linked, which
// surfaces as a thrown render rather than a missing view. GaugeChart hit this
// first and documents it at length; the same guard applies here, except that
// this component simply disappears — a route preview is worth nothing to
// explain and everything to not crash the plan screen over.

import { Component, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { RiverGeometry } from '@eddy/types';
import { routePreview, type LngLat } from '@eddy/geo/route-preview';
import { useTheme } from '@/theme/ThemeProvider';
import { warn } from '@/lib/monitoring';

const HEIGHT = 116;
/**
 * Laid out at a fixed width and scaled by the SVG viewBox.
 *
 * onLayout would be exact, but it costs a frame in which the card is a
 * different height — and this sits directly above the headline number, so that
 * frame is a visible jump on the one screen people are reading for an answer.
 */
const WIDTH = 320;

function PlanRoutePreviewInner({ geometry }: { geometry: RiverGeometry | null | undefined }) {
  const { colors, isDark } = useTheme();

  const preview = routePreview(geometry?.coordinates as readonly LngLat[] | undefined, {
    width: WIDTH,
    height: HEIGHT,
    // Room for a marker's radius plus its ring, so neither end is clipped when
    // the route runs into a corner.
    padding: 14,
  });
  if (!preview) return null;

  return (
    <View
      style={[styles.frame, { backgroundColor: isDark ? colors.cardRaised : colors.bg }]}
      // One image, described once. The path is thousands of numbers and the
      // markers are two dots; a screen reader gets the sentence instead.
      accessible
      accessibilityRole="image"
      accessibilityLabel="The shape of this stretch, from the put-in to the take-out"
    >
      <Svg width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        {/* Casing under fill, the same two-pass stroke the map draws the plan
            route with, so the line reads against both card colours. */}
        <Path
          d={preview.path}
          stroke={colors.bg}
          strokeWidth={7}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <Path
          d={preview.path}
          stroke={colors.interactive}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Put-in green, take-out coral — the two colours these ends already
            wear on the map and in Getting there. A third vocabulary for the
            same two places would be one to learn for nothing. */}
        <Circle cx={preview.start.x} cy={preview.start.y} r={7} fill={colors.bg} />
        <Circle cx={preview.start.x} cy={preview.start.y} r={5} fill={colors.success} />
        <Circle cx={preview.end.x} cy={preview.end.y} r={7} fill={colors.bg} />
        <Circle cx={preview.end.x} cy={preview.end.y} r={5} fill={colors.accent} />
      </Svg>
    </View>
  );
}

/** See the header. Renders nothing at all on failure. */
class PreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    warn('chart', 'route preview failed; native react-native-svg missing?', error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function PlanRoutePreview({ geometry }: { geometry: RiverGeometry | null | undefined }) {
  return (
    <PreviewBoundary>
      <PlanRoutePreviewInner geometry={geometry} />
    </PreviewBoundary>
  );
}

const styles = StyleSheet.create({
  frame: { height: HEIGHT, borderRadius: 14, overflow: 'hidden', marginBottom: 12 },
});
