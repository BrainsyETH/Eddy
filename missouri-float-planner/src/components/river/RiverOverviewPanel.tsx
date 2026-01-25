'use client';

// src/components/river/RiverOverviewPanel.tsx
// River detail overview panel - bottom sheet on mobile, inline panel on desktop

import { useEffect, useState } from 'react';
import type { RiverWithDetails, RiverCondition, ConditionCode } from '@/types/api';

interface RiverOverviewPanelProps {
  river: RiverWithDetails | null;
  condition: RiverCondition | null;
  accessPointCount: number;
  isOpen: boolean;
  onClose: () => void;
  isDesktop?: boolean;
}

const conditionStyles: Record<ConditionCode, { bg: string; text: string; icon: string }> = {
  optimal: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: '✓' },
  low: { bg: 'bg-amber-100', text: 'text-amber-700', icon: '↓' },
  very_low: { bg: 'bg-orange-100', text: 'text-orange-700', icon: '⚠' },
  high: { bg: 'bg-orange-100', text: 'text-orange-700', icon: '↑' },
  too_low: { bg: 'bg-red-100', text: 'text-red-700', icon: '✕' },
  dangerous: { bg: 'bg-red-200', text: 'text-red-800', icon: '⚠' },
  unknown: { bg: 'bg-bluff-100', text: 'text-bluff-600', icon: '?' },
};

// Condition level explanations for the legend
const CONDITION_LEGEND = [
  { code: 'optimal', label: 'Good', icon: '✓', color: 'bg-emerald-500', description: 'Ideal conditions - minimal dragging' },
  { code: 'low', label: 'Low', icon: '↓', color: 'bg-amber-500', description: 'Floatable with some dragging in riffles' },
  { code: 'very_low', label: 'Very Low', icon: '⚠', color: 'bg-orange-500', description: 'Frequent scraping and portaging likely' },
  { code: 'high', label: 'High', icon: '↑', color: 'bg-orange-500', description: 'Fast current - experienced paddlers only' },
  { code: 'dangerous', label: 'Flood', icon: '🚫', color: 'bg-red-600', description: 'Dangerous conditions - do not float' },
];

export default function RiverOverviewPanel({
  river,
  condition,
  accessPointCount,
  isOpen,
  onClose,
  isDesktop = false,
}: RiverOverviewPanelProps) {
  const conditionStyle = condition ? conditionStyles[condition.code] : conditionStyles.unknown;
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Prevent body scroll when bottom sheet is open (mobile only)
  useEffect(() => {
    if (!isMounted) return;

    // On mobile, prevent scroll when modal is open
    const isMobileView = window.innerWidth < 1024;
    if (isOpen && isMobileView) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, isMounted]);

  if (!isOpen || !river) {
    return null;
  }

  // Desktop: Inline panel that slides up from bottom, under map
  if (isDesktop) {
    return (
      <div
        className={`w-full bg-river-deep border-t-2 border-white/15 transform transition-all duration-300 ease-out ${
          isOpen ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
        }`}
      >
        {/* Content - Compact horizontal layout for desktop */}
        <div className="px-6 py-3">
          {/* Single row layout - all info visible without scroll */}
          <div className="flex items-center gap-6">
            {/* River name and close button */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div>
                <h2 className="text-lg font-bold text-white">{river.name}</h2>
                <p className="text-river-gravel text-xs">Plan your float with live conditions</p>
              </div>
              <button
                onClick={onClose}
                className="text-river-gravel hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
                aria-label="Close river panel"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Quick stats - inline */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="bg-white/10 rounded-lg px-3 py-1.5 border border-white/10">
                <p className="text-[10px] font-medium text-river-gravel uppercase">Length</p>
                <p className="text-sm font-bold text-white">{river.lengthMiles.toFixed(1)} mi</p>
              </div>
              <div className="bg-white/10 rounded-lg px-3 py-1.5 border border-white/10">
                <p className="text-[10px] font-medium text-river-gravel uppercase">Access</p>
                <p className="text-sm font-bold text-river-water">{accessPointCount}</p>
              </div>
              <div className={`rounded-lg px-3 py-1.5 border border-white/10 ${conditionStyle.bg}`}>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{conditionStyle.icon}</span>
                  <div>
                    <p className={`font-semibold text-xs ${conditionStyle.text}`}>
                      {condition?.label ?? 'Unknown'}
                    </p>
                    {condition?.gaugeHeightFt !== null && condition?.gaugeHeightFt !== undefined && (
                      <p className={`text-[10px] ${conditionStyle.text} opacity-75`}>
                        {condition.gaugeHeightFt.toFixed(2)} ft
                      </p>
                    )}
                  </div>
                </div>
              </div>
              {condition?.dischargeCfs !== null && condition?.dischargeCfs !== undefined && (
                <div className="bg-white/10 rounded-lg px-3 py-1.5 border border-white/10">
                  <p className="text-[10px] font-medium text-river-gravel uppercase">Flow</p>
                  <p className="text-sm font-bold text-white">{condition.dischargeCfs.toLocaleString()} cfs</p>
                </div>
              )}
            </div>

            {/* Tags - inline */}
            <div className="flex items-center gap-2 flex-wrap flex-1">
              {river.region && (
                <span className="px-2 py-1 rounded-full bg-white/10 text-river-gravel text-[10px] border border-white/10">
                  {river.region}
                </span>
              )}
              {river.difficultyRating && (
                <span className="px-2 py-1 rounded-full bg-river-water/20 text-river-water text-[10px] border border-river-water/30">
                  {river.difficultyRating}
                </span>
              )}
            </div>

            {/* Compact condition legend */}
            <div className="flex items-center gap-3 flex-shrink-0 border-l border-white/10 pl-4">
              <p className="text-[10px] font-medium text-river-gravel uppercase">Conditions:</p>
              <div className="flex items-center gap-2">
                {CONDITION_LEGEND.map((item) => (
                  <div key={item.code} className="flex items-center gap-1" title={item.description}>
                    <span className={`w-2 h-2 rounded-full ${item.color}`} />
                    <span className="text-[10px] text-white">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Disclaimer - compact single line */}
          <p className="text-[10px] text-river-gravel/70 mt-2 text-center">
            Always confirm conditions with local outfitters before your float. This data is for planning purposes only.
          </p>
        </div>
      </div>
    );
  }

  // Mobile: Full bottom sheet modal
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity duration-300 lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Bottom Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-river-deep rounded-t-2xl shadow-2xl transform transition-transform duration-300 ease-out lg:hidden ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ maxHeight: '85vh' }}
      >
        {/* Drag Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-river-gravel/40 rounded-full" />
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(85vh-1rem)] scrollbar-thin">
          {/* Header section */}
          <div className="relative bg-river-deep px-5 py-4 border-b border-white/10">
            <div className="relative flex justify-between items-start">
              <div>
                <h2 className="text-lg font-bold text-white">{river.name}</h2>
                <p className="text-river-gravel text-sm mt-0.5">Plan your float with live conditions</p>
              </div>
              <button
                onClick={onClose}
                className="text-river-gravel hover:text-white transition-colors p-1"
                aria-label="Close river panel"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/10 rounded-xl p-3 border border-white/10">
                <p className="text-xs font-medium text-river-gravel uppercase tracking-wide">Length</p>
                <p className="text-xl font-bold text-white">{river.lengthMiles.toFixed(1)} mi</p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 border border-white/10">
                <p className="text-xs font-medium text-river-gravel uppercase tracking-wide">Access Points</p>
                <p className="text-xl font-bold text-river-water">{accessPointCount}</p>
              </div>
            </div>

            <div className={`rounded-xl p-3 border border-white/10 ${conditionStyle.bg}`}>
              <div className="flex items-center gap-2">
                <span className="text-lg">{conditionStyle.icon}</span>
                <div>
                  <p className={`font-semibold ${conditionStyle.text}`}>
                    {condition?.label ?? 'Condition unavailable'}
                  </p>
                  {condition?.gaugeHeightFt !== null && condition?.gaugeHeightFt !== undefined && (
                    <p className={`text-sm ${conditionStyle.text} opacity-75`}>
                      Stage: {condition.gaugeHeightFt.toFixed(2)} ft
                    </p>
                  )}
                </div>
              </div>
              {condition?.dischargeCfs !== null && condition?.dischargeCfs !== undefined && (
                <p className={`text-sm ${conditionStyle.text} opacity-75 mt-1`}>
                  Flow: {condition.dischargeCfs.toLocaleString()} cfs
                </p>
              )}
              {condition?.readingTimestamp && (
                <p className="text-xs text-bluff-600 mt-1">
                  Updated {new Date(condition.readingTimestamp).toLocaleString()}
                </p>
              )}
            </div>

            {river.description && (
              <div className="bg-white/10 rounded-xl p-3 border border-white/10">
                <p className="text-xs font-medium text-river-gravel uppercase tracking-wide mb-2">
                  About this river
                </p>
                <p className="text-sm text-river-gravel">{river.description}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 text-xs">
              {river.region && (
                <span className="px-3 py-1.5 rounded-full bg-white/10 text-river-gravel border border-white/10">Region: {river.region}</span>
              )}
              {river.difficultyRating && (
                <span className="px-3 py-1.5 rounded-full bg-river-water/20 text-river-water border border-river-water/30">
                  Difficulty: {river.difficultyRating}
                </span>
              )}
              <span className="px-3 py-1.5 rounded-full bg-sky-warm/20 text-sky-warm border border-sky-warm/30">Tubing friendly</span>
              <span className="px-3 py-1.5 rounded-full bg-river-forest/20 text-river-forest border border-river-forest/30">Dog friendly</span>
            </div>

            {/* Condition Legend */}
            <div className="bg-white/5 rounded-xl p-3 border border-white/10">
              <p className="text-xs font-medium text-river-gravel uppercase tracking-wide mb-2">River Condition Guide</p>
              <div className="space-y-2">
                {CONDITION_LEGEND.map((item) => (
                  <div key={item.code} className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${item.color} flex-shrink-0`} />
                    <div className="flex-1 flex items-center justify-between">
                      <span className="text-xs font-medium text-white">{item.label}</span>
                      <span className="text-[10px] text-river-gravel">{item.description}</span>
                    </div>
                  </div>
                ))}
              </div>
              {/* Safety Disclaimer */}
              <div className="mt-3 pt-3 border-t border-white/10">
                <p className="text-[10px] text-river-gravel/80 leading-relaxed">
                  <span className="font-semibold text-amber-400">Safety First:</span> Always confirm current conditions with local outfitters and authorities before your float. Water levels can change rapidly. This data is for planning purposes only and should not replace on-site assessment.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
