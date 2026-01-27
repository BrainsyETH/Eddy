'use client';

// src/components/river/RiverHeader.tsx
// River header with at-a-glance navigability status
// Back navigation is now handled by the global SiteHeader

import { useState } from 'react';
import { Info } from 'lucide-react';
import type { RiverWithDetails, RiverCondition } from '@/types/api';

interface RiverHeaderProps {
  river: RiverWithDetails;
  condition: RiverCondition | null;
}

function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        onClick={(e) => { e.stopPropagation(); setShow(!show); }}
        onBlur={() => setShow(false)}
        className="ml-0.5 opacity-40 hover:opacity-70 transition-opacity"
        aria-label="More info"
      >
        <Info className="w-3 h-3" />
      </button>
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-neutral-900 rounded shadow-lg whitespace-nowrap z-50">
          {text}
        </span>
      )}
    </span>
  );
}

export default function RiverHeader({ river, condition }: RiverHeaderProps) {
  return (
    <div className="text-white" style={{ background: 'linear-gradient(to bottom right, #0F2D35, #163F4A, #0F2D35)' }}>
      <div className="max-w-7xl mx-auto px-4 py-6 md:py-8">
        {/* Header Content */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-6">
          {/* Left: River Info */}
          <div className="flex-1">
            <h1 className="text-3xl md:text-5xl font-bold mb-2 text-white">{river.name}</h1>
            {river.description && (
              <p className="text-base md:text-lg mb-3 md:mb-4" style={{ color: '#A3D1DB' }}>{river.description}</p>
            )}

            {/* River Stats */}
            <div className="flex flex-wrap gap-3 md:gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <span style={{ color: '#72B5C4' }}>Length:</span>
                <span className="font-semibold text-white">{river.lengthMiles.toFixed(1)} mi</span>
              </div>
              {river.region && (
                <div className="flex items-center gap-1.5">
                  <span style={{ color: '#72B5C4' }}>Region:</span>
                  <span className="font-semibold text-white">{river.region}</span>
                </div>
              )}
              {river.difficultyRating && (
                <div className="flex items-center gap-1.5">
                  <span style={{ color: '#72B5C4' }}>Difficulty:</span>
                  <span className="font-semibold text-white">{river.difficultyRating}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right: Gauge Summary (desktop) */}
          {condition && (
            <div className="hidden md:block backdrop-blur-sm rounded-xl px-4 py-3 min-w-[200px]" style={{ backgroundColor: 'rgba(29, 82, 95, 0.7)' }}>
              <p className="text-xs mb-1" style={{ color: '#4EB86B' }}>USGS Gauge</p>
              {condition.gaugeName && (
                <p className="text-sm font-semibold mb-2 text-white">{condition.gaugeName}</p>
              )}
              <div className="space-y-1">
                {condition.gaugeHeightFt !== null && (
                  <div className="flex justify-between text-sm gap-4">
                    <span className="flex items-center" style={{ color: '#72B5C4' }}>
                      Stage
                      <InfoTooltip text="Water height at the gauge station" />
                    </span>
                    <span className="font-semibold text-white">{condition.gaugeHeightFt.toFixed(2)} ft</span>
                  </div>
                )}
                {condition.dischargeCfs !== null && (
                  <div className="flex justify-between text-sm gap-4">
                    <span className="flex items-center" style={{ color: '#72B5C4' }}>
                      Flow
                      <InfoTooltip text="Water volume in cubic feet per second" />
                    </span>
                    <span className="font-semibold text-white">{condition.dischargeCfs.toLocaleString()} cfs</span>
                  </div>
                )}
              </div>
              {condition.readingAgeHours !== null && condition.readingAgeHours < 24 && (
                <p className="text-xs mt-2" style={{ color: '#4EB86B' }}>
                  Updated {Math.round(condition.readingAgeHours)}h ago
                </p>
              )}
            </div>
          )}
        </div>

        {/* Mobile Gauge Bar - full width, compact inline layout */}
        {condition && (
          <div className="md:hidden mt-4 backdrop-blur-sm rounded-lg px-3 py-2.5" style={{ backgroundColor: 'rgba(29, 82, 95, 0.7)' }}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[10px] font-bold tracking-wide uppercase shrink-0" style={{ color: '#4EB86B' }}>USGS</span>
                {condition.gaugeName && (
                  <span className="text-xs text-white/60 truncate">{condition.gaugeName}</span>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {condition.gaugeHeightFt !== null && (
                  <div className="flex items-center gap-1 text-sm">
                    <span className="text-[11px]" style={{ color: '#72B5C4' }}>Stage</span>
                    <InfoTooltip text="Water height at the gauge station" />
                    <span className="font-bold text-white">{condition.gaugeHeightFt.toFixed(2)} ft</span>
                  </div>
                )}
                {condition.dischargeCfs !== null && (
                  <div className="flex items-center gap-1 text-sm">
                    <span className="text-[11px]" style={{ color: '#72B5C4' }}>Flow</span>
                    <InfoTooltip text="Water volume in cubic feet per second" />
                    <span className="font-bold text-white">{condition.dischargeCfs.toLocaleString()} cfs</span>
                  </div>
                )}
              </div>
            </div>
            {condition.readingAgeHours !== null && condition.readingAgeHours < 24 && (
              <p className="text-[10px] mt-1" style={{ color: '#4EB86B' }}>
                Updated {Math.round(condition.readingAgeHours)}h ago
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
