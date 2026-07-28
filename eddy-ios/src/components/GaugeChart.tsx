// eddy-ios/src/components/GaugeChart.tsx
// The hydrograph: what this gauge has been doing, against what the bands mean.
//
// ── Why the app has a chart at all ──────────────────────────────────────────
// Every surface in Eddy until now answered "what is the river doing RIGHT NOW".
// That is the right headline and it is not the whole question: 900 cfs on the
// way down from 2,400 is a different weekend from 900 on the way up, and the
// reading card cannot tell them apart. The trend arrow tries — it compares two
// points — and a week of line does it properly.
//
// ── Bands are drawn at TRUE numeric height here, unlike the track ───────────
// ReadingScale draws the same ladder at EQUAL width per band, deliberately, so
// a 20,000-cfs flood band cannot crush the bands people float in down to a
// sliver. That is right for a track whose axis is "how far through the ladder".
//
// It is wrong here. This chart's y axis is the READING, so a band has to sit at
// the numbers it actually covers or the line would cross into "High" at a height
// that is not where High starts. The two therefore look different on purpose,
// and neither is a rescaling of the other.
//
// The y domain comes from the DATA, then stretches to swallow any threshold
// that is close enough to be worth seeing (see NEAR_THRESHOLD_FRACTION). A week
// spent entirely in Good shows one band and the line inside it — which is the
// honest picture — but if High is just above, High is on screen.
//
// ── NWS stages, for the gauges that have no bands ──────────────────────────
// A rated gauge gets condition bands because a human decided where they go. An
// unrated one got a bare line and no way to tell whether it was high — the flow
// band on the card above says "higher than usual", which is a comparison to its
// own record and not a threshold.
//
// The Weather Service publishes action/flood/moderate/major stages for ~12,700
// forecast points, and quoting those is not the same as issuing a verdict. They
// rule across the plot in violet — a hue in neither the condition ladder nor the
// flow ramp, so it cannot be misread as either. See src/theme/floodStage.ts.
//
// ── Both units, and never a fabricated one ─────────────────────────────────
// A station publishes stage, discharge, or both. The toggle offers only what is
// actually on the wire, and the caller's preferred unit is the DEFAULT rather
// than a lock; there is no fallback across units, here or anywhere else in this
// app. See primaryReading() for the longer version of that rule.
//
// That toggle became load-bearing with the stages above. NWPS publishes them in
// FEET and nothing else, and a reference station's chart opens on discharge —
// so without a way to reach the foot axis, the gauges that most need a flood
// line are the ones that could never show it.
//
// ── The scrub ──────────────────────────────────────────────────────────────
// Touch and drag reads out the value and the time under your finger. It is a
// PanResponder over a transparent overlay rather than per-point touch targets:
// a 30-day window is ~720 points, and 720 Pressables is a frame budget spent on
// hit-testing. onStartShouldSetPanResponder claims the gesture on touch-down so
// a tap works as well as a drag, and the parent ScrollView is only blocked once
// the finger is genuinely down on the plot.

import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { GaugeFloodStages, GaugeHistoryReading } from '@eddy/types';
import { buildZones, type ThresholdValues } from '@eddy/conditions/threshold-zones';
import { conditionColor } from '@/theme/conditions';
import {
  FLOOD_STAGE_ORDER,
  FLOOD_STAGE_SYSTEM,
  floodStageColor,
  type FloodStageKey,
} from '@/theme/floodStage';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { formatReading } from '@/lib/readingCopy';
import { useGaugeHistory } from '@/hooks/useGaugeHistory';

/** The three questions people actually ask, and nothing else. */
const RANGES = [
  { days: 1, label: '24h' },
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
] as const;

const CHART_HEIGHT = 168;
/** Room for the value labels down the right edge. */
const PAD_RIGHT = 46;
/** Room for the two time labels under the plot. */
const PAD_BOTTOM = 18;
const PAD_TOP = 10;

/**
 * How far past the data a threshold may sit and still be pulled into view, as a
 * fraction of the data's own range.
 *
 * Generous enough that "High is just above where you've been" shows, tight
 * enough that a flood line an order of magnitude up does not flatten the week
 * you came to look at into a straight line along the bottom.
 */
const NEAR_THRESHOLD_FRACTION = 0.75;

/**
 * Break the line when the gap between samples exceeds this multiple of the
 * expected spacing.
 *
 * A station that stopped reporting for two days should show a HOLE, not a
 * straight line drawn confidently across the outage. The expected spacing is
 * derived from the window rather than assumed hourly, because the endpoint
 * downsamples by window length.
 */
const GAP_BREAK_MULTIPLE = 4;

interface Props {
  /** Null renders nothing at all — the caller has no station to chart. */
  siteId: string | null;
  /**
   * The unit to OPEN on. Comes from the river's ladder where there is one, so
   * the chart and the reading above it start out saying the same thing.
   *
   * Not a lock: see the toggle below. It is the default, and switching away
   * from it is the user's call.
   */
  unit: 'ft' | 'cfs';
  /**
   * The ladder to shade behind the line. Null for any station Eddy has not
   * rated — the chart still draws, it just has no verdict to draw against,
   * which is exactly the distinction the whole app maintains between a rated
   * gauge and a reference one.
   */
  thresholds?: (ThresholdValues & { thresholdUnit?: 'ft' | 'cfs' }) | null;
  /**
   * NWS stages to rule across the plot. FEET ONLY — see the guard below.
   *
   * The reference tier's only piece of context. A rated gauge gets condition
   * bands because a human decided where they go; an unrated one got a bare line
   * and no way to tell whether it was high. These are the Weather Service's own
   * published thresholds for the station, so drawing them makes no claim Eddy
   * has not earned.
   */
  floodStages?: GaugeFloodStages | null;
  /** Section heading. Omitted when the caller draws its own. */
  title?: string;
}

interface Point {
  t: number;
  v: number;
}

function valueIn(reading: GaugeHistoryReading, unit: 'ft' | 'cfs'): number | null {
  const raw = unit === 'cfs' ? reading.dischargeCfs : reading.gaugeHeightFt;
  return raw != null && Number.isFinite(raw) ? raw : null;
}

/** "Tue 2pm" for a short window, "Jul 12" for a long one. */
function axisTime(ms: number, days: number): string {
  const d = new Date(ms);
  if (days <= 1) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** The scrub readout wants the full moment, not an axis tick. */
function scrubTime(ms: number): string {
  const d = new Date(ms);
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString(
    undefined,
    { hour: 'numeric', minute: '2-digit' },
  )}`;
}

export function GaugeChart({
  siteId,
  unit,
  thresholds = null,
  floodStages = null,
  title,
}: Props) {
  const { colors, elevation, isDark } = useTheme();
  const [days, setDays] = useState<number>(7);
  const [width, setWidth] = useState(0);
  const [scrubX, setScrubX] = useState<number | null>(null);
  /**
   * The unit being drawn, once the reader has chosen one.
   *
   * Null means "whatever the caller passed", which is the ladder's unit on a
   * rated river and discharge on a reference station. The override exists
   * because flood stages are published in FEET and nothing else: a station
   * charted in cfs cannot show them at all, so a reader looking at a creek with
   * an official flood line needs a way to get to the axis it lives on.
   */
  const [unitOverride, setUnitOverride] = useState<'ft' | 'cfs' | null>(null);

  const { history, loading, unavailable } = useGaugeHistory(siteId, days);

  const drawnUnit = unitOverride ?? unit;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  }, []);

  /**
   * THE LADDER'S OWN UNIT WINS, or there is no shading.
   *
   * The band bounds are raw numbers and the drawn series is raw numbers, and
   * comparing them is arithmetic that cannot tell feet from cfs. A ladder in
   * stage shaded behind a discharge line would put "Flood" at 4 cfs. Same guard
   * ReadingScale makes, same reason.
   */
  const zones = useMemo(() => {
    if (!thresholds) return [];
    if (thresholds.thresholdUnit && thresholds.thresholdUnit !== drawnUnit) return [];
    return buildZones(thresholds);
  }, [thresholds, drawnUnit]);

  /**
   * The NWS lines to rule, lowest first.
   *
   * EMPTY ON A CFS AXIS, unconditionally. NWPS publishes these as stages and
   * nothing else — its category `flow` field comes back as -9999 — so a flood
   * line drawn against discharge would put "flood" at 20 cfs on a river that
   * floods at 20 feet. Same guard the condition bands make one block up, and
   * the more important of the two: that one mislabels a band, this one draws a
   * flood line in the wrong place.
   */
  const stageLines = useMemo(() => {
    if (!floodStages || drawnUnit !== 'ft') return [];
    const byKey: Record<FloodStageKey, number | null> = {
      action: floodStages.actionFt,
      flood: floodStages.floodFt,
      moderate: floodStages.moderateFt,
      major: floodStages.majorFt,
    };
    return FLOOD_STAGE_ORDER.flatMap((key) => {
      const value = byKey[key];
      return value != null && Number.isFinite(value) ? [{ key, value }] : [];
    });
  }, [floodStages, drawnUnit]);

  const points = useMemo<Point[]>(() => {
    if (!history) return [];
    const out: Point[] = [];
    for (const r of history.readings) {
      const v = valueIn(r, drawnUnit);
      const t = new Date(r.timestamp).getTime();
      if (v === null || !Number.isFinite(t)) continue;
      out.push({ t, v });
    }
    return out;
  }, [history, drawnUnit]);

  const domain = useMemo(() => {
    if (points.length === 0) return null;

    let minV = points[0].v;
    let maxV = points[0].v;
    for (const p of points) {
      if (p.v < minV) minV = p.v;
      if (p.v > maxV) maxV = p.v;
    }

    // A dead-flat series has zero range, which would divide by zero below and
    // draw the line along an edge. Give it a band to sit in the middle of.
    const dataRange =
      maxV - minV || Math.max(Math.abs(maxV) * 0.1, drawnUnit === 'cfs' ? 10 : 0.2);
    const reach = dataRange * NEAR_THRESHOLD_FRACTION;

    // Stage lines pull the axis on exactly the same terms as band edges: an
    // official flood line just above where the week has been is the single most
    // useful thing on this chart, and one an order of magnitude up would flatten
    // the week into a stripe along the bottom.
    for (const line of stageLines) {
      if (line.value < minV && line.value > minV - reach) minV = line.value;
      if (line.value > maxV && line.value < maxV + reach) maxV = line.value;
    }

    for (const z of zones) {
      // Only the EDGES matter: a band boundary is the number someone needs to
      // see their line approaching. Pulling in a band's far side would stretch
      // the axis for a line nobody is near.
      for (const edge of [z.min, z.max]) {
        if (!Number.isFinite(edge)) continue;
        if (edge < minV && edge > minV - reach) minV = edge;
        if (edge > maxV && edge < maxV + reach) maxV = edge;
      }
    }

    const pad = (maxV - minV || dataRange) * 0.08;
    return { min: minV - pad, max: maxV + pad, t0: points[0].t, t1: points[points.length - 1].t };
  }, [points, zones, stageLines, drawnUnit]);

  const plotWidth = Math.max(0, width - PAD_RIGHT);
  const plotHeight = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;

  const scale = useMemo(() => {
    if (!domain || plotWidth <= 0) return null;
    const spanT = domain.t1 - domain.t0 || 1;
    const spanV = domain.max - domain.min || 1;
    return {
      x: (t: number) => ((t - domain.t0) / spanT) * plotWidth,
      y: (v: number) => PAD_TOP + (1 - (v - domain.min) / spanV) * plotHeight,
    };
  }, [domain, plotWidth, plotHeight]);

  /**
   * The line, as one or more segments.
   *
   * Segments rather than a single path so an outage reads as an outage. See
   * GAP_BREAK_MULTIPLE.
   */
  const paths = useMemo<string[]>(() => {
    if (!scale || points.length < 2) return [];
    const expected = (points[points.length - 1].t - points[0].t) / (points.length - 1);
    const breakAt = expected * GAP_BREAK_MULTIPLE;

    const out: string[] = [];
    let current = `M ${scale.x(points[0].t).toFixed(2)} ${scale.y(points[0].v).toFixed(2)}`;
    for (let i = 1; i < points.length; i++) {
      const gap = points[i].t - points[i - 1].t;
      const cmd = `${scale.x(points[i].t).toFixed(2)} ${scale.y(points[i].v).toFixed(2)}`;
      if (gap > breakAt) {
        out.push(current);
        current = `M ${cmd}`;
      } else {
        current += ` L ${cmd}`;
      }
    }
    out.push(current);
    // A lone moveto is not a line; dropping it avoids a stray dot at a gap edge.
    return out.filter((d) => d.includes('L'));
  }, [points, scale]);

  /**
   * The units this station actually reported in the loaded window.
   *
   * Derived from the DATA, never from the station's declared parameter codes: a
   * site that is supposed to publish stage and has not for a week should not
   * offer a toggle to an empty chart. A single entry means no toggle at all.
   */
  const availableUnits = useMemo<('ft' | 'cfs')[]>(() => {
    if (!history) return [];
    const out: ('ft' | 'cfs')[] = [];
    if (history.readings.some((r) => r.gaugeHeightFt != null)) out.push('ft');
    if (history.readings.some((r) => r.dischargeCfs != null)) out.push('cfs');
    return out;
  }, [history]);

  const scrubbed = useMemo<Point | null>(() => {
    if (scrubX === null || !scale || points.length === 0 || !domain) return null;
    const spanT = domain.t1 - domain.t0 || 1;
    const targetT = domain.t0 + (Math.min(Math.max(scrubX, 0), plotWidth) / plotWidth) * spanT;

    // Linear scan. 720 points is nothing next to the gesture's own cost, and a
    // binary search here would be a cleverness nobody can check.
    let best = points[0];
    let bestDelta = Math.abs(points[0].t - targetT);
    for (const p of points) {
      const delta = Math.abs(p.t - targetT);
      if (delta < bestDelta) {
        best = p;
        bestDelta = delta;
      }
    }
    return best;
  }, [scrubX, scale, points, domain, plotWidth]);

  // useMemo, not useRef: the handlers are spread onto a View during render, and
  // reading a ref's `.current` there is the thing react-hooks/refs forbids. The
  // empty dep array makes this every bit as stable as the ref was — setScrubX
  // is a setState function, which React guarantees never changes identity.
  const pan = useMemo(
    () =>
      PanResponder.create({
        // Claim on touch-down so a tap reads out, and so the enclosing
        // ScrollView does not steal a slow horizontal drag across the plot.
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => setScrubX(e.nativeEvent.locationX),
        onPanResponderMove: (e) => setScrubX(e.nativeEvent.locationX),
        onPanResponderRelease: () => setScrubX(null),
        onPanResponderTerminate: () => setScrubX(null),
      }),
    [],
  );

  if (!siteId) return null;

  const lineColor = colors.accent;
  const hasPlot = scale !== null && domain !== null && paths.length > 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
      <View style={styles.head}>
        <View style={styles.headText}>
          {title ? (
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          ) : null}
          {/* The scrub readout replaces the subtitle rather than sitting beside
              it: a finger on the plot means the question is "what was it then",
              and two lines of metadata competing for the same row is how a
              readout gets missed. */}
          {scrubbed ? (
            <Text style={[styles.scrubLine, { color: colors.textMuted }]} numberOfLines={1}>
              <Text style={[styles.scrubValue, { color: colors.text }]}>
                {formatReading(scrubbed.v, drawnUnit)}
              </Text>
              {'  '}
              {scrubTime(scrubbed.t)}
            </Text>
          ) : (
            <Text style={[styles.subtitle, { color: colors.textSubtle }]} numberOfLines={1}>
              {drawnUnit === 'cfs' ? 'Discharge' : 'Gauge height'} · last{' '}
              {days === 1 ? '24 hours' : `${days} days`}
            </Text>
          )}
        </View>

        {/* ── Units ────────────────────────────────────────────────
            Only when the station published BOTH in this window. One unit and
            the control is a decision nobody has, which is the same reason the
            range strip does not offer a window the endpoint cannot fill.

            It sits before the range toggle because it changes what the chart is
            OF, where the range only changes how much of it you see. */}
        {availableUnits.length > 1 ? (
          <View style={[styles.ranges, { borderColor: colors.border }]}>
            {availableUnits.map((u) => {
              const active = u === drawnUnit;
              return (
                <Pressable
                  key={u}
                  onPress={() => setUnitOverride(u)}
                  style={[styles.range, active && { backgroundColor: colors.cardRaised }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={u === 'ft' ? 'Show gauge height' : 'Show discharge'}
                >
                  <Text
                    style={[
                      styles.rangeText,
                      { color: active ? colors.text : colors.textSubtle },
                    ]}
                  >
                    {u}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={[styles.ranges, { borderColor: colors.border }]}>
          {RANGES.map((r) => {
            const active = r.days === days;
            return (
              <Pressable
                key={r.days}
                onPress={() => setDays(r.days)}
                style={[
                  styles.range,
                  active && { backgroundColor: colors.cardRaised },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Show last ${r.label}`}
              >
                <Text
                  style={[
                    styles.rangeText,
                    { color: active ? colors.text : colors.textSubtle },
                  ]}
                >
                  {r.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.plotWrap} onLayout={onLayout}>
        {width > 0 && hasPlot ? (
          <View {...pan.panHandlers}>
            <Svg width={width} height={CHART_HEIGHT}>
              {/* ── The bands, at their true numeric height ── */}
              {zones.map((zone) => {
                const top = scale.y(Math.min(zone.max, domain.max));
                const bottom = scale.y(Math.max(zone.min, domain.min));
                const h = bottom - top;
                // Entirely outside the visible domain — not clipped to a sliver,
                // dropped. A 1px stripe of "Flood" along the top edge implies a
                // proximity the numbers do not support.
                if (h <= 0.5) return null;
                return (
                  <Rect
                    key={zone.key}
                    x={0}
                    y={top}
                    width={plotWidth}
                    height={h}
                    fill={conditionColor(zone.key)}
                    // Low enough that the line and its readout stay the subject.
                    // Lifted slightly on dark, where the same alpha over
                    // near-black stone all but disappears.
                    opacity={isDark ? 0.17 : 0.13}
                  />
                );
              })}

              {/* Band boundaries, labelled down the right edge. These are the
                  numbers people actually want off a chart like this — "High
                  starts at 1,400" — and a shaded region alone does not say it. */}
              {zones.map((zone) => {
                const y = scale.y(zone.max);
                if (zone.openEnded) return null;
                if (y < PAD_TOP || y > PAD_TOP + plotHeight) return null;
                return (
                  <Line
                    key={`edge-${zone.key}`}
                    x1={0}
                    y1={y}
                    x2={plotWidth}
                    y2={y}
                    stroke={conditionColor(zone.key)}
                    strokeWidth={1}
                    strokeDasharray="3,3"
                    opacity={0.55}
                  />
                );
              })}

              {/* ── Value axis, right edge ── */}
              {[domain.max, (domain.max + domain.min) / 2, domain.min].map((v, i) => (
                <SvgText
                  key={`v-${i}`}
                  x={plotWidth + 6}
                  y={scale.y(v) + 4}
                  fill={colors.textSubtle}
                  fontSize={10}
                  fontFamily={fonts.mono}
                >
                  {formatReading(v, drawnUnit).replace(` ${drawnUnit}`, '')}
                </SvgText>
              ))}

              {/* ── The NWS stages ──
                  Drawn OVER the bands and UNDER the line: they are somebody
                  else's threshold laid across the picture, so they must not sit
                  behind a condition band that would tint them, and they must not
                  cover the reading they are context for.

                  Never rendered on a cfs axis — stageLines is empty there by
                  construction, so this cannot be got wrong by editing the JSX.
                  The label carries "NWS" every time; a bare violet rule is an
                  unattributed claim about danger. */}
              {stageLines.map((line) => {
                const y = scale.y(line.value);
                if (y < PAD_TOP || y > PAD_TOP + plotHeight) return null;
                const def = FLOOD_STAGE_SYSTEM[line.key];
                return (
                  <G key={`stage-${line.key}`}>
                    <Line
                      x1={0}
                      y1={y}
                      x2={plotWidth}
                      y2={y}
                      stroke={floodStageColor()}
                      strokeWidth={1.5}
                      strokeDasharray={def.dash}
                      opacity={def.opacity}
                    />
                    <SvgText
                      x={2}
                      // Above its own line, and pushed below it for a stage
                      // sitting within a label's height of the top edge —
                      // otherwise the topmost one clips out of the viewport.
                      y={y - 3 < PAD_TOP + 8 ? y + 11 : y - 3}
                      fill={floodStageColor()}
                      fontSize={9}
                      fontFamily={fonts.medium}
                      opacity={Math.max(def.opacity, 0.75)}
                    >
                      {def.label}
                    </SvgText>
                  </G>
                );
              })}

              {/* ── The line ── */}
              {paths.map((d, i) => (
                <Path
                  key={`p-${i}`}
                  d={d}
                  stroke={lineColor}
                  strokeWidth={2}
                  fill="none"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}

              {/* ── Where it is now ── */}
              <Circle
                cx={scale.x(points[points.length - 1].t)}
                cy={scale.y(points[points.length - 1].v)}
                r={3.5}
                fill={lineColor}
              />

              {/* ── The scrub rule ── */}
              {scrubbed ? (
                <>
                  <Line
                    x1={scale.x(scrubbed.t)}
                    y1={PAD_TOP}
                    x2={scale.x(scrubbed.t)}
                    y2={PAD_TOP + plotHeight}
                    stroke={colors.text}
                    strokeWidth={1}
                    opacity={0.4}
                  />
                  <Circle
                    cx={scale.x(scrubbed.t)}
                    cy={scale.y(scrubbed.v)}
                    r={4.5}
                    fill={colors.card}
                    stroke={lineColor}
                    strokeWidth={2}
                  />
                </>
              ) : null}

              {/* ── Time axis ── */}
              <SvgText
                x={0}
                y={CHART_HEIGHT - 4}
                fill={colors.textSubtle}
                fontSize={10}
                fontFamily={fonts.body}
              >
                {axisTime(domain.t0, days)}
              </SvgText>
              <SvgText
                x={plotWidth}
                y={CHART_HEIGHT - 4}
                fill={colors.textSubtle}
                fontSize={10}
                fontFamily={fonts.body}
                textAnchor="end"
              >
                {axisTime(domain.t1, days)}
              </SvgText>
            </Svg>
          </View>
        ) : (
          <View style={[styles.placeholder, { height: CHART_HEIGHT }]}>
            {loading ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Text style={[styles.placeholderText, { color: colors.textSubtle }]}>
                {/* Three distinct states, because two of them would be a lie as
                    the third. Only `unavailable` may be phrased as a fact about
                    the gauge — a failed request leaves the previous line up and
                    never lands here; see useGaugeHistory.

                    The single-point case is its own sentence. A line needs two
                    points, so one reading falls through to this branch, and
                    saying "none reported" over a station that reported once is
                    the app contradicting the number on the card above it. */}
                {unavailable
                  ? 'No recent history published for this gauge.'
                  : points.length === 1
                    ? `Only one ${drawnUnit === 'cfs' ? 'discharge' : 'gauge height'} reading in this window — not enough to chart.`
                    : `No ${drawnUnit === 'cfs' ? 'discharge' : 'gauge height'} reported in this window.`}
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 14, borderRadius: 16, padding: 14 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 6 },
  headText: { flex: 1 },
  title: { ...t.base, fontFamily: fonts.heading },
  subtitle: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  scrubLine: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  scrubValue: { ...t.sm, fontFamily: fonts.monoMedium },
  ranges: { flexDirection: 'row', borderWidth: 1, borderRadius: 9, overflow: 'hidden' },
  range: { paddingHorizontal: 10, paddingVertical: 5 },
  rangeText: { ...t.xs, fontFamily: fonts.medium },
  plotWrap: { marginTop: 2 },
  placeholder: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  placeholderText: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
});
