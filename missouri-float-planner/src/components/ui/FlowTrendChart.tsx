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
// ── What is still decided here ────────────────────────────────────────────
// Pixels, colours and the pointer. The SVG keeps viewBox="0 0 100 100" with
// preserveAspectRatio="none" and stretches to the container, which is why every
// piece of text sits in a sibling DOM column rather than inside the SVG: text
// in a non-uniformly scaled SVG is text with the wrong aspect ratio. It also
// means the tooltip's `left: x%` and the SVG's x coordinate are the same
// number, so the readout and the crosshair cannot drift apart.

import { useMemo, useState, useRef, useCallback } from 'react';
import { useGaugeHistory } from '@/hooks/useGaugeHistory';
import {
  chartDomain,
  chartPoints,
  nearestChartPoint,
  niceValueTicks,
  splitAtGaps,
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

/** The USGS codes that actually turn up on Ozark gauges. */
const QUALIFIER_COPY: Record<string, string> = {
  P: 'provisional',
  e: 'estimated',
  E: 'estimated',
  Ice: 'ice affected',
  Eqp: 'equipment malfunction',
  Bkw: 'backwater affected',
  Dis: 'discontinued',
  Mnt: 'maintenance',
};

function qualifierText(codes: string[]): string | null {
  if (!codes.length) return null;
  const seen = new Set<string>();
  for (const code of codes) {
    const copy = QUALIFIER_COPY[code];
    if (copy) seen.add(copy);
  }
  return seen.size ? [...seen].join(', ') : null;
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
}: FlowTrendChartProps) {
  const { data: history, isLoading, error } = useGaugeHistory(gaugeSiteId, days);
  const isFt = displayUnit === 'ft';
  const [hoverFraction, setHoverFraction] = useState<number | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const chartData = useMemo(() => {
    if (!history) return null;

    const observed = chartPoints(history.readings, displayUnit);
    if (observed.length < 2) return null;

    // Forecast points share the reading shape, so the same reader applies —
    // including its refusal to invent a value for the unit that is absent.
    const forecast = chartPoints(history.forecast, displayUnit);

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
    // straight line drawn confidently across it.
    const observedSegments = splitAtGaps(observed).filter((segment) => segment.length > 1);

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
      observedPaths: observedSegments.map(pathFor),
      observedAreas: observedSegments.map(areaFor),
      forecastPath: forecast.length > 1 ? pathFor(forecast) : '',
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
          className={`relative flex-1 min-w-0 ${chartClassName ?? 'h-32'} cursor-crosshair`}
          onMouseMove={(e) => handleInteraction(e.clientX)}
          onMouseLeave={() => setHoverFraction(null)}
          onTouchMove={(e) => {
            if (e.touches[0]) handleInteraction(e.touches[0].clientX);
          }}
          onTouchEnd={() => setHoverFraction(null)}
          onTouchCancel={() => setHoverFraction(null)}
        >
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="w-full h-full"
            role="img"
            aria-label={`${chartLabel} trend chart, currently ${formatVal(currentDisplay)} ${unitLabel}${
              hasForecast ? ', with official NWS forecast' : ''
            }`}
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
            {chartData.forecastPath && (
              <path
                d={chartData.forecastPath}
                fill="none"
                stroke={FORECAST_COLOR}
                strokeWidth="2"
                strokeDasharray="5,4"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            )}

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
    </div>
  );
}
