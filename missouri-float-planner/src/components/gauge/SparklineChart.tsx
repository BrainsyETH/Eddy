'use client';

// src/components/gauge/SparklineChart.tsx
// Minimal sparkline chart for river dashboard cards

import { useGaugeHistory } from '@/hooks/useGaugeHistory';

interface SparklineChartProps {
  siteId: string;
  displayUnit: 'ft' | 'cfs';
  className?: string;
}

export default function SparklineChart({ siteId, displayUnit, className = '' }: SparklineChartProps) {
  const { data: history } = useGaugeHistory(siteId, 3);

  if (!history?.readings || history.readings.length < 3) {
    return <div className={`${className}`} />;
  }

  const isFt = displayUnit === 'ft';
  const values = history.readings
    .map(r => (isFt ? r.gaugeHeightFt : r.dischargeCfs))
    .filter((v): v is number => v !== null);

  if (values.length < 3) return <div className={`${className}`} />;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const width = 120;
  const height = 40;
  const padding = 2;

  const points = values.map((v, i) => {
    const x = padding + (i / (values.length - 1)) * (width - padding * 2);
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`${className}`}
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
