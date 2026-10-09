// Compact hydrograph shared by River, Gauge and map history.
// Data geometry, gaps and reading identity come from the shared chart model.

import { ControlIcon } from '@/components/ControlIcon';
import { chartDateRange } from '@/lib/chartDateRange';
import { Component, useCallback, useMemo, useState, useId, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  ActionSheetIOS,
  Platform,
  Switch, useWindowDimensions,
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
  Defs,
  G,
  Line,
  ClipPath,
  Path,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import type { GaugeFloodStages } from '@eddy/types';
import {
  chartDomain,
  chartForecastWindow,
  chartPoints,
  chartSegments,
  splitAtGaps,
  alignPriorYear,
  lastYearAvailable,
  priorYearPointFor,
  priorYearWindow,
  windowCalendarDates,
  nearestChartPoint,
  niceValueTicks,
  nowLabel,
  qualifierText,
  stepScrubTime,
  timeTicks,
  type ChartPoint,
  type PriorYearPoint,
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
import { resolveHistoryCapabilities, type HistoryCapabilities } from '@eddy/conditions/history-capabilities';
import { useGaugeHistory } from '@/hooks/useGaugeHistory';
import { useLastYearHistory } from '@/hooks/useLastYearHistory';
import { warn } from '@/lib/monitoring';
import { ChartDateField } from '@/components/ChartDateField';
import { GaugeChartSheet } from '@/components/GaugeChartSheet';
import { GaugeChartDetails } from '@/components/GaugeChartDetails';
import { GaugeChartReadout, GaugeChartFixedReadout } from '@/components/GaugeChartReadout';
import { GaugeChartFullscreen } from '@/components/GaugeChartFullscreen';
import { chartTimeAtX, expandedChartHeight, type ChartSelection } from '@/lib/gaugeChartExpansion';
import { chartGutters, chartGridValues, selectChartRailLabels, type ChartRailLabel } from '@/lib/gaugeChartLayout';
import { validateChartDates, localChartDate, parseLocalChartDate, chartEndAfterStartChange, type ChartDateErrors } from '@/lib/gaugeChartDates';

/** Short history first; provider capabilities unlock the longer windows. */
const RANGES = [
  { days: 1, label: '24h' },
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
  { days: 365, label: '1y' },
] as const;

// Plot includes axes and in-plot context labels; surrounding controls add ~100pt.
const CHART_HEIGHT = 208;
const NEAR_THRESHOLD_FRACTION = 0.28;

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
  /** Station identity remains visible when the page is behind the chart. */
  title?: string;
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
  provider?: string | null;
  historyCapabilities?: HistoryCapabilities;
  initialDays?: number;
  initialWindow?: { from: string; to: string };
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
    return d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric' });
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

/** "Oct 9, 2024" for a prior-year value's own date. */
function priorDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** The scrub readout wants the full moment, not an axis tick. */
function scrubTime(ms: number): string {
  const d = new Date(ms);
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString(
    undefined,
    { hour: 'numeric', minute: '2-digit' },
  )}`;
}

/** The narrow rail uses the category; details retain the full NWS name. */
function stageRailLabel(key: FloodStageKey): string {
  const category = FLOOD_STAGE_SYSTEM[key].label.replace(/^NWS /, '').split(' ')[0];
  return category[0].toUpperCase() + category.slice(1);
}

/** One controller owns the settings, request and eight-window cache throughout
 * expansion. Both presentations draw from it; neither fetches on mount. */
function useGaugeChartController({ siteId, unit, provider, historyCapabilities, initialDays = 30, initialWindow }: Props) {
  const [sheet, setSheet] = useState<'compare' | 'data' | 'range' | 'unit' | 'dates' | null>(null);
  const [showTypical, setShowTypical] = useState(false);
  const [showMedian, setShowMedian] = useState(false);
  const [showLastYear, setShowLastYear] = useState(false);
  const [fullScale, setFullScale] = useState(false);
  const [fromDate, setFromDate] = useState(() => {
    const date = initialWindow ? new Date(initialWindow.from) : new Date();
    if (!initialWindow) date.setDate(date.getDate() - 29);
    return localChartDate(date);
  });
  const [toDate, setToDate] = useState(() => localChartDate(initialWindow ? new Date(initialWindow.to) : new Date()));
  const [customWindow, setCustomWindow] = useState<{ from: string; to: string } | undefined>(initialWindow);
  const [dateErrors, setDateErrors] = useState<ChartDateErrors>({});
  const [days, setDays] = useState<number>(initialDays);
  const [selection, setSelection] = useState<ChartSelection | null>(null);
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

  const historyState = useGaugeHistory(siteId, days, customWindow);

  // Fetched here so expansion and rotation keep the layer and its data.
  const lastYearEligible = lastYearAvailable(unitOverride ?? unit, resolveHistoryCapabilities(provider, historyCapabilities), days);
  const selectedWindow = historyState.matchesRequest ? historyState.history?.requestedWindow ?? null : null;
  // Custom windows are sent as local midnight, so local dates are the picked dates.
  const lastYearDates = useMemo(() => selectedWindow ? windowCalendarDates(selectedWindow) : null, [selectedWindow]);
  const lastYearWindow = useMemo(
    () => showLastYear && lastYearEligible && lastYearDates ? priorYearWindow(lastYearDates) : null,
    [showLastYear, lastYearEligible, lastYearDates],
  );
  const lastYear = useLastYearHistory(siteId, lastYearWindow);

  return {
    sheet, setSheet, showTypical, setShowTypical, showMedian, setShowMedian,
    showLastYear, setShowLastYear, lastYearEligible, lastYear, lastYearDates,
    fullScale, setFullScale, fromDate, setFromDate, toDate, setToDate,
    customWindow, setCustomWindow, dateErrors, setDateErrors, days, setDays,
    selection, setSelection, unitOverride, setUnitOverride, historyState,
  };
}

type ChartController = ReturnType<typeof useGaugeChartController>;

function GaugeChartInner(props: Props) {
  const controller = useGaugeChartController(props);
  const [expanded, setExpanded] = useState(false);
  const close = useCallback(() => setExpanded(false), []);
  if (!props.siteId) return null;
  return <>
    <GaugeChartView {...props} controller={controller} active={!expanded} onExpand={() => setExpanded(true)} />
    {expanded ? <GaugeChartFullscreen title={props.title?.trim() || 'Gauge history'} onClose={close}>
      {availableHeight => <GaugeChartView {...props} controller={controller} expanded availableHeight={availableHeight} onClose={close} />}
    </GaugeChartFullscreen> : null}
  </>;
}

function GaugeChartView({
  siteId, unit, thresholds = null, floodStages = null, provider, historyCapabilities,
  controller, expanded = false, active = true, availableHeight = 0, onExpand, onClose,
}: Props & {
  controller: ChartController;
  expanded?: boolean;
  active?: boolean;
  availableHeight?: number;
  onExpand?: () => void;
  onClose?: () => void;
}) {
  const { fontScale } = useWindowDimensions();
  const [controlsHeight, setControlsHeight] = useState(112 * fontScale);
  const [actionsHeight, setActionsHeight] = useState(44 * fontScale);
  const chartHeight = expanded
    ? expandedChartHeight(availableHeight, controlsHeight, actionsHeight, fontScale)
    : CHART_HEIGHT * Math.max(1, fontScale);
  const axisFont = 11 * fontScale;
  const padTop = 30 * fontScale;
  const padBottom = 28 * fontScale;
  const clipId = `gauge-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const { colors, isDark } = useTheme();
  const {
    sheet, setSheet, showTypical, setShowTypical, showMedian, setShowMedian,
    showLastYear, setShowLastYear, lastYearEligible, lastYear, lastYearDates,
    fullScale, setFullScale, fromDate, setFromDate, toDate, setToDate,
    customWindow, setCustomWindow, dateErrors, setDateErrors, days, setDays,
    selection, setSelection, unitOverride, setUnitOverride, historyState,
  } = controller;
  const { history, loading, unavailable, failed, retry, historyDays, matchesRequest } = historyState;
  const capabilities = resolveHistoryCapabilities(provider, historyCapabilities);
  const ranges = RANGES.filter(r => r.days <= capabilities.maxInstantDays || capabilities.supportsDaily);
  const [width, setWidth] = useState(0);
  const [finger, setFinger] = useState<{ x: number; y: number } | null>(null);
  const clearScrub = useCallback(() => { setSelection(null); setFinger(null); }, [setSelection]);

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
  const observedLabel = history?.statistic === 'daily_mean' ? 'Daily mean'
    : history?.statistic === 'daily_selected' ? 'Daily observation' : 'Observed';

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
      !matchesRequest || !history || days > 7 || !!customWindow || history.resolution === 'daily'
        ? null
        : computeTrend(history.readings, drawnUnit),
    [matchesRequest, history, days, drawnUnit, customWindow],
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
  const allForecastPoints = useMemo(
    () => (history?.forecast?.length ? chartPoints(history.forecast, drawnUnit) : []),
    [history, drawnUnit],
  );

  // A short forecast is unreadable against a full year. Exclude it from the
  // plot, its domain and scrubbing; the unmodified history stays in details.
  const forecastPoints = useMemo(() => drawnDays >= 365 ? [] : chartForecastWindow(
    allForecastPoints,
    Date.parse(history?.requestedWindow?.to ?? history?.observedThrough ?? ''),
    drawnDays,
  ), [allForecastPoints, history, drawnDays]);

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
      const start = Date.parse(history.requestedWindow?.from ?? '');
      const end = Date.parse(history.requestedWindow?.to ?? '');
      if ((Number.isFinite(start) && t < start) || (Number.isFinite(end) && t > end)) return [];
      return Number.isFinite(t) && row.p50Cfs !== null
        ? [{ t, median: row.p50Cfs, low: row.p25Cfs, high: row.p75Cfs }]
        : [];
    });
  }, [history, drawnUnit]);

  /** Last year's daily averages on this year's calendar, for this window only. */
  const lastYearShown = showLastYear && lastYearEligible;
  const priorPoints = useMemo<PriorYearPoint[]>(
    () => lastYearShown && matchesRequest && lastYear.readings && lastYearDates
      ? alignPriorYear(lastYear.readings, 'cfs', lastYearDates, history?.requestedWindow) : [],
    [lastYearShown, matchesRequest, lastYear.readings, lastYearDates, history],
  );

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
      ...priorPoints,
      ...typical.flatMap((row) =>
        [showTypical ? row.low : null, showMedian ? row.median : null, showTypical ? row.high : null].flatMap((value) =>
          value === null ? [] : [{ t: row.t, v: value, timestamp: '', qualifiers: [] }],
        ),
      ),
    ].sort((a, b) => a.t - b.t);

    // Band edges and stage lines are context the axis may stretch to include —
    // only the EDGES, since a band boundary is the number someone needs to see
    // their line approaching, and a band's far side is not.
    const context = [
      ...stageLines.map((line) => line.value),
      ...zones.flatMap((zone) => zone.openEnded ? [zone.min] : [zone.min, zone.max]),
    ];
    return chartDomain(spanning, drawnUnit, context, NEAR_THRESHOLD_FRACTION, {
      minimumSpan: drawnUnit === 'cfs' ? 80 : 0.3,
      minimumSpanFraction: drawnUnit === 'cfs' ? 0.18 : 0.08,
      includeAllContext: fullScale,
    });
  }, [points, forecastPoints, priorPoints, typical, zones, stageLines, drawnUnit, showTypical, showMedian, fullScale]);

  /**
   * Round numbers down the left edge, from the same tick function the web axis
   * uses.
   *
   * This file used to label the axis with the padded domain's min, midpoint and
   * max — so the app printed "1,437.6" where the website printed "1,400" for the
   * same gauge in the same week. Nobody reads a hydrograph to learn the 8% pad.
   */
  const valueTicks = useMemo(
    // Three with headroom for four in the compact plot.
    //
    // Discharge is printed as whole cfs (formatReading rounds), so its ticks
    // are floored at whole cfs; a half-cfs rung on a low-water week printed
    // "5, 5, 6". Stage reads to the hundredth and takes the full ladder.
    () =>
      domain
        ? niceValueTicks(domain.min, domain.max, 3, 4, drawnUnit === 'cfs' ? { minStep: 1 } : {})
        : [],
    [domain, drawnUnit],
  );

  const railVisible = (zones.length > 0 || stageLines.length > 0) && fontScale <= 1.25 && width >= 240;
  const railReferences = zones.length
    ? zones.slice(1).map(zone => ({ value: zone.min, label: zone.label, color: conditionColor(zone.key) }))
    : stageLines.map(line => ({ value: line.value, label: stageRailLabel(line.key), color: floodStageColor() }));
  const above = domain ? railReferences.filter(r => r.value >= domain.max).sort((a, b) => a.value - b.value)[0] : null;
  const below = domain ? railReferences.filter(r => r.value <= domain.min).sort((a, b) => b.value - a.value)[0] : null;
  const referenceValues = [...zones.filter(zone => !zone.openEnded).map(zone => zone.max), ...stageLines.map(line => line.value)];
  const railTexts = [
    ...zones.filter(zone => domain && zone.min < domain.max && (zone.openEnded || zone.max > domain.min)).map(zone => zone.label),
    ...railReferences.filter(reference => domain && reference.value >= domain.min && reference.value <= domain.max).flatMap(reference => [reference.label, axisValue(reference.value, drawnUnit)]),
    ...(above ? [`↑ ${above.label}`, axisValue(above.value, drawnUnit)] : []),
    ...(below ? [`↓ ${zones.find(zone => !zone.openEnded && zone.max === below.value)?.label ?? below.label}`, axisValue(below.value, drawnUnit)] : []),
  ];
  const gutters = chartGutters(valueTicks.map(tick => axisValue(tick.value, drawnUnit)), railTexts, axisFont, railVisible);
  const padLeft = gutters.left;
  const padRight = gutters.right;
  const plotWidth = Math.max(0, width - padLeft - padRight);
  const plotHeight = chartHeight - padTop - padBottom;
  const gridValues = domain ? chartGridValues(valueTicks.map(tick => tick.value), referenceValues, domain, plotHeight, axisFont * 1.7) : [];

  const scale = useMemo(() => {
    if (!domain || plotWidth <= 0) return null;
    const spanT = domain.t1 - domain.t0 || 1;
    const spanV = domain.max - domain.min || 1;
    return {
      x: (t: number) => padLeft + 4 + ((t - domain.t0) / spanT) * (plotWidth - 8),
      y: (v: number) => padTop + (1 - (v - domain.min) / spanV) * plotHeight,
    };
  }, [domain, plotWidth, plotHeight, padLeft, padTop]);

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
      gapPaths: [] as string[],
      dots: [] as ChartPoint[],
      forecastPaths: [] as string[],
      forecastDots: [] as ChartPoint[],
      typicalArea: '',
      typicalPath: '',
      priorPaths: [] as string[],
      priorDots: [] as ChartPoint[],
    };
    if (!scale) return empty;
    const toPath = (segment: ChartPoint[]) =>
      segment
        .map((p, i) => `${i ? 'L' : 'M'} ${scale.x(p.t).toFixed(2)} ${scale.y(p.v).toFixed(2)}`)
        .join(' ');

    const { lines, isolated } = chartSegments(points, GAP_BREAK_MULTIPLE);
    const forecastSplit = chartSegments(forecastPoints, GAP_BREAK_MULTIPLE);
    const priorSplit = chartSegments(priorPoints, GAP_BREAK_MULTIPLE);
    return {
      priorPaths: priorSplit.lines.map(toPath),
      priorDots: priorSplit.isolated,
      paths: lines.map(toPath),
      gapPaths: splitAtGaps(points, GAP_BREAK_MULTIPLE).flatMap((segment, index, segments) =>
        index === 0 ? [] : [toPath([segments[index - 1][segments[index - 1].length - 1], segment[0]])],
      ),
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
  }, [points, forecastPoints, priorPoints, typical, scale]);

  /** Three instants across the window, so the middle of the plot is placeable. */
  const xTicks = useMemo(
    () => {
      if (!domain) return [];
      if (domain.t0 === domain.t1 || plotWidth < axisFont * 10) return [{ value: domain.t0, position: 0 }];
      return timeTicks(domain.t0, domain.t1, plotWidth > axisFont * 22 ? 3 : 2);
    },
    [domain, plotWidth, axisFont],
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
    if ([...history.readings, ...(history.forecast ?? [])].some((r) => r.gaugeHeightFt != null)) out.push('ft');
    if ([...history.readings, ...(history.forecast ?? [])].some((r) => r.dischargeCfs != null)) out.push('cfs');
    return out;
  }, [history]);

  const selectTime = useCallback((targetT: number) => {
    // Keep the observed/forecast identity, including when both report at the
    // same instant. Rotation and expansion must not turn one into the other.
    const observed = nearestChartPoint(points, targetT);
    const forecast = nearestChartPoint(forecastPoints, targetT);
    const chooseObserved = observed && (!forecast || Math.abs(observed.t - targetT) <= Math.abs(forecast.t - targetT));
    const point = chooseObserved ? observed : forecast;
    setSelection(point ? { time: point.t, kind: chooseObserved ? 'observed' : 'forecast' } : null);
  }, [points, forecastPoints, setSelection]);

  const scrubbed = useMemo<ScrubbedPoint | null>(() => {
    if (!selection) return null;
    const point = nearestChartPoint(selection.kind === 'observed' ? points : forecastPoints, selection.time);
    // A new range must never silently attach an old selection to another day.
    return point?.t === selection.time ? { point, kind: selection.kind } : null;
  }, [selection, points, forecastPoints]);

  const selectTouch = useCallback((x: number, y: number) => {
    if (!domain) return;
    const time = chartTimeAtX(x, padLeft, plotWidth, domain.t0, domain.t1);
    if (time === null) return;
    setFinger({ x, y });
    selectTime(time);
  }, [domain, padLeft, plotWidth, selectTime]);

  // The inline pan still yields vertical drags to the page/map sheet and wins
  // horizontal drags before the pager. Expanded selections remain after lifting
  // the finger, so rotating the phone keeps the selected reading in view.
  const scrubGesture = useMemo(
    () => Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-SCRUB_ACTIVATE_X, SCRUB_ACTIVATE_X])
      .failOffsetY([-SCRUB_FAIL_Y, SCRUB_FAIL_Y])
      .onTouchesDown(e => {
        const touch = e.allTouches[0];
        if (touch) selectTouch(touch.x, touch.y);
      })
      .onUpdate(e => selectTouch(e.x, e.y))
      .onFinalize(() => {
        setFinger(null);
        if (!expanded) setSelection(null);
      }),
    [selectTouch, expanded, setSelection],
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
    plotWidth > 16 &&
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

  const newest = points.length ? points[points.length - 1] : null;
  const readoutPoint = scrubbed ?? (newest ? { point: newest, kind: 'observed' as const }
    : forecastPoints[0] ? { point: forecastPoints[0], kind: 'forecast' as const } : null);
  const readoutZone = readoutPoint?.kind === 'observed'
    ? zones.find(zone => readoutPoint.point.v <= zone.max || zone.openEnded) : null;
  /** The same date last year, or nothing — never a neighbouring day. */
  const priorFor = (at: ScrubbedPoint | null) => at?.kind === 'observed' ? priorYearPointFor(priorPoints, at.point) : null;
  const priorText = (at: ScrubbedPoint | null) => {
    const prior = priorFor(at);
    return prior ? `Last year · ${formatReading(prior.v, 'cfs')} · ${priorDate(prior.sourceDate)}` : 'Last year · —';
  };

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
    const window = history?.requestedWindow ? `${new Date(history.requestedWindow.from).toLocaleDateString()} to ${new Date(history.requestedWindow.to).toLocaleDateString()}` : drawnDays === 1 ? 'last 24 hours' : `last ${drawnDays} days`;
    const measure = drawnUnit === 'cfs' ? 'Discharge' : 'Gauge height';
    const bits = [
      newest
        ? `${measure}, ${window}. Latest ${formatReading(newest.v, drawnUnit)}.`
        : `${measure}, ${window}.`,
    ];
    // Keep the guarded trend in the spoken summary without repeating page UI.
    if (shownTrend) bits.push(`${shownTrend.label} over the last ${shownTrend.windowHours} hours.`);
    const latestQualifiers = newest ? qualifierText(newest.qualifiers) : null;
    if (latestQualifiers) bits.push(`Latest reading ${latestQualifiers}.`);
    if (forecastPoints.length > 0) {
      bits.push(`NWS forecast included${forecastIssued ? `, issued ${forecastIssued}` : ''}.`);
    }
    if (showTypical && series.typicalArea) bits.push('Historical 25th–75th percentile range shown.');
    if (showMedian && series.typicalPath) bits.push('Historical median shown.');
    if (priorPoints.length) bits.push('Last year daily average shown.');
    if (history?.resolution === 'daily') bits.push(`${observedLabel} history.`);
    if (series.gapPaths.length) bits.push('Dotted connectors indicate missing readings.');
    if (newest && nowLabelText === 'Last reading') bits.push('Last reading is stale.');
    if (zones.length) bits.push('Eddy condition thresholds available in Data and details.');
    if (stageLines.length) bits.push('NWS stage references shown. Full labels and values are in Data and details.');
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
    const at = scrubbed ?? (newest ? { point: newest, kind: 'observed' as const }
      : forecastPoints[0] ? { point: forecastPoints[0], kind: 'forecast' as const } : null);
    if (!at) return null;
    const bits = [`${formatReading(at.point.v, drawnUnit)}, ${scrubTime(at.point.t)}`];
    if (at.kind === 'forecast') bits.push('NWS forecast');
    else {
      if (history?.resolution === 'daily') bits.push(observedLabel);
      const spokenQualifiers = qualifierText(at.point.qualifiers);
      if (spokenQualifiers) bits.push(spokenQualifiers);
      const prior = priorFor(at);
      if (prior) bits.push(`last year ${formatReading(prior.v, 'cfs')} daily average, ${priorDate(prior.sourceDate)}`);
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
    const from = scrubbed?.point.t ?? newest?.t ?? forecastPoints[0]?.t;
    if (from == null) return;
    const next = stepScrubTime(scrubTimes, from, step);
    if (next != null) selectTime(next);
  };

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const action = event.nativeEvent.actionName;
    if (action === 'increment') stepScrub(1);
    else if (action === 'decrement') stepScrub(-1);
  };

  const currentZone = newest ? zones.find(zone => newest.v <= zone.max || zone.openEnded) : null;
  const comparisonCount = Number(showTypical && typical.length > 0) + Number(showMedian && typical.length > 0) + Number(lastYearShown) + Number(fullScale);
  const drawnRangeLabel = drawnDays === 1 ? 'Past 24 hours' : `Past ${drawnDays} days`;
  const rangeLabel = customWindow ? 'Custom dates' : RANGES.find(r => r.days === days)?.label ?? `${days}d`;
  const rangeSummaryLabel = matchesRequest && history?.resolution === 'daily' ? `${rangeLabel} · daily` : rangeLabel;
  const measurementLabel = drawnUnit === 'cfs' ? 'Flow (cfs)' : 'Gauge height (ft)';
  const closeSheet = () => setSheet(null);
  const chooseUnit = (value: 'ft' | 'cfs') => {
    setUnitOverride(value); clearScrub(); setShowTypical(false); setShowMedian(false); setShowLastYear(false); setFullScale(false); closeSheet();
  };
  /** A range the layer cannot use turns it off rather than leaving it pending. */
  const chooseDays = (value: number) => {
    setDays(value);
    if (!lastYearAvailable(drawnUnit, capabilities, value)) setShowLastYear(false);
  };
  const openMeasurement = (target: string) => {
    clearScrub();
    if (Platform.OS !== 'ios') { setSheet('unit'); return; }
    const anchor = Number(target);
    ActionSheetIOS.showActionSheetWithOptions({
      title: 'Measurement', anchor: Number.isFinite(anchor) ? anchor : undefined, tintColor: colors.interactive, userInterfaceStyle: isDark ? 'dark' : 'light',
      options: [...availableUnits.map(value => value === 'cfs' ? 'Flow (cfs)' : 'Gauge height (ft)'), 'Cancel'],
      cancelButtonIndex: availableUnits.length,
    }, index => { if (availableUnits[index]) chooseUnit(availableUnits[index]); });
  };
  const openRange = (target: string) => {
    clearScrub();
    if (Platform.OS !== 'ios') { setSheet('range'); return; }
    const anchor = Number(target);
    const options = ranges.map(range => range.days === 1 ? '24 hours' : range.days === 365 ? '1 year' : `${range.days} days`);
    if (capabilities.supportsCustomRange) options.push('Custom dates');
    ActionSheetIOS.showActionSheetWithOptions({
      title: 'History range', anchor: Number.isFinite(anchor) ? anchor : undefined, tintColor: colors.interactive, userInterfaceStyle: isDark ? 'dark' : 'light',
      options: [...options, 'Cancel'], cancelButtonIndex: options.length,
    }, index => {
      const range = ranges[index];
      if (range) { setCustomWindow(undefined); chooseDays(range.days); clearScrub(); }
      else if (index < options.length) setSheet('dates');
    });
  };
  const chooseStartDate = (value: string) => {
    const nextEnd = chartEndAfterStartChange(value, toDate);
    setFromDate(value);
    if (nextEnd !== toDate) {
      setToDate(nextEnd);
      AccessibilityInfo.announceForAccessibility(`End date moved to ${parseLocalChartDate(nextEnd)!.toLocaleDateString()}.`);
    }
    setDateErrors({});
  };
  const applyDates = () => {
    const result = validateChartDates(fromDate, toDate, Date.now());
    if (result.errors) { setDateErrors(result.errors); return; }
    setDateErrors({}); clearScrub(); chooseDays(result.days);
    setCustomWindow(result.window); closeSheet();
  };

  const railCandidates: ChartRailLabel[] = [];
  if (railVisible && scale && domain) {
    for (const zone of zones) {
      const top = scale.y(zone.openEnded ? domain.max : Math.min(zone.max, domain.max));
      const bottom = scale.y(Math.max(zone.min, domain.min));
      if (bottom - top >= axisFont * 1.7) railCandidates.push({
        id: `name-${zone.key}`, kind: 'name', text: zone.label, y: (top + bottom) / 2,
        height: axisFont * 1.3, priority: zone === currentZone ? -1 : 2000,
      });
    }
    const currentY = newest ? scale.y(newest.v) : padTop + plotHeight / 2;
    for (const reference of railReferences) {
      if (reference.value < domain.min || reference.value > domain.max) continue;
      const y = scale.y(reference.value);
      railCandidates.push({ id: `value-${reference.value}`, kind: 'value', text: axisValue(reference.value, drawnUnit),
        y, height: axisFont * 1.3, priority: 10 + Math.abs(y - currentY) });
      if (!zones.length) railCandidates.push({ id: `name-${reference.value}`, kind: 'name', text: reference.label,
        y: y - axisFont * 1.8, height: axisFont * 1.3, priority: 1000 + Math.abs(y - currentY) });
    }
    if (above) railCandidates.push({ id: 'above', kind: 'offscreen', text: `↑ ${above.label}`, secondLine: axisValue(above.value, drawnUnit),
      y: axisFont * 1.25 + 1, height: axisFont * 2.5, priority: -2 });
    if (below) railCandidates.push({ id: 'below', kind: 'offscreen', text: `↓ ${zones.find(zone => !zone.openEnded && zone.max === below.value)?.label ?? below.label}`, secondLine: axisValue(below.value, drawnUnit),
      y: chartHeight - axisFont * 1.25 - 1, height: axisFont * 2.5, priority: -2 });
  }
  const railLabels = selectChartRailLabels(railCandidates, 0, chartHeight, 4 * fontScale);

  return (
    <View style={[styles.card, expanded && styles.expandedCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      accessibilityElementsHidden={!active} importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}>
      <View onLayout={expanded ? event => setControlsHeight(event.nativeEvent.layout.height) : undefined}>
        <View style={styles.toolbar}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Measurement: ${measurementLabel}`}
            accessibilityHint="Choose the measurement to chart"
            accessibilityState={{ disabled: !availableUnits.some(value => value !== drawnUnit) }}
            disabled={!availableUnits.some(value => value !== drawnUnit)} onPress={event => openMeasurement(event.nativeEvent.target)}
            style={({ pressed }) => [styles.measurement, { opacity: pressed ? 0.65 : 1 }]}>
            <Text style={[styles.measurementText, { color: colors.text }]}>{measurementLabel}</Text>
            {availableUnits.some(value => value !== drawnUnit) ? <ControlIcon name="chevron-down" size={14} color={colors.textMuted} /> : null}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`History range: ${rangeSummaryLabel}`} onPress={event => openRange(event.nativeEvent.target)}
            style={({ pressed }) => [styles.rangeButton, { backgroundColor: colors.cardRaised, opacity: pressed ? 0.65 : 1 }]}>
            {loading && history ? <ActivityIndicator size="small" color={colors.interactive} /> : null}
            <Text style={[styles.actionText, { color: colors.text }]}>{rangeSummaryLabel}</Text>
            <ControlIcon name="chevron-down" size={14} color={colors.textMuted} />
          </Pressable>
        </View>
        {history && !matchesRequest ? <View style={styles.rangeStatus}>
          <Text accessibilityLiveRegion="polite" style={[styles.caption, { color: colors.textMuted }]}>
            {loading ? 'Loading selected range… ' : 'Selected range unavailable. '}
            Showing {history.requestedWindow ? chartDateRange(history.requestedWindow.from, history.requestedWindow.to) : drawnRangeLabel.toLowerCase()}.
          </Text>
          {!loading ? <Pressable accessibilityRole="button" onPress={retry} style={styles.retry}>
            <Text style={[styles.actionText, { color: colors.interactive }]}>Try again</Text>
          </Pressable> : null}
        </View> : null}
        {expanded ? <GaugeChartFixedReadout
          compact={width > availableHeight && fontScale <= 1.5}
          value={readoutPoint ? formatReading(readoutPoint.point.v, drawnUnit) : '—'}
          band={readoutPoint?.kind === 'observed' ? readoutZone?.label : undefined}
          time={readoutPoint ? scrubTime(readoutPoint.point.t) : 'Touch the chart to explore'}
          source={readoutPoint?.kind === 'forecast' ? 'NWS forecast' : observedLabel}
          quality={readoutPoint?.kind === 'observed' ? qualifierText(readoutPoint.point.qualifiers) : null}
          comparison={priorPoints.length ? priorText(readoutPoint) : null} /> : null}
      </View>
      <View style={styles.plotWrap} onLayout={onLayout}>
        {width > 0 && hasPlot ? <GestureDetector gesture={scrubGesture}>
          <View accessible accessibilityRole="adjustable" accessibilityLabel={plotSummary}
            accessibilityHint="Swipe up or down for the next or previous reading. Data and details contains the full table."
            accessibilityValue={spokenValue ? { text: spokenValue } : undefined}
            accessibilityActions={[{ name: 'increment', label: 'Later reading' }, { name: 'decrement', label: 'Earlier reading' }]}
            onAccessibilityAction={onAccessibilityAction} onAccessibilityEscape={expanded ? onClose : clearScrub}>
            <Svg width={width} height={chartHeight}>
              <Defs><ClipPath id={clipId}><Rect x={padLeft} y={padTop} width={plotWidth} height={plotHeight} /></ClipPath></Defs>
              <G clipPath={`url(#${clipId})`}>
                {currentZone ? <Rect x={padLeft} y={Math.max(padTop, scale.y(currentZone.openEnded ? domain.max : Math.min(currentZone.max, domain.max)))}
                  width={plotWidth} height={Math.max(0, Math.min(padTop + plotHeight, scale.y(currentZone.min)) - Math.max(padTop, scale.y(currentZone.openEnded ? domain.max : Math.min(currentZone.max, domain.max))))}
                  fill={conditionColor(currentZone.key)} opacity={isDark ? 0.08 : 0.05} /> : null}
                {gridValues.map(value => <Line key={`grid-${value}`} x1={padLeft} x2={padLeft + plotWidth} y1={scale.y(value)} y2={scale.y(value)} stroke={colors.border} strokeWidth={0.5} />)}
                {showTypical && series.typicalArea ? <Path d={series.typicalArea} fill={colors.textMuted} fillOpacity={isDark ? 0.16 : 0.1} /> : null}
                {showMedian && series.typicalPath ? <Path d={series.typicalPath} stroke={colors.textMuted} strokeWidth={1} strokeDasharray="2 4" fill="none" /> : null}
                {zones.filter(zone => !zone.openEnded).map(zone => <Line key={`edge-${zone.key}`} x1={padLeft} x2={padLeft + plotWidth} y1={scale.y(zone.max)} y2={scale.y(zone.max)} stroke={conditionColor(zone.key)} strokeWidth={0.75} opacity={0.5} />)}
                {stageLines.map(line => <Line key={`stage-${line.key}`} x1={padLeft} x2={padLeft + plotWidth} y1={scale.y(line.value)} y2={scale.y(line.value)} stroke={floodStageColor()} strokeWidth={1} strokeDasharray={FLOOD_STAGE_SYSTEM[line.key].dash} opacity={0.65} />)}
                {series.priorPaths.map((d, i) => <Path key={`prior-${i}`} d={d} stroke={colors.textSubtle} strokeWidth={1.6} strokeDasharray="5 4" fill="none" strokeLinejoin="round" />)}
                {series.priorDots.map(point => <Circle key={`prior-dot-${point.t}`} cx={scale.x(point.t)} cy={scale.y(point.v)} r={2} fill={colors.textSubtle} />)}
                {series.gapPaths.map((d, i) => <Path key={`gap-${i}`} d={d} stroke={colors.textSubtle} strokeWidth={1} strokeDasharray="1 5" fill="none" />)}
                {series.paths.map((d, i) => <Path key={`observed-${i}`} d={d} stroke={lineColor} strokeWidth={2.8} fill="none" strokeLinejoin="round" strokeLinecap="round" />)}
                {series.dots.map(point => <Circle key={`dot-${point.t}`} cx={scale.x(point.t)} cy={scale.y(point.v)} r={2.5} fill={lineColor} />)}
                {series.forecastPaths.map((d, i) => <Path key={`forecast-${i}`} d={d} stroke={lineColor} strokeWidth={1.8} strokeDasharray="6 4" opacity={0.7} fill="none" strokeLinejoin="round" />)}
                {series.forecastDots.map(point => <Circle key={`forecast-dot-${point.t}`} cx={scale.x(point.t)} cy={scale.y(point.v)} r={3} fill={colors.card} stroke={lineColor} strokeWidth={1.3} />)}
                {forecastPoints.length > 0 ? <Circle cx={scale.x(forecastPoints[0].t)} cy={scale.y(forecastPoints[0].v)} r={2.7} fill={colors.card} stroke={lineColor} strokeWidth={1.3} /> : null}
                {newest ? <>
                  {forecastPoints.length > 0 ? <Line x1={scale.x(newest.t)} x2={scale.x(newest.t)} y1={padTop} y2={padTop + plotHeight} stroke={colors.textMuted} strokeDasharray="2 4" opacity={0.3} /> : null}
                  <Circle cx={scale.x(newest.t)} cy={scale.y(newest.v)} r={4.3} fill={lineColor} stroke={colors.card} strokeWidth={1.3} />
                </> : null}
                {scrubbed ? <>
                  <Line x1={scale.x(scrubbed.point.t)} x2={scale.x(scrubbed.point.t)} y1={padTop} y2={padTop + plotHeight} stroke={colors.textMuted} opacity={0.5} />
                  <Circle cx={scale.x(scrubbed.point.t)} cy={scale.y(scrubbed.point.v)} r={4.5} fill={colors.card} stroke={lineColor} strokeWidth={2} />
                </> : null}
              </G>
              {valueTicks.map(tick => <SvgText key={`value-${tick.value}`} x={padLeft - 7} y={scale.y(tick.value) + axisFont * 0.35} textAnchor="end" fill={colors.textMuted} fontSize={axisFont} fontFamily={fonts.mono}>{axisValue(tick.value, drawnUnit)}</SvgText>)}
              {railVisible && zones.map(zone => {
                const top = scale.y(zone.openEnded ? domain.max : Math.min(zone.max, domain.max));
                const bottom = scale.y(Math.max(zone.min, domain.min));
                const height = bottom - top;
                if (height <= 0) return null;
                return <G key={`rail-${zone.key}`}>
                  <Rect x={padLeft + plotWidth + 7} y={top} width={4} height={height} fill={conditionColor(zone.key)} />
                </G>;
              })}
              {railVisible && !zones.length && stageLines.map(line => {
                const y = scale.y(line.value);
                return y >= padTop && y <= padTop + plotHeight
                  ? <Rect key={`rail-stage-${line.key}`} x={padLeft + plotWidth + 7} y={y - 2} width={4} height={4} fill={floodStageColor()} /> : null;
              })}
              {railLabels.map(label => label.kind === 'offscreen' ? <G key={label.id}>
                <SvgText x={padLeft + plotWidth + 6} y={label.y - axisFont * 0.3} fill={colors.textMuted} fontSize={axisFont} fontFamily={fonts.body}>{label.text}</SvgText>
                <SvgText x={padLeft + plotWidth + 6} y={label.y + axisFont} fill={colors.textMuted} fontSize={axisFont} fontFamily={fonts.mono}>{label.secondLine}</SvgText>
              </G> : <SvgText key={label.id} x={padLeft + plotWidth + 16} y={label.y + axisFont * 0.35} fontSize={axisFont}
                fill={label.kind === 'name' ? colors.text : colors.textMuted} fontFamily={label.kind === 'name' ? fonts.medium : fonts.mono}>{label.text}</SvgText>)}
              {plotWidth >= axisFont * 7 && (forecastPoints.length > 0 || stageLines.length > 0) ? <SvgText x={padLeft + plotWidth - 3} y={axisFont * 1.8} textAnchor="end" fill={colors.textMuted} fontSize={axisFont} fontFamily={fonts.body}>{forecastPoints.length ? 'NWS forecast' : 'NWS stages'}</SvgText> : null}
              {plotWidth > axisFont * (forecastPoints.length || stageLines.length ? 18 : 8) ? <SvgText x={padLeft + 3} y={axisFont * 1.8} fill={colors.textMuted} fontSize={axisFont} fontFamily={fonts.body}>
                {priorPoints.length ? (plotWidth > axisFont * (forecastPoints.length || stageLines.length ? 30 : 16) ? 'Last year · daily average' : 'Last year')
                  : showTypical && series.typicalArea ? 'Typical' : showMedian && series.typicalPath ? 'Median' : nowLabelText === 'Last reading' ? 'Last reading' : ''}
              </SvgText> : null}
              {xTicks.map((tick, index) => <SvgText key={`time-${index}`} x={scale.x(tick.value)} y={chartHeight - 6} fill={colors.textMuted} fontSize={axisFont} fontFamily={fonts.body} textAnchor={index === 0 ? 'start' : index === xTicks.length - 1 ? 'end' : 'middle'}>{axisTime(tick.value, drawnDays)}</SvgText>)}
            </Svg>
            {scrubbed && !expanded && active ? <GaugeChartReadout key={`${drawnUnit}-${fontScale}`} width={width} height={chartHeight}
              point={{ x: scale.x(scrubbed.point.t), y: scale.y(scrubbed.point.v) }}
              finger={finger}
              value={formatReading(scrubbed.point.v, drawnUnit)} band={scrubZone?.label} time={scrubTime(scrubbed.point.t)}
              source={scrubbed.kind === 'forecast' ? 'NWS forecast' : observedLabel} quality={scrubQualifiers}
              comparison={priorPoints.length && scrubbed.kind === 'observed' ? priorText(scrubbed) : null} /> : null}
          </View>
        </GestureDetector> : <View style={[styles.placeholder, { height: chartHeight }]}>
          {loading ? <ActivityIndicator accessibilityLabel="Loading gauge history" color={colors.interactive} /> : failed ? <>
            <Text style={[styles.placeholderText, { color: colors.textMuted }]}>Couldn&apos;t load this gauge&apos;s history.</Text>
            <Pressable accessibilityRole="button" onPress={retry} style={styles.retry}><Text style={[styles.actionText, { color: colors.interactive }]}>Try again</Text></Pressable>
          </> : <Text style={[styles.placeholderText, { color: colors.textMuted }]}>{unavailable ? 'No recent history published for this gauge.' : points.length >= 2 || forecastPoints.length ? 'Use Data & details to read this history at your current text size.' : points.length === 1 ? 'Only one reading in this window — not enough to chart.' : `No ${drawnUnit === 'cfs' ? 'flow' : 'gauge height'} reported in this window.`}</Text>}
        </View>}
      </View>
      <View style={[styles.actions, { borderTopColor: colors.border }]}
        onLayout={expanded ? event => setActionsHeight(event.nativeEvent.layout.height) : undefined}>
        <Pressable accessibilityRole="button" accessibilityLabel="Compare chart layers" onPress={() => { clearScrub(); setSheet('compare'); }} style={({ pressed }) => [styles.toolbarAction, { opacity: pressed ? 0.65 : 1 }]}>
          <ControlIcon name="options-outline" size={16} color={colors.interactive} /><Text style={[styles.actionText, { color: colors.interactive }]}>Compare{comparisonCount ? ` · ${comparisonCount}` : ''}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => { clearScrub(); setSheet('data'); }} style={({ pressed }) => [styles.toolbarAction, { opacity: pressed ? 0.65 : 1 }]}>
          <ControlIcon name="grid-outline" size={16} color={colors.interactive} /><Text style={[styles.actionText, { color: colors.interactive }]}>Data & details</Text>
        </Pressable>
        {!expanded ? <Pressable accessibilityRole="button" accessibilityLabel="Expand chart"
          accessibilityHint="Open the chart full screen."
          onPress={onExpand} style={({ pressed }) => [styles.expand, { opacity: pressed ? 0.65 : 1 }]}>
          <ControlIcon name="expand-outline" size={20} color={colors.interactive} />
        </Pressable> : null}
      </View>
      {active && sheet ? <GaugeChartSheet expanded={expanded} title={sheet === 'compare' ? 'Compare' : sheet === 'data' ? 'Data & details' : sheet === 'unit' ? 'Measurement' : sheet === 'range' ? 'History range' : 'Custom dates'} onClose={closeSheet}>
        {sheet === 'compare' ? <>
          <ChartComparison label="Typical range" detail={drawnUnit !== 'cfs' ? 'Available for Flow (cfs)' : typical.length ? 'Historical daily flow · 25th–75th percentile' : 'Historical statistics unavailable for this window'} value={showTypical && typical.length > 0} disabled={!typical.length} onChange={setShowTypical} />
          <ChartComparison label="Historical median" detail="50th percentile for each date" value={showMedian && typical.length > 0} disabled={!typical.length} onChange={setShowMedian} />
          {lastYearEligible ? <ChartComparison label="Last year"
            detail={!showLastYear ? 'Daily average' : lastYear.status === 'failed' ? "Couldn't load last year"
              : lastYear.status === 'empty' || (lastYear.status === 'ready' && !priorPoints.length) ? 'No data for last year'
              : lastYear.status === 'ready' ? 'Daily average' : 'Loading…'}
            value={showLastYear} disabled={false} onChange={setShowLastYear}
            action={showLastYear && lastYear.status === 'failed' ? <Pressable accessibilityRole="button" accessibilityLabel="Retry last year" onPress={lastYear.retry} style={[styles.retry, styles.inlineRetry]}>
              <Text style={[styles.actionText, { color: colors.interactive }]}>Retry</Text>
            </Pressable> : null} /> : null}
          <ChartComparison label={zones.length ? 'Full Eddy scale' : 'Full stage references'} detail={zones.length ? 'Show every condition threshold' : stageLines.length ? 'NWS references in feet' : 'No thresholds for this measurement'} value={fullScale} disabled={!zones.length && !stageLines.length} onChange={setFullScale} />
          <Text style={[styles.caption, { color: colors.textMuted }]}>Historical context describes past daily flow, not forecast uncertainty. Values appear only for dates provided by USGS.</Text>
        </> : sheet === 'data' ? <GaugeChartDetails siteId={siteId} history={history} thresholds={thresholds} floodStages={floodStages} defaultUnit={unit} /> : sheet === 'unit' ? availableUnits.map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: value === drawnUnit }} onPress={() => chooseUnit(value)} style={[styles.choice, { borderBottomColor: colors.border }]}>
          <Text style={[styles.choiceText, { color: colors.text }]}>{value === 'cfs' ? 'Flow (cfs)' : 'Gauge height (ft)'}</Text>{value === drawnUnit ? <ControlIcon name="checkmark" size={20} color={colors.interactive} /> : null}
        </Pressable>) : sheet === 'range' ? <>
          {ranges.map(r => {
            const active = r.days === days && !customWindow;
            return <Pressable key={r.days} accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => { setCustomWindow(undefined); chooseDays(r.days); clearScrub(); closeSheet(); }} style={[styles.choice, { borderBottomColor: colors.border }]}>
              <Text style={[styles.choiceText, { color: colors.text }]}>{r.days === 1 ? '24 hours' : r.days === 365 ? '1 year' : `${r.days} days`}</Text>{active ? <ControlIcon name="checkmark" size={20} color={colors.interactive} /> : null}
            </Pressable>;
          })}
          {capabilities.supportsCustomRange ? <Pressable accessibilityRole="button" onPress={() => setSheet('dates')} style={[styles.choice, { borderBottomColor: colors.border }]}><Text style={[styles.choiceText, { color: colors.interactive }]}>Custom dates</Text><ControlIcon name="calendar-outline" size={20} color={colors.interactive} /></Pressable> : null}
        </> : <>
          <Text style={[styles.caption, { color: colors.textMuted }]}>Choose up to 366 days.</Text>
          <ChartDateField label="Start date" value={fromDate} error={dateErrors.from} onChange={chooseStartDate} />
          <ChartDateField label="End date" minimumDate={parseLocalChartDate(fromDate) ?? undefined} value={toDate} error={dateErrors.to} onChange={value => { setToDate(value); setDateErrors({}); }} />
          <Pressable accessibilityRole="button" onPress={applyDates} style={[styles.rangeButton, { backgroundColor: colors.cardRaised }]}><Text style={[styles.actionText, { color: colors.interactive }]}>Apply dates</Text></Pressable>
        </>}
      </GaugeChartSheet> : null}
    </View>
  );
}

function ChartComparison({ label, detail, value, disabled, onChange, action }: { label: string; detail: string; value: boolean; disabled: boolean; onChange: (value: boolean) => void; action?: ReactNode }) {
  const { colors } = useTheme();
  return <View style={[styles.comparison, { borderBottomColor: colors.border }]}>
    <View style={styles.comparisonCopy}><Text style={[styles.choiceText, { color: colors.text }]}>{label}</Text><Text style={[styles.caption, { color: colors.textMuted }]}>{detail}</Text>{action}</View>
    <Switch accessibilityLabel={`${label}. ${detail}`} value={value} disabled={disabled} onValueChange={onChange} trackColor={{ true: colors.interactive }} />
  </View>;
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
  const { colors } = useTheme();
  return (
    <ChartBoundary
      // Deliberately shaped like the component's own empty states rather than
      // like an error: same card, same height, same quiet ink. What is missing
      // is one panel, and the reading it charts is still on the screen above.
      fallback={
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.placeholder, { height: CHART_HEIGHT }]}>
            <Text style={[styles.placeholderText, { color: colors.textSubtle }]}>
              Charts need a newer version of the app. Everything else on this
              screen is up to date.
            </Text>
          </View>
        </View>
      }
    >
      <GaugeChartInner key={props.siteId} {...props} />
    </ChartBoundary>
  );
}

const styles = StyleSheet.create({
  // Page summaries own the current value, rating and freshness. This component
  // owns only the chart: ~310pt at default text size, growing with Dynamic Type.
  card: { marginBottom: 14, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  expandedCard: { marginBottom: 0, paddingTop: 0, paddingBottom: 8, borderTopWidth: 0, borderBottomWidth: 0 },
  expand: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  measurement: { minHeight: 44, flexDirection: 'row', gap: 6, alignItems: 'center', flexShrink: 1, paddingVertical: 8, paddingHorizontal: 4 },
  measurementText: { ...t.sm, fontFamily: fonts.semibold, flexShrink: 1 },
  rangeButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  rangeStatus: { marginBottom: 8, gap: 4 },
  plotWrap: { position: 'relative' },
  caption: { ...t.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth },
  toolbarAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 4, flexShrink: 1 },
  actionText: { ...t.xs, fontFamily: fonts.medium, flexShrink: 1 },
  placeholder: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  placeholderText: { ...t.sm, textAlign: 'center' },
  retry: { minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
  inlineRetry: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  choice: { minHeight: 52, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  choiceText: { ...t.base, fontFamily: fonts.medium, flexShrink: 1 },
  comparison: { minHeight: 68, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  comparisonCopy: { flex: 1, gap: 3 },
  dateInput: { ...t.base, minHeight: 44, borderWidth: 1, borderRadius: 10, padding: 12 },
});
