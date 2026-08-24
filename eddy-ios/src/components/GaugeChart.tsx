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
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { GaugeFloodStages } from '@eddy/types';
import {
  chartDomain,
  chartPoints,
  chartSegments,
  nearestChartPoint,
  niceValueTicks,
  qualifierText,
  stepScrubTime,
  timeTicks,
  type ChartPoint,
} from '@eddy/conditions/chart-model';
import { buildZones, type ThresholdValues } from '@eddy/conditions/threshold-zones';
import { computeTrend } from '@eddy/conditions/gauge-trend';
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

const CHART_HEIGHT = 168;
/** Room for the value labels down the right edge. */
const PAD_RIGHT = 46;
/** Room for the time labels under the plot. */
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

  const { history, loading, unavailable, failed, retry } = useGaugeHistory(siteId, days);

  const drawnUnit = unitOverride ?? unit;

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
   * ── WHY 30d IS EXCLUDED, AND WHY THE WINDOW IS CHECKED ────────────────
   * The endpoint downsamples a month to ~360 points by KEEPING EACH BUCKET'S
   * MIN AND MAX, so at roughly four hours per bucket the point nearest six
   * hours back is a local extremum rather than a representative reading, and
   * the delta gets measured against a peak or a trough. There is nothing to
   * compute honestly from at that range, so nothing is claimed.
   *
   * The window check covers the other direction: computeTrend takes the reading
   * NEAREST six hours back with no floor on how near that is, so a sparse or
   * stalled station can answer from a window nothing like the one asked for.
   * Past a twelve-hour gap it even selects the latest reading as its own
   * comparison and reports a rising river as "Holding steady" — always with a
   * 1h window, which this rejects. See shared/gauge-trend.test.ts, which pins
   * that behaviour and explains why it is not fixed there.
   */
  const trend = useMemo(
    () => (days === 30 || !history ? null : computeTrend(history.readings, drawnUnit)),
    [days, history, drawnUnit],
  );
  const shownTrend = trend && Math.abs(trend.windowHours - 6) <= 3 ? trend : null;

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

  const points = useMemo(
    () => (history ? chartPoints(history.readings, drawnUnit) : []),
    [history, drawnUnit],
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
          value === null ? [] : [{ t: row.t, v: value, timestamp: '', qualifiers: [] }],
        ),
      ),
    ].sort((a, b) => a.t - b.t);

    // Band edges and stage lines are context the axis may stretch to include —
    // only the EDGES, since a band boundary is the number someone needs to see
    // their line approaching, and a band's far side is not.
    const context = [
      ...stageLines.map((line) => line.value),
      ...zones.flatMap((zone) => [zone.min, zone.max]),
    ];
    return chartDomain(spanning, drawnUnit, context, NEAR_THRESHOLD_FRACTION);
  }, [points, forecastPoints, typical, zones, stageLines, drawnUnit]);

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
      // The band needs both edges, so it is drawn from the rows that HAVE both
      // rather than suppressed by one row that does not. The median covers every
      // row regardless.
      typicalArea: (() => {
        const rows = typical.filter((row) => row.low !== null && row.high !== null);
        if (rows.length < 2) return '';
        const up = rows
          .map((row, i) => `${i ? 'L' : 'M'} ${scale.x(row.t).toFixed(2)} ${scale.y(row.high!).toFixed(2)}`)
          .join(' ');
        const back = rows
          .slice()
          .reverse()
          .map((row) => `L ${scale.x(row.t).toFixed(2)} ${scale.y(row.low!).toFixed(2)}`)
          .join(' ');
        return `${up} ${back} Z`;
      })(),
      typicalPath:
        typical.length > 1
          ? typical
              .map((row, i) => `${i ? 'L' : 'M'} ${scale.x(row.t).toFixed(2)} ${scale.y(row.median).toFixed(2)}`)
              .join(' ')
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
    () => (domain ? niceValueTicks(domain.min, domain.max, 3) : []),
    [domain],
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
   * ONE OBSERVED READING IS ENOUGH — and so is a forecast with none.
   *
   * A single reading used to fall through to the placeholder because a line
   * needs two points; it draws as a dot at a real instant on a real axis,
   * which is what the reading is. A forecast with no observations behind it
   * now draws too, in the same release the web chart made its "current"
   * nullable and the endpoint stopped 404ing forecast-only stations — the
   * three moved together, which is what kept the two charts in step. The
   * now-line and the current dot stay observed-only below: a forecast-only
   * plot has no "now" boundary to draw, and inventing one at the forecast's
   * start would claim an observation nobody took.
   */
  const hasPlot =
    scale !== null && domain !== null && (points.length > 0 || forecastPoints.length > 0);

  const scrubQualifiers =
    scrubbed?.kind === 'observed' ? qualifierText(scrubbed.point.qualifiers) : null;

  const newest = points.length ? points[points.length - 1] : null;

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
    const window = days === 1 ? 'last 24 hours' : `last ${days} days`;
    const measure = drawnUnit === 'cfs' ? 'Discharge' : 'Gauge height';
    const bits = [
      newest
        ? `${measure}, ${window}. Latest ${formatReading(newest.v, drawnUnit)}.`
        : `${measure}, ${window}.`,
    ];
    // The pill is a fact about the water, not decoration, so it is spoken.
    if (shownTrend) bits.push(`${shownTrend.label} over the last ${shownTrend.windowHours} hours.`);
    const latestQualifiers = newest ? qualifierText(newest.qualifiers) : null;
    if (latestQualifiers) bits.push(`Latest reading ${latestQualifiers}.`);
    if (forecastPoints.length > 0) {
      bits.push(`NWS forecast included${forecastIssued ? `, issued ${forecastIssued}` : ''}.`);
    }
    if (series.typicalPath) bits.push('Typical range for the date shown.');
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
        <View style={styles.headText}>
          {/* ── The pill sits on the TITLE line, not the subtitle ───────────
              The subtitle is replaced outright by the scrub readout below, so a
              trend rendered there would vanish the moment a finger touched the
              plot — exactly when the reader is asking which way the water is
              going. The title is short ("Recent history") and the unit and
              range controls sit hard right, so the room is here. */}
          {title || shownTrend ? (
            <View style={styles.titleRow}>
              {title ? (
                <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                  {title}
                </Text>
              ) : null}
              {shownTrend ? (
                <TrendPill direction={shownTrend.direction} label={shownTrend.label} />
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

                {/* ── Value axis, right edge ──
                    Round numbers from niceValueTicks(), not the padded domain's own
                    min/mid/max. See the memo for what that printed. */}
                {valueTicks.map((tick) => (
                  <SvgText
                    key={`v-${tick.value}`}
                    x={plotWidth + 6}
                    y={scale.y(tick.value) + 4}
                    fill={colors.textSubtle}
                    fontSize={10}
                    fontFamily={fonts.mono}
                  >
                    {formatReading(tick.value, drawnUnit).replace(` ${drawnUnit}`, '')}
                  </SvgText>
                ))}

                {/* ── What this river normally does on this date ──
                    Behind everything the gauge measured, and labelled in the legend
                    below: a shaded band with nothing naming it is a claim the reader
                    cannot check. Discharge only — see the memo. */}
                {series.typicalArea ? (
                  <Path d={series.typicalArea} fill={TYPICAL_COLOR} fillOpacity={isDark ? 0.16 : 0.1} />
                ) : null}
                {series.typicalPath ? (
                  <Path
                    d={series.typicalPath}
                    stroke={TYPICAL_COLOR}
                    strokeWidth={1}
                    strokeDasharray="4,3"
                    opacity={0.55}
                    fill="none"
                  />
                ) : null}

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
                {points.length > 0 && forecastPoints.length > 0 ? (
                  <Line
                    x1={scale.x(points[points.length - 1].t)}
                    y1={PAD_TOP}
                    x2={scale.x(points[points.length - 1].t)}
                    y2={PAD_TOP + plotHeight}
                    stroke={colors.textSubtle}
                    strokeWidth={1}
                    strokeDasharray="2,3"
                    opacity={0.7}
                  />
                ) : null}

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

                {/* ── Where it is now ── the newest OBSERVED reading, never a forecast */}
                {points.length > 0 ? (
                  <Circle
                    cx={scale.x(points[points.length - 1].t)}
                    cy={scale.y(points[points.length - 1].v)}
                    r={3.5}
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
                    {axisTime(tick.value, days)}
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
              {series.typicalPath || forecastPoints.length > 0 ? (
                <View style={styles.legend}>
                  {series.typicalPath ? (
                    <Text style={[styles.legendText, { color: TYPICAL_COLOR }]}>Typical 25–75%</Text>
                  ) : null}
                  {forecastPoints.length > 0 ? (
                    <Text style={[styles.legendText, { color: floodStageColor() }]} numberOfLines={1}>
                      NWS forecast{forecastIssued ? ` · issued ${forecastIssued}` : ''}
                    </Text>
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
                {/* Two distinct states, because either would be a lie as the
                    other. Only `unavailable` may be phrased as a fact about the
                    gauge — a failed request either leaves the previous line up or
                    takes the branch above; see useGaugeHistory.

                    THE SINGLE-READING SENTENCE IS GONE, because it is no longer
                    true. One reading used to fall through to here ("not enough to
                    chart") since a line needs two points; it now draws as a dot at
                    a real instant on a real axis, which is what the reading is. */}
                {unavailable
                  ? 'No recent history published for this gauge.'
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
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 6 },
  headText: { flex: 1 },
  // The title takes the squeeze, not the pill — TrendPill is flexShrink 0.
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...t.base, fontFamily: fonts.heading, flexShrink: 1 },
  subtitle: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  scrubLine: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  scrubValue: { ...t.sm, fontFamily: fonts.monoMedium },
  ranges: { flexDirection: 'row', borderWidth: 1, borderRadius: 9, overflow: 'hidden' },
  range: { paddingHorizontal: 10, paddingVertical: 5 },
  rangeText: { ...t.xs, fontFamily: fonts.medium },
  plotWrap: { marginTop: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  legendText: { ...t.xs, fontFamily: fonts.medium },
  placeholder: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  placeholderText: { ...t.sm, fontFamily: fonts.body, textAlign: 'center' },
  retry: { marginTop: 8, minHeight: 44, justifyContent: 'center' },
  retryText: { ...t.sm, fontFamily: fonts.semibold },
});
