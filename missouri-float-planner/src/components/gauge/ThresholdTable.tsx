'use client';

// src/components/gauge/ThresholdTable.tsx
// Clean condition thresholds table matching the Stitch reference design

import { DEFAULT_THRESHOLD_DESCRIPTIONS } from '@/constants';

interface ThresholdTableProps {
  thresholdUnit: 'ft' | 'cfs';
  levelTooLow: number | null;
  levelLow: number | null;
  levelOptimalMin: number | null;
  levelOptimalMax: number | null;
  levelHigh: number | null;
  levelDangerous: number | null;
  thresholdDescriptions?: {
    tooLow?: string;
    low?: string;
    okay?: string;
    optimal?: string;
    high?: string;
    flood?: string;
  } | null;
  currentCondition?: string;
}

interface ThresholdRow {
  key: string;
  label: string;
  range: string;
  description: string;
  badgeClass: string;
}

export default function ThresholdTable({
  thresholdUnit,
  levelTooLow,
  levelLow,
  levelOptimalMin,
  levelOptimalMax,
  levelHigh,
  levelDangerous,
  thresholdDescriptions,
  currentCondition,
}: ThresholdTableProps) {
  const unitLabel = thresholdUnit === 'cfs' ? 'FLOW (CFS)' : 'GAUGE STAGE (FT)';

  const fmt = (val: number | null) => {
    if (val === null) return '—';
    return thresholdUnit === 'cfs' ? val.toLocaleString() : `${val}'`;
  };

  const rows: ThresholdRow[] = [];

  // Scrape Low / Too Low
  if (levelTooLow !== null || levelLow !== null) {
    const upper = levelLow ?? levelTooLow;
    rows.push({
      key: 'too_low',
      label: 'Scrape Low',
      range: `Below ${fmt(upper)}`,
      description: thresholdDescriptions?.tooLow || DEFAULT_THRESHOLD_DESCRIPTIONS.tooLow,
      badgeClass: 'bg-neutral-200 text-neutral-700',
    });
  }

  // Optimal
  if (levelOptimalMin !== null || levelOptimalMax !== null) {
    const min = levelOptimalMin ?? levelLow;
    const max = levelOptimalMax ?? levelHigh;
    rows.push({
      key: 'optimal',
      label: 'Optimal',
      range: min !== null && max !== null ? `${fmt(min)} - ${fmt(max)}` : '—',
      description: thresholdDescriptions?.optimal || DEFAULT_THRESHOLD_DESCRIPTIONS.optimal,
      badgeClass: 'bg-emerald-100 text-emerald-700',
    });
  }

  // Fast Flow / High
  if (levelHigh !== null || levelDangerous !== null) {
    const lower = levelHigh ?? levelOptimalMax;
    const upper = levelDangerous;
    rows.push({
      key: 'high',
      label: 'Fast Flow',
      range: lower !== null && upper !== null
        ? `${fmt(lower)} - ${fmt(upper)}`
        : lower !== null
          ? `Above ${fmt(lower)}`
          : '—',
      description: thresholdDescriptions?.high || DEFAULT_THRESHOLD_DESCRIPTIONS.high,
      badgeClass: 'bg-orange-100 text-orange-700',
    });
  }

  // Flood Stage
  if (levelDangerous !== null) {
    rows.push({
      key: 'dangerous',
      label: 'Flood Stage',
      range: `Above ${fmt(levelDangerous)}`,
      description: thresholdDescriptions?.flood || DEFAULT_THRESHOLD_DESCRIPTIONS.flood,
      badgeClass: 'bg-red-100 text-red-700',
    });
  }

  if (rows.length === 0) return null;

  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-neutral-100">
        <h3 className="text-base font-bold text-neutral-900">Condition Thresholds</h3>
        <p className="text-xs text-neutral-500 mt-0.5">Standard benchmarks for this stretch of river</p>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[140px_120px_1fr] md:grid-cols-[160px_140px_1fr] px-5 py-2.5 bg-neutral-50 border-b border-neutral-100">
        <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Condition</span>
        <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">{unitLabel}</span>
        <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Floating Experience</span>
      </div>

      {/* Table rows */}
      {rows.map((row) => {
        const isActive = currentCondition === row.key;
        return (
          <div
            key={row.key}
            className={`grid grid-cols-[140px_120px_1fr] md:grid-cols-[160px_140px_1fr] px-5 py-3.5 border-b border-neutral-50 last:border-b-0 items-start gap-y-1 ${
              isActive ? 'bg-primary-50/50' : ''
            }`}
          >
            <div className="flex items-center">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wide ${row.badgeClass}`}>
                {row.label}
              </span>
            </div>
            <div className="text-sm font-semibold text-neutral-900 tabular-nums">
              {row.range}
            </div>
            <div className="text-sm text-neutral-600 leading-relaxed">
              {row.description}
            </div>
          </div>
        );
      })}
    </div>
  );
}
