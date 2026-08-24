'use client';

// src/components/embed/EmbedTrendChart.tsx
// The embeddable 14-day sparkline — compact on purpose. It does NOT grow the
// detail page's summary, scrubber, or expanded controls; an embed is a
// glance, and the link out is the way to interrogate it.
//
// What it no longer decides (Release 4 of the gauge redesign): the axis math.
// It used to space points by ARRAY INDEX, draw one confident line across any
// outage, and scan for its own extremes with no cfs floor — the exact three
// drifts shared/chart-model.ts was extracted to end on the detail charts.
// chart-parity.test.ts now reads this file too.

import { useId } from 'react';
import { CONDITION_COLORS } from '@/constants';
import type { EmbedPalette } from '@/lib/embed/theme';
import {
  chartDomain,
  chartPoints,
  chartSegments,
  niceValueTicks,
  timeTicks,
  type ChartPoint,
} from '@shared/chart-model';

export interface EmbedChartThresholds {
  levelOptimalMin: number | null;
  levelOptimalMax: number | null;
  levelHigh: number | null;
  levelDangerous: number | null;
  /**
   * The unit the levels are expressed in. When set and it differs from the
   * chart's unit, no threshold is drawn — same declared-unit guard as the
   * detail charts, for the same reason: the bounds and the series are bare
   * numbers, and arithmetic cannot tell feet from cfs.
   */
  unit?: 'ft' | 'cfs' | null;
}

export interface EmbedChartData {
  readings: { timestamp: string; value: number }[];
  unit: string;
  thresholds: EmbedChartThresholds | null;
}

export default function EmbedTrendChart({
  data,
  palette,
  periodLabel = '14-day',
}: {
  data: EmbedChartData;
  palette: EmbedPalette;
  /** "14-day", "30-day", … — names the window in the heading and the alt text. */
  periodLabel?: string;
}) {
  const rawId = useId();
  const id = rawId.replace(/:/g, '');

  const unit: 'ft' | 'cfs' = data.unit === 'cfs' ? 'cfs' : 'ft';
  // Through the shared reader, so the same refusal to invent values applies
  // here as on the detail charts.
  const points = chartPoints(
    data.readings.map((reading) => ({
      timestamp: reading.timestamp,
      gaugeHeightFt: unit === 'ft' ? reading.value : null,
      dischargeCfs: unit === 'cfs' ? reading.value : null,
    })),
    unit,
  ).sort((a, b) => a.t - b.t);
  if (points.length < 2) return null;

  const activeThresholds =
    data.thresholds && (data.thresholds.unit == null || data.thresholds.unit === unit)
      ? data.thresholds
      : null;

  const thresholds: { value: number; color: string; label: string; dash: string }[] = [];
  const addThreshold = (value: number | null, color: string, label: string, dash: string) => {
    if (value !== null) thresholds.push({ value, color, label, dash });
  };
  if (activeThresholds) {
    addThreshold(activeThresholds.levelOptimalMin, CONDITION_COLORS.flowing, 'Optimal min', '4 2');
    addThreshold(activeThresholds.levelOptimalMax, CONDITION_COLORS.flowing, 'Optimal max', '2 2');
    addThreshold(activeThresholds.levelHigh, CONDITION_COLORS.high, 'High', '6 2');
    addThreshold(activeThresholds.levelDangerous, CONDITION_COLORS.dangerous, 'Flood', '1 2');
  }

  // Shared domain: the cfs floor and threshold-reach rules live in the model,
  // not here.
  const domain = chartDomain(points, unit, thresholds.map((threshold) => threshold.value));
  if (!domain) return null;

  const W = 540;
  const H = 112;
  const PAD_L = 38;
  const PAD_R = 10;
  const PAD_T = 8;
  const PAD_B = 20;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  // X is TIME. Index spacing drew a crest at the wrong hour whenever the
  // series was unevenly spaced — which, extrema-preserved, it always is.
  const spanT = domain.t1 - domain.t0 || 1;
  const spanV = domain.max - domain.min || 1;
  const toX = (t: number) => PAD_L + ((t - domain.t0) / spanT) * chartW;
  const toY = (v: number) => PAD_T + (1 - (v - domain.min) / spanV) * chartH;

  // One path per segment, so an outage reads as an outage — plus dots for
  // readings with no neighbour to join to.
  const segments = chartSegments(points);
  const pathFor = (segment: ChartPoint[]) =>
    `M${segment.map((p) => `${toX(p.t).toFixed(1)},${toY(p.v).toFixed(1)}`).join('L')}`;
  const areaFor = (segment: ChartPoint[]) =>
    `${pathFor(segment)}L${toX(segment[segment.length - 1].t).toFixed(1)},${(PAD_T + chartH).toFixed(1)}L${toX(segment[0].t).toFixed(1)},${(PAD_T + chartH).toFixed(1)}Z`;

  const first = points[0];
  const latest = points[points.length - 1];
  const delta = latest.v - first.v;
  const direction = Math.abs(delta) < Math.max(Math.abs(latest.v) * 0.005, 0.01)
    ? 'steady'
    : delta > 0 ? 'up' : 'down';
  const formatValue = (value: number) => unit === 'cfs'
    ? Math.round(value).toLocaleString()
    : value.toFixed(1);

  const visibleThresholds = thresholds.filter(
    (threshold) => threshold.value >= domain.min && threshold.value <= domain.max,
  );

  const yTicks = niceValueTicks(domain.min, domain.max, 2);
  const xTicks = timeTicks(domain.t0, domain.t1, 3);
  const formatDate = (ms: number) => {
    const date = new Date(ms);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const description = `Current ${formatValue(latest.v)} ${data.unit}, ${direction} over the ${periodLabel} window. Recorded range ${formatValue(domain.min)} to ${formatValue(domain.max)} ${data.unit}.`;

  return (
    <section aria-labelledby={`${id}-heading`} style={{ marginTop: 2 }}>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={`${id}-heading`} className="m-0 text-[11px] font-bold uppercase tracking-[0.05em]" style={{ color: palette.textSecondary }}>
          {periodLabel} trend ({data.unit})
        </h2>
        <div className="text-[11px] font-semibold tabular-nums" style={{ color: palette.textPrimary }}>
          Now {formatValue(latest.v)} {data.unit} · {direction}
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border px-1 pb-0.5 pt-1.5" style={{ background: palette.cardBg, borderColor: palette.border }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height="auto"
          role="img"
          aria-labelledby={`${id}-title ${id}-description`}
          style={{ display: 'block' }}
        >
          <title id={`${id}-title`}>{periodLabel} river level trend</title>
          <desc id={`${id}-description`}>{description}</desc>
          <defs>
            <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={palette.link} stopOpacity="0.2" />
              <stop offset="100%" stopColor={palette.link} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {segments.lines.map((segment, index) => (
            <path key={`area-${index}`} d={areaFor(segment)} fill={`url(#${id}-area)`} />
          ))}
          {visibleThresholds.map(threshold => {
            const y = toY(threshold.value);
            return (
              <line
                key={`${threshold.label}-${threshold.value}`}
                x1={PAD_L}
                y1={y}
                x2={W - PAD_R}
                y2={y}
                stroke={threshold.color}
                strokeWidth="1"
                strokeDasharray={threshold.dash}
                opacity="0.8"
              />
            );
          })}
          {segments.lines.map((segment, index) => (
            <path
              key={`line-${index}`}
              d={pathFor(segment)}
              fill="none"
              stroke={palette.link}
              strokeWidth="1.7"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {segments.isolated
            .filter((point) => point.t !== latest.t)
            .map((point) => (
              <circle
                key={`dot-${point.t}`}
                cx={toX(point.t)}
                cy={toY(point.v)}
                r="1.8"
                fill={palette.link}
              />
            ))}
          <circle cx={toX(latest.t)} cy={toY(latest.v)} r="3.2" fill={palette.link} stroke={palette.cardBg} strokeWidth="1.5" />
          {yTicks.map((tick) => (
            <text
              key={`ytick-${tick.value}`}
              x={PAD_L - 4}
              y={PAD_T + (1 - tick.position) * chartH + 3}
              fill={palette.textSecondary}
              fontSize="8"
              textAnchor="end"
              fontFamily="ui-monospace, monospace"
            >
              {formatValue(tick.value)}
            </text>
          ))}
          {xTicks.map((tick, index) => (
            <text
              key={`xtick-${tick.value}`}
              x={PAD_L + tick.position * chartW}
              y={H - 3}
              fill={palette.textSecondary}
              fontSize="8"
              textAnchor={index === 0 ? 'start' : index === xTicks.length - 1 ? 'end' : 'middle'}
              fontFamily="system-ui, sans-serif"
            >
              {formatDate(tick.value)}
            </text>
          ))}
        </svg>
        {thresholds.length > 0 && (
          <div
            className="flex flex-wrap gap-x-3 gap-y-1 border-t px-1.5 py-1.5 text-[10px] leading-4"
            style={{ borderColor: palette.border, color: palette.textSecondary }}
            aria-label="Chart thresholds"
          >
            {thresholds.map(threshold => (
              <span key={`${threshold.label}-legend`} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <svg aria-hidden="true" width="20" height="4" viewBox="0 0 20 4" className="flex-none">
                  <line x1="0" y1="2" x2="20" y2="2" stroke={threshold.color} strokeWidth="1.5" strokeDasharray={threshold.dash} />
                </svg>
                <span>{threshold.label} {formatValue(threshold.value)} {data.unit}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <p className="sr-only">{description}</p>
    </section>
  );
}
