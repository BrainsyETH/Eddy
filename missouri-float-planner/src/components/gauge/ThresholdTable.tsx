'use client';

// src/components/gauge/ThresholdTable.tsx
// Visual gauge bar with colored zones, needle indicator, and expandable descriptions

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { CONDITION_COLORS, DEFAULT_THRESHOLD_DESCRIPTIONS } from '@/constants';

interface ThresholdValues {
  levelTooLow: number | null;
  levelLow: number | null;
  levelOptimalMin: number | null;
  levelOptimalMax: number | null;
  levelHigh: number | null;
  levelDangerous: number | null;
}

interface ThresholdTableProps extends ThresholdValues {
  thresholdUnit: 'ft' | 'cfs';
  altThresholds?: ThresholdValues | null;
  altUnit?: 'ft' | 'cfs';
  thresholdDescriptions?: {
    tooLow?: string;
    low?: string;
    good?: string;
    flowing?: string;
    high?: string;
    flood?: string;
  } | null;
  currentCondition?: string;
  gaugeHeightFt?: number | null;
  dischargeCfs?: number | null;
}

interface Zone {
  key: string;
  label: string;
  color: string;
  min: number;
  max: number;
  description: string;
}

function buildZones(
  tv: ThresholdValues,
  barMin: number,
  barMax: number,
  descriptions?: ThresholdTableProps['thresholdDescriptions'] | null,
): Zone[] {
  const zones: Zone[] = [];

  // Too Low: 0 → levelTooLow
  if (tv.levelTooLow !== null) {
    zones.push({
      key: 'too_low',
      label: 'Too Low',
      color: CONDITION_COLORS.too_low,
      min: barMin,
      max: tv.levelTooLow,
      description: descriptions?.tooLow || DEFAULT_THRESHOLD_DESCRIPTIONS.tooLow,
    });
  }

  // Low: levelTooLow → levelLow
  if (tv.levelLow !== null) {
    zones.push({
      key: 'low',
      label: 'Low',
      color: CONDITION_COLORS.low,
      min: tv.levelTooLow ?? barMin,
      max: tv.levelLow,
      description: descriptions?.low || DEFAULT_THRESHOLD_DESCRIPTIONS.low,
    });
  }

  // Good: levelLow → levelOptimalMin
  if (tv.levelOptimalMin !== null) {
    zones.push({
      key: 'good',
      label: 'Good',
      color: CONDITION_COLORS.good,
      min: tv.levelLow ?? tv.levelTooLow ?? barMin,
      max: tv.levelOptimalMin,
      description: descriptions?.good || DEFAULT_THRESHOLD_DESCRIPTIONS.good,
    });
  }

  // Flowing: levelOptimalMin → levelOptimalMax
  if (tv.levelOptimalMin !== null && tv.levelOptimalMax !== null) {
    zones.push({
      key: 'flowing',
      label: 'Ideal',
      color: CONDITION_COLORS.flowing,
      min: tv.levelOptimalMin,
      max: tv.levelOptimalMax,
      description: descriptions?.flowing || DEFAULT_THRESHOLD_DESCRIPTIONS.flowing,
    });
  }

  // High: levelOptimalMax → levelDangerous (or levelHigh as start)
  if (tv.levelHigh !== null || tv.levelDangerous !== null) {
    const highStart = tv.levelOptimalMax ?? tv.levelHigh ?? barMin;
    const highEnd = tv.levelDangerous ?? barMax;
    zones.push({
      key: 'high',
      label: 'High',
      color: CONDITION_COLORS.high,
      min: highStart,
      max: highEnd,
      description: descriptions?.high || DEFAULT_THRESHOLD_DESCRIPTIONS.high,
    });
  }

  // Flood: above levelDangerous
  if (tv.levelDangerous !== null) {
    zones.push({
      key: 'dangerous',
      label: 'Flood',
      color: CONDITION_COLORS.dangerous,
      min: tv.levelDangerous,
      max: barMax,
      description: descriptions?.flood || DEFAULT_THRESHOLD_DESCRIPTIONS.flood,
    });
  }

  return zones;
}

export default function ThresholdTable({
  thresholdUnit,
  levelTooLow,
  levelLow,
  levelOptimalMin,
  levelOptimalMax,
  levelHigh,
  levelDangerous,
  altThresholds,
  altUnit,
  thresholdDescriptions,
  currentCondition,
  gaugeHeightFt,
  dischargeCfs,
}: ThresholdTableProps) {
  const hasAlt = altThresholds && altUnit && (
    altThresholds.levelTooLow !== null ||
    altThresholds.levelLow !== null ||
    altThresholds.levelOptimalMin !== null ||
    altThresholds.levelOptimalMax !== null ||
    altThresholds.levelHigh !== null ||
    altThresholds.levelDangerous !== null
  );

  const [showingAlt, setShowingAlt] = useState(false);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [showAllZones, setShowAllZones] = useState(false);

  const activeUnit = showingAlt && hasAlt ? altUnit! : thresholdUnit;
  const tv: ThresholdValues = showingAlt && hasAlt ? altThresholds! : {
    levelTooLow, levelLow, levelOptimalMin, levelOptimalMax, levelHigh, levelDangerous,
  };
  const currentValue = activeUnit === 'cfs' ? (dischargeCfs ?? null) : (gaugeHeightFt ?? null);

  const fmt = (val: number): string => {
    if (activeUnit === 'cfs') return val.toLocaleString();
    return val.toFixed(2);
  };

  const unitLabel = activeUnit === 'cfs' ? 'cfs' : 'ft';

  // Determine bar range
  const allValues = [
    tv.levelTooLow, tv.levelLow, tv.levelOptimalMin,
    tv.levelOptimalMax, tv.levelHigh, tv.levelDangerous,
    currentValue,
  ].filter((v): v is number => v !== null);

  if (allValues.length === 0) return null;

  const barMin = 0;
  const dataMax = Math.max(...allValues);
  // Cap bar at ~20% beyond the dangerous level (or the max threshold)
  const barMax = tv.levelDangerous
    ? tv.levelDangerous * 1.25
    : dataMax * 1.3;

  const zones = buildZones(tv, barMin, barMax, thresholdDescriptions);
  if (zones.length === 0) return null;

  const barRange = barMax - barMin;

  // Needle position
  const needlePercent = currentValue !== null && currentValue !== undefined
    ? Math.max(0, Math.min(100, ((currentValue - barMin) / barRange) * 100))
    : null;

  // Active zone for description display
  const activeZoneKey = selectedZone ?? currentCondition ?? null;
  const activeZone = zones.find(z => z.key === activeZoneKey) ?? null;

  // Boundary tick marks — deduplicated, sorted
  const boundarySet = new Map<number, boolean>();
  boundarySet.set(barMin, true);
  for (const z of zones) {
    if (z.min > barMin) boundarySet.set(z.min, true);
    if (z.max < barMax) boundarySet.set(z.max, true);
  }
  // Add a "max+" label
  boundarySet.set(barMax, true);

  const boundaries = Array.from(boundarySet.keys()).sort((a, b) => a - b);

  // Format boundary labels — use "800+" style for the max
  const fmtBoundary = (val: number, isMax: boolean): string => {
    if (isMax && tv.levelDangerous !== null) {
      return `${fmt(tv.levelDangerous)}+`;
    }
    return fmt(val);
  };

  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
        <div>
          <h3 className="text-base font-bold text-neutral-900">Condition Thresholds</h3>
          <p className="text-xs text-neutral-500 mt-0.5">Current conditions for this gauge ({unitLabel})</p>
        </div>
        {hasAlt && (
          <div className="flex rounded-lg border border-neutral-300 overflow-hidden">
            <button
              onClick={() => setShowingAlt(false)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                !showingAlt
                  ? 'bg-primary-500 text-white'
                  : 'bg-white text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              {thresholdUnit === 'ft' ? 'Gauge (ft)' : 'Flow (cfs)'}
            </button>
            <button
              onClick={() => setShowingAlt(true)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                showingAlt
                  ? 'bg-primary-500 text-white'
                  : 'bg-white text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              {altUnit === 'ft' ? 'Gauge (ft)' : 'Flow (cfs)'}
            </button>
          </div>
        )}
      </div>

      {/* Gauge bar */}
      <div className="px-5 pt-5 pb-2">
        <div className="relative">
          {/* Segmented bar */}
          <div className="flex h-8 rounded-md overflow-hidden">
            {zones.map((zone) => {
              const widthPercent = ((zone.max - zone.min) / barRange) * 100;
              const isSelected = activeZoneKey === zone.key;
              return (
                <button
                  key={zone.key}
                  className="relative h-full flex items-center justify-center transition-opacity cursor-pointer border-0 p-0"
                  style={{
                    width: `${widthPercent}%`,
                    backgroundColor: zone.color,
                    opacity: activeZoneKey && !isSelected ? 0.5 : 1,
                  }}
                  onClick={() => setSelectedZone(selectedZone === zone.key ? null : zone.key)}
                  title={`${zone.label}: ${fmt(zone.min)} – ${fmt(zone.max)} ${unitLabel}`}
                >
                  {widthPercent > 12 && (
                    <span className="text-[10px] sm:text-xs font-bold text-white truncate px-1 select-none">
                      {zone.label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Needle */}
          {needlePercent !== null && (
            <div
              className="absolute top-0 h-8 pointer-events-none"
              style={{ left: `${needlePercent}%` }}
            >
              <div className="relative flex flex-col items-center" style={{ transform: 'translateX(-50%)' }}>
                {/* Needle line */}
                <div className="w-0.5 h-8 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)]" />
                {/* Value label below */}
                <div className="mt-1.5 flex flex-col items-center">
                  <div
                    className="w-0 h-0 border-l-[5px] border-r-[5px] border-b-[5px] border-l-transparent border-r-transparent border-b-neutral-800"
                  />
                  <div className="bg-neutral-800 text-white text-[11px] font-bold px-2 py-0.5 rounded tabular-nums whitespace-nowrap">
                    {fmt(currentValue!)} {unitLabel}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Boundary labels */}
        <div className="relative h-4 mt-8">
          {boundaries.map((val, i) => {
            const percent = ((val - barMin) / barRange) * 100;
            const isLast = i === boundaries.length - 1;
            const isFirst = i === 0;
            return (
              <span
                key={val}
                className="absolute text-[10px] text-neutral-400 tabular-nums"
                style={{
                  left: `${percent}%`,
                  transform: isLast ? 'translateX(-100%)' : isFirst ? 'none' : 'translateX(-50%)',
                }}
              >
                {fmtBoundary(val, isLast)}
              </span>
            );
          })}
        </div>
      </div>

      {/* Active zone description */}
      {activeZone && (
        <div className="px-5 pb-4">
          <div
            className="flex items-start gap-2.5 rounded-lg px-3.5 py-2.5"
            style={{ backgroundColor: `${activeZone.color}15` }}
          >
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5"
              style={{ backgroundColor: activeZone.color }}
            />
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-neutral-900">{activeZone.label}</span>
                <span className="text-xs text-neutral-500 tabular-nums">
                  {fmt(activeZone.min)} – {activeZone.key === 'dangerous' ? `${fmt(activeZone.min)}+` : fmt(activeZone.max)} {unitLabel}
                </span>
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed mt-0.5">
                {activeZone.description}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Expand all zones */}
      <div className="border-t border-neutral-100">
        <button
          onClick={() => setShowAllZones(!showAllZones)}
          className="w-full flex items-center justify-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-neutral-500 hover:text-neutral-700 transition-colors"
        >
          {showAllZones ? 'Hide' : 'All'} thresholds
          {showAllZones ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showAllZones && (
          <div className="divide-y divide-neutral-100 border-t border-neutral-100">
            {zones.map((zone) => {
              const isActive = currentCondition === zone.key;
              return (
                <div
                  key={zone.key}
                  className={`px-5 py-3 ${isActive ? 'bg-primary-50/50' : ''}`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: zone.color }}
                      />
                      <span className="text-sm font-semibold text-neutral-900">{zone.label}</span>
                    </div>
                    <span className="text-xs font-mono text-neutral-500 tabular-nums">
                      {zone.key === 'dangerous'
                        ? `${fmt(zone.min)}+ ${unitLabel}`
                        : `${fmt(zone.min)} – ${fmt(zone.max)} ${unitLabel}`
                      }
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 leading-relaxed ml-[18px]">
                    {zone.description}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
