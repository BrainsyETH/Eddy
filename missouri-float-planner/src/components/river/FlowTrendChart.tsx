'use client';

// src/components/river/FlowTrendChart.tsx
// 7-day flow trend chart for river conditions

import { useMemo } from 'react';
import { useGaugeHistory } from '@/hooks/useGaugeHistory';

interface FlowTrendChartProps {
  gaugeSiteId: string | null;
  className?: string;
}

export default function FlowTrendChart({ gaugeSiteId, className = '' }: FlowTrendChartProps) {
  const { data: history, isLoading, error } = useGaugeHistory(gaugeSiteId);

  // Process data for the chart
  const chartData = useMemo(() => {
    if (!history?.readings || history.readings.length === 0) return null;

    const readings = history.readings;
    const stats = history.stats;

    // Get min/max for scaling
    const minVal = stats.minDischarge ?? 0;
    const maxVal = stats.maxDischarge ?? 100;
    const range = maxVal - minVal || 1;

    // Sample points for the SVG path (max ~50 points for smooth chart)
    const sampleStep = Math.max(1, Math.floor(readings.length / 50));
    const sampledReadings = readings.filter((_, i) => i % sampleStep === 0);

    // Generate SVG path points
    const points = sampledReadings.map((reading, index) => {
      const x = (index / (sampledReadings.length - 1)) * 100;
      const y = reading.dischargeCfs !== null
        ? 100 - ((reading.dischargeCfs - minVal) / range) * 100
        : 50;
      return { x, y, value: reading.dischargeCfs, timestamp: reading.timestamp };
    });

    // Create SVG path
    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    // Create area path (fill under the line)
    const areaD = `${pathD} L ${points[points.length - 1].x} 100 L ${points[0].x} 100 Z`;

    return {
      points,
      pathD,
      areaD,
      minVal,
      maxVal,
      currentVal: readings[readings.length - 1]?.dischargeCfs,
      startDate: new Date(readings[0].timestamp),
      endDate: new Date(readings[readings.length - 1].timestamp),
    };
  }, [history]);

  if (isLoading) {
    return (
      <div className={`bg-white/5 rounded-lg p-4 ${className}`}>
        <div className="flex items-center gap-2 text-river-gravel text-sm">
          <div className="w-4 h-4 border-2 border-river-water border-t-transparent rounded-full animate-spin" />
          Loading 7-day trend...
        </div>
      </div>
    );
  }

  if (error || !chartData) {
    return (
      <div className={`bg-white/5 rounded-lg p-4 ${className}`}>
        <p className="text-river-gravel text-sm">Flow trend data unavailable</p>
      </div>
    );
  }

  // Format numbers for display
  const formatCfs = (val: number) => {
    if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
    return val.toFixed(0);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className={`bg-white/5 rounded-lg p-4 border border-white/10 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-white">7-Day Flow Trend</h4>
        {chartData.currentVal !== null && (
          <span className="text-xs text-river-water font-medium">
            Current: {formatCfs(chartData.currentVal)} cfs
          </span>
        )}
      </div>

      {/* SVG Chart */}
      <div className="relative h-24">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          {/* Gradient fill */}
          <defs>
            <linearGradient id="flowGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path d={chartData.areaD} fill="url(#flowGradient)" />

          {/* Line */}
          <path
            d={chartData.pathD}
            fill="none"
            stroke="rgb(59, 130, 246)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />

          {/* Current value dot */}
          {chartData.points.length > 0 && (
            <circle
              cx={chartData.points[chartData.points.length - 1].x}
              cy={chartData.points[chartData.points.length - 1].y}
              r="3"
              fill="rgb(59, 130, 246)"
              stroke="white"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-[10px] text-river-gravel -ml-1">
          <span>{formatCfs(chartData.maxVal)}</span>
          <span>{formatCfs(chartData.minVal)}</span>
        </div>
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between text-[10px] text-river-gravel mt-1 px-2">
        <span>{formatDate(chartData.startDate)}</span>
        <span>{formatDate(chartData.endDate)}</span>
      </div>

      <p className="text-[10px] text-river-gravel/70 mt-2 text-center">
        Discharge in cubic feet per second (cfs)
      </p>
    </div>
  );
}
