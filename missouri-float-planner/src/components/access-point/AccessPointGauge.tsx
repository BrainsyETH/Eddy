// src/components/access-point/AccessPointGauge.tsx
// Water level gauge status display

import type { AccessPointGaugeStatus } from '@/types/api';

interface AccessPointGaugeProps {
  gaugeStatus: AccessPointGaugeStatus | null;
}

export default function AccessPointGauge({ gaugeStatus }: AccessPointGaugeProps) {
  if (!gaugeStatus) {
    return (
      <div className="flex items-center gap-3 p-3 bg-neutral-100 rounded-lg">
        <div className="w-2 h-9 rounded bg-neutral-300" />
        <div>
          <div className="text-sm font-semibold text-neutral-600">
            No gauge data
          </div>
          <div className="text-xs text-neutral-500">
            Water level unavailable
          </div>
        </div>
      </div>
    );
  }

  const colors = getGaugeColors(gaugeStatus.level);
  const lastUpdated = gaugeStatus.lastUpdated
    ? formatTimeAgo(new Date(gaugeStatus.lastUpdated))
    : null;

  return (
    <div>
      <div
        className="flex items-center gap-3 p-3 rounded-lg border"
        style={{
          backgroundColor: colors.bg,
          borderColor: colors.border,
        }}
      >
        {/* Level indicator bar */}
        <div
          className="w-2 h-9 rounded"
          style={{ backgroundColor: colors.bar }}
        />

        {/* Status text */}
        <div className="flex-1 min-w-0">
          <div
            className="text-sm font-bold"
            style={{ color: colors.text }}
          >
            {gaugeStatus.label}
          </div>
          <div
            className="text-xs font-mono"
            style={{ color: colors.text, opacity: 0.75 }}
          >
            {gaugeStatus.cfs !== null ? `${gaugeStatus.cfs.toLocaleString()} cfs` : 'N/A'}
            {gaugeStatus.heightFt !== null && ` · ${gaugeStatus.heightFt.toFixed(2)} ft`}
          </div>
        </div>

        {/* Trend indicator */}
        {gaugeStatus.trend && (
          <div className="flex flex-col items-end">
            <span className="text-base">
              {gaugeStatus.trend === 'rising' ? '↑' : gaugeStatus.trend === 'falling' ? '↓' : '→'}
            </span>
            <span
              className="text-[10px]"
              style={{ color: colors.text, opacity: 0.7 }}
            >
              {gaugeStatus.trend}
            </span>
          </div>
        )}
      </div>

      {/* Gauge info footer */}
      {lastUpdated && (
        <div className="text-right mt-1.5 text-[10px] font-mono text-neutral-500">
          USGS {gaugeStatus.usgsId} · Updated {lastUpdated}
        </div>
      )}
    </div>
  );
}

function getGaugeColors(level: AccessPointGaugeStatus['level']) {
  const colorMap = {
    'too_low': { bg: '#fef3e0', bar: '#d4a244', border: '#d4a24433', text: '#8a6a1e' },
    'low': { bg: '#fef3e0', bar: '#d4a244', border: '#d4a24433', text: '#8a6a1e' },
    'optimal': { bg: '#e0f0e4', bar: '#3d7c47', border: '#3d7c4733', text: '#1e5428' },
    'high': { bg: '#fff3e0', bar: '#f57c00', border: '#f57c0033', text: '#e65100' },
    'flood': { bg: '#ffebee', bar: '#d32f2f', border: '#d32f2f33', text: '#b71c1c' },
    'unknown': { bg: '#f5f5f5', bar: '#9e9e9e', border: '#9e9e9e33', text: '#616161' },
  };
  return colorMap[level] || colorMap.unknown;
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}
