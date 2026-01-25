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
  optimal: { bg: 'bg-support-100', text: 'text-support-700', icon: '✓' },
  low: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: '↓' },
  very_low: { bg: 'bg-amber-100', text: 'text-amber-700', icon: '⚠' },
  high: { bg: 'bg-orange-100', text: 'text-orange-700', icon: '↑' },
  too_low: { bg: 'bg-red-100', text: 'text-red-700', icon: '✕' },
  dangerous: { bg: 'bg-red-200', text: 'text-red-800', icon: '⚠' },
  unknown: { bg: 'bg-neutral-100', text: 'text-neutral-600', icon: '?' },
};

// Condition level explanations for the legend (ordered: Very Low → Low → Good → High → Flood)
const CONDITION_LEGEND = [
  { code: 'very_low', label: 'Low', icon: '⚠', color: 'bg-amber-500', description: 'Scraping and portaging likely' },
  { code: 'low', label: 'Good', icon: '↓', color: 'bg-yellow-500', description: 'Good conditions with some dragging' },
  { code: 'optimal', label: 'Optimal', icon: '✓', color: 'bg-support-500', description: 'Ideal conditions' },
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
        className={`w-full bg-primary-800 border-t-2 border-neutral-900 transform transition-all duration-300 ease-out ${
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
                <h2 className="text-lg font-heading font-bold text-white">{river.name}</h2>
                <p className="text-primary-300 text-xs">Plan your float with live conditions</p>
              </div>
              <button
                onClick={onClose}
                className="text-primary-300 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
                aria-label="Close river panel"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Quick stats - inline */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="bg-primary-700 rounded-md px-3 py-1.5 border border-primary-600">
                <p className="text-[10px] font-medium text-primary-300 uppercase">Length</p>
                <p className="text-sm font-bold text-white">{river.lengthMiles.toFixed(1)} mi</p>
              </div>
              <div className="bg-primary-700 rounded-md px-3 py-1.5 border border-primary-600">
                <p className="text-[10px] font-medium text-primary-300 uppercase">Access</p>
                <p className="text-sm font-bold text-primary-200">{accessPointCount}</p>
              </div>
              <div className={`rounded-md px-3 py-1.5 border border-primary-600 ${conditionStyle.bg}`}>
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
                <div className="bg-primary-700 rounded-md px-3 py-1.5 border border-primary-600">
                  <p className="text-[10px] font-medium text-primary-300 uppercase">Flow</p>
                  <p className="text-sm font-bold text-white">{condition.dischargeCfs.toLocaleString()} cfs</p>
                </div>
              )}
            </div>

            {/* Tags - inline */}
            <div className="flex items-center gap-2 flex-wrap flex-1">
              {river.region && (
                <span className="px-2 py-1 rounded-md bg-primary-700 text-primary-200 text-[10px] border border-primary-600">
                  {river.region}
                </span>
              )}
              {river.difficultyRating && (
                <span className="px-2 py-1 rounded-md bg-primary-600 text-primary-100 text-[10px] border border-primary-500">
                  {river.difficultyRating}
                </span>
              )}
            </div>

            {/* Compact condition legend */}
            <div className="flex items-center gap-3 flex-shrink-0 border-l border-primary-600 pl-4">
              <p className="text-[10px] font-medium text-primary-300 uppercase">Conditions:</p>
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
          <p className="text-[10px] text-primary-400 mt-2 text-center">
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
        className={`fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-xl shadow-2xl transform transition-transform duration-300 ease-out lg:hidden ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ maxHeight: '85vh' }}
      >
        {/* Drag Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-neutral-300 rounded-full" />
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(85vh-1rem)] scrollbar-thin">
          {/* Header section */}
          <div className="relative bg-primary-800 px-5 py-4 border-b border-primary-700">
            <div className="relative flex justify-between items-start">
              <div>
                <h2 className="text-lg font-heading font-bold text-white">{river.name}</h2>
                <p className="text-primary-200 text-sm mt-0.5">Plan your float with live conditions</p>
              </div>
              <button
                onClick={onClose}
                className="text-primary-300 hover:text-white transition-colors p-1"
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
              <div className="bg-neutral-100 rounded-lg p-3 border border-neutral-200">
                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Length</p>
                <p className="text-xl font-bold text-neutral-900">{river.lengthMiles.toFixed(1)} mi</p>
              </div>
              <div className="bg-neutral-100 rounded-lg p-3 border border-neutral-200">
                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Access Points</p>
                <p className="text-xl font-bold text-primary-600">{accessPointCount}</p>
              </div>
            </div>

            <div className={`rounded-lg p-3 border ${conditionStyle.bg}`}>
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
                <p className="text-xs text-neutral-500 mt-1">
                  Updated {new Date(condition.readingTimestamp).toLocaleString()}
                </p>
              )}
            </div>

            {river.description && (
              <div className="bg-neutral-100 rounded-lg p-3 border border-neutral-200">
                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
                  About this river
                </p>
                <p className="text-sm text-neutral-700">{river.description}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 text-xs">
              {river.region && (
                <span className="px-3 py-1.5 rounded-md bg-neutral-100 text-neutral-700 border border-neutral-200">Region: {river.region}</span>
              )}
              {river.difficultyRating && (
                <span className="px-3 py-1.5 rounded-md bg-primary-100 text-primary-700 border border-primary-200">
                  Difficulty: {river.difficultyRating}
                </span>
              )}
              <span className="px-3 py-1.5 rounded-md bg-accent-100 text-accent-700 border border-accent-200">Tubing friendly</span>
              <span className="px-3 py-1.5 rounded-md bg-support-100 text-support-700 border border-support-200">Dog friendly</span>
            </div>

            {/* Condition Legend */}
            <div className="bg-neutral-50 rounded-lg p-3 border border-neutral-200">
              <p className="text-xs font-medium text-neutral-600 uppercase tracking-wide mb-2">River Condition Guide</p>
              <div className="space-y-2">
                {CONDITION_LEGEND.map((item) => (
                  <div key={item.code} className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${item.color} flex-shrink-0`} />
                    <div className="flex-1 flex items-center justify-between">
                      <span className="text-xs font-medium text-neutral-800">{item.label}</span>
                      <span className="text-[10px] text-neutral-500">{item.description}</span>
                    </div>
                  </div>
                ))}
              </div>
              {/* Safety Disclaimer */}
              <div className="mt-3 pt-3 border-t border-neutral-200">
                <p className="text-[10px] text-neutral-500 leading-relaxed">
                  <span className="font-semibold text-amber-600">Safety First:</span> Always confirm current conditions with local outfitters and authorities before your float. Water levels can change rapidly. This data is for planning purposes only and should not replace on-site assessment.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
