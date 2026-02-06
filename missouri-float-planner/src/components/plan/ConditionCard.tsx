'use client';

// src/components/plan/ConditionCard.tsx
// River condition display card with gauge readings

import { getConditionConfig } from '@/constants';
import type { ConditionCode, RiverCondition } from '@/types/api';

interface ConditionCardProps {
  condition: RiverCondition;
  compact?: boolean;
}

export default function ConditionCard({ condition, compact = false }: ConditionCardProps) {
  const code: ConditionCode = condition.code || 'unknown';
  const config = getConditionConfig(code);

  if (compact) {
    return (
      <div className={`rounded-lg overflow-hidden ${config.bgClass}`}>
        <div className="px-3 py-2 flex items-center justify-center gap-2">
          <span className="text-lg">{config.icon}</span>
          <span className={`font-bold ${config.textClass}`}>{config.shortLabel}</span>
        </div>
        <div className="bg-white/95 px-3 py-2 flex items-center justify-around">
          <div className="text-center">
            <p className="text-lg font-bold text-neutral-800">
              {condition.gaugeHeightFt?.toFixed(1) ?? '—'}
            </p>
            <p className="text-[9px] uppercase tracking-wider text-neutral-500 font-medium">Feet</p>
          </div>
          <div className="w-px h-8 bg-neutral-200" />
          <div className="text-center">
            <p className="text-lg font-bold text-neutral-800">
              {condition.dischargeCfs?.toLocaleString() ?? '—'}
            </p>
            <p className="text-[9px] uppercase tracking-wider text-neutral-500 font-medium">CFS</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl overflow-hidden ${config.bgClass}`}>
      {/* Main Status */}
      <div className="px-4 py-4 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/20 mb-2">
          <span className="text-2xl">{config.icon}</span>
        </div>
        <p className={`text-xl font-bold ${config.textClass}`}>{config.shortLabel}</p>
        {condition.gaugeName && (
          <p className={`text-xs ${config.textClass} opacity-75 mt-1`}>
            {condition.gaugeName}
          </p>
        )}
      </div>

      {/* Stats Row */}
      <div className="bg-white/95 backdrop-blur px-4 py-3">
        <div className="flex items-center justify-around">
          <div className="text-center">
            <p className="text-2xl font-bold text-neutral-800">
              {condition.gaugeHeightFt?.toFixed(1) ?? '—'}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">Feet</p>
          </div>
          <div className="w-px h-10 bg-neutral-200" />
          <div className="text-center">
            <p className="text-2xl font-bold text-neutral-800">
              {condition.dischargeCfs?.toLocaleString() ?? '—'}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">CFS</p>
          </div>
          {condition.usgsUrl && (
            <>
              <div className="w-px h-10 bg-neutral-200" />
              <a
                href={condition.usgsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center text-primary-600 hover:text-primary-700"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                <p className="text-[10px] uppercase tracking-wider font-medium mt-1">USGS</p>
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
