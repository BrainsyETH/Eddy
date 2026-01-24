'use client';

// src/components/river/ConditionsBlock.tsx
// Conditions & Safety section with USGS data and trends

import type { RiverCondition } from '@/types/api';
import type { GaugeStation } from '@/hooks/useGaugeStations';

interface ConditionsBlockProps {
  riverId: string;
  condition: RiverCondition | null;
  nearestGauge?: GaugeStation | null;
  hasPutInSelected?: boolean;
  isLoading?: boolean;
}

export default function ConditionsBlock({ condition, nearestGauge, hasPutInSelected, isLoading }: ConditionsBlockProps) {
  // Use the condition passed from parent (which is segment-aware when put-in is selected)
  const displayCondition = condition;

  if (isLoading) {
    return (
      <div className="glass-card-dark rounded-2xl p-6 border border-white/10">
        <h3 className="text-xl font-bold text-white mb-4">Conditions & Safety</h3>
        <p className="text-sm text-white/70">Loading conditions...</p>
      </div>
    );
  }

  if (!displayCondition) {
    return (
      <div className="glass-card-dark rounded-2xl p-6 border border-white/10">
        <h3 className="text-xl font-bold text-white mb-4">Conditions & Safety</h3>
        <p className="text-sm text-white/70">Condition data not available at this time.</p>
      </div>
    );
  }

  // Determine trend (simplified - in production, would compare with historical data)
  const getTrend = () => {
    // For MVP, we'll show "Current" - can be enhanced with historical comparison
    return { label: 'Current', icon: '→', color: 'text-bluff-600' };
  };

  const trend = getTrend();
  const conditionColorClass =
    displayCondition.code === 'optimal' ? 'bg-emerald-100 text-emerald-800' :
    displayCondition.code === 'low' || displayCondition.code === 'very_low' || displayCondition.code === 'too_low' ? 'bg-amber-100 text-amber-800' :
    displayCondition.code === 'high' ? 'bg-orange-100 text-orange-800' :
    displayCondition.code === 'dangerous' ? 'bg-red-100 text-red-800' :
    'bg-bluff-100 text-bluff-700';

  return (
    <div className="glass-card-dark rounded-2xl p-6 border border-white/10">
      <h3 className="text-xl font-bold text-white mb-4">Conditions & Safety</h3>

      <div className="space-y-4">
        {/* River Condition */}
        <div className={`rounded-xl p-4 ${conditionColorClass}`}>
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-bold text-base">River Condition</h4>
            <span className="text-xs font-medium">
              {displayCondition.readingAgeHours !== null && displayCondition.readingAgeHours < 24
                ? `Updated ${Math.round(displayCondition.readingAgeHours)}h ago`
                : 'Recent'}
            </span>
          </div>
          <p className="text-xl font-bold mb-3">{displayCondition.label}</p>

          {/* Gauge Data */}
          <div className="grid grid-cols-2 gap-3">
            {displayCondition.gaugeHeightFt !== null && (
              <div>
                <p className="text-xs font-semibold mb-1">Gauge Height</p>
                <p className="text-2xl font-bold">{displayCondition.gaugeHeightFt.toFixed(2)} ft</p>
              </div>
            )}
            {displayCondition.dischargeCfs !== null && (
              <div>
                <p className="text-xs font-semibold mb-1">Discharge</p>
                <p className="text-2xl font-bold">{displayCondition.dischargeCfs.toLocaleString()} cfs</p>
              </div>
            )}
          </div>

          {displayCondition.gaugeName && (
            <p className="text-xs mt-3 font-medium border-t border-current/20 pt-2">
              📍 Gauge: {displayCondition.gaugeName}
            </p>
          )}
        </div>

        {/* Nearest Gauge */}
        {nearestGauge && (
          <div className="bg-blue-500/20 border border-blue-400/40 rounded-xl p-4">
            <h4 className="font-bold text-blue-300 mb-2 text-sm flex items-center gap-2">
              <span>💧</span>
              <span>{hasPutInSelected ? 'Nearest Gauge to Your Put-in' : 'Nearest Gauge Station'}</span>
            </h4>
            <p className="text-white font-medium text-sm mb-2">{nearestGauge.name}</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-blue-200/70 text-xs">Gauge Height</p>
                <p className="text-white font-bold">
                  {nearestGauge.gaugeHeightFt !== null
                    ? `${nearestGauge.gaugeHeightFt.toFixed(2)} ft`
                    : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-blue-200/70 text-xs">Discharge</p>
                <p className="text-white font-bold">
                  {nearestGauge.dischargeCfs !== null
                    ? `${nearestGauge.dischargeCfs.toLocaleString()} cfs`
                    : 'N/A'}
                </p>
              </div>
            </div>
            {nearestGauge.readingAgeHours !== null && (
              <p className="text-blue-200/60 text-xs mt-2">
                Updated {nearestGauge.readingAgeHours < 1
                  ? 'just now'
                  : nearestGauge.readingAgeHours < 24
                    ? `${Math.round(nearestGauge.readingAgeHours)}h ago`
                    : `${Math.round(nearestGauge.readingAgeHours / 24)}d ago`}
              </p>
            )}
            <p className="text-blue-200/60 text-xs mt-1">
              View gauge pins on the map to see thresholds
            </p>
          </div>
        )}

        {/* Trend */}
        <div className="bg-white/10 rounded-xl p-4 border border-white/20">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{trend.icon}</span>
            <div>
              <p className="text-xs text-white/60 font-medium uppercase tracking-wide mb-0.5">Trend</p>
              <p className="font-bold text-white text-lg">{trend.label}</p>
            </div>
          </div>
          <p className="text-sm text-white/70 mt-3 pt-2 border-t border-white/10">
            Check USGS website for detailed historical trends
          </p>
        </div>

        {/* Safety Notes */}
        <div className="bg-amber-500/20 border border-amber-400/40 rounded-xl p-4">
          <h4 className="font-bold text-amber-300 mb-3 text-base">⚠️ Safety Reminders</h4>
          <ul className="text-sm text-white/90 space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-amber-400">•</span>
              <span>Always wear a life jacket</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-400">•</span>
              <span>Check weather conditions before floating</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-400">•</span>
              <span>Inform someone of your float plan</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-400">•</span>
              <span>Bring adequate water and sun protection</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-400">•</span>
              <span>Know your skill level and river difficulty</span>
            </li>
          </ul>
        </div>

        {/* Accuracy Warning */}
        {displayCondition.accuracyWarning && displayCondition.accuracyWarningReason && (
          <div className="bg-orange-500/20 border border-orange-400/40 rounded-xl p-4">
            <p className="text-sm text-orange-200">
              <span className="font-bold text-orange-300">⚠ Warning:</span> {displayCondition.accuracyWarningReason}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
