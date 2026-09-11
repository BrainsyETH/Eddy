// eddy-ios/src/components/GaugeChart.tsx
// The hydrograph: what this gauge has been doing, against its usual range.
//
// ── Why the app has a chart at all ──────────────────────────────────────────
// Every surface in Eddy until now answered "what is the river doing RIGHT NOW".
// That is the right headline and it is not the whole question: 900 cfs on the
// way down from 2,400 is a different weekend from 900 on the way up, and the
// reading card cannot tell them apart. The trend arrow tries — it compares two
// points — and a week of line does it properly.
//
// ── What this file no longer decides ────────────────────────────────────────
// The axis, the gap rule, the tick placement, the nearest-point lookup and the
// qualifier vocabulary all live in shared/chart-model.ts, which the website's
// FlowTrendChart draws from too. This file took `splitAtGaps` from it and kept
// its own copy of the rest, and the copies drifted where nobody looks: the value
// axis was labelled with the padded domain's min, midpoint and max (so the app
// printed 1,437.6 where the site printed 1,400), and the domain had no floor, so
// a low-water discharge plot could label its bottom below zero — negative flow,
// on a chart of a river.
//
// Pixels, gestures and colour are still decided here. Meaning is not.
// src/lib/gauge/chart-parity.test.ts is the guard on that split.
//
// ── The forecast and the typical range ──────────────────────────────────────
// The history endpoint has sent an official NWS forecast and the USGS day-of-year
// percentile range to both clients since NWPS replaced AHPS. This chart drew
// neither, so the phone showed a week of line beside an EddyTake paragraph
// quoting a forecast that was not on the plot. Both are drawn now, both are
// labelled in the legend, and the forecast carries its ISSUE TIME — NWPS reissues
// on a schedule, so a dashed line read at 6pm may predate the afternoon's rain.
//
// The typical range is DISCHARGE ONLY, because usgs_daily_percentiles is
// snapshotted for discharge and there is no stage equivalent. Same guard the web
// chart makes, for the same reason.
//
// ── One background context, not two competing verdict systems ──────────────
// ReadingScale above this chart already answers where the current reading sits
// in Eddy's condition ladder. Repainting all six condition bands here put that
// verdict behind the day-of-year typical range, then added both sets of dashed
// boundaries on top. The result was accurate and nearly impossible to parse.
//
// This plot now uses a neutral grid and reserves its single shaded area for the
// typical 25–75% range. One labelled rule marks the next condition above the
// current reading; it preserves the decision number without repainting the full
// ladder. Official NWS stages remain labelled rules because they are independent
// safety context rather than a second background classification.
//
// ── NWS stages, for gauges that publish them ────────────────────────────────
// An unrated gauge otherwise has no way to say whether it is near an official
// flood threshold — the flow band on the card above says "higher than usual",
// which is a comparison to its own record and not a safety stage.
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
// Touch and drag reads out the value and the time under your finger. One
// Gesture.Pan() over the whole plot rather than per-point touch targets: a
// 30-day window is ~720 points, and 720 Pressables is a frame budget spent on
// hit-testing.
//
// Gesture.Pan() and not PanResponder, because this chart also renders inside
// the map sheet, whose sheet and pager are RNGH pans — and RNGH cancels the RN
// responder system the moment one of its own gestures activates. The
// PanResponder this file used to carry therefore scrubbed fine on the gauge
// and river screens and was stolen ~12pt in inside the sheet, so the sheet
// mounted the chart with the scrub switched off entirely (the deleted
// `scrubbable` prop). The pan joins the axis-splitting contract MapSheet and
// SheetPager keep between themselves instead of naming either by ref: see the
// note on the gesture itself.
//
// The scrub is also reachable without the gesture: the plot is an adjustable
// element for VoiceOver, and a swipe up or down steps it one READING at a time
// through stepScrubTime() from the shared model — the same stepping the web
// chart gives arrow keys.

import { Component, useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
} from 'react-native';
// A direct import of a native module, like MapSheet's and SheetPager's — it is
// a declared dependency and the root layout already mounts its root view, so
// this adds no new runtime fingerprint. See SwipeRow.tsx for the situation
// where reaching for it would be wrong.
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, {
  Circle,
  G,
  Line,
  Path,
  Text as SvgText,
} from 'react-native-svg';
import type { GaugeFloodStages } from '@eddy/types';
import {
  chartDomain,
  chartPoints,
  chartSegments,
  nearestChartPoint,
  niceValueTicks,
  nowLabel,
  qualifierText,
  stepScrubTime,
  timeTicks,
  type ChartPoint,
} from '@eddy/conditions/chart-model';
import {
  buildZones,
  nextZoneBoundary,
  type ThresholdValues,
} from '@eddy/conditions/threshold-zones';
import {
  computeTrend,
  formatGaugeTrend,
  isGaugeTrendWindowReliable,
} from '@eddy/conditions/gauge-trend';
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
import { warn } from '@/lib/monitoring';
import { TrendPill } from '@/components/TrendPill';

/** The three questions people actually ask, and nothing else. */
const RANGES = [
  { days: 1, label: '24h' },
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
] as const;

/**
 * 200, up from 168. Four labelled value ticks plus a typical range, optional
 * NWS stage rules and a forecast need the usable height. Every consumer scrolls
 * (the gauge screen, river screen and map sheet tab), so the extra 32px costs
 * scroll distance rather than squeezing another panel. Sized WITH the axis:
 * neither this nor the tick budget below should move without the other.
 */
const CHART_HEIGHT = 200;
/** Room for the value labels down the right edge. */
const PAD_RIGHT = 46;
/** Room for the time labels under the plot. */
const PAD_BOTTOM = 18;
const PAD_TOP = 10;

/**
 * Whether an NWS stage label goes BELOW its line rather than above it: the
 * line sits within a label's height of the top edge, and a label above it
 * would clip out of the viewport. Named because two things ask — the stage
 * label itself, and the now-label, which shares that top line of the plot
 * and has to know when it is already taken.
 */
const stageLabelBelowLine = (y: number): boolean => y - 3 < PAD_TOP + 8;

/**
 * How far past the data a reference line may sit and still be pulled into view, as a
 * fraction of the data's own range.
 *
 * Generous enough that the next Eddy condition or a nearby NWS stage shows,
 * tight enough that a distant boundary does not flatten the week into a line.
 */
const NEAR_THRESHOLD_FRACTION = 0.75;

/**
 * The day-of-year typical range.
 *
 * Teal-700 — the flow-band family, which is where it belongs: "normal for this
 * date" is a COMPARISON, exactly what that ramp means, and never a verdict about
 * whether the river is floatable. The web chart uses this same hex for the same
 * band; see FlowTrendChart's TYPICAL_COLOR.
 */
const TYPICAL_COLOR = '#0f766e';

/**
 * Break the line when the gap between samples exceeds this multiple of the
 * cadence.
 *
 * A station that stopped reporting for two days should show a HOLE, not a
 * straight line drawn confidently across the outage.
 *
 * CADENCE IS THE MEDIAN INTERVAL, measured by splitAtGaps() rather than assumed
 * hourly, and it used to be the mean of the whole window. That was already
 * fragile — one long outage inflates the mean until the outage stops qualifying
 * — and it stopped being merely fragile when the endpoint moved from a fixed
 * stride to extrema-preserving sampling: those points are unevenly spaced ON
 * PURPOSE, and a mean-based threshold reads the bucketing as outages that never
 * happened. See shared/chart-model.ts.
 */
const GAP_BREAK_MULTIPLE = 4;

/**
 * Horizontal travel that claims the touch for the scrub.
 *
 * Deliberately TIGHTER than SheetPager's ACTIVATE_X (12): over the plot, a
 * horizontal drag means "when was this", and the chart must cross its own
 * threshold before the pager crosses its wider one — that ordering, not a
 * declared relation, is what stops the page turning under a scrub.
 */
const SCRUB_ACTIVATE_X = 8;

/**
 * Vertical travel that hands the touch onward.
 *
 * Mirrors the sheet's DRAG_DEAD_ZONE (8), so the moment a drag is vertical
 * enough for the sheet to claim it, this pan has already stood down — the same
 * first-axis-to-move-wins contract MapSheet and SheetPager keep between
 * themselves. On the gauge and river screens the beneficiary is the plain
 * ScrollView, which the old touch-down claim used to freeze whenever a scroll
 * began on the plot.
 */
const SCRUB_FAIL_Y = 8;

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
   * The ladder used to name an observed value while scrubbing. Null for any
   * station Eddy has not rated, so a reference gauge never inherits Eddy's
   * condition vocabulary.
   */
  thresholds?: (ThresholdValues & { thresholdUnit?: 'ft' | 'cfs' }) | null;
  /**
   * NWS stages to rule across the plot. FEET ONLY — see the guard below.
   *
   * These are the Weather Service's own published thresholds for the station,
   * so drawing them makes no claim Eddy has not earned.
   */
  floodStages?: GaugeFloodStages | null;
  /** Section heading. Omitted when the caller draws its own. */
  title?: string;
  /** Hide when the surrounding card already states the same trend. */
  showTrend?: boolean;
}

/** One day of the day-of-year typical range, at the instant it is drawn at. */
interface TypicalRow {
  t: number;
  median: number;
  low: number | null;
  high: number | null;
}

/** What the scrub is sitting on. A forecast must never read as a measurement. */
type ScrubbedPoint = { point: ChartPoint; kind: 'observed' | 'forecast' };

/** "Tue 2pm" for a short window, "Jul 12" for a long one. */
function axisTime(ms: number, days: number): string {
  const d = new Date(ms);
  if (days <= 1) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * A value-axis tick, without its unit.
 *
 * The column right of the plot is PAD_RIGHT wide, ~40px of it usable, and a
 * six-digit discharge in 10px mono ("120,000" — the Arkansas gets there) runs
 * off the edge of the Svg. Widening the column would shrink the plot on every
 * chart to fit a number most never show, so instead the formatter gives way
 * only at six digits: "12,000" still reads as "12,000", which the review asked
 * to keep, and "120,000" becomes "120k". The web axis abbreviates from 1,000
 * up; this deliberately does not, because the phone axis has the width for
 * five digits and a real number beats a rounded one where it fits.
 */
function axisValue(value: number, unit: 'ft' | 'cfs'): string {
  if (unit === 'cfs' && Math.abs(value) >= 100_000) {
    const k = value / 1000;
    // Whole thousands print whole; a 2.5-rung tick (102,500) keeps its half
    // rather than rounding onto a number that is not the tick.
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return formatReading(value, unit).replace(` ${unit}`, '');
}

/** The scrub readout wants the full moment, not an axis tick. */
function scrubTime(ms: number): string {
  const d = new Date(ms);
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString(
    undefined,
    { hour: 'numeric', minute: '2-digit' },
  )}`;
}

function GaugeChartInner({
  siteId,
  unit,
  thresholds = null,
  floodStages = null,
  title,
  showTrend = true,
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

  const { history, loading, unavailable, failed, retry, historyDays, matchesRequest } =
    useGaugeHistory(siteId, days);

  const drawnUnit = unitOverride ?? unit;

  /**
   * The range the line on screen actually covers, which is NOT always `days`.
   *
   * useGaugeHistory keeps the previous series through a range change so the
   * chart does not flash empty, and through a failure so a reader is not handed
   * an error in place of a chart they were reading. Both are deliberate. What
   * was not deliberate is that everything describing the series read `days` —
   * the range that was ASKED for — so the subtitle printed "last 24 hours" over
   * a month of line, the axis labelled thirty days with three bare hour stamps,
   * and VoiceOver spoke both as fact.
   *
   * The line is honest about itself. The words around it have to follow the
   * line, not the request. The range STRIP is the one exception below and
   * stays on `days`: it shows what you chose, and a control that quietly
   * re-selects itself from arriving data is a control you cannot trust.
   */
  const drawnDays = historyDays ?? days;

  /**
   * Which way it is going, over roughly the last six hours.
   *
   * ── COMPUTED HERE, NOT SENT ───────────────────────────────────────────
   * The series is already in hand and the unit is under the reader's thumb, so
   * a wire field could not follow the unit toggle even if one existed. The same
   * rule the website runs (shared/gauge-trend.ts) over the same points the line
   * is drawn from means the badge and the line cannot disagree.
   *
   * ── SIX HOURS, WHATEVER THE RANGE IS SET TO ───────────────────────────
   * Not scaled to `days`. This is the same fact the river screen, the Today
   * rows and the Favorites cards show, and it has to be the same number on all
   * of them — a badge that silently changes meaning when you zoom out is worse
   * than one that is absent.
   *
   * ── WHY 30d IS EXCLUDED ───────────────────────────────────────────────
   * The endpoint downsamples a month to ~360 points by KEEPING EACH BUCKET'S
   * MIN AND MAX, so at roughly four hours per bucket the point nearest six
   * hours back is a local extremum rather than a representative reading, and
   * the delta gets measured against a peak or a trough. There is nothing to
   * compute honestly from at that range, so nothing is claimed.
   *
   * ── AND WHY THAT IS NOT ENOUGH ON ITS OWN ─────────────────────────────
   * This gate used to be `days === 30` alone, which tested the range the reader
   * ASKED for while computeTrend read the series the hook was HOLDING. Those
   * are not the same window. Going 30d → 24h, `days` becomes 1 while the month
   * of data is still on screen, so the gate stood open in exactly the direction
   * it was written to close — and the window check below does not catch it,
   * because a 30-day series is only ~2-4h between points, so the reading
   * nearest six hours back rounds to five or seven and passes cleanly.
   *
   * `matchesRequest` is the fix: the series must be the one that was asked for,
   * for this station and this range. It is deliberately stricter than the
   * subtitle and the axis, which follow the drawn range and stay honest that
   * way. A trend cannot do that — it is a claim about the last six hours, not a
   * description of what is on screen — so while the series is mismatched it is
   * withheld rather than relabelled. That costs a blink on every range change,
   * which is the right price for never stating a trend off the wrong window.
   *
   * ── THE WINDOW CHECK, WHICH IS A DIFFERENT PROBLEM ────────────────────
   * computeTrend takes the reading NEAREST six hours back with no floor on how
   * near that is, so a sparse or stalled station can answer from a window
   * nothing like the one asked for.
   * Past a twelve-hour gap it even selects the latest reading as its own
   * comparison and reports a rising river as "Holding steady" — always with a
   * 1h window, which this rejects. See shared/gauge-trend.test.ts, which pins
   * that behaviour and explains why it is not fixed there.
   */
  const trend = useMemo(
    () =>
      !matchesRequest || !history || days === 30
        ? null
        : computeTrend(history.readings, drawnUnit),
    [matchesRequest, history, days, drawnUnit],
  );
  const trustedTrend = isGaugeTrendWindowReliable(trend) ? trend : null;
  const shownTrend = showTrend ? trustedTrend : null;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  }, []);

  /**
   * THE LADDER'S OWN UNIT WINS, or there is no scrub verdict.
   *
   * The bounds and drawn series are raw numbers, and comparing them is arithmetic
   * that cannot tell feet from cfs. Without this guard the scrub could call a
   * discharge reading "Flood" using a four-foot stage threshold.
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
   * floods at 20 feet. Same unit guard as the scrub verdict one block up, and
   * the more important of the two: this would draw a flood line in the wrong
   * place rather than merely mislabel one reading.
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

  const points = useMemo(
    () => (history ? chartPoints(history.readings, drawnUnit) : []),
    [history, drawnUnit],
  );
  const newest = points.length ? points[points.length - 1] : null;

  /**
   * One decision boundary, rather than the whole condition ladder.
   *
   * The upper edge of the current band answers the useful next question—for
   * example, "High · 1,400 cfs"—while keeping the observed history dominant.
   * An open-ended final band has no honest next boundary.
   */
  const conditionBoundary = useMemo(
    () => nextZoneBoundary(zones, newest?.v),
    [zones, newest],
  );

  /**
   * The official forecast, ahead of the last reading.
   *
   * The endpoint has sent this since NWPS replaced AHPS, and this chart ignored
   * it — so the app drew a week of history next to an EddyTake paragraph quoting
   * a forecast the plot did not contain. Same reader as the observed series,
   * which means the same refusal to invent a value for an absent unit: NWPS
   * publishes stage, and its secondary flow field is often empty, so a cfs axis
   * frequently has no forecast to draw. That is a fact to show or omit, never to
   * fill in.
   */
  const forecastPoints = useMemo(
    () => (history?.forecast?.length ? chartPoints(history.forecast, drawnUnit) : []),
    [history, drawnUnit],
  );

  /**
   * "What this river normally does on this date", from the USGS day-of-year
   * percentiles.
   *
   * DISCHARGE ONLY, because usgs_daily_percentiles is snapshotted for discharge
   * and there is no stage equivalent — the same guard the web chart makes. A foot
   * axis simply has no typical range, and inventing one from stage would be
   * comparing a gauge's arbitrary datum against a national statistic.
   */
  const typical = useMemo<TypicalRow[]>(() => {
    if (drawnUnit !== 'cfs' || !history?.typical?.length) return [];
    return history.typical.flatMap((row) => {
      const t = new Date(`${row.date}T12:00:00`).getTime();
      return Number.isFinite(t) && row.p50Cfs !== null
        ? [{ t, median: row.p50Cfs, low: row.p25Cfs, high: row.p75Cfs }]
        : [];
    });
  }, [history, drawnUnit]);

  /**
   * The axis, from shared/chart-model.ts rather than from a loop in this file.
   *
   * This is the divergence that made the model worth extracting and then outlived
   * the extraction: the copy that lived here had no floor, so a low-water
   * discharge axis could label its bottom gridline below zero — negative flow,
   * on a chart of a river. chartDomain() clamps cfs at zero and pointedly does
   * NOT clamp stage, because gauge height is relative to a datum and Ozark
   * stations do read below theirs. There is a test pinning both; it only guards
   * the renderers that call this.
   */
  const domain = useMemo(() => {
    const spanning = [
      ...points,
      ...forecastPoints,
      ...typical.flatMap((row) =>
        [row.low, row.median, row.high].flatMap((value) =>
          value === null
            ? []
            : [{
                t: row.t,
                v: value,
                timestamp: '',
                qualifiers: [],
              }],
        ),
      ),
    ].sort((a, b) => a.t - b.t);

    // Only context actually drawn on the plot may stretch its scale. One nearby
    // condition boundary is useful; the rest of the ladder remains on the
    // ReadingScale and cannot flatten the observed history invisibly.
    const context = [
      ...stageLines.map((line) => line.value),
      ...(conditionBoundary ? [conditionBoundary.value] : []),
    ];
    return chartDomain(spanning, drawnUnit, context, NEAR_THRESHOLD_FRACTION);
  }, [points, forecastPoints, typical, stageLines, conditionBoundary, drawnUnit]);

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

  const visibleConditionBoundary = (() => {
    if (!conditionBoundary || !scale) return null;
    const y = scale.y(conditionBoundary.value);
    return y >= PAD_TOP && y <= PAD_TOP + plotHeight
      ? { ...conditionBoundary, y }
      : null;
  })();
  const showConditionBoundaryLabel =
    visibleConditionBoundary !== null &&
    !stageLines.some(
      (line) => Math.abs(scale!.y(line.value) - visibleConditionBoundary.y) < 14,
    );

  /**
   * The line, as one or more segments, plus the readings that stand alone.
   *
   * Segments rather than a single path so an outage reads as an outage — see
   * GAP_BREAK_MULTIPLE. The isolated readings used to be dropped here on the
   * grounds that a lone point is not a line, which is true and left a real
   * reading rendered as blank space; chartSegments() hands both back and the dots
   * are drawn below.
   */
  const series = useMemo(() => {
    const empty = {
      paths: [] as string[],
      dots: [] as ChartPoint[],
      forecastPaths: [] as string[],
      forecastDots: [] as ChartPoint[],
      typicalArea: '',
      typicalPath: '',
    };
    if (!scale) return empty;
    const toPath = (segment: ChartPoint[]) =>
      segment
        .map((p, i) => `${i ? 'L' : 'M'} ${scale.x(p.t).toFixed(2)} ${scale.y(p.v).toFixed(2)}`)
        .join(' ');

    const { lines, isolated } = chartSegments(points, GAP_BREAK_MULTIPLE);
    const forecastSplit = chartSegments(forecastPoints, GAP_BREAK_MULTIPLE);
    return {
      paths: lines.map(toPath),
      dots: isolated,
      forecastPaths: forecastSplit.lines.map(toPath),
      // A short-range issuance can be a single point. Dropping it would repeat,
      // in the forecast series, exactly the omission chartSegments() exists to
      // stop in the observed one.
      forecastDots: forecastSplit.isolated,
      typicalArea: (() => {
        const rows = typical.filter(
          (row): row is TypicalRow & { low: number; high: number } =>
            row.low !== null && row.high !== null,
        );
        if (rows.length < 2) return '';
        const up = rows
          .map((row, i) => `${i ? 'L' : 'M'} ${scale.x(row.t).toFixed(2)} ${scale.y(row.high).toFixed(2)}`)
          .join(' ');
        const back = rows
          .slice()
          .reverse()
          .map((row) => `L ${scale.x(row.t).toFixed(2)} ${scale.y(row.low).toFixed(2)}`)
          .join(' ');
        return `${up} ${back} Z`;
      })(),
      // A shortened USGS percentile ladder may still publish a valid median.
      // Draw it only when the 25–75% envelope cannot be formed, so the fallback
      // preserves context without adding another layer to a complete chart.
      typicalPath:
        typical.length > 1 && typical.filter((row) => row.low !== null && row.high !== null).length < 2
          ? toPath(typical.map((row) => ({
              t: row.t,
              v: row.median,
              timestamp: '',
              qualifiers: [],
            })))
          : '',
    };
  }, [points, forecastPoints, typical, scale]);

  /**
   * Round numbers down the right edge, from the same tick function the web axis
   * uses.
   *
   * This file used to label the axis with the padded domain's min, midpoint and
   * max — so the app printed "1,437.6" where the website printed "1,400" for the
   * same gauge in the same week. Nobody reads a hydrograph to learn the 8% pad.
   */
  const valueTicks = useMemo(
    // Four with headroom for five, matched to the 200px chart — the 168px
    // chart asked for three. See CHART_HEIGHT: the two numbers move together.
    //
    // Discharge is printed as whole cfs (formatReading rounds), so its ticks
    // are floored at whole cfs; a half-cfs rung on a low-water week printed
    // "5, 5, 6". Stage reads to the hundredth and takes the full ladder.
    () =>
      domain
        ? niceValueTicks(domain.min, domain.max, 4, 5, drawnUnit === 'cfs' ? { minStep: 1 } : {})
        : [],
    [domain, drawnUnit],
  );

  /** Three instants across the window, so the middle of the plot is placeable. */
  const xTicks = useMemo(
    () => (domain ? timeTicks(domain.t0, domain.t1, 3) : []),
    [domain],
  );

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

  const scrubbed = useMemo<ScrubbedPoint | null>(() => {
    if (scrubX === null || !scale || !domain) return null;
    const spanT = domain.t1 - domain.t0 || 1;
    const targetT = domain.t0 + (Math.min(Math.max(scrubX, 0), plotWidth) / plotWidth) * spanT;

    // Binary search from the shared model, replacing a linear scan this file
    // kept. The reason to share it is not the speed — it is that both charts must
    // answer "which reading is under this finger" the same way, including the
    // tie at the exact midpoint between two readings.
    const observed = nearestChartPoint(points, targetT);
    const forecast = nearestChartPoint(forecastPoints, targetT);
    if (!observed) return forecast ? { point: forecast, kind: 'forecast' } : null;
    if (!forecast) return { point: observed, kind: 'observed' };

    // Whichever is genuinely nearer. Always preferring the observed series would
    // read out the last real reading while the finger sits three days into the
    // forecast — a prediction relabelled as a measurement.
    return Math.abs(observed.t - targetT) <= Math.abs(forecast.t - targetT)
      ? { point: observed, kind: 'observed' }
      : { point: forecast, kind: 'forecast' };
  }, [scrubX, scale, points, forecastPoints, domain, plotWidth]);

  /**
   * The scrub gesture. Gesture.Pan(), so it exists inside the map sheet — the
   * history of why is in the header.
   *
   * It states its axes and no relations, which is the contract every pan in
   * the sheet already keeps: activate on horizontal travel before the pager's
   * wider threshold, fail on vertical the moment the sheet's own activation
   * distance is reached. Whichever crosses first wins, and the others are
   * cancelled by RNGH's ordinary arbitration — including the page scrollers
   * and the plain ScrollViews on the gauge and river screens.
   *
   * The readout still appears at TOUCH-DOWN, as the PanResponder's did: touch
   * events fire from the first contact, before arbitration has decided
   * anything. If the drag then turns out to be vertical this pan fails,
   * onFinalize clears the readout, and the sheet or the scroll takes over —
   * a readout that flashed for 8pt of travel is the honest cost of not
   * freezing every scroll that begins on the plot. onFinalize covers all
   * three ends: activation ended, failure, and a tap released in place.
   *
   * runOnJS, because the readout is React state and with Reanimated installed
   * RNGH otherwise expects worklets. The empty dep array is as stable as the
   * old useRef was — setScrubX never changes identity.
   */
  const scrubGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-SCRUB_ACTIVATE_X, SCRUB_ACTIVATE_X])
        .failOffsetY([-SCRUB_FAIL_Y, SCRUB_FAIL_Y])
        .onTouchesDown((e) => {
          const touch = e.allTouches[0];
          if (touch) setScrubX(touch.x);
        })
        .onUpdate((e) => setScrubX(e.x))
        .onFinalize(() => setScrubX(null)),
    [],
  );

  /**
   * Every instant the scrub can land on — both series merged, ascending — for
   * stepping by READING rather than by distance. See stepScrubTime() in the
   * shared model for why a fixed step skips some readings and lands twice on
   * others.
   */
  const scrubTimes = useMemo(
    () => [...points, ...forecastPoints].map((p) => p.t).sort((a, b) => a - b),
    [points, forecastPoints],
  );

  if (!siteId) return null;

  const lineColor = colors.interactive;

  /**
   * ONE OBSERVED READING PLUS A FORECAST IS A CHART — and so is a forecast
   * with none. One reading ALONE is not, and that is the web chart's rule too.
   *
   * A single reading used to draw as a dot at a real instant, on the argument
   * that a dot is what the reading is. The axis under it was not real: with
   * nothing else to span, chartDomain() returns t0 === t1, every x maps to
   * the left edge, and timeTicks() prints three copies of the same hour under
   * a plot that is one dot at x = 0. The website refuses exactly this case
   * (FlowTrendChart's "fewer than two observed and no forecast" guard), so the
   * phone now does as well, and the placeholder says why.
   *
   * A forecast with no observations behind it still draws, in the same
   * release the web chart made its "current" nullable and the endpoint
   * stopped 404ing forecast-only stations — the three moved together, which
   * is what kept the two charts in step. The now-line and the current dot
   * stay observed-only below: a forecast-only plot has no "now" boundary to
   * draw, and inventing one at the forecast's start would claim an
   * observation nobody took.
   */
  const hasPlot =
    scale !== null &&
    domain !== null &&
    (forecastPoints.length > 0 || points.length >= 2);

  const scrubQualifiers =
    scrubbed?.kind === 'observed' ? qualifierText(scrubbed.point.qualifiers) : null;

  /**
   * Which band a reading sits in, off the same contiguous ladder the rects
   * draw. The web tooltip has always named the zone beside the number
   * ("340 cfs — Flowing"); this readout said "340 cfs" and left the verdict to
   * a colour behind the line. Observed readings only, like the web: a forecast
   * gets its NWS attribution instead, never a floatability verdict.
   *
   * Bands are contiguous by construction (each min is the previous max), so
   * the first band whose max clears the value owns it; a value past every
   * closed band still belongs to the last band, which is how the web's
   * `getZoneLabel` reads a spike above a ladder with no flood level.
   */
  const scrubZone =
    scrubbed?.kind === 'observed' && zones.length > 0
      ? (zones.find((zone) => scrubbed.point.v <= zone.max || zone.openEnded) ??
        zones[zones.length - 1])
      : null;

  /**
   * "Now" while the newest reading is still current, "Last reading" once it
   * is not. The shared model decides, on the same six-hour line the reading
   * card above this chart uses, so the two cannot disagree about whether
   * this gauge is keeping up. The rule itself does not move; see nowLabel().
   */
  const nowLabelText = newest ? nowLabel(newest.t) : null;

  /**
   * When the Weather Service computed the dashed line.
   *
   * A forecast is the one series here with an age of its own — NWPS reissues on a
   * schedule — and the endpoint has sent this all along with nothing showing it.
   */
  const forecastIssued = (() => {
    const raw = history?.forecastIssuedAt;
    if (!raw) return null;
    const issued = new Date(raw);
    return Number.isFinite(issued.getTime())
      ? issued.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : null;
  })();

  /**
   * What the plot says, for a reader who cannot see it.
   *
   * VoiceOver reached the range and unit buttons and then met the chart as an
   * unlabelled box: the line, the forecast and the qualifier were all visual and
   * only visual. This is the summary — the label a VoiceOver focus lands on
   * before any stepping, the same thing the web chart's aria-label carries.
   *
   * The plot itself is accessibilityRole "adjustable", the iOS spelling of the
   * web plot's role="slider": a VoiceOver swipe up or down steps the scrub one
   * reading at a time through stepScrubTime() from the shared model, and the
   * stepped-to reading is announced through accessibilityValue below.
   */
  const plotSummary = (() => {
    const window = drawnDays === 1 ? 'last 24 hours' : `last ${drawnDays} days`;
    const measure = drawnUnit === 'cfs' ? 'Discharge' : 'Gauge height';
    const bits = [
      newest
        ? `${measure}, ${window}. Latest ${formatReading(newest.v, drawnUnit)}.`
        : `${measure}, ${window}.`,
    ];
    // The pill is a fact about the water, not decoration, so it is spoken.
    // Visual deduplication must not erase a water fact from VoiceOver. The
    // river screen hides the chart pill because the card above repeats it, but
    // the adjustable plot still carries a self-contained spoken summary.
    if (trustedTrend) {
      bits.push(`${trustedTrend.label} over the last ${trustedTrend.windowHours} hours.`);
    }
    const latestQualifiers = newest ? qualifierText(newest.qualifiers) : null;
    if (latestQualifiers) bits.push(`Latest reading ${latestQualifiers}.`);
    if (forecastPoints.length > 0) {
      bits.push(`NWS forecast included${forecastIssued ? `, issued ${forecastIssued}` : ''}.`);
    }
    if (series.typicalArea) bits.push('Typical range for the date shown.');
    else if (series.typicalPath) bits.push('Typical median for the date shown.');
    if (visibleConditionBoundary) {
      bits.push(
        `${visibleConditionBoundary.toLabel} begins at ${formatReading(visibleConditionBoundary.value, drawnUnit)}.`,
      );
    }
    return bits.join(' ');
  })();

  /**
   * The reading under the scrub — or the newest one, before any stepping — as
   * a sentence. VoiceOver announces this as the element's value after every
   * increment or decrement, so the two labels the visible readout refuses to
   * drop in a hurry are spoken too: a forecast is not a measurement, and a
   * provisional reading is not a verified one.
   */
  const spokenValue = (() => {
    const at = scrubbed ?? (newest ? { point: newest, kind: 'observed' as const } : null);
    if (!at) return null;
    const bits = [`${formatReading(at.point.v, drawnUnit)}, ${scrubTime(at.point.t)}`];
    if (at.kind === 'forecast') bits.push('NWS forecast');
    else {
      const spokenQualifiers = qualifierText(at.point.qualifiers);
      if (spokenQualifiers) bits.push(spokenQualifiers);
    }
    return bits.join(', ');
  })();

  /**
   * One VoiceOver step: the adjacent reading in either series, clamped at the
   * ends. Steps BY READING, not by distance — stepScrubTime()'s note says why —
   * and starts from the newest observation when nothing is scrubbed yet, which
   * is where the summary label has just left the listener.
   */
  const stepScrub = (step: 1 | -1) => {
    if (!scale) return;
    const from = scrubbed?.point.t ?? newest?.t;
    if (from == null) return;
    const next = stepScrubTime(scrubTimes, from, step);
    if (next != null) setScrubX(scale.x(next));
  };

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const action = event.nativeEvent.actionName;
    if (action === 'increment') stepScrub(1);
    else if (action === 'decrement') stepScrub(-1);
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
      <View style={styles.head}>
        {/* The title and trend own a full row. They used to share horizontal
            space with both segmented controls, leaving only "Re…" on a phone.
            The trend names its six-hour window so it cannot be mistaken for a
            summary of the selected seven- or thirty-day line. */}
        {title || shownTrend ? (
          <View style={styles.titleRow}>
            {title ? <Text style={[styles.title, { color: colors.text }]}>{title}</Text> : null}
            {shownTrend ? (
              <TrendPill
                direction={shownTrend.direction}
                label={formatGaugeTrend(shownTrend)}
              />
            ) : null}
          </View>
        ) : null}

        {/* The scrub readout replaces the subtitle rather than sitting beside
            it: a finger on the plot means the question is "what was it then",
            and two lines of metadata competing for the same row is how a
            readout gets missed. */}
        {scrubbed ? (
          <Text style={[styles.scrubLine, { color: colors.textMuted }]} numberOfLines={1}>
            <Text style={[styles.scrubValue, { color: colors.text }]}>
              {formatReading(scrubbed.point.v, drawnUnit)}
            </Text>
            {/* The verdict beside the number, in the band's own colour —
                parity with the web tooltip's "340 cfs — Flowing". */}
            {scrubZone ? (
              <Text style={{ color: conditionColor(scrubZone.key) }}>{` ${scrubZone.label}`}</Text>
            ) : null}
            {'  '}
            {scrubTime(scrubbed.point.t)}
            {/* Two labels that must survive being read in a hurry: a forecast is
                not a measurement, and a provisional reading is not a verified
                one. The qualifier came with the reading and was thrown away
                here until the copy moved into the shared model. */}
            {scrubbed.kind === 'forecast' ? (
              <Text style={{ color: floodStageColor() }}>{'  NWS forecast'}</Text>
            ) : scrubQualifiers ? (
              <Text style={{ color: colors.textSubtle }}>{`  ${scrubQualifiers}`}</Text>
            ) : null}
          </Text>
        ) : (
          <Text style={[styles.subtitle, { color: colors.textSubtle }]} numberOfLines={1}>
            {/* The newest reading rides in the idle subtitle — the exact
                "what is it now" number, in the row the scrub readout will
                reuse, instead of a callout crowding the plot's right edge
                where the axis and the current dot already live. */}
            {newest ? (
              <>
                <Text style={[styles.scrubValue, { color: colors.text }]}>
                  {formatReading(newest.v, drawnUnit)}
                </Text>
                {' now · last '}
              </>
            ) : (
              <>
                {drawnUnit === 'cfs' ? 'Discharge' : 'Gauge height'}
                {' · last '}
              </>
            )}
            {drawnDays === 1 ? '24 hours' : `${drawnDays} days`}
          </Text>
        )}

        {/* ── Units ────────────────────────────────────────────────
            Only when the station published BOTH in this window. One unit and
            the control is a decision nobody has, which is the same reason the
            range strip does not offer a window the endpoint cannot fill.

            It sits before the range toggle because it changes what the chart is
            OF, where the range only changes how much of it you see. */}
        <View style={styles.controls}>
          {availableUnits.length > 1 ? (
            <View style={[styles.ranges, { borderColor: colors.border }]}>
              {availableUnits.map((u) => {
                const active = u === drawnUnit;
                return (
                  <Pressable
                    key={u}
                    // The scrub is cleared with the switch: it is stored as a
                    // pixel, and the same pixel names a different reading on the
                    // other axis. A finger-driven scrub clears itself on release;
                    // a VoiceOver-stepped one would otherwise survive the change.
                    onPress={() => {
                      setUnitOverride(u);
                      setScrubX(null);
                    }}
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
                  // Same clearing as the unit toggle: a pixel kept across a
                  // window change would point at a different instant.
                  onPress={() => {
                    setDays(r.days);
                    setScrubX(null);
                  }}
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
      </View>

      <View style={styles.plotWrap} onLayout={onLayout}>
        {width > 0 && hasPlot ? (
          <GestureDetector gesture={scrubGesture}>
            {/* Adjustable, not image: a VoiceOver swipe up/down steps the scrub
                one reading at a time — the same thing the web plot's
                role="slider" gives arrow keys. The label summarises the plot;
                the value speaks whichever reading the scrub is on. */}
            <View
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={plotSummary}
              accessibilityValue={spokenValue ? { text: spokenValue } : undefined}
              accessibilityActions={[
                { name: 'increment', label: 'Later reading' },
                { name: 'decrement', label: 'Earlier reading' },
              ]}
              onAccessibilityAction={onAccessibilityAction}
            >
              <Svg width={width} height={CHART_HEIGHT}>
                {/* A neutral value grid replaces the stacked condition fills and
                    dashed boundaries. The ladder remains in ReadingScale above;
                    here these rules make the observed line readable against one
                    contextual area: the typical range. */}
                {valueTicks.map((tick) => (
                  <Line
                    key={`grid-${tick.value}`}
                    x1={0}
                    y1={scale.y(tick.value)}
                    x2={plotWidth}
                    y2={scale.y(tick.value)}
                    stroke={colors.border}
                    strokeWidth={1}
                    opacity={0.65}
                  />
                ))}

                {/* ── What this river normally does on this date ──
                    The chart's only shaded area. The median used to add another
                    dashed line through a plot already full of threshold rules;
                    the labelled 25–75% envelope is the comparison people need. */}
                {series.typicalArea ? (
                  <Path
                    d={series.typicalArea}
                    fill={TYPICAL_COLOR}
                    fillOpacity={isDark ? 0.2 : 0.13}
                  />
                ) : null}
                {series.typicalPath ? (
                  <Path
                    d={series.typicalPath}
                    fill="none"
                    stroke={TYPICAL_COLOR}
                    strokeWidth={1.25}
                    strokeDasharray="4,3"
                    opacity={0.7}
                  />
                ) : null}

                {/* ── The next Eddy condition ──
                    One labelled rule preserves the useful decision number
                    without bringing back six fills and six boundaries. It is
                    omitted when distant (chartDomain leaves it outside the
                    plot). If its label would collide with an NWS stage, the
                    rule remains and official safety context wins the label. */}
                {visibleConditionBoundary
                  ? (() => {
                      const color = conditionColor(visibleConditionBoundary.toKey);
                      return (
                        <G key={`condition-${visibleConditionBoundary.toKey}`}>
                          <Line
                            x1={0}
                            y1={visibleConditionBoundary.y}
                            x2={plotWidth}
                            y2={visibleConditionBoundary.y}
                            stroke={color}
                            strokeWidth={1}
                            strokeDasharray="3,3"
                            opacity={0.65}
                          />
                          {showConditionBoundaryLabel ? (
                            <SvgText
                              x={2}
                              y={
                                stageLabelBelowLine(visibleConditionBoundary.y)
                                  ? visibleConditionBoundary.y + 11
                                  : visibleConditionBoundary.y - 3
                              }
                              fill={color}
                              fontSize={9}
                              fontFamily={fonts.medium}
                              opacity={0.9}
                            >
                              {`${visibleConditionBoundary.toLabel} · ${formatReading(visibleConditionBoundary.value, drawnUnit)}`}
                            </SvgText>
                          ) : null}
                        </G>
                      );
                    })()
                  : null}

                {/* ── The NWS stages ──
                    Drawn over the typical range and under the observed line:
                    official safety context remains visible without covering the
                    reading it qualifies.

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
                        y={stageLabelBelowLine(y) ? y + 11 : y - 3}
                        fill={floodStageColor()}
                        fontSize={9}
                        fontFamily={fonts.medium}
                        opacity={Math.max(def.opacity, 0.75)}
                      >
                        {/* The number rides with the name: "NWS flood stage"
                            alone tells a reader a line matters without saying
                            where it is, and the axis ticks rarely land on it.
                            Stage lines are feet by construction (never drawn
                            on a cfs axis), so the unit is literal. */}
                        {`${def.label} · ${line.value} ft`}
                      </SvgText>
                    </G>
                  );
                })}

                {/* ── The line ── */}
                {series.paths.map((d, i) => (
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

                {/* A reading with no neighbour inside the cadence. Dropped with its
                    segment until chartSegments() started handing these back, which
                    meant a station reporting once between two outages showed empty
                    space where a number was. */}
                {series.dots.map((point) => (
                  <Circle
                    key={`dot-${point.t}`}
                    cx={scale.x(point.t)}
                    cy={scale.y(point.v)}
                    r={2}
                    fill={lineColor}
                  />
                ))}

                {/* ── The boundary between what happened and what is predicted ──
                    Keyed on there being a forecast POINT, not a forecast path: a
                    one-point forecast is still a forecast, and gating the rule on a
                    drawn line put the boundary and the legend out of step with the
                    thing they describe. */}
                {newest && nowLabelText && forecastPoints.length > 0
                  ? (() => {
                      const nowX = scale.x(newest.t);
                      // Roughly the caption's width at 9px plus the gap:
                      // "Last reading" needs about three times the room "Now"
                      // did, so it flips to the forecast side sooner.
                      const flipped = nowX < (nowLabelText === 'Now' ? 36 : 64);
                      // The caption and a top-band stage label share the top
                      // line of the plot. When the now-line also sits in the
                      // leftmost quarter — a 24h range under a multi-day
                      // forecast — they would overprint, so the caption drops
                      // one line height. The simplest rule that clears the
                      // case seen; the web chart applies the same one.
                      const stageLabelAtTop = stageLines.some((line) => {
                        const y = scale.y(line.value);
                        return y >= PAD_TOP && stageLabelBelowLine(y);
                      });
                      const captionY =
                        stageLabelAtTop && nowX < plotWidth * 0.25 ? PAD_TOP + 22 : PAD_TOP + 10;
                      return (
                        <G>
                          <Line
                            x1={nowX}
                            y1={PAD_TOP}
                            x2={nowX}
                            y2={PAD_TOP + plotHeight}
                            stroke={colors.textSubtle}
                            strokeWidth={1}
                            strokeDasharray="2,3"
                            opacity={0.7}
                          />
                          {/* The rule, named. Unlabelled it was a dashed line a
                              reader had to infer; "Now" is what makes the dashed
                              series past it unmistakably a prediction — and
                              "Last reading" is what keeps that honest when the
                              gauge has been quiet for days. On the observed
                              side of its own line, flipped when the boundary
                              sits so far left that an end-anchored label would
                              clip out of the plot. */}
                          <SvgText
                            x={flipped ? nowX + 4 : nowX - 4}
                            y={captionY}
                            fill={colors.textSubtle}
                            fontSize={9}
                            fontFamily={fonts.medium}
                            textAnchor={flipped ? 'start' : 'end'}
                            opacity={0.8}
                          >
                            {nowLabelText}
                          </SvgText>
                        </G>
                      );
                    })()
                  : null}

                {/* ── The official forecast ──
                    Violet and dashed, the same hue the stage lines use and for the
                    same reason: it is the Weather Service's number, not Eddy's
                    verdict. The legend names it; an unattributed dashed line
                    climbing off the right edge is a prediction nobody owns. */}
                {series.forecastPaths.map((d, i) => (
                  <Path
                    key={`f-${i}`}
                    d={d}
                    stroke={floodStageColor()}
                    strokeWidth={2}
                    strokeDasharray="5,4"
                    fill="none"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))}
                {series.forecastDots.map((point) => (
                  <Circle
                    key={`fdot-${point.t}`}
                    cx={scale.x(point.t)}
                    cy={scale.y(point.v)}
                    r={2}
                    fill={floodStageColor()}
                  />
                ))}

                {/* ── Where it is now ── the newest OBSERVED reading, never a
                    forecast. 8px across: decisively bigger than the 4px isolated-
                    reading dots, still under the scrub marker that lands on it. */}
                {points.length > 0 ? (
                  <Circle
                    cx={scale.x(points[points.length - 1].t)}
                    cy={scale.y(points[points.length - 1].v)}
                    r={4}
                    fill={lineColor}
                  />
                ) : null}

                {/* ── The scrub rule ── */}
                {scrubbed ? (
                  <>
                    <Line
                      x1={scale.x(scrubbed.point.t)}
                      y1={PAD_TOP}
                      x2={scale.x(scrubbed.point.t)}
                      y2={PAD_TOP + plotHeight}
                      stroke={colors.text}
                      strokeWidth={1}
                      opacity={0.4}
                    />
                    <Circle
                      cx={scale.x(scrubbed.point.t)}
                      cy={scale.y(scrubbed.point.v)}
                      r={4.5}
                      fill={colors.card}
                      stroke={scrubbed.kind === 'forecast' ? floodStageColor() : lineColor}
                      strokeWidth={2}
                    />
                  </>
                ) : null}

                {/* ── Value axis, right edge ──
                    Round numbers from niceValueTicks(), not the padded domain's own
                    min/mid/max. See the memo for what that printed. Drawn on top of
                    the stack with the time axis: axis text is how every other layer
                    gets read, so nothing may paint over it. */}
                {valueTicks.map((tick) => (
                  <SvgText
                    key={`v-${tick.value}`}
                    x={plotWidth + 6}
                    y={scale.y(tick.value) + 4}
                    fill={colors.textSubtle}
                    fontSize={10}
                    fontFamily={fonts.mono}
                  >
                    {axisValue(tick.value, drawnUnit)}
                  </SvgText>
                ))}

                {/* ── Time axis ──
                    Three instants from timeTicks() rather than the two ends, so the
                    middle of the plot can be placed in time. The first and last are
                    anchored inward; a centred label at x=0 clips. */}
                {xTicks.map((tick, index) => (
                  <SvgText
                    key={`t-${index}`}
                    x={scale.x(tick.value)}
                    y={CHART_HEIGHT - 4}
                    fill={colors.textSubtle}
                    fontSize={10}
                    fontFamily={fonts.body}
                    textAnchor={index === 0 ? 'start' : index === xTicks.length - 1 ? 'end' : 'middle'}
                  >
                    {axisTime(tick.value, drawnDays)}
                  </SvgText>
                ))}
              </Svg>

              {/* ── Legend ──
                  Only for the overlays that are actually on screen, and never
                  omitted when one is: a violet dashed line climbing off the right
                  edge is somebody's prediction, and a teal band behind the series
                  is a national statistic. Both are claims a reader must be able to
                  attribute, and the issue time is the part that makes a forecast
                  checkable — NWPS reissues on a schedule, so a line read at 6pm may
                  predate the afternoon's rain. */}
              {series.typicalArea || series.typicalPath || forecastPoints.length > 0 ? (
                <View style={styles.legend}>
                  {/* Each entry carries a sample of its own mark — coloured text
                      alone asks the reader to hold a colour table in their head.
                      The forecast leads: it is the entry that most needs
                      attributing. Its dash sample is two segments rather than a
                      dashed border, which RN only renders reliably on a view
                      bordered on all four sides. */}
                  {forecastPoints.length > 0 ? (
                    <View style={styles.legendItem}>
                      <View style={styles.legendDashes} aria-hidden>
                        <View style={[styles.legendDash, { backgroundColor: floodStageColor() }]} />
                        <View style={[styles.legendDash, { backgroundColor: floodStageColor() }]} />
                      </View>
                      <Text style={[styles.legendText, { color: floodStageColor() }]} numberOfLines={1}>
                        NWS forecast{forecastIssued ? ` · issued ${forecastIssued}` : ''}
                      </Text>
                    </View>
                  ) : null}
                  {series.typicalArea ? (
                    <View style={styles.legendItem}>
                      {/* The range's own translucent envelope at legend scale. */}
                      <View
                        aria-hidden
                        style={[
                          styles.legendBand,
                          {
                            backgroundColor: `${TYPICAL_COLOR}${isDark ? '59' : '40'}`,
                            borderColor: TYPICAL_COLOR,
                          },
                        ]}
                      />
                      <Text style={[styles.legendText, { color: TYPICAL_COLOR }]}>Typical 25–75%</Text>
                    </View>
                  ) : series.typicalPath ? (
                    <View style={styles.legendItem}>
                      <View style={styles.legendDashes} aria-hidden>
                        <View style={[styles.legendDash, { backgroundColor: TYPICAL_COLOR }]} />
                        <View style={[styles.legendDash, { backgroundColor: TYPICAL_COLOR }]} />
                      </View>
                      <Text style={[styles.legendText, { color: TYPICAL_COLOR }]}>Typical median</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </GestureDetector>
        ) : (
          <View style={[styles.placeholder, { height: CHART_HEIGHT }]}>
            {loading ? (
              <ActivityIndicator size="small" color={colors.interactive} />
            ) : failed ? (
              // A sentence about the NETWORK, and the only one here that comes
              // with a way out. It is reachable only when nothing is held for
              // this station — with an older window cached, useGaugeHistory
              // keeps that line up and never lands here at all.
              <>
                <Text style={[styles.placeholderText, { color: colors.textSubtle }]}>
                  Couldn&apos;t load this gauge&apos;s history.
                </Text>
                <Pressable
                  onPress={retry}
                  hitSlop={10}
                  accessibilityRole="button"
                  style={styles.retry}
                >
                  <Text style={[styles.retryText, { color: colors.interactive }]}>Try again</Text>
                </Pressable>
              </>
            ) : (
              <Text style={[styles.placeholderText, { color: colors.textSubtle }]}>
                {/* Three distinct states, because each would be a lie as the
                    others. Only `unavailable` may be phrased as a fact about the
                    gauge — a failed request either leaves the previous line up or
                    takes the branch above; see useGaugeHistory.

                    THE SINGLE-READING SENTENCE IS BACK. It left when one reading
                    started drawing as a dot; it returns because the axis under
                    that dot was not real (see hasPlot), so the reading falls
                    through to here again — and "no discharge reported" would be
                    false about a window that holds one. */}
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

/**
 * Catches a chart that cannot draw and says why, instead of taking the screen.
 *
 * ── The failure this exists for ────────────────────────────────────────────
 * `react-native-svg` is a NATIVE module, and it is the only one this file
 * needs. Native modules are autolinked when the native project is generated,
 * not when JS is bundled — so a dev client or TestFlight build produced before
 * react-native-svg entered package.json (it arrived with this component, in
 * dd5f2a8) runs the new JS against a binary that has never heard of
 * RNSVGSvgView. The JS bundle updates over the air; the binary does not.
 *
 * React Native's answer to that is "Unimplemented component", which surfaces as
 * a red box or a thrown render depending on the architecture — either way, a
 * screen somebody opened to read a number instead shows a crash.
 *
 * ── Why a boundary rather than a capability probe ──────────────────────────
 * The obvious alternative is asking UIManager whether the view manager is
 * registered, the way src/map/runtime.ts asks whether Mapbox can load. It is
 * the wrong tool here: view-manager registration is resolved differently under
 * the New Architecture, so the probe can answer "no" for a component that draws
 * perfectly well — and hiding a working chart is a worse outcome than the bug
 * being guarded against. A boundary only ever fires on an actual failure.
 *
 * ── This is a diagnosis, not a fix ─────────────────────────────────────────
 * The fix is `npm install` (never --legacy-peer-deps, which REMOVES packages
 * this app ships) followed by a rebuild: `npx expo run:ios`, or
 * `eas build --profile development --platform ios`. The copy points there
 * rather than apologising, because "update the app" is the only action a person
 * seeing this can take.
 */
class ChartBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // Said out loud once. The symptom on its own — a chart that is not there —
    // reads as missing data rather than as a stale binary.
    warn('chart', 'failed to render; native react-native-svg missing?', error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function GaugeChart(props: Props) {
  const { colors, elevation } = useTheme();
  return (
    <ChartBoundary
      // Deliberately shaped like the component's own empty states rather than
      // like an error: same card, same height, same quiet ink. What is missing
      // is one panel, and the reading it charts is still on the screen above.
      fallback={
        <View style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
          {props.title ? (
            <Text style={[styles.title, { color: colors.text }]}>{props.title}</Text>
          ) : null}
          <View style={[styles.placeholder, { height: CHART_HEIGHT }]}>
            <Text style={[styles.placeholderText, { color: colors.textSubtle }]}>
              Charts need a newer version of the app. Everything else on this
              screen is up to date.
            </Text>
          </View>
        </View>
      }
    >
      <GaugeChartInner {...props} />
    </ChartBoundary>
  );
}

const styles = StyleSheet.create({
  // NO marginHorizontal, deliberately. This card is rendered on two screens
  // whose ScrollViews inset differently — the gauge screen pads nothing and
  // margins each card, the river screen pads its content container by 16 — so a
  // horizontal margin here was ADDED to the river screen's padding and the
  // chart sat 32pt in while every card around it sat at 16. The narrower card
  // shrank the plot with it, since plotWidth comes from onLayout.
  //
  // Horizontal placement therefore belongs to the caller. Vertical rhythm does
  // not: the gap under a card is the same question on both screens.
  card: { marginBottom: 14, borderRadius: 16, padding: 16 },
  head: { gap: 6, marginBottom: 8 },
  // The row can wrap under large accessibility text without surrendering the
  // title to an ellipsis. The segmented controls live on their own row below.
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  title: { ...t.base, fontFamily: fonts.heading },
  subtitle: { ...t.xs, fontFamily: fonts.body },
  scrubLine: { ...t.xs, fontFamily: fonts.body },
  scrubValue: { ...t.sm, fontFamily: fonts.monoMedium },
  controls: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 },
  ranges: { flexDirection: 'row', borderWidth: 1, borderRadius: 9, overflow: 'hidden' },
  range: { paddingHorizontal: 10, paddingVertical: 5 },
  rangeText: { ...t.xs, fontFamily: fonts.medium },
  plotWrap: { marginTop: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDashes: { flexDirection: 'row', gap: 2 },
  legendDash: { width: 6, height: 2, borderRadius: 1 },
  legendBand: { width: 14, height: 8, borderRadius: 2, borderWidth: 1 },
  legendText: { ...t.xs, fontFamily: fonts.medium },
  placeholder: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  placeholderText: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
  retry: { marginTop: 8, minHeight: 44, justifyContent: 'center' },
  retryText: { ...t.sm, fontFamily: fonts.semibold },
});
