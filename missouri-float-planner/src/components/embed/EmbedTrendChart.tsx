'use client';

import { useId } from 'react';
import { CONDITION_COLORS } from '@/constants';
import type { EmbedPalette } from '@/lib/embed/theme';

export interface EmbedChartThresholds {
  levelOptimalMin: number | null;
  levelOptimalMax: number | null;
  levelHigh: number | null;
  levelDangerous: number | null;
}

export interface EmbedChartData {
  readings: { timestamp: string; value: number }[];
  unit: string;
  thresholds: EmbedChartThresholds | null;
}

export default function EmbedTrendChart({
  data,
  palette,
}: {
  data: EmbedChartData;
  palette: EmbedPalette;
}) {
  const rawId = useId();
  const id = rawId.replace(/:/g, '');
  if (data.readings.length < 2) return null;

  const W = 540;
  const H = 112;
  const PAD_L = 38;
  const PAD_R = 10;
  const PAD_T = 8;
  const PAD_B = 20;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;
  const values = data.readings.map(reading => reading.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;
  const paddedMin = minVal - range * 0.05;
  const paddedMax = maxVal + range * 0.05;
  const paddedRange = paddedMax - paddedMin;
  const first = data.readings[0];
  const latest = data.readings[data.readings.length - 1];
  const delta = latest.value - first.value;
  const direction = Math.abs(delta) < Math.max(Math.abs(latest.value) * 0.005, 0.01)
    ? 'steady'
    : delta > 0 ? 'up' : 'down';
  const formatValue = (value: number) => data.unit === 'cfs'
    ? Math.round(value).toLocaleString()
    : value.toFixed(1);
  const toX = (index: number) => PAD_L + (index / (data.readings.length - 1)) * chartW;
  const toY = (value: number) => PAD_T + (1 - (value - paddedMin) / paddedRange) * chartH;
  const linePath = `M${data.readings.map((reading, index) => `${toX(index).toFixed(1)},${toY(reading.value).toFixed(1)}`).join('L')}`;
  const areaPath = `${linePath}L${toX(data.readings.length - 1).toFixed(1)},${(PAD_T + chartH).toFixed(1)}L${PAD_L},${(PAD_T + chartH).toFixed(1)}Z`;

  const thresholds: { value: number; color: string; label: string; dash: string }[] = [];
  const addThreshold = (value: number | null, color: string, label: string, dash: string) => {
    if (value !== null) thresholds.push({ value, color, label, dash });
  };
  if (data.thresholds) {
    addThreshold(data.thresholds.levelOptimalMin, CONDITION_COLORS.flowing, 'Optimal min', '4 2');
    addThreshold(data.thresholds.levelOptimalMax, CONDITION_COLORS.flowing, 'Optimal max', '2 2');
    addThreshold(data.thresholds.levelHigh, CONDITION_COLORS.high, 'High', '6 2');
    addThreshold(data.thresholds.levelDangerous, CONDITION_COLORS.dangerous, 'Flood', '1 2');
  }
  const visibleThresholds = thresholds.filter(threshold => threshold.value >= paddedMin && threshold.value <= paddedMax);

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };
  const midIndex = Math.floor(data.readings.length / 2);
  const description = `Current ${formatValue(latest.value)} ${data.unit}, ${direction} over 14 days. Recorded range ${formatValue(minVal)} to ${formatValue(maxVal)} ${data.unit}.`;

  return (
    <section aria-labelledby={`${id}-heading`} style={{ marginTop: 2 }}>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={`${id}-heading`} className="m-0 text-[11px] font-bold uppercase tracking-[0.05em]" style={{ color: palette.textSecondary }}>
          14-day trend ({data.unit})
        </h2>
        <div className="text-[11px] font-semibold tabular-nums" style={{ color: palette.textPrimary }}>
          Now {formatValue(latest.value)} {data.unit} · {direction}
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
          <title id={`${id}-title`}>Fourteen-day river level trend</title>
          <desc id={`${id}-description`}>{description}</desc>
          <defs>
            <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={palette.link} stopOpacity="0.2" />
              <stop offset="100%" stopColor={palette.link} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${id}-area)`} />
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
          <path d={linePath} fill="none" stroke={palette.link} strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={toX(data.readings.length - 1)} cy={toY(latest.value)} r="3.2" fill={palette.link} stroke={palette.cardBg} strokeWidth="1.5" />
          <text x={PAD_L - 4} y={PAD_T + 8} fill={palette.textSecondary} fontSize="8" textAnchor="end" fontFamily="ui-monospace, monospace">
            {formatValue(paddedMax)}
          </text>
          <text x={PAD_L - 4} y={PAD_T + chartH - 2} fill={palette.textSecondary} fontSize="8" textAnchor="end" fontFamily="ui-monospace, monospace">
            {formatValue(paddedMin)}
          </text>
          {[
            { x: PAD_L, label: formatDate(first.timestamp), anchor: 'start' as const },
            { x: toX(midIndex), label: formatDate(data.readings[midIndex].timestamp), anchor: 'middle' as const },
            { x: W - PAD_R, label: formatDate(latest.timestamp), anchor: 'end' as const },
          ].map(date => (
            <text key={`${date.label}-${date.x}`} x={date.x} y={H - 3} fill={palette.textSecondary} fontSize="8" textAnchor={date.anchor} fontFamily="system-ui, sans-serif">
              {date.label}
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
