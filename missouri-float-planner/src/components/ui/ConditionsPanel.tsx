'use client';

// src/components/ui/ConditionsPanel.tsx
// Display current river conditions

import { useConditions } from '@/hooks/useConditions';
import LoadingSpinner from './LoadingSpinner';
import type { ConditionCode } from '@/types/api';

interface ConditionsPanelProps {
  riverId: string | null;
  className?: string;
}

// Condition styles ordered: Too Low → Low → Okay → Optimal → High → Flood
const conditionStyles: Record<ConditionCode, { bg: string; border: string; text: string; icon: string; label: string }> = {
  too_low: { bg: 'bg-neutral-500/15', border: 'border-neutral-500/30', text: 'text-neutral-400', icon: '✕', label: 'Too Low' },
  very_low: { bg: 'bg-yellow-500/15', border: 'border-yellow-500/30', text: 'text-yellow-400', icon: '⚠', label: 'Low' },
  low: { bg: 'bg-lime-500/15', border: 'border-lime-500/30', text: 'text-lime-400', icon: '✓', label: 'Okay' },
  optimal: { bg: 'bg-emerald-600/20', border: 'border-emerald-600/40', text: 'text-emerald-400', icon: '✓', label: 'Optimal' },
  high: { bg: 'bg-orange-500/15', border: 'border-orange-500/30', text: 'text-orange-400', icon: '↑', label: 'High' },
  dangerous: { bg: 'bg-red-500/20', border: 'border-red-500/40', text: 'text-red-400', icon: '⚠', label: 'Flood' },
  unknown: { bg: 'bg-white/5', border: 'border-white/10', text: 'text-river-gravel', icon: '?', label: 'Unknown' },
};

// Helper to validate gauge readings (filter out USGS error values like -999999)
function isValidGaugeHeight(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && value > -100 && value < 500;
}

function isValidDischarge(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && value >= 0 && value < 1000000;
}

export default function ConditionsPanel({ riverId, className = '' }: ConditionsPanelProps) {
  const { data, isLoading, error } = useConditions(riverId);
  const condition = data?.condition ?? null;
  const diagnostic = data?.diagnostic ?? null;

  if (!riverId) {
    return (
      <div className={`glass-card-dark rounded-xl p-4 border border-white/10 ${className}`}>
        <p className="text-sm text-river-gravel">Select a river to see conditions</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={`glass-card-dark rounded-xl p-4 border border-white/10 ${className}`}>
        <div className="flex items-center gap-3">
          <LoadingSpinner size="sm" />
          <p className="text-sm text-river-gravel">Loading conditions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`glass-card-dark rounded-xl p-4 border border-white/10 ${className}`}>
        <h3 className="text-sm font-semibold text-white mb-2">River Conditions</h3>
        <p className="text-sm text-red-400">Unable to load conditions</p>
      </div>
    );
  }

  // Show unknown state if condition is null or code is unknown
  if (!condition || condition.code === 'unknown') {
    const style = conditionStyles['unknown'];
    return (
      <div className={`glass-card-dark rounded-xl p-4 border border-white/10 ${className}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">River Conditions</h3>
        </div>
        <div className={`rounded-xl p-3 border ${style.bg} ${style.border}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{style.icon}</span>
            <p className={`font-semibold ${style.text}`}>Unknown Conditions</p>
          </div>
          <p className={`text-xs ${style.text} opacity-75`}>
            {diagnostic
              ? diagnostic
              : 'Gauge data is not available for this river at this time. Toggle gauge pins on the map to view nearby gauges.'}
          </p>
        </div>
      </div>
    );
  }

  const style = conditionStyles[condition.code];

  return (
    <div className={`glass-card-dark rounded-xl p-4 border border-white/10 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">River Conditions</h3>
        <span className="text-xs text-river-gravel">
          {condition.readingAgeHours !== null && condition.readingAgeHours < 24
            ? `${Math.round(condition.readingAgeHours)}h ago`
            : 'Updated'}
        </span>
      </div>

      <div className={`rounded-xl p-4 border ${style.bg} ${style.border}`}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">{style.icon}</span>
          <p className={`font-semibold ${style.text}`}>{condition.label}</p>
        </div>

        {isValidGaugeHeight(condition.gaugeHeightFt) && (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-river-gravel">Gauge Height</span>
              <span className={`text-sm font-bold ${style.text}`}>
                {condition.gaugeHeightFt.toFixed(2)} ft
              </span>
            </div>
            {isValidDischarge(condition.dischargeCfs) && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-river-gravel">Discharge</span>
                <span className={`text-sm font-bold ${style.text}`}>
                  {condition.dischargeCfs.toLocaleString()} cfs
                </span>
              </div>
            )}
            {condition.gaugeName && (
              <p className="text-xs text-river-gravel/60 mt-2 pt-2 border-t border-white/5">
                {condition.gaugeName}
              </p>
            )}
          </div>
        )}

        {condition.accuracyWarning && condition.accuracyWarningReason && (
          <div className="mt-3 pt-2 border-t border-white/10">
            <p className={`text-xs ${style.text} opacity-80`}>
              ⚠ {condition.accuracyWarningReason}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
