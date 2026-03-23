'use client';

// src/components/gauge/ThresholdTable.tsx
// Condition thresholds table with 6 rows and ft/cfs unit toggle

import { useState } from 'react';
import { DEFAULT_THRESHOLD_DESCRIPTIONS } from '@/constants';

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

  const activeUnit = showingAlt && hasAlt ? altUnit! : thresholdUnit;
  const tv: ThresholdValues = showingAlt && hasAlt ? altThresholds! : {
    levelTooLow, levelLow, levelOptimalMin, levelOptimalMax, levelHigh, levelDangerous,
  };

  const decrement = activeUnit === 'cfs' ? 1 : 0.01;

  const fmt = (val: number | null): string => {
    if (val === null) return '—';
    if (activeUnit === 'cfs') return val.toLocaleString();
    return val.toFixed(2);
  };

  const unitLabel = activeUnit === 'cfs' ? 'cfs' : 'ft';

  // Build the 6 rows exactly matching the original layout
  const rows: {
    key: string;
    label: string;
    dotColor: string;
    range: string;
    description: string;
  }[] = [];

  // 1. Optimal — levelOptimalMin to levelOptimalMax
  if (tv.levelOptimalMin !== null || tv.levelOptimalMax !== null) {
    rows.push({
      key: 'flowing',
      label: 'Flowing',
      dotColor: 'bg-emerald-500',
      range: tv.levelOptimalMin !== null && tv.levelOptimalMax !== null
        ? `${fmt(tv.levelOptimalMin)} – ${fmt(tv.levelOptimalMax)} ${unitLabel}`
        : tv.levelOptimalMin !== null
          ? `Above ${fmt(tv.levelOptimalMin)} ${unitLabel}`
          : `Below ${fmt(tv.levelOptimalMax)} ${unitLabel}`,
      description: thresholdDescriptions?.flowing || DEFAULT_THRESHOLD_DESCRIPTIONS.flowing,
    });
  }

  // 2. Okay — levelLow to (levelOptimalMin - decrement)
  if (tv.levelLow !== null || tv.levelOptimalMin !== null) {
    const lower = tv.levelLow;
    const upper = tv.levelOptimalMin !== null ? +(tv.levelOptimalMin - decrement).toFixed(activeUnit === 'cfs' ? 0 : 2) : null;
    rows.push({
      key: 'good',
      label: 'Good',
      dotColor: 'bg-lime-500',
      range: lower !== null && upper !== null
        ? `${fmt(lower)} – ${fmt(upper)} ${unitLabel}`
        : lower !== null
          ? `Above ${fmt(lower)} ${unitLabel}`
          : upper !== null
            ? `Below ${fmt(upper)} ${unitLabel}`
            : '—',
      description: thresholdDescriptions?.good || DEFAULT_THRESHOLD_DESCRIPTIONS.good,
    });
  }

  // 3. Low — levelTooLow to (levelLow - decrement)
  if (tv.levelTooLow !== null || tv.levelLow !== null) {
    const lower = tv.levelTooLow;
    const upper = tv.levelLow !== null ? +(tv.levelLow - decrement).toFixed(activeUnit === 'cfs' ? 0 : 2) : null;
    rows.push({
      key: 'low',
      label: 'Low',
      dotColor: 'bg-yellow-500',
      range: lower !== null && upper !== null
        ? `${fmt(lower)} – ${fmt(upper)} ${unitLabel}`
        : lower !== null
          ? `Above ${fmt(lower)} ${unitLabel}`
          : upper !== null
            ? `Below ${fmt(upper)} ${unitLabel}`
            : '—',
      description: thresholdDescriptions?.low || DEFAULT_THRESHOLD_DESCRIPTIONS.low,
    });
  }

  // 4. Too Low — below levelTooLow
  if (tv.levelTooLow !== null) {
    rows.push({
      key: 'too_low',
      label: 'Too Low',
      dotColor: 'bg-neutral-500',
      range: `Below ${fmt(tv.levelTooLow)} ${unitLabel}`,
      description: thresholdDescriptions?.tooLow || DEFAULT_THRESHOLD_DESCRIPTIONS.tooLow,
    });
  }

  // 5. High — levelHigh to (levelDangerous - decrement)
  if (tv.levelHigh !== null || tv.levelDangerous !== null) {
    const lower = tv.levelHigh ?? tv.levelOptimalMax;
    const upper = tv.levelDangerous !== null ? +(tv.levelDangerous - decrement).toFixed(activeUnit === 'cfs' ? 0 : 2) : null;
    rows.push({
      key: 'high',
      label: 'High',
      dotColor: 'bg-orange-500',
      range: lower !== null && upper !== null
        ? `${fmt(lower)} – ${fmt(upper)} ${unitLabel}`
        : lower !== null
          ? `Above ${fmt(lower)} ${unitLabel}`
          : '—',
      description: thresholdDescriptions?.high || DEFAULT_THRESHOLD_DESCRIPTIONS.high,
    });
  }

  // 6. Flood — above levelDangerous
  if (tv.levelDangerous !== null) {
    rows.push({
      key: 'dangerous',
      label: 'Flood',
      dotColor: 'bg-red-500',
      range: `Above ${fmt(tv.levelDangerous)} ${unitLabel}`,
      description: thresholdDescriptions?.flood || DEFAULT_THRESHOLD_DESCRIPTIONS.flood,
    });
  }

  if (rows.length === 0) return null;

  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
        <div>
          <h3 className="text-base font-bold text-neutral-900">Condition Thresholds</h3>
          <p className="text-xs text-neutral-500 mt-0.5">Standard benchmarks for this stretch of river</p>
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

      <div className="divide-y divide-neutral-100">
        {rows.map((row) => {
          const isActive = currentCondition === row.key;
          return (
            <div
              key={row.key}
              className={`px-5 py-3.5 ${isActive ? 'bg-primary-50/50' : ''}`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2.5">
                  <span className={`w-3 h-3 rounded-full ${row.dotColor} flex-shrink-0`} />
                  <span className="text-sm font-semibold text-neutral-900">{row.label}</span>
                </div>
                <span className="text-sm font-mono font-medium text-neutral-700 tabular-nums">
                  {row.range}
                </span>
              </div>
              <p className="text-xs text-neutral-500 leading-relaxed ml-[22px]">
                {row.description}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
