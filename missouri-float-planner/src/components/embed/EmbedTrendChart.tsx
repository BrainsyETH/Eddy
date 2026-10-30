'use client';

// src/components/embed/EmbedTrendChart.tsx
// The embeddable trend chart — compact on purpose. It does NOT grow the
// detail page's summary, scrubber, or expanded controls; an embed is a
// glance, and the link out is the way to interrogate it.
//
// What it no longer decides (Release 4 of the gauge redesign): the axis math.
// It used to space points by ARRAY INDEX, draw one confident line across any
// outage, and scan for its own extremes with no cfs floor — the exact three
// drifts shared/chart-model.ts was extracted to end on the detail charts.
// chart-parity.test.ts reads this file too.
//
// ── Why the labels are HTML ─────────────────────────────────────────────────
// Text inside a scaled SVG shrinks with the drawing: an 8-unit tick label in a
// 540-wide viewBox rendered at about 4px in a 300px sidebar. The plot is now a
// fixed-height SVG stretched to the width (preserveAspectRatio="none", with
// non-scaling strokes so lines keep their weight), and the tick labels, the
// latest-reading dot and lone readings are positioned in HTML at real sizes.

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

/** Drawing space. The SVG stretches it to the container; nothing in it is text. */
const W = 1000;
const H = 100;
const PLOT_HEIGHT_PX = 120;

// Calendar labels in the gauges' own zone, so the server render and the
// browser agree on the day.
const DATE_LABEL = new Intl.DateTimeFormat('en-US', { month: 'numeric', day: 'numeric', timeZone: 'America/Chicago' });

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
    addThreshold(activeThresholds.levelOptimalMin, CONDITION_COLORS.flowing, 'Optimal min', '6 4');
    addThreshold(activeThresholds.levelOptimalMax, CONDITION_COLORS.flowing, 'Optimal max', '3 3');
    addThreshold(activeThresholds.levelHigh, CONDITION_COLORS.high, 'High', '8 3');
    addThreshold(activeThresholds.levelDangerous, CONDITION_COLORS.dangerous, 'Flood', '2 3');
  }

  // Shared domain: the cfs floor and threshold-reach rules live in the model,
  // not here.
  const domain = chartDomain(points, unit, thresholds.map((threshold) => threshold.value));
  if (!domain) return null;

  // X is TIME. Index spacing drew a crest at the wrong hour whenever the
  // series was unevenly spaced — which, extrema-preserved, it always is.
  const spanT = domain.t1 - domain.t0 || 1;
  const spanV = domain.max - domain.min || 1;
  const fx = (t: number) => (t - domain.t0) / spanT; // 0..1, left to right
  const fy = (v: number) => 1 - (v - domain.min) / spanV; // 0..1, top = 0
  const toX = (t: number) => fx(t) * W;
  const toY = (v: number) => fy(v) * H;
  const pct = (fraction: number) => `${(fraction * 100).toFixed(2)}%`;

  // One path per segment, so an outage reads as an outage — plus dots for
  // readings with no neighbour to join to.
  const segments = chartSegments(points);
  const pathFor = (segment: ChartPoint[]) =>
    `M${segment.map((p) => `${toX(p.t).toFixed(1)},${toY(p.v).toFixed(1)}`).join('L')}`;
  const areaFor = (segment: ChartPoint[]) =>
    `${pathFor(segment)}L${toX(segment[segment.length - 1].t).toFixed(1)},${H}L${toX(segment[0].t).toFixed(1)},${H}Z`;

  const first = points[0];
  const latest = points[points.length - 1];
  const delta = latest.v - first.v;
  const direction = Math.abs(delta) < Math.max(Math.abs(latest.v) * 0.005, 0.01)
    ? 'steady'
    : delta > 0 ? 'up' : 'down';
  const formatValue = (value: number) => unit === 'cfs'
    ? Math.round(value).toLocaleString('en-US')
    : value.toFixed(1);

  const visibleThresholds = thresholds.filter(
    (threshold) => threshold.value >= domain.min && threshold.value <= domain.max,
  );

  const yTicks = niceValueTicks(domain.min, domain.max, 2);
  const xTicks = timeTicks(domain.t0, domain.t1, 3);

  const description = `Current ${formatValue(latest.v)} ${data.unit}, ${direction} over the ${periodLabel} window. Recorded range ${formatValue(domain.min)} to ${formatValue(domain.max)} ${data.unit}.`;

  return (
    <section aria-labelledby={`${id}-heading`}>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={`${id}-heading`} className="m-0 text-xs font-bold" style={{ color: palette.textSecondary }}>
          {`${periodLabel} trend`}
        </h2>
        <div className="text-xs font-semibold tabular-nums" style={{ color: palette.textPrimary }}>
          {`Now ${formatValue(latest.v)} ${data.unit} · ${direction}`}
        </div>
      </div>
      <div className="relative" style={{ height: PLOT_HEIGHT_PX, borderBottom: `1px solid ${palette.border}` }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          width="100%"
          height="100%"
          role="img"
          aria-labelledby={`${id}-title ${id}-description`}
          style={{ display: 'block', overflow: 'visible' }}
        >
          <title id={`${id}-title`}>{`${periodLabel} river level trend`}</title>
          <desc id={`${id}-description`}>{description}</desc>
          <defs>
            <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={palette.link} stopOpacity="0.18" />
              <stop offset="100%" stopColor={palette.link} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {yTicks.map((tick) => (
            <line
              key={`grid-${tick.value}`}
              x1={0}
              x2={W}
              y1={(1 - tick.position) * H}
              y2={(1 - tick.position) * H}
              stroke={palette.border}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {segments.lines.map((segment, index) => (
            <path key={`area-${index}`} d={areaFor(segment)} fill={`url(#${id}-area)`} />
          ))}
          {visibleThresholds.map((threshold) => (
            <line
              key={`${threshold.label}-${threshold.value}`}
              x1={0}
              y1={toY(threshold.value)}
              x2={W}
              y2={toY(threshold.value)}
              stroke={threshold.color}
              strokeWidth="1.5"
              strokeDasharray={threshold.dash}
              vectorEffect="non-scaling-stroke"
              opacity="0.85"
            />
          ))}
          {segments.lines.map((segment, index) => (
            <path
              key={`line-${index}`}
              d={pathFor(segment)}
              fill="none"
              stroke={palette.link}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {/* Lone readings and the latest reading as real circles: in a
            stretched SVG they would draw as ellipses. */}
        {segments.isolated
          .filter((point) => point.t !== latest.t)
          .map((point) => (
            <span
              key={`dot-${point.t}`}
              aria-hidden="true"
              className="absolute rounded-full"
              style={{ width: 4, height: 4, left: pct(fx(point.t)), top: pct(fy(point.v)), transform: 'translate(-50%, -50%)', background: palette.link }}
            />
          ))}
        <span
          aria-hidden="true"
          className="absolute rounded-full"
          style={{ width: 9, height: 9, left: pct(fx(latest.t)), top: pct(fy(latest.v)), transform: 'translate(-50%, -50%)', background: palette.link, boxShadow: `0 0 0 2px ${palette.bg}` }}
        />
        {yTicks.map((tick) => (
          <span
            key={`ytick-${tick.value}`}
            aria-hidden="true"
            className="absolute left-0 text-xs tabular-nums"
            style={{ top: pct(1 - tick.position), transform: 'translateY(-115%)', color: palette.textSecondary }}
          >
            {formatValue(tick.value)}
          </span>
        ))}
      </div>
      <div className="relative h-5" aria-hidden="true">
        {xTicks.map((tick, index) => (
          <span
            key={`xtick-${tick.value}`}
            className="absolute top-1 text-xs tabular-nums"
            style={{
              left: pct(tick.position),
              transform: index === 0 ? 'none' : index === xTicks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
              color: palette.textSecondary,
            }}
          >
            {DATE_LABEL.format(tick.value)}
          </span>
        ))}
      </div>
      {thresholds.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs leading-5" style={{ color: palette.textSecondary }} aria-label="Chart thresholds">
          {thresholds.map((threshold) => (
            <span key={`${threshold.label}-legend`} className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <svg aria-hidden="true" width="20" height="4" viewBox="0 0 20 4" className="flex-none">
                <line x1="0" y1="2" x2="20" y2="2" stroke={threshold.color} strokeWidth="1.5" strokeDasharray={threshold.dash} />
              </svg>
              <span>{`${threshold.label} ${formatValue(threshold.value)} ${data.unit}`}</span>
            </span>
          ))}
        </div>
      )}
      <p className="sr-only">{description}</p>
    </section>
  );
}
