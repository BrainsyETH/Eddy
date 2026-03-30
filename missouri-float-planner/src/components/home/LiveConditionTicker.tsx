'use client';

// src/components/home/LiveConditionTicker.tsx
// Rotating live ticker showing current conditions across all rivers

import { useState, useEffect, useCallback } from 'react';
import { useRiverGroups } from '@/hooks/useRiverGroups';
import { CONDITION_COLORS, CONDITION_SHORT_LABELS } from '@/constants';
import ConditionPulse from '@/components/ui/ConditionPulse';

export default function LiveConditionTicker() {
  const { riverGroups, isLoading } = useRiverGroups();
  const [activeIndex, setActiveIndex] = useState(0);
  const [key, setKey] = useState(0); // force re-mount for animation

  const advance = useCallback(() => {
    if (riverGroups.length === 0) return;
    setActiveIndex(prev => (prev + 1) % riverGroups.length);
    setKey(prev => prev + 1);
  }, [riverGroups.length]);

  useEffect(() => {
    if (riverGroups.length === 0) return;
    const interval = setInterval(advance, 4000);
    return () => clearInterval(interval);
  }, [advance, riverGroups.length]);

  if (isLoading || riverGroups.length === 0) return null;

  const river = riverGroups[activeIndex];
  if (!river) return null;

  const condCode = river.condition.code;
  const condLabel = CONDITION_SHORT_LABELS[condCode] || 'Unknown';
  const condColor = CONDITION_COLORS[condCode as keyof typeof CONDITION_COLORS] || CONDITION_COLORS.unknown;
  const isCfs = river.primaryThreshold.thresholdUnit === 'cfs';
  const value = isCfs ? river.primaryGauge.dischargeCfs : river.primaryGauge.gaugeHeightFt;
  const unit = isCfs ? 'cfs' : 'ft';

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 overflow-hidden h-8">
      <div
        key={key}
        className="ticker-item flex items-center gap-2 whitespace-nowrap"
      >
        <ConditionPulse conditionCode={condCode} size="sm" />
        <span className="text-xs font-semibold text-white/90">
          {river.riverName}
        </span>
        <span
          className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
          style={{ backgroundColor: condColor, color: 'white' }}
        >
          {condLabel}
        </span>
        {value !== null && (
          <span className="text-xs font-medium text-white/60 tabular-nums">
            {isCfs ? value.toLocaleString() : value.toFixed(1)} {unit}
          </span>
        )}
      </div>
    </div>
  );
}
