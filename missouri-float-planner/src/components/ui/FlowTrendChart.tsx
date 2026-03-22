'use client';

// src/components/ui/FlowTrendChart.tsx
// Shared SVG flow/stage trend chart with threshold overlays and interactive tooltips

import { useMemo, useState, useRef, useCallback } from 'react';
import { useGaugeHistory } from '@/hooks/useGaugeHistory';

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
  { key: 'levelLow', label: 'Okay', color: '#65a30d', dash: '3,3' },
  { key: 'levelOptimalMin', label: 'Optimal', color: '#059669', dash: '2,2' },
  { key: 'levelOptimalMax', label: 'Optimal', color: '#059669', dash: '2,2' },
  { key: 'levelHigh', label: 'High', color: '#f97316', dash: '3,3' },
  { key: 'levelDangerous', label: 'Flood', color: '#ef4444', dash: '4,2' },
];

interface FlowTrendChartProps {
  gaugeSiteId: string;
  days: number;
  thresholds?: ChartThresholdLines | null;
  latestValue?: number | null;
  displayUnit?: 'ft' | 'cfs';
  chartClassName?: string;
}

export default function FlowTrendChart({
  gaugeSiteId,
  days,
  thresholds,
  latestValue,
  displayUnit = 'cfs',
  chartClassName,
}: FlowTrendChartProps) {
  const { data: history, isLoading, error } = useGaugeHistory(gaugeSiteId, days);
  const isFt = displayUnit === 'ft';
  const [tooltip, setTooltip] = useState<{ x: number; y: number; value: number; timestamp: string } | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const chartData = useMemo(() => {
    if (!history?.readings || history.readings.length === 0) return null;

    const readings = history.readings;
    const stats = history.stats;

    const dataMin = isFt ? (stats.minHeight ?? 0) : (stats.minDischarge ?? 0);
    const dataMax = isFt ? (stats.maxHeight ?? 10) : (stats.maxDischarge ?? 100);
    const dataRange = dataMax - dataMin || 1;

    let minVal = dataMin;
    let maxVal = dataMax;

    if (thresholds) {
      const expansionLimit = dataRange * 1.5;
      const thresholdValues = [
        thresholds.levelTooLow, thresholds.levelLow,
        thresholds.levelOptimalMin, thresholds.levelOptimalMax,
        thresholds.levelHigh, thresholds.levelDangerous,
      ].filter((v): v is number => v !== null);

      for (const tv of thresholdValues) {
        if (tv >= dataMin - expansionLimit && tv <= dataMax + expansionLimit) {
          if (tv < minVal) minVal = tv;
          if (tv > maxVal) maxVal = tv;
        }
      }
    }

    const padding = (maxVal - minVal) * 0.05 || (isFt ? 0.5 : 5);
    minVal = Math.max(0, minVal - padding);
    maxVal = maxVal + padding;

    // Use sqrt scaling when the data range is very large relative to the
    // threshold zone (e.g. flood spikes dwarfing normal operating range).
    // This compresses outlier peaks while keeping the normal range readable.
    // For ft (stage) data the range is typically small, so keep linear.
    const rangeRatio = maxVal / (minVal || 1);
    const useSqrt = !isFt && rangeRatio > 5;

    // Map a data value to a 0-100 Y coordinate (0 = top, 100 = bottom)
    const toY = (val: number): number => {
      if (useSqrt) {
        const sqrtMin = Math.sqrt(minVal);
        const sqrtMax = Math.sqrt(maxVal);
        const sqrtRange = sqrtMax - sqrtMin || 1;
        return 100 - ((Math.sqrt(val) - sqrtMin) / sqrtRange) * 100;
      }
      const range = maxVal - minVal || 1;
      return 100 - ((val - minVal) / range) * 100;
    };

    const sampleStep = Math.max(1, Math.floor(readings.length / 50));
    const sampledReadings = readings.filter((_: unknown, i: number) => i % sampleStep === 0);

    const points = sampledReadings.map((reading: { dischargeCfs: number | null; gaugeHeightFt: number | null; timestamp: string }, index: number) => {
      const val = isFt ? reading.gaugeHeightFt : reading.dischargeCfs;
      const x = (index / (sampledReadings.length - 1)) * 100;
      const y = val !== null ? toY(val) : 50;
      return { x, y, value: val, timestamp: reading.timestamp };
    });

    const pathD = points.map((p: { x: number; y: number }, i: number) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaD = `${pathD} L ${points[points.length - 1].x} 100 L ${points[0].x} 100 Z`;

    const allThresholdLines = thresholds
      ? THRESHOLD_LINE_CONFIG
          .filter(t => thresholds[t.key] !== null)
          .map(t => ({
            ...t,
            value: thresholds[t.key]!,
            y: toY(thresholds[t.key]!),
          }))
          .filter(t => t.y >= -5 && t.y <= 105)
      : [];

    const MIN_LABEL_GAP = 8;
    const labelCandidates: typeof allThresholdLines = [];
    const optMin = allThresholdLines.find(t => t.key === 'levelOptimalMin');
    const optMax = allThresholdLines.find(t => t.key === 'levelOptimalMax');
    if (optMin && optMax) {
      labelCandidates.push({ ...optMin, y: (optMin.y + optMax.y) / 2 });
    } else if (optMin) {
      labelCandidates.push(optMin);
    } else if (optMax) {
      labelCandidates.push(optMax);
    }
    for (const t of allThresholdLines) {
      if (t.key !== 'levelOptimalMin' && t.key !== 'levelOptimalMax') {
        labelCandidates.push(t);
      }
    }
    labelCandidates.sort((a, b) => a.y - b.y);
    const thresholdLabels: typeof labelCandidates = [];
    for (const candidate of labelCandidates) {
      const tooClose = thresholdLabels.some(placed => Math.abs(placed.y - candidate.y) < MIN_LABEL_GAP);
      if (!tooClose) {
        thresholdLabels.push(candidate);
      }
    }

    // Generate Y-axis tick values. With sqrt scaling, evenly-spaced ticks in
    // sqrt-space correspond to unevenly-spaced values that feel natural.
    const yAxisTicks: { value: number; y: number }[] = [];
    const tickCount = 3;
    if (useSqrt) {
      const sqrtMin = Math.sqrt(minVal);
      const sqrtMax = Math.sqrt(maxVal);
      for (let i = 0; i < tickCount; i++) {
        const sqrtVal = sqrtMin + (sqrtMax - sqrtMin) * (i / (tickCount - 1));
        const val = sqrtVal * sqrtVal;
        yAxisTicks.push({ value: val, y: toY(val) });
      }
    } else {
      for (let i = 0; i < tickCount; i++) {
        const val = minVal + (maxVal - minVal) * (i / (tickCount - 1));
        yAxisTicks.push({ value: val, y: toY(val) });
      }
    }

    const lastReading = readings[readings.length - 1];
    return {
      points,
      pathD,
      areaD,
      minVal,
      maxVal,
      useSqrt,
      yAxisTicks,
      currentVal: isFt ? lastReading?.gaugeHeightFt : lastReading?.dischargeCfs,
      startDate: new Date(readings[0].timestamp),
      endDate: new Date(readings[readings.length - 1].timestamp),
      thresholdLineData: allThresholdLines,
      thresholdLabels,
    };
  }, [history, thresholds, isFt]);

  // Handle mouse/touch interaction for tooltip
  const handleInteraction = useCallback((clientX: number) => {
    if (!chartContainerRef.current || !chartData) return;
    const rect = chartContainerRef.current.getBoundingClientRect();
    const relativeX = (clientX - rect.left) / rect.width;
    const clampedX = Math.max(0, Math.min(1, relativeX));

    // Find closest point
    let closestPoint = chartData.points[0];
    let closestDist = Infinity;
    for (const p of chartData.points) {
      const dist = Math.abs(p.x / 100 - clampedX);
      if (dist < closestDist) {
        closestDist = dist;
        closestPoint = p;
      }
    }

    if (closestPoint.value !== null) {
      setTooltip({
        x: closestPoint.x,
        y: closestPoint.y,
        value: closestPoint.value,
        timestamp: closestPoint.timestamp,
      });
    }
  }, [chartData]);

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
    if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
    return val.toFixed(0);
  };

  const formatTooltipVal = (val: number) => {
    if (isFt) return val.toFixed(2);
    return val.toLocaleString();
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTooltipDate = (timestamp: string) => {
    const d = new Date(timestamp);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const unitLabel = isFt ? 'ft' : 'cfs';
  const chartLabel = isFt ? 'Stage (ft)' : 'Flow (cfs)';
  const currentDisplay = latestValue ?? chartData.currentVal;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-neutral-700">{chartLabel}</span>
        {currentDisplay !== null && currentDisplay !== undefined && (
          <span className="text-xs text-primary-600 font-medium">
            Current: {formatVal(currentDisplay)} {unitLabel}
          </span>
        )}
      </div>

      <div
        ref={chartContainerRef}
        className={`relative ${chartClassName ?? 'h-32'} cursor-crosshair`}
        onMouseMove={(e) => handleInteraction(e.clientX)}
        onMouseLeave={() => setTooltip(null)}
        onTouchMove={(e) => {
          e.preventDefault();
          if (e.touches[0]) handleInteraction(e.touches[0].clientX);
        }}
        onTouchEnd={() => setTooltip(null)}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
          <defs>
            <linearGradient id={`flowGradient-${gaugeSiteId}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgb(45, 120, 137)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="rgb(45, 120, 137)" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* High/Warning zone fill */}
          {chartData.thresholdLineData.length > 0 && (() => {
            const high = chartData.thresholdLineData.find(t => t.key === 'levelHigh');
            const dangerous = chartData.thresholdLineData.find(t => t.key === 'levelDangerous');
            if (high) {
              const topY = dangerous ? Math.min(dangerous.y, high.y) : 0;
              const bottomY = high.y;
              if (bottomY > topY) {
                return (
                  <rect
                    x="0" width="100"
                    y={topY}
                    height={bottomY - topY}
                    fill="#f97316" fillOpacity="0.08"
                  />
                );
              }
            }
            return null;
          })()}

          {/* Flood zone fill */}
          {chartData.thresholdLineData.length > 0 && (() => {
            const dangerous = chartData.thresholdLineData.find(t => t.key === 'levelDangerous');
            if (dangerous && dangerous.y > 0) {
              return (
                <rect
                  x="0" width="100"
                  y={0}
                  height={dangerous.y}
                  fill="#ef4444" fillOpacity="0.06"
                />
              );
            }
            return null;
          })()}

          {/* Optimal range shaded band */}
          {chartData.thresholdLineData.length > 0 && (() => {
            const optMin = chartData.thresholdLineData.find(t => t.key === 'levelOptimalMin');
            const optMax = chartData.thresholdLineData.find(t => t.key === 'levelOptimalMax');
            if (optMin && optMax) {
              return (
                <rect
                  x="0" width="100"
                  y={Math.min(optMin.y, optMax.y)}
                  height={Math.abs(optMax.y - optMin.y)}
                  fill="#059669" fillOpacity="0.12"
                />
              );
            }
            return null;
          })()}

          {/* Threshold reference lines */}
          {chartData.thresholdLineData.map((t) => (
            <line
              key={t.key}
              x1="0" x2="100"
              y1={t.y} y2={t.y}
              stroke={t.color}
              strokeWidth="1"
              strokeDasharray={t.dash || 'none'}
              vectorEffect="non-scaling-stroke"
              opacity="0.5"
            />
          ))}

          {/* Area fill */}
          <path d={chartData.areaD} fill={`url(#flowGradient-${gaugeSiteId})`} />

          {/* Line */}
          <path
            d={chartData.pathD}
            fill="none"
            stroke="rgb(45, 120, 137)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />

          {/* Current value dot */}
          {chartData.points.length > 0 && (
            <circle
              cx={chartData.points[chartData.points.length - 1].x}
              cy={chartData.points[chartData.points.length - 1].y}
              r="4"
              fill="rgb(45, 120, 137)"
              stroke="#f5f5f5"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* Tooltip crosshair line */}
          {tooltip && (
            <line
              x1={tooltip.x} x2={tooltip.x}
              y1="0" y2="100"
              stroke="rgb(45, 120, 137)"
              strokeWidth="1"
              strokeDasharray="2,2"
              vectorEffect="non-scaling-stroke"
              opacity="0.6"
            />
          )}

          {/* Tooltip dot */}
          {tooltip && (
            <circle
              cx={tooltip.x}
              cy={tooltip.y}
              r="5"
              fill="rgb(45, 120, 137)"
              stroke="white"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* Y-axis labels */}
        {chartData.yAxisTicks.map((tick, i) => (
          <div
            key={`ytick-${i}`}
            className="absolute left-0 text-[10px] text-neutral-500 -ml-1 leading-none"
            style={{
              top: `${tick.y}%`,
              transform: 'translateY(-50%)',
            }}
          >
            {formatVal(tick.value)}
          </div>
        ))}

        {/* Threshold labels on right side (de-overlapped) */}
        {chartData.thresholdLabels.map((t) => (
          <div
            key={`label-${t.key}`}
            className="absolute right-0 text-[9px] font-medium -mr-1 leading-none"
            style={{
              top: `${t.y}%`,
              color: t.color,
              transform: 'translateY(-50%)',
            }}
          >
            {t.label}
          </div>
        ))}

        {/* Tooltip popup */}
        {tooltip && (
          <div
            className="absolute z-10 pointer-events-none bg-neutral-900 text-white text-xs rounded-lg px-2.5 py-1.5 shadow-lg whitespace-nowrap"
            style={{
              left: `${tooltip.x}%`,
              top: `${tooltip.y}%`,
              transform: `translate(${tooltip.x > 70 ? '-100%' : '8px'}, -120%)`,
            }}
          >
            <div className="font-bold tabular-nums">{formatTooltipVal(tooltip.value)} {unitLabel}</div>
            <div className="text-neutral-400 text-[10px]">{formatTooltipDate(tooltip.timestamp)}</div>
          </div>
        )}
      </div>

      {/* X-axis labels — show day abbreviations for 7-day view, dates otherwise */}
      <div className="flex justify-between text-[10px] text-neutral-500 mt-1 px-2">
        {days <= 7 ? (() => {
          const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
          const start = chartData.startDate;
          const end = chartData.endDate;
          const totalDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
          const labels: { label: string; position: number }[] = [];
          for (let i = 0; i <= totalDays; i++) {
            const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
            const isToday = i === totalDays;
            labels.push({
              label: isToday ? 'TODAY' : dayNames[d.getDay()],
              position: totalDays > 0 ? i / totalDays : 0,
            });
          }
          return labels.map((l, i) => (
            <span key={i} className={`${l.label === 'TODAY' ? 'font-semibold text-primary-600' : ''}`}>
              {l.label}
            </span>
          ));
        })() : (
          <>
            <span>{formatDate(chartData.startDate)}</span>
            <span>{formatDate(chartData.endDate)}</span>
          </>
        )}
      </div>
    </div>
  );
}
