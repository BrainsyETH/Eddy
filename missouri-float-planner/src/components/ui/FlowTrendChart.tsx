'use client';

// src/components/ui/FlowTrendChart.tsx
// The web hydrograph: what this gauge has been doing, against what its
// thresholds mean, plus the official forecast where NWS publishes one.
//
// ── What this file no longer decides ───────────────────────────────────────
// The axis math, the gap rule, the tick placement and the downsample live in
// shared/chart-model.ts, which eddy-ios draws from too. They used to live here
// AND there, and the two had drifted into telling different stories about the
// same river:
//
//   · X WAS THE ARRAY INDEX, not time. Readings are not evenly spaced — less so
//     now that the endpoint samples by extrema — so a crest was drawn at the
//     wrong hour, and an outage was drawn as if the river had simply held
//     steady across it.
//   · A NULL READING WAS PLOTTED AT y = 50, mid-frame. That is a fabricated
//     number, and on a stage-only gauge asked for discharge it drew a flat
//     confident line at nothing in particular.
//   · THE SERIES WAS RE-SAMPLED HERE with `index % step`, on top of the
//     server's own stride, so the chart could lose a flood peak twice.
//   · THE Y AXIS SILENTLY BECAME sqrt WHENEVER the range ratio passed 5. Two
//     gauges side by side could carry differently-shaped axes with nothing on
//     screen saying so.
//
// The qualifier vocabulary moved there too: the app's scrub was reading out a
// provisional number with nothing saying it was provisional, because this file
// owned the only copy of the table.
//
// ── What is still decided here ────────────────────────────────────────────
// Pixels, colours and the pointer — and, since this is the web, the KEYBOARD.
// The plot is a role="slider" over time: arrow keys step one reading at a time
// through the observed and forecast series, Home/End jump to the ends, and
// aria-valuetext speaks the same sentence the tooltip shows. Scrubbing used to
// be mouse and touch only, which left the numbers reachable by pointer alone.
//
// The SVG keeps viewBox="0 0 100 100" with
// preserveAspectRatio="none" and stretches to the container, which is why every
// piece of text sits in a sibling DOM column rather than inside the SVG: text
// in a non-uniformly scaled SVG is text with the wrong aspect ratio. It also
// means the tooltip's `left: x%` and the SVG's x coordinate are the same
// number, so the readout and the crosshair cannot drift apart.

import { useMemo, useState, useRef, useCallback, type ReactNode } from 'react';
import { useGaugeHistory } from '@/hooks/useGaugeHistory';
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
} from '@shared/chart-model';

// Threshold line configuration
export interface ChartThresholdLines {
  levelTooLow: number | null;
  levelLow: number | null;
  levelOptimalMin: number | null;
  levelOptimalMax: number | null;
  levelHigh: number | null;
  levelDangerous: number | null;
}

const THRESHOLD_LINE_CONFIG: { key: keyof ChartThresholdLines; label: string; color: string; dash?: string }[] = [
  { key: 'levelLow', label: 'Good', color: '#65a30d', dash: '3,3' },
  { key: 'levelOptimalMin', label: 'Flowing', color: '#059669', dash: '2,2' },
  { key: 'levelOptimalMax', label: 'Flowing', color: '#059669', dash: '2,2' },
  { key: 'levelHigh', label: 'High', color: '#f97316', dash: '3,3' },
  { key: 'levelDangerous', label: 'Flood', color: '#ef4444', dash: '4,2' },
];

const SERIES_COLOR = 'rgb(45, 120, 137)';
/** Violet sits in neither the condition ladder nor the flow ramp, so a forecast
 *  line cannot be misread as a verdict about floatability. Matches the hue the
 *  app's chart uses for NWS stages. */
const FORECAST_COLOR = '#7c3aed';
const TYPICAL_COLOR = '#0f766e';

/**
 * Who published the observed series, read off the URL the endpoint gave us.
 *
 * From the HOST rather than from the station's provider id, because the host is
 * the one thing that cannot be wrong about where a link goes. An unrecognised
 * publisher gets its own hostname rather than a guess or a shrug.
 */
function publisherLabel(sourceUrl: string): string | null {
  try {
    const { hostname } = new URL(sourceUrl);
    if (hostname.endsWith('usgs.gov')) return 'USGS';
    if (hostname.endsWith('noaa.gov')) return 'NWS';
    return hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

interface FlowTrendChartProps {
  gaugeSiteId: string;
  days: number;
  thresholds?: ChartThresholdLines | null;
  latestValue?: number | null;
  displayUnit?: 'ft' | 'cfs';
  chartClassName?: string;
  /**
   * Draw the day-of-year typical range behind the series.
   *
   * OFF BY DEFAULT, and deliberately not inferred from the chart's height. It
   * is real context on a detail page with room for a legend, and clutter behind
   * a 128px card sparkline that a reader cannot interrogate. The caller knows
   * which one it is drawing; this component does not.
   */
  showTypical?: boolean;
  /**
   * Name the sources under the plot: who measured the line, who forecast the
   * dashed part and when they issued it, and whether the series was reduced.
   *
   * SAME CALLER-DECIDES RULE as showTypical, plus a structural one. The source
   * is a link, and RiverCard renders this chart INSIDE a next/link — a nested
   * anchor is invalid HTML and React will say so. Detail views pass this; the
   * card cannot, and does not need to: both detail views already print the
   * station's own source link beside its name.
   */
  showProvenance?: boolean;
  /**
   * Whether pointer and keyboard can scrub the series.
   *
   * ON BY DEFAULT, OFF FOR CARDS, and that is the navigation fix rather than a
   * taste call. RiverCard wraps the whole card — this chart included — in a link
   * to the river, so on a phone a drag across a 128px sparkline is a gesture
   * competing with both the page scroll and the tap target underneath it: at
   * best the readout flickers, at worst the reader lands on a detail page they
   * did not ask for. A card sparkline is a shape, and the detail chart three
   * taps away is where the numbers are.
   */
  interactive?: boolean;
}

type HoverPoint = { point: ChartPoint; kind: 'observed' | 'forecast' };

export default function FlowTrendChart({
  gaugeSiteId,
  days,
  thresholds,
  latestValue,
  displayUnit = 'cfs',
  chartClassName,
  showTypical = false,
  showProvenance = false,
  interactive = true,
}: FlowTrendChartProps) {
  const { data: history, isLoading, error } = useGaugeHistory(gaugeSiteId, days);
  const isFt = displayUnit === 'ft';
  const [hoverFraction, setHoverFraction] = useState<number | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const chartData = useMemo(() => {
    if (!history) return null;

    const observed = chartPoints(history.readings, displayUnit);

    // Forecast points share the reading shape, so the same reader applies —
    // including its refusal to invent a value for the unit that is absent.
    const forecast = chartPoints(history.forecast, displayUnit);

    // ONE READING PLUS A FORECAST IS A CHART. This guard used to run before the
    // forecast was read and to demand two OBSERVED points, so a gauge with one
    // recent reading and three days of official forecast rendered "trend data
    // unavailable" — throwing away the half of the picture that was about the
    // weekend.
    //
    // Zero observations is still nothing, on purpose. A forecast-only chart
    // needs `current` (below) to become nullable — it feeds the now-line, the
    // current dot and the header's "Current:" — and it needs the endpoint to
    // stop 404ing a station whose only data is ahead of it. Measured against
    // production before writing this: of 6,855 stations carrying an NWS LID,
    // none had exactly one reading in a 14-day window in either unit, and the
    // 6,830 with no stored readings at all take the live-upstream fallback or
    // the 404. So the cheap half ships and the expensive half waits for a
    // station that needs it, which starts as a route change, not a chart one.
    if (!observed.length || (observed.length < 2 && !forecast.length)) return null;

    // Percentiles are a discharge statistic; there is no stage equivalent in
    // usgs_daily_percentiles, so a foot axis simply has no typical range.
    const typical = showTypical && !isFt
      ? history.typical.flatMap((row) => {
          const t = new Date(`${row.date}T12:00:00`).getTime();
          return Number.isFinite(t) && row.p50Cfs !== null
            ? [{ t, median: row.p50Cfs, low: row.p25Cfs, high: row.p75Cfs }]
            : [];
        })
      : [];

    const thresholdValues = thresholds
      ? THRESHOLD_LINE_CONFIG.map((config) => thresholds[config.key]).filter(
          (value): value is number => value !== null
        )
      : [];

    const typicalPoints: ChartPoint[] = typical.flatMap((row) =>
      [row.low, row.median, row.high].flatMap((value) =>
        value === null ? [] : [{ t: row.t, v: value, timestamp: '', qualifiers: [] }]
      )
    );

    const spanning = [...observed, ...forecast, ...typicalPoints].sort((a, b) => a.t - b.t);
    const domain = chartDomain(spanning, displayUnit, thresholdValues);
    if (!domain) return null;

    const spanT = domain.t1 - domain.t0 || 1;
    const spanV = domain.max - domain.min || 1;
    const x = (t: number) => ((t - domain.t0) / spanT) * 100;
    const y = (value: number) => 100 - ((value - domain.min) / spanV) * 100;

    const pathFor = (segment: { t: number; v: number }[]) =>
      segment.map((p, i) => `${i ? 'L' : 'M'} ${x(p.t).toFixed(3)} ${y(p.v).toFixed(3)}`).join(' ');

    // One path per segment, so an outage reads as an outage rather than as a
    // straight line drawn confidently across it — plus the readings that have no
    // neighbour to be joined to, which get a dot instead of being discarded.
    const observedSplit = chartSegments(observed);
    const forecastSplit = chartSegments(forecast);

    const areaFor = (segment: ChartPoint[]) =>
      `${pathFor(segment)} L ${x(segment[segment.length - 1].t).toFixed(3)} 100 L ${x(segment[0].t).toFixed(3)} 100 Z`;

    // The band needs both edges, so it is drawn from the rows that HAVE both
    // rather than suppressed entirely by one row that does not. The median line
    // is separate and covers every row regardless.
    const bandRows = typical.filter((row) => row.low !== null && row.high !== null);
    const typicalArea =
      bandRows.length > 1
        ? `${pathFor(bandRows.map((row) => ({ t: row.t, v: row.high! })))} ${bandRows
            .slice()
            .reverse()
            .map((row) => `L ${x(row.t).toFixed(3)} ${y(row.low!).toFixed(3)}`)
            .join(' ')} Z`
        : '';

    const thresholdLineData = thresholds
      ? THRESHOLD_LINE_CONFIG.filter((config) => thresholds[config.key] !== null)
          .map((config) => ({ ...config, value: thresholds[config.key]!, y: y(thresholds[config.key]!) }))
          .filter((line) => line.y >= -5 && line.y <= 105)
      : [];

    // Collapse the optimal pair to one centred label, then drop any label that
    // would collide with one already placed.
    const MIN_LABEL_GAP = 8;
    const labelCandidates: typeof thresholdLineData = [];
    const optMin = thresholdLineData.find((t) => t.key === 'levelOptimalMin');
    const optMax = thresholdLineData.find((t) => t.key === 'levelOptimalMax');
    if (optMin && optMax) labelCandidates.push({ ...optMin, y: (optMin.y + optMax.y) / 2 });
    else if (optMin) labelCandidates.push(optMin);
    else if (optMax) labelCandidates.push(optMax);
    for (const line of thresholdLineData) {
      if (line.key !== 'levelOptimalMin' && line.key !== 'levelOptimalMax') labelCandidates.push(line);
    }
    labelCandidates.sort((a, b) => a.y - b.y);
    const thresholdLabels: typeof labelCandidates = [];
    for (const candidate of labelCandidates) {
      if (!thresholdLabels.some((placed) => Math.abs(placed.y - candidate.y) < MIN_LABEL_GAP)) {
        thresholdLabels.push(candidate);
      }
    }

    const current = observed[observed.length - 1];
    return {
      observed,
      forecast,
      domain,
      x,
      y,
      current,
      observedPaths: observedSplit.lines.map(pathFor),
      observedAreas: observedSplit.lines.map(areaFor),
      // The newest reading is excluded because it already has the current-value
      // dot; drawing both would stack two circles of different radii.
      observedDots: observedSplit.isolated.filter((point) => point.t !== current.t),
      // Every instant a keyboard can land on, in order. Stepping by POINT rather
      // than by a fraction of the width is what makes arrow keys usable: a 14-day
      // window is ~340 points across ~700px, so a pixel step would sometimes move
      // two readings and sometimes none.
      scrubTimes: [...observed.map((point) => point.t), ...forecast.map((point) => point.t)].sort(
        (a, b) => a - b
      ),
      // Split on the same terms as the observed series. It used to be one path
      // built from the whole array, which drew a straight confident line across
      // any hole in the forecast and dropped a single-point forecast entirely —
      // while the legend went on naming a series that was not on the plot.
      forecastPaths: forecastSplit.lines.map(pathFor),
      forecastDots: forecastSplit.isolated,
      typicalArea,
      typicalPath:
        typical.length > 1 ? pathFor(typical.map((row) => ({ t: row.t, v: row.median }))) : '',
      yTicks: niceValueTicks(domain.min, domain.max, 3),
      xTicks: timeTicks(domain.t0, domain.t1, days <= 2 ? 4 : 5),
      thresholdLineData,
      thresholdLabels,
    };
  }, [history, thresholds, displayUnit, isFt, showTypical, days]);

  const hovered = useMemo<HoverPoint | null>(() => {
    if (hoverFraction === null || !chartData) return null;
    const time = chartData.domain.t0 + hoverFraction * (chartData.domain.t1 - chartData.domain.t0);
    const observed = nearestChartPoint(chartData.observed, time);
    const forecast = nearestChartPoint(chartData.forecast, time);
    if (!observed) return forecast ? { point: forecast, kind: 'forecast' } : null;
    if (!forecast) return { point: observed, kind: 'observed' };
    // Whichever is genuinely nearer the cursor. Snapping always to the observed
    // series would report the last real reading while the pointer sits over a
    // forecast three days out.
    return Math.abs(observed.t - time) <= Math.abs(forecast.t - time)
      ? { point: observed, kind: 'observed' }
      : { point: forecast, kind: 'forecast' };
  }, [hoverFraction, chartData]);

  const handleInteraction = useCallback((clientX: number) => {
    const rect = chartContainerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setHoverFraction(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)));
  }, []);

  /** Put the scrub on an instant, as the fraction the pointer path also speaks. */
  const scrubToTime = useCallback(
    (time: number) => {
      if (!chartData) return;
      const { domain } = chartData;
      setHoverFraction((time - domain.t0) / (domain.t1 - domain.t0 || 1));
    },
    [chartData]
  );

  /**
   * Move the scrub by whole READINGS — see stepScrubTime for why not by pixels.
   *
   * ARRIVING WITH NOTHING SELECTED STARTS FROM THE NEWEST OBSERVED READING,
   * because that is the point aria-valuenow has been reporting since the chart
   * rendered. Anchoring on the end of the window instead — which is where this
   * started — made the first left press select the reading the reader was already
   * on, so on a station with no forecast the key appeared to do nothing.
   */
  const moveScrub = useCallback(
    (step: number) => {
      if (!chartData) return;
      const from =
        hoverFraction === null
          ? chartData.current.t
          : chartData.domain.t0 + hoverFraction * (chartData.domain.t1 - chartData.domain.t0 || 1);
      const next = stepScrubTime(chartData.scrubTimes, from, step);
      if (next !== null) scrubToTime(next);
    },
    [chartData, hoverFraction, scrubToTime]
  );

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 text-neutral-500 text-sm">
          <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          Loading trend data...
        </div>
      </div>
    );
  }

  if (error || !chartData) {
    return (
      <div className="p-4">
        <p className="text-neutral-500 text-sm">{isFt ? 'Stage' : 'Flow'} trend data unavailable</p>
      </div>
    );
  }

  const formatVal = (val: number) => {
    if (isFt) return val.toFixed(2);
    if (Math.abs(val) >= 1000) return `${(val / 1000).toFixed(1)}k`;
    return val.toFixed(0);
  };

  const formatTooltipVal = (val: number) => (isFt ? val.toFixed(2) : Math.round(val).toLocaleString());

  // Determine which condition zone a value falls in
  const getZoneLabel = (val: number): string | null => {
    if (!thresholds) return null;
    const { levelTooLow, levelLow, levelOptimalMin, levelOptimalMax, levelHigh, levelDangerous } = thresholds;
    if (levelDangerous !== null && val >= levelDangerous) return 'Flood';
    const highStart = levelOptimalMax ?? levelHigh;
    if (highStart !== null && val > highStart) return 'High';
    if (levelOptimalMin !== null && levelOptimalMax !== null && val >= levelOptimalMin && val <= levelOptimalMax) return 'Flowing';
    if (levelLow !== null && val >= levelLow) return 'Good';
    if (levelTooLow !== null && val >= levelTooLow) return 'Low';
    if (levelTooLow !== null && val < levelTooLow) return 'Too Low';
    return null;
  };

  const formatAxisTime = (ms: number) =>
    days <= 2
      ? new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric' })
      : new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const formatTooltipDate = (ms: number) =>
    new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  const unitLabel = isFt ? 'ft' : 'cfs';
  const chartLabel = isFt ? 'Stage (ft)' : 'Flow (cfs)';
  const currentDisplay = latestValue ?? chartData.current.v;
  const hasForecast = chartData.forecast.length > 0;
  const nowX = chartData.x(chartData.current.t);
  const hoveredQualifiers = hovered?.kind === 'observed' ? qualifierText(hovered.point.qualifiers) : null;

  /**
   * The scrubbed reading as one sentence — the tooltip's content, for a reader
   * who cannot see the tooltip.
   *
   * Fed to aria-valuetext rather than to a live region: role="slider" makes a
   * screen reader announce the new value on every arrow press by itself, and a
   * polite live region alongside it would say the same numbers twice.
   */
  const scrubReadout = hovered
    ? [
        `${formatTooltipVal(hovered.point.v)} ${unitLabel}`,
        hovered.kind === 'forecast' ? 'NWS forecast' : getZoneLabel(hovered.point.v),
        formatTooltipDate(hovered.point.t),
        hoveredQualifiers,
      ]
        .filter(Boolean)
        .join(', ')
    : `${formatVal(currentDisplay)} ${unitLabel}, latest reading`;

  const forecastIssued = (() => {
    const raw = history?.forecastIssuedAt;
    if (!raw) return null;
    const issued = new Date(raw);
    return Number.isFinite(issued.getTime())
      ? issued.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : null;
  })();

  const sourcePublisher = history?.sourceUrl ? publisherLabel(history.sourceUrl) : null;

  const provenanceBits: ReactNode[] = [];
  if (sourcePublisher && history?.sourceUrl) {
    provenanceBits.push(
      <>
        Observed:{' '}
        <a
          href={history.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-neutral-600"
        >
          {sourcePublisher}
        </a>
      </>
    );
  }
  if (hasForecast) {
    provenanceBits.push(<>Forecast: NWS{forecastIssued ? `, issued ${forecastIssued}` : ''}</>);
  }
  if (history?.sampled) {
    // Said out loud because a reader comparing this to the publisher's own
    // hydrograph will see fewer points and should know why. The crest is still
    // the real crest — samplePreservingExtrema() keeps the high and low of every
    // bucket — so this is about density, not about accuracy.
    provenanceBits.push(<>thinned for display, peaks kept</>);
  }

  /**
   * Pointer and keyboard, or neither — see the `interactive` prop.
   *
   * role="slider" because that is what this is: one value selected along one
   * axis, moved with the arrow keys, reported through aria-valuetext. It is also
   * the only common role a screen reader will announce a CHANGING value for; an
   * `img` with a summary label (which is what this chart offered before, and
   * still offers when it is not interactive) can say what the series did on the
   * whole but cannot be asked about Tuesday.
   */
  const scrubProps = interactive
    ? {
        tabIndex: 0,
        role: 'slider',
        'aria-label': `${chartLabel} readings. Use the left and right arrow keys to move through the series.`,
        'aria-orientation': 'horizontal' as const,
        // The SELECTABLE range, not the drawn one. The domain also spans the
        // typical band's dates, which are a daily statistic rather than a reading
        // and which the scrub cannot land on — advertising those as the bounds
        // promised a Home/End that could not arrive.
        'aria-valuemin': chartData.scrubTimes[0],
        'aria-valuemax': chartData.scrubTimes[chartData.scrubTimes.length - 1],
        'aria-valuenow': (hovered?.point ?? chartData.current).t,
        'aria-valuetext': scrubReadout,
        onMouseMove: (event: React.MouseEvent) => handleInteraction(event.clientX),
        onMouseLeave: () => setHoverFraction(null),
        onTouchMove: (event: React.TouchEvent) => {
          if (event.touches[0]) handleInteraction(event.touches[0].clientX);
        },
        onTouchEnd: () => setHoverFraction(null),
        onTouchCancel: () => setHoverFraction(null),
        onBlur: () => setHoverFraction(null),
        onKeyDown: (event: React.KeyboardEvent) => {
          // Up and Down as well as Right and Left, per the APG slider pattern:
          // Up/Right increase, Down/Left decrease. The axis is horizontal and the
          // vertical keys still work — a reader who has learned one slider should
          // not have to discover that this one is different.
          //
          // preventDefault on all of them, and on Home/End: the page must not
          // scroll out from under a widget the reader is stepping through.
          const times = chartData.scrubTimes;
          if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
            event.preventDefault();
            moveScrub(-1);
          } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
            event.preventDefault();
            moveScrub(1);
          } else if (event.key === 'Home') {
            event.preventDefault();
            if (times.length) scrubToTime(times[0]);
          } else if (event.key === 'End') {
            event.preventDefault();
            if (times.length) scrubToTime(times[times.length - 1]);
          } else if (event.key === 'Escape') {
            setHoverFraction(null);
          }
        },
      }
    : {};

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3 gap-2">
        <span className="text-sm font-semibold text-neutral-700">{chartLabel}</span>
        <div className="flex items-center gap-2">
          {/* A shaded band with nothing naming it is a claim the reader cannot
              check. Both overlays say what they are, or they do not draw. */}
          {chartData.typicalPath && (
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: TYPICAL_COLOR }}>
              Typical 25–75%
            </span>
          )}
          {hasForecast && (
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: FORECAST_COLOR }}>
              NWS forecast
            </span>
          )}
          <span className="text-xs text-primary-600 font-medium">
            Current: {formatVal(currentDisplay)} {unitLabel}
          </span>
        </div>
      </div>

      <div className="flex">
        {/* Y-axis labels, positioned by VALUE rather than spread evenly: the
            ticks are round numbers now, so they do not sit at even fractions. */}
        <div className={`relative flex-shrink-0 w-10 pr-1.5 text-right ${chartClassName ?? 'h-32'}`}>
          {chartData.yTicks.map((tick) => (
            <span
              key={`ytick-${tick.value}`}
              className="absolute right-1.5 text-[10px] text-neutral-400 tabular-nums leading-none"
              style={{ top: `${(1 - tick.position) * 100}%`, transform: 'translateY(-50%)' }}
            >
              {formatVal(tick.value)}
            </span>
          ))}
        </div>

        {/* Chart SVG area */}
        <div
          ref={chartContainerRef}
          className={`relative flex-1 min-w-0 ${chartClassName ?? 'h-32'} ${
            interactive
              ? 'cursor-crosshair rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500'
              : ''
          }`}
          {...scrubProps}
        >
          {/* When the wrapper is a slider, the SVG is hidden from the
              accessibility tree rather than labelled: two nested announcements —
              a summary of the whole series and the value under the scrub — read
              as two different charts. The summary label is what a NON-interactive
              card sparkline offers instead, since there is nothing to step
              through there. */}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="w-full h-full"
            {...(interactive
              ? { 'aria-hidden': true }
              : {
                  role: 'img',
                  'aria-label': `${chartLabel} trend chart, currently ${formatVal(currentDisplay)} ${unitLabel}${
                    hasForecast ? ', with official NWS forecast' : ''
                  }`,
                })}
          >
            <defs>
              <linearGradient id={`flowGradient-${gaugeSiteId}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={SERIES_COLOR} stopOpacity="0.3" />
                <stop offset="100%" stopColor={SERIES_COLOR} stopOpacity="0.05" />
              </linearGradient>
            </defs>

            {/* High/Warning zone fill — anything above optimal_max is "high" */}
            {(() => {
              const optimalMax = chartData.thresholdLineData.find((t) => t.key === 'levelOptimalMax');
              const high = chartData.thresholdLineData.find((t) => t.key === 'levelHigh');
              const dangerous = chartData.thresholdLineData.find((t) => t.key === 'levelDangerous');
              const start = optimalMax ?? high;
              if (!start) return null;
              const topY = dangerous ? Math.min(dangerous.y, start.y) : 0;
              return start.y > topY ? (
                <rect x="0" width="100" y={topY} height={start.y - topY} fill="#f97316" fillOpacity="0.08" />
              ) : null;
            })()}

            {/* Flood zone fill */}
            {(() => {
              const dangerous = chartData.thresholdLineData.find((t) => t.key === 'levelDangerous');
              return dangerous && dangerous.y > 0 ? (
                <rect x="0" width="100" y={0} height={dangerous.y} fill="#ef4444" fillOpacity="0.06" />
              ) : null;
            })()}

            {/* Optimal range shaded band */}
            {(() => {
              const optMin = chartData.thresholdLineData.find((t) => t.key === 'levelOptimalMin');
              const optMax = chartData.thresholdLineData.find((t) => t.key === 'levelOptimalMax');
              return optMin && optMax ? (
                <rect
                  x="0"
                  width="100"
                  y={Math.min(optMin.y, optMax.y)}
                  height={Math.abs(optMax.y - optMin.y)}
                  fill="#059669"
                  fillOpacity="0.12"
                />
              ) : null;
            })()}

            {/* Day-of-year typical range, behind everything the gauge measured */}
            {chartData.typicalArea && <path d={chartData.typicalArea} fill={TYPICAL_COLOR} fillOpacity="0.1" />}
            {chartData.typicalPath && (
              <path
                d={chartData.typicalPath}
                fill="none"
                stroke={TYPICAL_COLOR}
                strokeWidth="1"
                strokeDasharray="4,3"
                opacity="0.55"
                vectorEffect="non-scaling-stroke"
              />
            )}

            {/* Threshold reference lines */}
            {chartData.thresholdLineData.map((t) => (
              <line
                key={t.key}
                x1="0"
                x2="100"
                y1={t.y}
                y2={t.y}
                stroke={t.color}
                strokeWidth="1"
                strokeDasharray={t.dash || 'none'}
                vectorEffect="non-scaling-stroke"
                opacity="0.5"
              />
            ))}

            {chartData.observedAreas.map((d, i) => (
              <path key={`area-${i}`} d={d} fill={`url(#flowGradient-${gaugeSiteId})`} />
            ))}
            {chartData.observedPaths.map((d, i) => (
              <path
                key={`line-${i}`}
                d={d}
                fill="none"
                stroke={SERIES_COLOR}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {/* A reading with no neighbour to join it to. It used to be dropped
                with the segment it sat in, so a lone reading between two outages
                rendered as blank space. */}
            {chartData.observedDots.map((point) => (
              <circle
                key={`dot-${point.t}`}
                cx={chartData.x(point.t)}
                cy={chartData.y(point.v)}
                r="2"
                fill={SERIES_COLOR}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {/* The boundary between what happened and what is predicted */}
            {hasForecast && (
              <line
                x1={nowX}
                x2={nowX}
                y1="0"
                y2="100"
                stroke="#64748b"
                strokeWidth="1"
                strokeDasharray="2,3"
                vectorEffect="non-scaling-stroke"
                opacity="0.7"
              />
            )}
            {chartData.forecastPaths.map((d, i) => (
              <path
                key={`forecast-${i}`}
                d={d}
                fill="none"
                stroke={FORECAST_COLOR}
                strokeWidth="2"
                strokeDasharray="5,4"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {/* A forecast point with no neighbour — a short-range issuance can be
                one point. Drawn for the same reason its observed counterpart is:
                the legend names this series, so the series has to be visible. */}
            {chartData.forecastDots.map((point) => (
              <circle
                key={`forecast-dot-${point.t}`}
                cx={chartData.x(point.t)}
                cy={chartData.y(point.v)}
                r="2"
                fill={FORECAST_COLOR}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {/* Current value dot — the newest OBSERVED reading, never a forecast */}
            <circle
              cx={nowX}
              cy={chartData.y(chartData.current.v)}
              r="4"
              fill={SERIES_COLOR}
              stroke="#f5f5f5"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />

            {hovered && (
              <>
                <line
                  x1={chartData.x(hovered.point.t)}
                  x2={chartData.x(hovered.point.t)}
                  y1="0"
                  y2="100"
                  stroke={hovered.kind === 'forecast' ? FORECAST_COLOR : SERIES_COLOR}
                  strokeWidth="1"
                  strokeDasharray="2,2"
                  vectorEffect="non-scaling-stroke"
                  opacity="0.6"
                />
                <circle
                  cx={chartData.x(hovered.point.t)}
                  cy={chartData.y(hovered.point.v)}
                  r="5"
                  fill={hovered.kind === 'forecast' ? FORECAST_COLOR : SERIES_COLOR}
                  stroke="white"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            )}
          </svg>

          {/* Tooltip popup. `left` is the same 0–100 number the SVG used, which
              is only true because the viewBox spans the container exactly. */}
          {hovered && (
            <div
              className="absolute z-10 pointer-events-none bg-neutral-900 text-white text-xs rounded-lg px-2.5 py-1.5 shadow-lg whitespace-nowrap"
              style={{
                left: `${chartData.x(hovered.point.t)}%`,
                top: `${chartData.y(hovered.point.v)}%`,
                transform: `translate(${chartData.x(hovered.point.t) > 70 ? '-100%' : '8px'}, -120%)`,
              }}
            >
              <div className="font-bold tabular-nums">
                {formatTooltipVal(hovered.point.v)} {unitLabel}
                {hovered.kind === 'observed'
                  ? (() => {
                      const zone = getZoneLabel(hovered.point.v);
                      return zone ? <span className="font-medium text-neutral-400"> — {zone}</span> : null;
                    })()
                  : <span className="font-medium" style={{ color: '#c4b5fd' }}> — forecast</span>}
              </div>
              <div className="text-neutral-400 text-[10px]">{formatTooltipDate(hovered.point.t)}</div>
              {hoveredQualifiers && (
                <div className="text-amber-300 text-[10px]">{hoveredQualifiers}</div>
              )}
            </div>
          )}
        </div>

        {/* Threshold labels (right column, outside chart) */}
        {chartData.thresholdLabels.length > 0 && (
          <div className={`relative flex-shrink-0 w-12 pl-1.5 ${chartClassName ?? 'h-32'}`}>
            {chartData.thresholdLabels.map((t) => (
              <div
                key={`label-${t.key}`}
                className="absolute text-[9px] font-semibold leading-none whitespace-nowrap"
                style={{ top: `${t.y}%`, color: t.color, transform: 'translateY(-50%)' }}
              >
                {t.label}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* X-axis labels, positioned by TIME so they sit under the point they
          describe — including when a forecast extends the window past now. */}
      <div className={`relative h-4 mt-1 ml-10 ${chartData.thresholdLabels.length > 0 ? 'mr-12' : ''}`}>
        {chartData.xTicks.map((tick, index) => (
          <span
            key={`xtick-${index}`}
            className="absolute top-0 text-[10px] text-neutral-400 whitespace-nowrap"
            style={{
              left: `${tick.position * 100}%`,
              transform:
                index === 0
                  ? 'none'
                  : index === chartData.xTicks.length - 1
                    ? 'translateX(-100%)'
                    : 'translateX(-50%)',
            }}
          >
            {formatAxisTime(tick.value)}
          </span>
        ))}
      </div>

      {/* Who measured the line, who predicted the dashed part and when they said
          it, and whether the series was thinned to fit.

          THE ISSUE TIME IS THE POINT OF THIS ROW. A forecast is the one series
          here with an age of its own: NWPS reissues on a schedule, so a dashed
          line read at 6pm may have been computed before the afternoon's rain.
          The endpoint has carried `forecastIssuedAt` and `sourceUrl` since the
          forecast landed, and nothing rendered either of them. */}
      {showProvenance && provenanceBits.length > 0 && (
        <p className="mt-1.5 ml-10 text-[10px] text-neutral-400 leading-snug">
          {provenanceBits.map((bit, index) => (
            <span key={`prov-${index}`}>
              {index > 0 && ' · '}
              {bit}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
