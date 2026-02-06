'use client';

// src/components/river/RiverHeader.tsx
// River header with at-a-glance navigability status
// Back navigation is now handled by the global SiteHeader

import { useState, useEffect, useRef } from 'react';
import { Info } from 'lucide-react';
import type { RiverWithDetails, RiverCondition } from '@/types/api';

interface RiverHeaderProps {
  river: RiverWithDetails;
  condition: RiverCondition | null;
}

function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // Dismiss on any click outside
  useEffect(() => {
    if (!show) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShow(false);
      }
    };
    const timer = setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => { clearTimeout(timer); document.removeEventListener('click', handleClick); };
  }, [show]);

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        onClick={(e) => { e.stopPropagation(); setShow(!show); }}
        className="ml-1 p-0.5 opacity-50 hover:opacity-80 transition-opacity"
        aria-label="More info"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {show && (
        <span className="absolute bottom-full right-0 mb-2 px-3 py-1.5 text-xs text-white bg-neutral-800 rounded-lg shadow-lg max-w-[200px] z-50">
          {text}
        </span>
      )}
    </span>
  );
}

export default function RiverHeader({ river, condition }: RiverHeaderProps) {
  return (
    <div className="text-white bg-gradient-to-br from-primary-900 via-primary-800 to-primary-900">
      <div className="max-w-7xl mx-auto px-4 py-6 md:py-8">
        {/* Header Content */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-6">
          {/* Left: River Info */}
          <div className="flex-1">
            <h1 className="text-3xl md:text-5xl font-bold mb-2 text-white">{river.name}</h1>
            {river.description && (
              <p className="text-base md:text-lg mb-3 md:mb-4 text-primary-200">{river.description}</p>
            )}

            {/* River Stats */}
            <div className="flex flex-wrap gap-3 md:gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-primary-300">Length:</span>
                <span className="font-semibold text-white">{river.lengthMiles.toFixed(1)} mi</span>
              </div>
              {river.region && (
                <div className="flex items-center gap-1.5">
                  <span className="text-primary-300">Region:</span>
                  <span className="font-semibold text-white">{river.region}</span>
                </div>
              )}
              {river.difficultyRating && (
                <div className="flex items-center gap-1.5">
                  <span className="text-primary-300">Difficulty:</span>
                  <span className="font-semibold text-white">{river.difficultyRating}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right: Gauge Summary (desktop) */}
          {condition && (
            <div className="hidden md:block backdrop-blur-sm rounded-xl px-4 py-3 min-w-[200px] bg-primary-700/70">
              <p className="text-xs mb-1 text-support-500">USGS Gauge</p>
              {condition.gaugeName && (
                <p className="text-sm font-semibold mb-2 text-white">{condition.gaugeName}</p>
              )}
              <div className="space-y-1">
                {condition.gaugeHeightFt !== null && (
                  <div className="flex justify-between text-sm gap-4">
                    <span className="flex items-center text-primary-300">
                      Stage
                      <InfoTooltip text="Water height at the gauge station" />
                    </span>
                    <span className="font-semibold text-white">{condition.gaugeHeightFt.toFixed(2)} ft</span>
                  </div>
                )}
                {condition.dischargeCfs !== null && (
                  <div className="flex justify-between text-sm gap-4">
                    <span className="flex items-center text-primary-300">
                      Flow
                      <InfoTooltip text="Water volume in cubic feet per second" />
                    </span>
                    <span className="font-semibold text-white">{condition.dischargeCfs.toLocaleString()} cfs</span>
                  </div>
                )}
              </div>
              {condition.readingAgeHours !== null && condition.readingAgeHours < 24 && (
                <p className="text-xs mt-2 text-support-500">
                  Updated {Math.round(condition.readingAgeHours)}h ago
                </p>
              )}
            </div>
          )}
        </div>

        {/* Mobile Gauge Bar - full width, two-row layout */}
        {condition && (
          <div className="md:hidden mt-4 backdrop-blur-sm rounded-lg px-3 py-3 bg-primary-700/70">
            {/* Row 1: Gauge name */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded text-support-500 bg-support-500/15">USGS</span>
              {condition.gaugeName && (
                <span className="text-sm font-medium text-white">{condition.gaugeName}</span>
              )}
            </div>

            {/* Row 2: Stats */}
            <div className="flex items-center gap-4">
              {condition.gaugeHeightFt !== null && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-primary-300">Stage</span>
                  <InfoTooltip text="Water height at the gauge station" />
                  <span className="text-base font-bold text-white tabular-nums">{condition.gaugeHeightFt.toFixed(2)}</span>
                  <span className="text-xs text-white/50">ft</span>
                </div>
              )}
              {condition.dischargeCfs !== null && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-primary-300">Flow</span>
                  <InfoTooltip text="Water volume in cubic feet per second" />
                  <span className="text-base font-bold text-white tabular-nums">{condition.dischargeCfs.toLocaleString()}</span>
                  <span className="text-xs text-white/50">cfs</span>
                </div>
              )}
              {condition.readingAgeHours !== null && condition.readingAgeHours < 24 && (
                <span className="ml-auto text-[10px] text-support-500">
                  {Math.round(condition.readingAgeHours)}h ago
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
